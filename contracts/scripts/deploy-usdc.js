// File: Desktop/The-Acquirer/contracts/scripts/deploy-usdc.js
require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying upgraded BudgetVault and MockUSDC with:", deployer.address);

  const artifact = require("../artifacts/contracts/BudgetVault.sol/BudgetVault.json");
  const BudgetVault = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const vault = await BudgetVault.deploy();
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("BudgetVault deployed to:", vaultAddress);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(1000000);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  const deployment = require("../../shared/BudgetVault.deployment.json");

  console.log("Configuring BudgetVault to use USDC...");
  const tx1 = await vault.setUSDCToken(usdcAddress);
  await tx1.wait();
  console.log("USDC mode enabled on BudgetVault");

  console.log("Approving vault to spend USDC...");
  const tx2 = await usdc.approve(
    vaultAddress,
    ethers.parseUnits("1000000", 6)
  );
  await tx2.wait();
  console.log("Approval set");

  console.log("Depositing 1000 USDC as budget...");
  const tx3 = await vault.depositUSDC(
    ethers.parseUnits("1000", 6)
  );
  await tx3.wait();
  console.log("1000 USDC deposited as budget");

  console.log("Registering sample services on the upgraded vault...");
  const providerAddress = "0x2B18CA5c477802bEfEaFC140675a2DBECbCE60f5";
  const services = [
    {
      apiId: "weather-basic",
      name: "Open-Meteo Weather",
      endpoint: "https://api.open-meteo.com/v1/forecast",
      price: ethers.parseUnits("0.01", 6)
    },
    {
      apiId: "crypto-price",
      name: "CoinGecko Price Feed",
      endpoint: "https://api.coingecko.com/api/v3/simple/price",
      price: ethers.parseUnits("0.02", 6)
    },
    {
      apiId: "ai-inference-v1",
      name: "Llama 3.1 AI Inference",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      price: ethers.parseUnits("0.05", 6)
    }
  ];

  for (const service of services) {
    const tx = await vault.registerAPIWithStake(
      service.apiId,
      service.name,
      service.endpoint,
      service.price,
      providerAddress,
      { value: ethers.parseEther("0.001") }
    );
    await tx.wait();
    console.log(`Registered service: ${service.name}`);
  }

  const shared = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../../shared/BudgetVault.deployment.json"),
    "utf8"
  ));
  shared.contractAddress = vaultAddress;
  shared.deployedAt = new Date().toISOString();
  shared.deployer = deployer.address;
  shared.usdcAddress = usdcAddress;
  shared.usdcMode = true;
  shared.network = "kite_testnet";
  shared.abi = artifact.abi;
  fs.writeFileSync(
    path.join(__dirname, "../../shared/BudgetVault.deployment.json"),
    JSON.stringify(shared, null, 2)
  );

  console.log("✅ USDC setup complete");
  console.log("MockUSDC address:", usdcAddress);
  console.log("BudgetVault address:", vaultAddress);
  console.log("Vault now accepts USDC deposits and payments");

  const currentBalance = await usdc.balanceOf(vaultAddress);
  console.log("Vault USDC balance:", ethers.formatUnits(currentBalance, 6), "USDC");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
