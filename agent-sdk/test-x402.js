// File: Desktop/The-Acquirer/agent-sdk/test-x402.js
"use strict";
require("dotenv").config({
  path: require("path").join(__dirname, "../.env")
});
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const BASE_URL = process.env.ACQUIRER_URL || "http://localhost:4000";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
const CHAIN_ID = parseInt(process.env.KITE_CHAIN_ID || "2368");
const KITE_USDT = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../shared/BudgetVault.deployment.json"), "utf8")
);

async function testX402Flow() {
  console.log("=== x402 END-TO-END TEST ===\n");
  console.log("Backend:", BASE_URL);
  console.log("Chain ID:", CHAIN_ID);
  console.log("");

  if (!PRIVATE_KEY) {
    console.error("❌ PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    RPC_URL,
    { chainId: CHAIN_ID, name: "kite" },
    { staticNetwork: true, polling: false }
  );
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Wallet:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  console.log("STEP 1: Calling /agent/execute (expect 402)...");
  const res1 = await fetch(`${BASE_URL}/agent/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "What is the current Bitcoin price?"
    })
  });

  if (res1.status !== 402) {
    console.error("❌ Expected 402, got:", res1.status);
    const body = await res1.text();
    console.error("Body:", body);
    process.exit(1);
  }

  const challenge = await res1.json();
  console.log("✅ Got 402 Payment Required");
  const accept = challenge.accepts?.[0] || {};
  console.log("   Scheme:", accept.scheme || challenge.scheme || "unknown");
  console.log("   Asset:", accept.asset || KITE_USDT);
  console.log("   Nonce:", challenge.nonce);
  console.log("   Amount:", accept.maxAmountRequired || challenge.amount, "wei");
  console.log("   Pay to:", accept.payTo || challenge.payTo);
  console.log("   Expires:", challenge.expiresAt);
  console.log("");

  console.log("STEP 2: Paying with Kite Test USDT...");
  const token = new ethers.Contract(
    accept.asset || KITE_USDT,
    [
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)"
    ],
    wallet
  );
  const amount = BigInt(accept.maxAmountRequired || challenge.amount || "20000");
  const paymentTx = await token.transfer(accept.payTo || challenge.payTo, amount);
  console.log("   Tx hash:", paymentTx.hash);
  console.log("   Waiting for confirmation...");

  const receipt = await paymentTx.wait();
  console.log("✅ Payment confirmed in block", receipt.blockNumber);
  console.log("");

  console.log("STEP 3: Retrying with payment proof...");
  const paymentProof = Buffer.from(JSON.stringify({
    txHash: paymentTx.hash,
    from: wallet.address,
    to: accept.payTo || challenge.payTo,
    amount: accept.maxAmountRequired || "20000",
    asset: accept.asset || KITE_USDT,
    network: "kite-testnet",
    nonce: challenge.nonce,
    timestamp: Date.now()
  })).toString("base64");

  const res2 = await fetch(`${BASE_URL}/agent/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": paymentProof,
      "X-Payment-Receipt": paymentTx.hash,
      "X-Payment-Sender": wallet.address,
      "X-Payment-Nonce": challenge.nonce
    },
    body: JSON.stringify({
      task: "What is the current Bitcoin price?"
    })
  });

  if (res2.status !== 200) {
    console.error("❌ Expected 200, got:", res2.status);
    const body = await res2.text();
    console.error("Body:", body);
    process.exit(1);
  }

  const result = await res2.json();
  console.log("✅ Got 200 OK — Task completed!");
  console.log("");
  console.log("=== RESULT ===");
  console.log("Answer:", result.answer);
  console.log("Cost:", result.cost, challenge.currency);
  console.log("Payment verified:", result.payment?.verified);
  console.log("On-chain receipt:", result.payment?.receipt);
  console.log("");
  console.log("=== KITESCAN LINKS ===");
  console.log("Payment tx:");
  console.log(`https://testnet.kitescan.ai/tx/${paymentTx.hash}`);
  console.log("Execution tx:");
  console.log(`https://testnet.kitescan.ai/tx/${result.txHashes?.[0]}`);
  console.log("");
  console.log("✅ x402 FLOW COMPLETE — All 3 steps verified");
}

testX402Flow().catch((e) => {
  console.error("❌ Test failed:", e.message);
  process.exit(1);
});
