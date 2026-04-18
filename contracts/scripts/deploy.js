// File: Desktop/The-Acquirer/contracts/scripts/deploy.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider(
    process.env.KITE_RPC_URL,
    undefined,
    { staticNetwork: true, polling: false }
  );
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log("Deploying BudgetVault with account:", deployer.address);

  const artifact = require("../artifacts/contracts/BudgetVault.sol/BudgetVault.json");
  const BudgetVault = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const vault = await BudgetVault.deploy();
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("BudgetVault deployed to:", address);

  const deploymentInfo = {
    contractAddress: address,
    abi: artifact.abi,
    network: "kite_testnet",
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const contractsDeploymentsDir = path.join(__dirname, "..", "deployments");
  const sharedDir = path.join(__dirname, "..", "..", "shared");
  fs.mkdirSync(contractsDeploymentsDir, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });

  fs.writeFileSync(
    path.join(contractsDeploymentsDir, "BudgetVault.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  fs.writeFileSync(
    path.join(sharedDir, "BudgetVault.deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("Deployment info saved to /contracts/deployments/ and /shared/");

  // Register services with real provider wallet
  const PROVIDER = "0x2B18CA5c477802bEfEaFC140675a2DBECbCE60f5";
  console.log("Registering services for provider:", PROVIDER);

  const services = [
    {
      apiId: "weather-v1",
      name: "Open-Meteo Weather",
      endpoint: "https://api.open-meteo.com/v1/forecast",
      price: ethers.parseEther("0.00001")
    },
    {
      apiId: "crypto-price-v1",
      name: "CoinGecko Price Feed",
      endpoint: "https://api.coingecko.com/api/v3/simple/price",
      price: ethers.parseEther("0.00002")
    },
    {
      apiId: "ai-inference-v1",
      name: "Llama 3.1 AI Inference",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      price: ethers.parseEther("0.00005")
    }
  ];

  for (const s of services) {
    const tx = await vault.registerAPIForProvider(
      s.apiId, s.name, s.endpoint, s.price,
      PROVIDER
    );
    await tx.wait();
    console.log(`✅ Registered: ${s.name} → provider: ${PROVIDER}`);
  }

  // Verify services were registered
  const serviceCount = await vault.serviceCount();
  console.log("Services registered on-chain:", serviceCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});