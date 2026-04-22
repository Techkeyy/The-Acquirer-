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

const vaultAbi = deployment.abi;

const pendingPayments = new Map();
const usedReceipts = new Set();

function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.KITE_RPC_URL || "http://127.0.0.1:8545",
    { chainId: parseInt(process.env.KITE_CHAIN_ID || "2368"), name: "kite" },
    { staticNetwork: true, polling: false }
  );
}

async function getPaymentConfig() {
  try {
    const provider = getProvider();
    const vault = new ethers.Contract(deployment.contractAddress, vaultAbi, provider);
    const usdcMode = await vault.usdcMode();
    if (usdcMode) {
      return {
        currency: "USDC",
        decimals: 6,
        method: "depositUSDC",
        tokenAddress: await vault.usdcToken()
      };
    }
  } catch (err) {
    // Fall back to ETH mode when the vault is not yet configured.
  }

  return {
    currency: "ETH",
    decimals: 18,
    method: "deposit",
    tokenAddress: null
  };
}

async function createPaymentChallenge(req, costAmount) {
  const paymentConfig = await getPaymentConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const challenge = {
    paymentRequired: true,
    protocol: "x402",
    version: "1.0",
    nonce,
    amount: costAmount.toString(),
    currency: paymentConfig.currency,
    network: "kite-testnet",
    chainId: parseInt(process.env.KITE_CHAIN_ID || "2368"),
    payTo: deployment.contractAddress,
    contract: deployment.contractAddress,
    tokenAddress: paymentConfig.tokenAddress,
    method: paymentConfig.method,
    expiresAt,
    instructions: paymentConfig.currency === "USDC"
      ? [
          "1. Approve the vault to spend USDC",
          "2. Call depositUSDC() on the vault contract",
          "3. Get the transaction hash",
          "4. Retry this request with headers:",
          "   X-Payment-Receipt: <txHash>",
          "   X-Payment-Sender: <yourWalletAddress>",
          "   X-Payment-Nonce: " + nonce
        ].join("\n")
      : [
          "1. Send ETH to the contract address",
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
    costAmount,
    currency: paymentConfig.currency,
    decimals: paymentConfig.decimals,
    method: paymentConfig.method,
    tokenAddress: paymentConfig.tokenAddress,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    used: false
  });

  return challenge;
}

async function verifyPayment(txHash, sender, nonce, requiredAmount) {
  try {
    const paymentConfig = await getPaymentConfig();
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

    const currency = pending.currency || paymentConfig.currency;
    const decimals = pending.decimals || paymentConfig.decimals;

    if (currency === "USDC") {
      if (tx.to?.toLowerCase() !== contractAddr) {
        return {
          valid: false,
          reason: `USDC payment must be sent to the vault contract. Expected: ${contractAddr}`
        };
      }

      const iface = new ethers.Interface([
        "function depositUSDC(uint256 amount)"
      ]);
      let parsed;
      try {
        parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
      } catch (err) {
        parsed = null;
      }

      if (!parsed || parsed.name !== "depositUSDC") {
        return {
          valid: false,
          reason: "USDC payment must call depositUSDC()"
        };
      }

      const expectedAmount = ethers.parseUnits(requiredAmount.toString(), decimals);
      if (parsed.args[0] !== expectedAmount) {
        return {
          valid: false,
          reason: `Insufficient USDC payment. Required: ${requiredAmount} USDC`
        };
      }

      if (tx.value !== 0n) {
        return {
          valid: false,
          reason: "USDC payment transactions must not send native ETH"
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
        amount: ethers.formatUnits(parsed.args[0], decimals),
        blockNumber: receipt.blockNumber,
        currency,
        tokenAddress: pending.tokenAddress || paymentConfig.tokenAddress
      };
    }

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
      blockNumber: receipt.blockNumber,
      currency
    };
  } catch (err) {
    return { valid: false, reason: "Verification error: " + err.message };
  }
}

function x402Payment(costAmount = 0.00002) {
  return async (req, res, next) => {
    if (req.body?.dryRun === true) {
      return next();
    }

    const receipt = req.headers["x-payment-receipt"];
    const sender = req.headers["x-payment-sender"];
    const nonce = req.headers["x-payment-nonce"];

    if (!receipt || !nonce) {
      const challenge = await createPaymentChallenge(req, costAmount);
      return res.status(402).json(challenge);
    }

    const verification = await verifyPayment(receipt, sender, nonce, costAmount);
    if (!verification.valid) {
      return res.status(402).json({
        paymentRequired: true,
        error: verification.reason,
        hint: "Get a new payment challenge by calling this endpoint without payment headers"
      });
    }

    req.payment = verification;
    console.log(
      `[x402] Payment verified: ${receipt.slice(0, 12)}... from ${sender?.slice(0, 8)}... amount: ${verification.amount} ${verification.currency || "ETH"}`
    );

    next();
  };
}

module.exports = { x402Payment, verifyPayment, createPaymentChallenge };
