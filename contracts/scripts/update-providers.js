// File: Desktop/The-Acquirer/contracts/scripts/update-providers.js
require("dotenv").config();
const { ethers } = require("hardhat");

const NEW_PROVIDER = "0x2B18CA5c477802bEfEaFC140675a2DBECbCE60f5";

const SERVICES = [
  {
    apiId: "weather-v2",
    name: "Open-Meteo Weather Pro",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    pricePerCall: ethers.parseEther("0.00001")
  },
  {
    apiId: "crypto-price-v2",
    name: "CoinGecko Price Feed Pro",
    endpoint: "https://api.coingecko.com/api/v3/simple/price",
    pricePerCall: ethers.parseEther("0.00002")
  },
  {
    apiId: "ai-inference-v2",
    name: "Llama 3.1 AI Inference",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    pricePerCall: ethers.parseEther("0.00005")
  }
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Registering with account:", deployer.address);

  const deployment = require("../../shared/BudgetVault.deployment.json");

  // Connect as deployer (owner)
  const vault = await ethers.getContractAt(
    "BudgetVault",
    deployment.contractAddress,
    deployer
  );

  console.log("Contract:", deployment.contractAddress);
  console.log("New provider:", NEW_PROVIDER);
  console.log("");

  // Check current service count
  const currentCount = await vault.serviceCount();
  console.log("Current services on chain:", currentCount.toString());

  // Register new services with the provider wallet
  for (const service of SERVICES) {
    try {
      // Check if already registered
      const exists = await vault.apiIdExists(service.apiId);
      if (exists) {
        console.log(`⏭️  ${service.apiId} already registered`);
        continue;
      }

      console.log(`Registering ${service.apiId}...`);
      const tx = await vault.registerAPIForProvider(
        service.apiId,
        service.name,
        service.endpoint,
        service.pricePerCall,
        NEW_PROVIDER
      );
      const receipt = await tx.wait();
      console.log(`✅ ${service.name} registered`);
      console.log(`   TxHash: ${receipt.hash}`);
      console.log(`   Price: ${ethers.formatEther(service.pricePerCall)} ETH/call`);
    } catch (err) {
      console.error(`❌ Failed to register ${service.apiId}:`, err.message.slice(0, 100));
    }
  }

  // Show all registered services
  console.log("\n=== ALL SERVICES ON CHAIN ===");
  const newCount = await vault.serviceCount();
  for (let i = 0; i < Number(newCount); i++) {
    const s = await vault.getService(i);
    console.log(`[${i}] ${s.name}`);
    console.log(`    apiId: ${s.apiId}`);
    console.log(`    provider: ${s.provider}`);
    console.log(`    price: ${ethers.formatEther(s.pricePerCall)} ETH`);
    console.log(`    active: ${s.active}`);
  }

  // Check provider wallet balance
  const providerBalance = await ethers.provider.getBalance(NEW_PROVIDER);
  console.log("\nProvider wallet balance:", ethers.formatEther(providerBalance), "ETH");
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});