// File: Desktop/The-Acquirer/contracts/scripts/seed-services.js
require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding with account:", deployer.address);
  
  const deployment = require("../../shared/BudgetVault.deployment.json");
  const vault = await ethers.getContractAt(
    "BudgetVault",
    deployment.contractAddress,
    deployer
  );

  const count = await vault.serviceCount();
  if (Number(count) > 0) {
    console.log("Services already seeded:", count.toString());
    return;
  }

  console.log("Calling seedDemoServices...");
  const tx = await vault.seedDemoServices();
  const receipt = await tx.wait();
  console.log("✅ Seeded! TxHash:", receipt.hash);

  const newCount = await vault.serviceCount();
  console.log("Services on chain:", newCount.toString());
  
  for (let i = 0; i < Number(newCount); i++) {
    const s = await vault.getService(i);
    console.log(`  [${i}] ${s.name} — ${ethers.formatEther(s.pricePerCall)} ETH/call`);
  }
}

main().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
