// File: Desktop/The-Acquirer/agent-sdk/index.js
"use strict";
/**
 * The Acquirer Agent SDK
 * Allows any AI agent to use The Acquirer protocol
 * with automatic x402 payment handling.
 *
 * Usage:
 *   const { AcquirerClient } = require("./agent-sdk");
 *   const client = new AcquirerClient({
 *     baseUrl: "https://your-deployment.railway.app",
 *     privateKey: "0x...",
 *     rpcUrl: "https://rpc-testnet.gokite.ai/"
 *   });
 *   const result = await client.execute("What is Bitcoin price?");
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../shared/BudgetVault.deployment.json"),
    "utf8"
  )
);

class AcquirerClient {
  constructor({ baseUrl, privateKey, rpcUrl, chainId = 2368 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.privateKey = privateKey;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;

    if (privateKey) {
      this.provider = new ethers.JsonRpcProvider(
        rpcUrl,
        { chainId, name: "kite" },
        { staticNetwork: true, polling: false }
      );
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(
        deployment.contractAddress,
        deployment.abi,
        this.wallet
      );
    }
  }

  async info() {
    const res = await fetch(`${this.baseUrl}/agent/info`);
    return res.json();
  }

  async marketplace() {
    const res = await fetch(`${this.baseUrl}/marketplace`);
    return res.json();
  }

  async leaderboard() {
    const res = await fetch(`${this.baseUrl}/leaderboard`);
    return res.json();
  }

  async execute(task, options = {}) {
    console.log(`[SDK] Executing task: "${task}"`);

    const firstResponse = await fetch(`${this.baseUrl}/agent/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, ...options })
    });

    if (firstResponse.status !== 402) {
      return firstResponse.json();
    }

    const challenge = await firstResponse.json();
    console.log(`[SDK] Got 402 — scheme: ${challenge.accepts?.[0]?.scheme || "unknown"}`);

    const accept = challenge.accepts?.[0];
    if (!accept) throw new Error("No payment terms in 402");

    const nonce = challenge.nonce || challenge.accepts?.[0]?.extra?.nonce;
    const payTo = accept.payTo;
    const costWei = accept.maxAmountRequired;
    const asset = accept.asset;

    console.log(`[SDK] Payment required:`);
    console.log(`  Pay to: ${payTo}`);
    console.log(`  Amount: ${costWei} wei`);
    console.log(`  Token: ${asset}`);
    console.log(`  Nonce: ${nonce}`);

    if (!this.wallet) {
      throw new Error(
        "Private key required for automatic payment. Initialize AcquirerClient with privateKey option."
      );
    }

    // Step 2: Pay using Kite USDT token
    // Try ERC-20 transfer first (proper Kite x402)
    let txHash;
    try {
      const tokenAbi = [
        "function transfer(address, uint256) returns (bool)",
        "function balanceOf(address) view returns (uint256)"
      ];
      const token = new ethers.Contract(asset, tokenAbi, this.wallet);

      const balance = await token.balanceOf(this.wallet.address);
      console.log(`[SDK] Token balance: ${balance.toString()}`);

      if (balance >= BigInt(costWei)) {
        console.log("[SDK] Paying with Kite USDT...");
        const tx = await token.transfer(payTo, BigInt(costWei));
        const receipt = await tx.wait();
        txHash = receipt.hash;
        console.log(`[SDK] ✅ USDT payment: ${txHash}`);
      } else {
        console.log("[SDK] Insufficient USDT, falling back to ETH...");
        const tx = await this.wallet.sendTransaction({
          to: payTo,
          value: ethers.parseEther("0.00002")
        });
        const receipt = await tx.wait();
        txHash = receipt.hash;
        console.log(`[SDK] ✅ ETH payment: ${txHash}`);
      }
    } catch (payErr) {
      console.error("[SDK] Payment error:", payErr.message);
      throw payErr;
    }

    const paymentProof = Buffer.from(JSON.stringify({
      txHash,
      from: this.wallet.address,
      to: payTo,
      amount: costWei,
      asset,
      network: "kite-testnet",
      nonce,
      timestamp: Date.now()
    })).toString("base64");

    console.log("[SDK] Retrying with X-PAYMENT header...");
    const secondResponse = await fetch(`${this.baseUrl}/agent/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": paymentProof,
        "X-Payment-Receipt": txHash,
        "X-Payment-Sender": this.wallet.address,
        "X-Payment-Nonce": nonce || ""
      },
      body: JSON.stringify({ task, ...options })
    });

    const result = await secondResponse.json();
    console.log(`[SDK] ✅ Complete: ${result.answer?.slice(0, 60)}...`);
    return result;
  }
}

module.exports = { AcquirerClient };
