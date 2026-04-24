// File: Desktop/The-Acquirer/agent/paymentService.js
require("dotenv").config({ override: true });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const deployment = require("../shared/BudgetVault.deployment.json");

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY env var is required");
}

let _provider = null;
let _signer = null;
let _vault = null;

function getVault() {
  if (!_vault) {
    try {
      _provider = new ethers.JsonRpcProvider(
        process.env.KITE_RPC_URL || "http://127.0.0.1:8545",
        { chainId: parseInt(process.env.KITE_CHAIN_ID || "31337"),
          name: "kite" },
        { staticNetwork: true, polling: false }
      );
      _signer = new ethers.Wallet(process.env.PRIVATE_KEY, _provider);
      _vault = new ethers.Contract(
        deployment.contractAddress,
        deployment.abi,
        _signer
      );
    } catch (err) {
      return null;
    }
  }
  return _vault;
}

async function getStatus() {
  try {
    const v = getVault();
    if (!v) throw new Error("Vault not initialized");
    const [totalDeposited, totalSpent, remainingBudget, paymentCount] =
      await Promise.all([
        v.totalDeposited(),
        v.totalSpent(),
        v.remainingBudget(),
        v.paymentCount()
      ]);

    return {
      contractAddress: deployment.contractAddress,
      totalDeposited: ethers.formatEther(totalDeposited),
      totalSpent: ethers.formatEther(totalSpent),
      remainingBudget: ethers.formatEther(remainingBudget),
      paymentCount: Number(paymentCount),
      network: deployment.network,
      chainConnected: true
    };
  } catch (err) {
    return {
      contractAddress: deployment.contractAddress,
      totalDeposited: "0.0",
      totalSpent: "0.0",
      remainingBudget: "0.0",
      currency: "USDT",
      paymentCount: 0,
      network: deployment.network || "offline",
      chainConnected: false,
      offlineMode: true,
      error: err.message
    };
  }
}

async function recordPayment(apiId, amountUSDC, note) {
  try {
    const v = getVault();
    if (!v) throw new Error("Vault not available");

    const amountEth = ethers.parseEther((amountUSDC / 1000).toString());
    let tx, receipt;

    // Try purchaseAPI first (updates stats counters)
    try {
      const exists = await v.apiIdExists(apiId);
      if (exists) {
        console.log(`[PAYMENT] Using purchaseAPI() for ${apiId}`);
        tx = await v.purchaseAPI(
          apiId,
          `${note} | cost: ${amountUSDC} USDT (Kite testnet)`
        );
        receipt = await tx.wait();
        console.log(`[PAYMENT] purchaseAPI confirmed: ${receipt.hash}`);
      } else {
        throw new Error("API not on-chain, using pay()");
      }
    } catch (purchaseErr) {
      // Fall back to pay() for off-chain APIs
      console.log(`[PAYMENT] Falling back to pay() — ${purchaseErr.message}`);
      tx = await v.pay(apiId, amountEth, note);
      receipt = await tx.wait();
    }

    return {
      success: true,
      txHash: receipt.hash,
      apiId,
      amountUSDC,
      amountEth: ethers.formatEther(amountEth),
      blockNumber: receipt.blockNumber,
      timestamp: new Date().toISOString(),
      note
    };
  } catch (err) {
    return { success: false, error: err.message, apiId, amountUSDC };
  }
}

async function depositBudget(amountEth) {
  try {
    const tx = await getVault().deposit({ value: ethers.parseEther(amountEth.toString()) });
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash, amountEth };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getPaymentHistory() {
  try {
    const v = getVault();
    if (!v) return [];
    const count = await v.paymentCount();
    const history = [];

    for (let i = 0; i < Number(count); i++) {
      try {
        const payment = await v.getPayment(i);
        history.push({
          id: Number(payment.id),
          apiId: payment.apiId,
          amountPaid: ethers.formatEther(payment.amountPaid),
          timestamp: Number(payment.timestamp),
          txNote: payment.txNote
        });
      } catch (e) {
        continue;
      }
    }

    return history;
  } catch (err) {
    return [];
  }
}

async function checkBudgetSufficient(amountUSDC) {
  try {
    const v = getVault();
    if (!v) return true;
    const remainingBudget = await v.remainingBudget();
    const requiredEth = ethers.parseEther((amountUSDC / 1000).toString());
    return remainingBudget >= requiredEth;
  } catch (err) {
    return true;
  }
}

module.exports = {
  getStatus,
  recordPayment,
  depositBudget,
  getPaymentHistory,
  checkBudgetSufficient,
};