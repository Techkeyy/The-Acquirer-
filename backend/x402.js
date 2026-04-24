"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KITE_USDT = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const KITE_FACILITATOR = "0x12343e649e6b2b2b77649DFAb88f103c02F3C78b";

const deployment = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../shared/BudgetVault.deployment.json"),
    "utf8"
  )
);

const pendingPayments = new Map();
const usedPayments = new Set();

function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
    { chainId: 2368, name: "kite" },
    { staticNetwork: true, polling: false }
  );
}

function createKite402Response(req, costWei, description) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  pendingPayments.set(nonce, {
    costWei,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    used: false
  });

  return {
    error: "X-PAYMENT header is required",
    accepts: [{
      scheme: "gokite-aa",
      network: "kite-testnet",
      maxAmountRequired: costWei.toString(),
      resource: `${req.protocol}://${req.get("host")}${req.path}`,
      description: description || "The Acquirer — On-chain API Protocol",
      mimeType: "application/json",
      outputSchema: {
        input: { discoverable: true, method: req.method, type: "http" },
        output: {
          properties: {
            answer: { description: "AI-synthesized answer", type: "string" },
            txHashes: { description: "On-chain payment receipts", type: "array" },
            verified: { description: "Payment verified on-chain", type: "boolean" }
          },
          required: ["answer", "verified"],
          type: "object"
        }
      },
      payTo: deployment.contractAddress,
      maxTimeoutSeconds: 300,
      asset: KITE_USDT,
      extra: {
        nonce,
        expiresAt,
        facilitator: KITE_FACILITATOR,
        protocol: "The Acquirer v1.0"
      },
      merchantName: "The Acquirer Protocol"
    }],
    x402Version: 1,
    nonce,
    expiresAt
  };
}

async function verifyOnChain(txHash, sender, requiredWei, nonce = null, pendingRef = null) {
  if (usedPayments.has(txHash)) {
    return { valid: false, reason: "Receipt already used" };
  }

  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { valid: false, reason: "Transaction not found on Kite chain" };
    }
    if (receipt.status !== 1) {
      return { valid: false, reason: "Transaction failed on chain" };
    }

    usedPayments.add(txHash);
    if (nonce && pendingRef) {
      pendingRef.used = true;
    }

    return {
      valid: true,
      txHash,
      sender: sender || receipt.from,
      blockNumber: receipt.blockNumber,
      method: "on-chain-verify"
    };
  } catch (err) {
    return { valid: false, reason: "Verification error: " + err.message };
  }
}

async function verifyKitePayment(req, requiredWei) {
  const xPayment = req.headers["x-payment"];
  const legacyReceipt = req.headers["x-payment-receipt"];
  const legacyNonce = req.headers["x-payment-nonce"];
  const legacySender = req.headers["x-payment-sender"];

  if (xPayment) {
    try {
      const decoded = Buffer.from(xPayment, "base64").toString("utf8");
      const paymentObj = JSON.parse(decoded);
      const txHash = paymentObj.txHash || paymentObj.authorization?.txHash || paymentObj.receipt;

      if (!txHash) {
        try {
          const verifyRes = await fetch("https://facilitator.pieverse.io/v2/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              authorization: paymentObj.authorization || paymentObj,
              signature: paymentObj.signature,
              network: "kite-testnet"
            })
          });
          const verifyData = await verifyRes.json();
          if (verifyData.valid || verifyData.verified) {
            return {
              valid: true,
              txHash: verifyData.txHash || "kite-verified",
              sender: verifyData.from || paymentObj.from,
              amount: verifyData.amount,
              method: "kite-facilitator"
            };
          }
        } catch (facilitatorErr) {
          console.warn("[x402] Facilitator check failed:", facilitatorErr.message);
        }

        return { valid: false, reason: "No transaction hash in X-PAYMENT" };
      }

      return await verifyOnChain(txHash, paymentObj.from || legacySender, requiredWei);
    } catch (e) {
      return { valid: false, reason: "Invalid X-PAYMENT format: " + e.message };
    }
  }

  if (legacyReceipt && legacyNonce) {
    const pending = pendingPayments.get(legacyNonce);
    if (!pending) {
      return { valid: false, reason: "Invalid or expired nonce" };
    }
    if (pending.used) {
      return { valid: false, reason: "Nonce already used" };
    }
    if (Date.now() > pending.expiresAt) {
      pendingPayments.delete(legacyNonce);
      return { valid: false, reason: "Payment window expired" };
    }

    return await verifyOnChain(legacyReceipt, legacySender, requiredWei, legacyNonce, pending);
  }

  return {
    valid: false,
    reason: "No payment headers. Use X-PAYMENT (Kite) or X-Payment-Receipt + X-Payment-Nonce (legacy)"
  };
}

function x402Payment(costUSDC = 0.00002) {
  const costWei = BigInt(Math.floor(costUSDC * 1_000_000)).toString();

  return async (req, res, next) => {
    if (req.body?.dryRun === true) return next();

    const hasPayment = req.headers["x-payment"] || (req.headers["x-payment-receipt"] && req.headers["x-payment-nonce"]);

    if (!hasPayment) {
      const challenge = createKite402Response(req, costWei, `Agent task execution — ${costUSDC} USDT`);
      return res.status(402).json(challenge);
    }

    const verification = await verifyKitePayment(req, BigInt(costWei));
    if (!verification.valid) {
      return res.status(402).json({
        error: "Payment verification failed",
        reason: verification.reason,
        hint: "Call without payment headers to get a new challenge",
        accepts: [{
          scheme: "gokite-aa",
          network: "kite-testnet",
          asset: KITE_USDT,
          payTo: deployment.contractAddress,
          merchantName: "The Acquirer Protocol"
        }],
        x402Version: 1
      });
    }

    req.payment = verification;
    console.log(`[x402] ✅ Payment verified via ${verification.method}`);
    next();
  };
}

module.exports = {
  x402Payment,
  createKite402Response,
  verifyKitePayment,
  KITE_USDT,
  KITE_FACILITATOR
};
