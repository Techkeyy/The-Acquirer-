// File: Desktop/The-Acquirer/backend/x402.js
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const deployment = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../shared/BudgetVault.deployment.json"),
    "utf8"
  )
);

const pendingPayments = new Map();
const usedReceipts = new Set();

function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.KITE_RPC_URL || "http://127.0.0.1:8545",
    { chainId: parseInt(process.env.KITE_CHAIN_ID || "2368"), name: "kite" },
    { staticNetwork: true, polling: false }
  );
}

function createPaymentChallenge(req, costETH) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const challenge = {
    paymentRequired: true,
    protocol: "x402",
    version: "1.0",
    nonce,
    amount: costETH.toString(),
    currency: "ETH",
    network: "kite-testnet",
    chainId: parseInt(process.env.KITE_CHAIN_ID || "2368"),
    payTo: deployment.contractAddress,
    contract: deployment.contractAddress,
    method: "deposit",
    expiresAt,
    instructions: [
      "1. Send ETH to the contract address using deposit()",
      "2. Get the transaction hash",
      "3. Retry this request with headers:",
      "   X-Payment-Receipt: <txHash>",
      "   X-Payment-Sender: <yourWalletAddress>",
      "   X-Payment-Nonce: " + nonce
    ].join("\n"),
    curl_example: `curl -X POST ${req.protocol}://${req.get("host")}${req.path} \\
  -H "Content-Type: application/json" \\
  -H "X-Payment-Receipt: <txHash>" \\
  -H "X-Payment-Sender: <walletAddress>" \\
  -H "X-Payment-Nonce: ${nonce}" \\
  -d '${JSON.stringify(req.body)}'`
  };

  pendingPayments.set(nonce, {
    costETH,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    used: false
  });

  return challenge;
}

async function verifyPayment(txHash, sender, nonce, requiredAmount) {
  try {
    const pending = pendingPayments.get(nonce);
    if (!pending) {
      return { valid: false, reason: "Invalid or expired nonce" };
    }
    if (pending.used) {
      return { valid: false, reason: "Nonce already used" };
    }
    if (Date.now() > pending.expiresAt) {
      pendingPayments.delete(nonce);
      return { valid: false, reason: "Payment window expired" };
    }

    if (usedReceipts.has(txHash)) {
      return { valid: false, reason: "Receipt already used" };
    }

    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { valid: false, reason: "Transaction not found on chain" };
    }
    if (receipt.status !== 1) {
      return { valid: false, reason: "Transaction failed on chain" };
    }

    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return { valid: false, reason: "Transaction details not found" };
    }

    const contractAddr = deployment.contractAddress.toLowerCase();
    if (tx.to?.toLowerCase() !== contractAddr) {
      return {
        valid: false,
        reason: `Payment not sent to contract. Expected: ${contractAddr}`
      };
    }

    if (tx.value < ethers.parseEther(requiredAmount.toString())) {
      return {
        valid: false,
        reason: `Insufficient payment. Required: ${requiredAmount} ETH`
      };
    }

    if (sender && tx.from?.toLowerCase() !== sender.toLowerCase()) {
      return {
        valid: false,
        reason: "Payment sender does not match X-Payment-Sender header"
      };
    }

    pending.used = true;
    usedReceipts.add(txHash);

    return {
      valid: true,
      txHash,
      sender: tx.from,
      amount: ethers.formatEther(tx.value),
      blockNumber: receipt.blockNumber
    };
  } catch (err) {
    return { valid: false, reason: "Verification error: " + err.message };
  }
}

function x402Payment(costETH = 0.00002) {
  return async (req, res, next) => {
    if (req.body?.dryRun === true) {
      return next();
    }

    const receipt = req.headers["x-payment-receipt"];
    const sender = req.headers["x-payment-sender"];
    const nonce = req.headers["x-payment-nonce"];

    if (!receipt || !nonce) {
      const challenge = createPaymentChallenge(req, costETH);
      return res.status(402).json(challenge);
    }

    const verification = await verifyPayment(receipt, sender, nonce, costETH);
    if (!verification.valid) {
      return res.status(402).json({
        paymentRequired: true,
        error: verification.reason,
        hint: "Get a new payment challenge by calling this endpoint without payment headers"
      });
    }

    req.payment = verification;
    console.log(
      `[x402] Payment verified: ${receipt.slice(0, 12)}... from ${sender?.slice(0, 8)}... amount: ${verification.amount} ETH`
    );

    next();
  };
}

module.exports = { x402Payment, verifyPayment, createPaymentChallenge };
