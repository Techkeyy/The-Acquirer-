// File: Desktop/The-Acquirer/backend/server.js
require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const { runAgent } = require("../agent/agentLoop");
const { x402Payment } = require("./x402");
const paymentService = require("../agent/paymentService");
const registry = require("../agent/registry.json");
const deployment = require("../shared/BudgetVault.deployment.json");

const recentAgentCalls = [];

function getVault() {
  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.KITE_RPC_URL || "http://127.0.0.1:8545",
      { chainId: parseInt(process.env.KITE_CHAIN_ID || "31337"),
        name: "kite" },
      { staticNetwork: true, polling: false }
    );
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    return new ethers.Contract(deployment.contractAddress, deployment.abi, signer);
  } catch(e) { return null; }
}

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 4000;

app.get("/health", async (req, res) => {
  try { res.json({ status: "ok", timestamp: new Date().toISOString(), service: "The Acquirer Backend" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/status", async (req, res) => {
  try { res.json(await paymentService.getStatus()); }
  catch (err) {
    // Always return valid JSON even on total failure
    res.status(200).json({
      contractAddress: "0x0000000000000000000000000000000000000000",
      totalDeposited: "0.0",
      totalSpent: "0.0",
      remainingBudget: "0.0",
      paymentCount: 0,
      network: "offline",
      chainConnected: false,
      offlineMode: true,
      error: err.message
    });
  }
});

app.post("/run-agent", async (req, res) => {
  try {
    const { task, dryRun } = req.body || {};
    if (!task) return res.status(400).json({ error: "task is required" });
    console.log("[SERVER] Running agent for task:", task);
    res.json(await runAgent(task, { dryRun: dryRun || false, maxSteps: 5 }));
  } catch (err) { res.status(500).json({ error: err.message, stack: err.stack }); }
});

app.post(
  "/agent/execute",
  x402Payment(0.00002),
  async (req, res) => {
    try {
      const { task, maxCost } = req.body || {};
      if (!task) {
        return res.status(400).json({
          error: "task is required",
          example: { task: "What is the Bitcoin price?" }
        });
      }

      console.log("[AGENT ENDPOINT] Task:", task);
      console.log("[AGENT ENDPOINT] Paid by:", req.payment?.sender);

      const result = await runAgent(task, {
        dryRun: false,
        maxSteps: 5,
        maxCost
      });

      if (result.status === "complete") {
        recentAgentCalls.unshift({
          task: task.slice(0, 60),
          sender: req.payment?.sender,
          txHash: req.payment?.txHash,
          answer: result.finalResult?.summary?.slice(0, 80),
          cost: result.totalCostUSDC,
          timestamp: new Date().toISOString()
        });
        if (recentAgentCalls.length > 10) recentAgentCalls.pop();
      }

      res.json({
        success: result.status === "complete",
        task,
        answer: result.finalResult?.summary || null,
        data: result.finalResult?.agentResults || [],
        cost: result.totalCostUSDC,
        txHashes: result.txHashes,
        payment: {
          verified: true,
          receipt: req.payment?.txHash,
          sender: req.payment?.sender,
          amount: req.payment?.amount
        },
        protocol: "x402",
        network: "kite-testnet"
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/agent/info", (req, res) => {
  res.json({
    name: "The Acquirer",
    description: "On-chain API acquisition protocol for AI agents",
    protocol: "x402",
    version: "1.0",
    network: "kite-testnet",
    chainId: 2368,
    contract: deployment.contractAddress,
    endpoints: {
      execute: {
        path: "/agent/execute",
        method: "POST",
        payment: "x402",
        cost: "0.00002 ETH",
        body: {
          task: "string — plain language task",
          maxCost: "number — optional budget limit in ETH"
        }
      },
      marketplace: {
        path: "/marketplace",
        method: "GET",
        payment: "free",
        description: "List all registered API services"
      },
      leaderboard: {
        path: "/leaderboard",
        method: "GET",
        payment: "free",
        description: "Reputation scores for all providers"
      }
    },
    howToUse: [
      "1. Call POST /agent/execute with your task",
      "2. Receive HTTP 402 with payment details and nonce",
      "3. Send ETH to the contract address",
      "4. Retry with X-Payment-Receipt, X-Payment-Sender, X-Payment-Nonce headers",
      "5. Receive your answer"
    ]
  });
});

app.get("/history", async (req, res) => {
  try {
    const payments = await paymentService.getPaymentHistory();
    res.json({ payments: Array.isArray(payments) ? payments : [] });
  } catch (err) {
    // Always return valid JSON — never 500
    res.status(200).json({ payments: [], error: err.message });
  }
});

app.get("/agent-calls", (req, res) => {
  res.json({ calls: recentAgentCalls });
});

app.get("/leaderboard", async (req, res) => {
  try {
    const vault = getVault();
    if (!vault) return res.json({ leaderboard: [] });
    const [ids, scores, calls] = await vault.getReputationLeaderboard();
    const leaderboard = ids.map((id, i) => ({
      serviceId: Number(id),
      reputationScore: Number(scores[i]),
      totalCalls: Number(calls[i])
    }));
    leaderboard.sort((a, b) => b.reputationScore - a.reputationScore);
    res.json({ leaderboard });
  } catch (err) {
    res.status(200).json({ leaderboard: [], error: err.message });
  }
});

app.get("/registry", async (req, res) => {
  try { res.json({ apis: registry }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/deposit", async (req, res) => {
  try { res.json(await paymentService.depositBudget(req.body.amountEth)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/reset-demo", async (req, res) => {
  try {
    const result = await paymentService.depositBudget("0.05");
    const status = await paymentService.getStatus();
    res.json({
      success: true,
      message: "Demo reset. Budget topped up by 0.05 ETH.",
      txHash: result.txHash,
      newBudget: status.remainingBudget
    });
  } catch (err) {
    res.status(200).json({
      success: false,
      message: err.message
    });
  }
});

app.get("/marketplace", async (req, res) => {
  try {
    const vault = getVault();
    if (!vault) return res.json({ services: [], offlineMode: true });
    const serviceCount = await vault.serviceCount();
    const services = [];
    for (let i = 0; i < Number(serviceCount); i++) {
      const s = await vault.getService(i);
      services.push({
        id: Number(s.id),
        apiId: s.apiId,
        name: s.name,
        endpoint: s.endpoint,
        pricePerCall: ethers.formatEther(s.pricePerCall),
        priceUSDC: (Number(ethers.formatEther(s.pricePerCall)) * 1000).toFixed(4),
        provider: s.provider,
        active: s.active,
        totalCalls: Number(s.totalCalls),
        totalEarned: ethers.formatEther(s.totalEarned)
      });
    }
    res.json({ services, totalServices: services.length });
  } catch (err) {
    res.status(200).json({ services: [], error: err.message });
  }
});

app.post("/register-api", async (req, res) => {
  try {
    const { apiId, name, endpoint, priceUSDC } = req.body;
    if (!apiId || !name || !endpoint || !priceUSDC) {
      return res.status(400).json({ error: "apiId, name, endpoint, priceUSDC required" });
    }
    const vault = getVault();
    if (!vault) return res.status(503).json({ error: "Chain not available" });

    const priceEth = (parseFloat(priceUSDC) / 1000).toString();
    const priceWei = ethers.parseEther(priceEth);

    const tx = await vault.registerAPI(apiId, name, endpoint, priceWei);
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt.hash,
      apiId,
      name,
      priceUSDC: parseFloat(priceUSDC),
      message: `API "${name}" registered on-chain`
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.post("/purchase-api", async (req, res) => {
  try {
    const { apiId, note } = req.body;
    if (!apiId) return res.status(400).json({ error: "apiId required" });
    const vault = getVault();
    if (!vault) return res.status(503).json({ error: "Chain not available" });

    const tx = await vault.purchaseAPI(apiId, note || "Agent purchase");
    const receipt = await tx.wait();

    res.json({
      success: true,
      txHash: receipt.hash,
      apiId,
      blockNumber: receipt.blockNumber,
      message: `API "${apiId}" purchased on-chain`
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.post("/dispute", async (req, res) => {
  try {
    const { serviceId, reason } = req.body;
    if (serviceId === undefined) {
      return res.status(400).json({ error: "serviceId required" });
    }
    const vault = getVault();
    if (!vault) return res.status(503).json({ error: "Chain not available" });
    const tx = await vault.fileDispute(serviceId, reason || "Poor service quality");
    const receipt = await tx.wait();
    res.json({
      success: true,
      txHash: receipt.hash,
      message: "Dispute filed on-chain"
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get("/protocol-stats", async (req, res) => {
  try {
    const vault = getVault();
    if (!vault) return res.json({
      totalServices: 0,
      totalTransactions: 0,
      offlineMode: true
    });

    const [serviceCount, paymentCount, totalSpent] = await Promise.all([
      vault.serviceCount(),
      vault.paymentCount(),
      vault.totalSpent()
    ]);

    res.json({
      totalServices: Number(serviceCount),
      totalTransactions: Number(paymentCount),
      totalVolumeETH: ethers.formatEther(totalSpent),
      totalVolumeUSDC: (Number(ethers.formatEther(totalSpent)) * 1000).toFixed(4),
      contractAddress: deployment.contractAddress,
      network: deployment.network
    });
  } catch (err) {
    res.status(200).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[The Acquirer] Backend running on http://localhost:${PORT}`);
  console.log(`[The Acquirer] Routes: GET /health /status /history /registry | POST /run-agent /deposit`);
});

module.exports = app;
