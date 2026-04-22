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
  console.log("   Currency:", challenge.currency);
  console.log("   Nonce:", challenge.nonce);
  console.log("   Amount:", challenge.amount, challenge.currency);
  console.log("   Pay to:", challenge.payTo);
  console.log("   Expires:", challenge.expiresAt);
  console.log("");

  let paymentTx;
  if (challenge.currency === "USDC") {
    const usdcAddress = challenge.tokenAddress || deployment.usdcAddress;
    if (!usdcAddress) {
      console.error("❌ USDC mode detected but no token address found");
      process.exit(1);
    }

    const usdc = new ethers.Contract(
      usdcAddress,
      [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)"
      ],
      wallet
    );
    const vault = new ethers.Contract(
      challenge.payTo,
      ["function depositUSDC(uint256 amount) external"],
      wallet
    );
    const amount = ethers.parseUnits(challenge.amount.toString(), 6);

    console.log("STEP 2: Approving USDC spend...");
    const approveTx = await usdc.approve(challenge.payTo, amount);
    await approveTx.wait();
    console.log("   Approval tx hash:", approveTx.hash);

    console.log("STEP 2: Paying on Kite chain via depositUSDC()...");
    paymentTx = await vault.depositUSDC(amount);
    console.log("   Tx hash:", paymentTx.hash);
    console.log("   Waiting for confirmation...");
    await paymentTx.wait();
    console.log("✅ Payment confirmed\n");
  } else {
    console.log("STEP 2: Paying on Kite chain...");
    const vault = new ethers.Contract(
      challenge.payTo,
      ["function deposit() external payable"],
      wallet
    );
    paymentTx = await vault.deposit({
      value: ethers.parseEther(challenge.amount.toString())
    });
    console.log("   Tx hash:", paymentTx.hash);
    console.log("   Waiting for confirmation...");

    const receipt = await paymentTx.wait();
    console.log("✅ Payment confirmed in block", receipt.blockNumber);
    console.log("");
  }

  console.log("STEP 3: Retrying with payment proof...");
  const res2 = await fetch(`${BASE_URL}/agent/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
