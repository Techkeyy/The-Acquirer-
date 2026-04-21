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
    console.log(`[SDK] Payment required: ${challenge.amount} ETH`);
    console.log(`[SDK] Nonce: ${challenge.nonce}`);
    console.log(`[SDK] Pay to: ${challenge.payTo}`);

    if (!this.wallet) {
      throw new Error(
        "Private key required for automatic payment. Initialize AcquirerClient with privateKey option."
      );
    }

    console.log("[SDK] Sending payment on Kite chain...");
    const tx = await this.contract.deposit({
      value: ethers.parseEther(challenge.amount)
    });

    console.log(`[SDK] Payment tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[SDK] Payment confirmed in block ${receipt.blockNumber}`);

    console.log("[SDK] Retrying with payment proof...");
    const secondResponse = await fetch(`${this.baseUrl}/agent/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Receipt": tx.hash,
        "X-Payment-Sender": this.wallet.address,
        "X-Payment-Nonce": challenge.nonce
      },
      body: JSON.stringify({ task, ...options })
    });

    const result = await secondResponse.json();
    console.log(`[SDK] Task complete: ${result.answer?.slice(0, 50)}...`);
    return result;
  }
}

module.exports = { AcquirerClient };
