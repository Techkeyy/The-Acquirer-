// File: Desktop/The-Acquirer/contracts/scripts/deposit-budget.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "..", "shared", "BudgetVault.deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const provider = new ethers.JsonRpcProvider(
    process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
    { chainId: 2368, name: "kite" },
    { staticNetwork: true, polling: false }
  );
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(deployment.contractAddress, deployment.abi, signer);

  const tx = await vault.deposit({ value: ethers.parseEther("0.01") });
  await tx.wait();

  console.log("Deposited 0.01 ETH as budget. Tx:", tx.hash);

  const budget = await vault.remainingBudget();
  console.log("Remaining budget (wei):", budget.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});