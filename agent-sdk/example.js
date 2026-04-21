// File: Desktop/The-Acquirer/agent-sdk/example.js
/**
 * Example: External AI agent using The Acquirer protocol
 * This simulates any external agent calling our protocol
 */
require("dotenv").config({
  path: require("path").join(__dirname, "../.env")
});
const { AcquirerClient } = require("./index");

async function main() {
  const client = new AcquirerClient({
    baseUrl: process.env.ACQUIRER_URL || "http://localhost:4000",
    privateKey: process.env.PRIVATE_KEY,
    rpcUrl: process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
    chainId: 2368
  });

  console.log("=== The Acquirer Agent SDK Demo ===\n");

  console.log("1. Discovering protocol...");
  const info = await client.info();
  console.log(`   Protocol: ${info.name}`);
  console.log(`   Network: ${info.network}`);
  console.log(`   Contract: ${info.contract}\n`);

  console.log("2. Checking marketplace...");
  const market = await client.marketplace();
  console.log(`   ${market.totalServices} services available`);
  market.services?.forEach((s) => {
    console.log(`   - ${s.name}: ${s.pricePerCall} ETH/call`);
  });
  console.log();

  console.log("3. Executing task with x402 payment...");
  const result = await client.execute(
    "What is the current Bitcoin price and should I buy?"
  );

  console.log("\n=== RESULT ===");
  console.log("Answer:", result.answer);
  console.log("Cost:", result.cost, "KITE");
  console.log("Payment receipt:", result.payment?.receipt);
  console.log("Verified on-chain:", result.payment?.verified);
}

main().catch(console.error);
