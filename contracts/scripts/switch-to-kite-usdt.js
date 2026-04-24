require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const KITE_USDT = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Switching to Kite official USDT...");
  console.log("Deployer:", deployer.address);

  const deployment = require("../../shared/BudgetVault.deployment.json");

  const vault = await ethers.getContractAt(
    "BudgetVault",
    deployment.contractAddress,
    deployer
  );

  const currentMode = typeof vault.usdcMode === "function"
    ? await vault.usdcMode().catch(() => false)
    : false;
  const currentToken = typeof vault.usdcToken === "function"
    ? await vault.usdcToken().catch(() => null)
    : null;
  console.log("Current USDC mode:", currentMode);
  console.log("Current token:", currentToken);

  if (typeof vault.setUSDCToken === "function") {
    console.log("Setting Kite USDT token...");
    const tx = await vault.setUSDCToken(KITE_USDT);
    await tx.wait();
    console.log("✅ Token switched to Kite USDT:", KITE_USDT);
  } else {
    console.log("⚠️  Vault ABI does not expose setUSDCToken(); skipping on-chain switch.");
    console.log("   Updating deployment metadata to point at Kite USDT instead.");
  }

  const usdtAbi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function transfer(address, uint256) returns (bool)",
    "function mint(address, uint256) external",
    "function faucet() external",
    "function drip(address) external"
  ];

  const usdt = new ethers.Contract(KITE_USDT, usdtAbi, deployer);

  try {
    const name = await usdt.name();
    const symbol = await usdt.symbol();
    const decimals = await usdt.decimals();
    console.log(`Token: ${name} (${symbol}), ${decimals} decimals`);

    const balance = await usdt.balanceOf(deployer.address);
    console.log("Your balance:", ethers.formatUnits(balance, decimals), symbol);

    try {
      await usdt.faucet();
      console.log("✅ Faucet called");
    } catch (e) {
      try {
        await usdt.drip(deployer.address);
        console.log("✅ Drip called");
      } catch (e2) {
        console.log("No faucet available — get tokens from:");
        console.log("https://faucet.gokite.ai");
      }
    }
  } catch (e) {
    console.log("Token info:", e.message);
  }

  const sharedPath = path.join(__dirname, "../../shared/BudgetVault.deployment.json");
  const shared = JSON.parse(fs.readFileSync(sharedPath, "utf8"));
  shared.kiteUSDT = KITE_USDT;
  shared.usdcAddress = KITE_USDT;
  shared.usdcNotes = {
    type: "Kite Official Test USDT",
    address: KITE_USDT,
    kitescan: "https://testnet.kitescan.ai/token/" + KITE_USDT,
    note: "Official Kite testnet stablecoin — not MockUSDC"
  };
  fs.writeFileSync(sharedPath, JSON.stringify(shared, null, 2));

  console.log("✅ Deployment file updated");
  console.log("Kite USDT:", KITE_USDT);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});