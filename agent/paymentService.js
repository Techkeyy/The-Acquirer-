// File: Desktop/The-Acquirer/agent/paymentService.js
require("dotenv").config({ override: true });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const deployment = require("../shared/BudgetVault.deployment.json");

const budgetVaultAbi = deployment.abi;

const usdcAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

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
        budgetVaultAbi,
        _signer
      );
    } catch (err) {
      return null;
    }
  }
  return _vault;
}

async function getCurrencyMode(v) {
  try {
    const usdcMode = await v.usdcMode();
    if (usdcMode) {
      return {
        currency: "USDC",
        decimals: 6,
        usdcMode: true,
        usdcToken: await v.usdcToken()
      };
    }
  } catch (err) {
    // Fall back to ETH mode when the new contract methods are unavailable.
  }

  return {
    currency: "ETH",
    decimals: 18,
    usdcMode: false,
    usdcToken: null
  };
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

    const mode = await getCurrencyMode(v);
    let usdcBalance = null;
    if (mode.usdcMode && mode.usdcToken) {
      try {
        const usdcContract = new ethers.Contract(mode.usdcToken, usdcAbi, _provider);
        const balance = await usdcContract.balanceOf(deployment.contractAddress);
        usdcBalance = ethers.formatUnits(balance, 6);
      } catch (err) {}
    }

    return {
      contractAddress: deployment.contractAddress,
      totalDeposited: mode.usdcMode ? ethers.formatUnits(totalDeposited, 6) : ethers.formatEther(totalDeposited),
      totalSpent: mode.usdcMode ? ethers.formatUnits(totalSpent, 6) : ethers.formatEther(totalSpent),
      remainingBudget: usdcBalance !== null
        ? usdcBalance
        : (mode.usdcMode ? ethers.formatUnits(remainingBudget, 6) : ethers.formatEther(remainingBudget)),
      usdcBalance,
      usdcMode: mode.usdcMode,
      currency: mode.currency,
      paymentCount: Number(paymentCount),
      network: deployment.network,
      chainConnected: true
    };
  } catch (err) {
    return {
      contractAddress: deployment.contractAddress,
      totalDeposited: "1.0",
      totalSpent: "0.0",
      remainingBudget: "1.0",
      usdcBalance: null,
      usdcMode: false,
      currency: "KITE",
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
    const mode = await getCurrencyMode(v);
    const amountOnChain = mode.usdcMode
      ? ethers.parseUnits(amountUSDC.toString(), 6)
      : ethers.parseEther((amountUSDC / 1000).toString());

    // Get current nonce and increment atomically
    const nonce = await v
      .runner
      .provider
      .getTransactionCount(
        await v.runner.getAddress(),
        "pending"
      );

    const tx = await v.pay(
      apiId, amountOnChain, note,
      { nonce: nonce }
    );
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      apiId,
      amountUSDC,
      amountEth: mode.usdcMode ? ethers.formatUnits(amountOnChain, 6) : ethers.formatEther(amountOnChain),
      currency: mode.currency,
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
    const v = getVault();
    const mode = await getCurrencyMode(v);
    const tx = mode.usdcMode
      ? await v.depositUSDC(ethers.parseUnits(amountEth.toString(), 6))
      : await v.deposit({ value: ethers.parseEther(amountEth.toString()) });
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash, amountEth, currency: mode.currency };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getPaymentHistory() {
  try {
    const v = getVault();
    if (!v) return [];
    const mode = await getCurrencyMode(v);
    const count = await v.paymentCount();
    const history = [];

    for (let i = 0; i < Number(count); i++) {
      try {
        const payment = await v.getPayment(i);
        history.push({
          id: Number(payment.id),
          apiId: payment.apiId,
          amountPaid: mode.usdcMode ? ethers.formatUnits(payment.amountPaid, 6) : ethers.formatEther(payment.amountPaid),
          currency: mode.currency,
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
    const mode = await getCurrencyMode(v);
    const remainingBudget = await v.remainingBudget();
    const requiredAmount = mode.usdcMode
      ? ethers.parseUnits(amountUSDC.toString(), 6)
      : ethers.parseEther((amountUSDC / 1000).toString());
    return remainingBudget >= requiredAmount;
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