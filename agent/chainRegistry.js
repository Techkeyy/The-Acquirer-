// File: Desktop/The-Acquirer/agent/chainRegistry.js
"use strict";
require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

let _provider = null;
let _vault = null;

function getVault() {
  if (_vault) return _vault;
  try {
    const deployment = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../shared/BudgetVault.deployment.json"),
        "utf8"
      )
    );
    _provider = new ethers.JsonRpcProvider(
      process.env.KITE_RPC_URL || "http://127.0.0.1:8545",
      { chainId: parseInt(process.env.KITE_CHAIN_ID || "31337"),
        name: "kite" },
      { staticNetwork: true, polling: false }
    );
    _vault = new ethers.Contract(
      deployment.contractAddress,
      deployment.abi,
      _provider
    );
    return _vault;
  } catch (e) {
    return null;
  }
}

// Convert on-chain service to registry format
function serviceToAPI(s) {
  const priceUSDC = Number(ethers.formatEther(s.pricePerCall)) * 1000;

  // Map on-chain apiId to executor case
  const idMap = {
    "weather-v1": "weather-basic",
    "weather-v2": "weather-basic",
    "crypto-price-v1": "coingecko-price",
    "crypto-price-v2": "coingecko-price",
    "ai-inference-v1": "openai-gpt4o-mini",
    "ai-inference-v2": "openai-gpt4o-mini"
  };

  return {
    id: idMap[s.apiId] || s.apiId,
    chainId: s.apiId,
    name: s.name,
    description: `On-chain registered service: ${s.name}`,
    endpoint: s.endpoint,
    costUSDC: parseFloat(priceUSDC.toFixed(4)),
    qualityScore: Number(s.reputationScore || 7),
    category: s.apiId.includes("weather") ? "weather"
      : s.apiId.includes("crypto") ? "data" : "ai",
    requiresKey: s.apiId.includes("ai"),
    keyEnvVar: s.apiId.includes("ai") ? "GROQ_API_KEY" : "",
    provider: s.provider,
    totalCalls: Number(s.totalCalls),
    active: s.active,
    source: "chain"
  };
}

async function getAPIsFromChain() {
  try {
    const vault = getVault();
    if (!vault) throw new Error("Vault not available");

    const count = await vault.serviceCount();
    const apis = [];

    for (let i = 0; i < Number(count); i++) {
      try {
        const s = await vault.getService(i);
        if (s.active) {
          apis.push(serviceToAPI(s));
        }
      } catch (e) {
        continue;
      }
    }

    if (apis.length > 0) {
      console.log(`[CHAIN REGISTRY] Loaded ${apis.length}` + " services from Kite chain");
      return apis;
    }
    throw new Error("No active services on chain");
  } catch (e) {
    console.warn("[CHAIN REGISTRY] Falling back to local registry:", e.message);
    const local = require("./registryLoader");
    return local.getAllAPIs();
  }
}

async function getBestAPIFromChain(budget) {
  const apis = await getAPIsFromChain();
  const affordable = apis
    .filter(a => a.costUSDC <= budget && a.active !== false)
    .sort((a, b) => b.qualityScore - a.qualityScore);
  return affordable[0] || null;
}

async function getAPIsUnderBudgetFromChain(budget) {
  const apis = await getAPIsFromChain();
  return apis
    .filter(a => a.costUSDC <= budget && a.active !== false)
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

module.exports = {
  getAPIsFromChain,
  getBestAPIFromChain,
  getAPIsUnderBudgetFromChain
};