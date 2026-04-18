"use strict";
require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});

const registryLoader = require("./registryLoader");
const chainRegistry = require("./chainRegistry");
const paymentService = require("./paymentService");
const executor = require("./executor");

const actionLog = [];

function log(step, type, message, data = {}) {
  const entry = {
    step,
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  actionLog.push(entry);
  console.log(`[ORCHESTRATOR][${step}][${type}] ${message}`);
  return entry;
}

async function callGroq(prompt, maxTokens = 200) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[GROQ] No API key found");
    throw new Error("GROQ_API_KEY not set");
  }
  console.log("[GROQ] Calling llama-3.1-8b-instant...");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      }),
    });

    const text = await response.text();
    console.log("[GROQ] Status:", response.status);
    console.log("[GROQ] Response:", text.slice(0, 200));

    if (!response.ok) {
      throw new Error("Groq API error " + response.status + ": " + text);
    }

    const data = JSON.parse(text);
    if (data.error) {
      throw new Error(data.error.message);
    }
    if (!data.choices?.[0]?.message?.content) {
      throw new Error("Empty response from Groq");
    }
    return data.choices[0].message.content;
  } catch (err) {
    console.error("[GROQ] Error:", err.message);
    throw err;
  }
}

function buildFallbackSummary(successfulResults) {
  const parts = successfulResults.map((result) => {
    const data = result.data || {};
    if (data.bitcoin && data.ethereum) {
      const btc = data.bitcoin.usd != null ? `$${data.bitcoin.usd}` : "an unavailable price";
      const eth = data.ethereum.usd != null ? `$${data.ethereum.usd}` : "an unavailable price";
      return `Bitcoin is at ${btc} and Ethereum is at ${eth}.`;
    }
    if (data.city && data.temperature != null) {
      const wind = data.windspeed != null ? `${data.windspeed}` : "unknown";
      return `The weather in ${data.city} is ${data.temperature}°C with wind around ${wind}.`;
    }
    if (data.response) {
      return String(data.response);
    }
    return `${result.api.name} returned ${JSON.stringify(data)}.`;
  });

  if (!parts.length) {
    return "No readable answer was produced, but the requested agents completed successfully.";
  }

  return `Based on the live data, ${parts.join(" ")}`;
}

async function decomposeTask(task, availableAPIs, budget) {
  const apiList = availableAPIs
    .map((api) => `- ${api.id}: ${api.description} (cost: $${api.costUSDC} KITE)`)
    .join("\n");

  const prompt = `You are an AI orchestrator selecting specialist agents.

User task: "${task}"

Available agents:
${apiList}

Budget: $${budget} KITE

RULES:
1. Select ALL agents whose data would help answer this task
2. If the task mentions crypto, prices, or portfolio → include crypto-price agent
3. If the task mentions weather, temperature, or outside → include weather-basic agent  
4. If the task needs analysis, reasoning, or a smart answer → include ai-inference agent
5. Never select more than 3 agents
6. Never exceed the budget
7. Always select at least 1 agent

For the task "${task}":
- Does it mention crypto/bitcoin/portfolio/price? → include crypto-price
- Does it mention weather/outside/temperature? → include weather-basic
- Does it need AI reasoning? → include openai-gpt4o-mini

Return ONLY a JSON array of agent IDs.
Example: ["weather-basic","coingecko-price"]
No explanation. No markdown. Just the array.`;

  const response = await callGroq(prompt, 100);
  const cleaned = response.trim().replace(/```json/g, "").replace(/```/g, "").trim();
  const ids = JSON.parse(cleaned);
  if (!Array.isArray(ids)) throw new Error("Invalid decomposition");
  return ids;
}

async function runSingleAgent(api, task, dryRun, stepNum) {
  const agentLog = [];

  function agentLog_(type, message, data = {}) {
    const entry = log(stepNum, type, `[${api.name}] ${message}`, data);
    agentLog.push(entry);
    return entry;
  }

  try {
    const sufficient = dryRun ? true : await paymentService.checkBudgetSufficient(api.costUSDC);
    if (!sufficient) {
      agentLog_("BUDGET_CHECK", `Insufficient budget for ${api.id}`);
      return { api, success: false, error: "Insufficient budget", agentLog };
    }
    agentLog_("BUDGET_CHECK", "Budget sufficient ✓");

    let paymentResult;
    if (dryRun) {
      agentLog_("PAY", `[DRY RUN] Skipping payment for ${api.id}`);
      paymentResult = {
        success: true,
        txHash: "0xDRYRUN_" + api.id,
        amountUSDC: api.costUSDC,
      };
    } else {
      agentLog_("PAY", `Paying $${api.costUSDC} KITE...`);
      paymentResult = await paymentService.recordPayment(
        api.id,
        api.costUSDC,
        `Orchestrator hired ${api.name} for: ${task.slice(0, 50)}`
      );
      if (!paymentResult.success) {
        agentLog_("PAY", `Payment failed: ${paymentResult.error}`);
        return { api, success: false, error: paymentResult.error, agentLog };
      }
      agentLog_("PAY", `Payment confirmed. TxHash: ${paymentResult.txHash}`);
    }

    agentLog_("EXECUTE", `Calling ${api.name}...`);
    const result = await executor.executeAPI(api, task);

    if (!result.success) {
      agentLog_("EXECUTE", `Failed: ${result.error}`);
      return {
        api,
        success: false,
        error: result.error,
        txHash: paymentResult.txHash,
        agentLog,
      };
    }

    agentLog_("EXECUTE", `Success: ${JSON.stringify(result.data).slice(0, 100)}`);

    return {
      api,
      success: true,
      data: result.data,
      txHash: paymentResult.txHash,
      amountUSDC: api.costUSDC,
      agentLog,
    };
  } catch (err) {
    agentLog_("ERROR", err.message);
    return { api, success: false, error: err.message, agentLog };
  }
}

async function runAgent(task, options = {}) {
  const { dryRun = false } = options;
  actionLog.length = 0;

  let agentResults = [];
  let finalAnswer = null;
  let totalCostUSDC = 0;
  let txHashes = [];

  try {
    log(1, "PLAN", `Orchestrator received task: "${task}"`);

    const statusData = dryRun ? { remainingBudget: "1.0" } : await paymentService.getStatus();
    const budget = dryRun ? 1.0 : parseFloat(statusData.remainingBudget || "0");

    log(1, "PLAN", `Budget available: $${budget} KITE${dryRun ? " (dry run)" : " (live)"}`);

    if (budget <= 0 && !dryRun) {
      log(1, "PLAN", "Budget exhausted. Cannot proceed.");
      return {
        task,
        status: "budget_exhausted",
        stepsExecuted: 1,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC: 0,
        txHashes: [],
      };
    }

    log(2, "DECOMPOSE", "Analyzing task and selecting specialist agents...");
    log(2, "DECOMPOSE", "Querying on-chain API registry on Kite chain...");

    const allAPIs = await chainRegistry.getAPIsFromChain();
    let selectedIds = [];

    if (dryRun) {
      selectedIds = allAPIs
        .filter((api) => !api.requiresKey)
        .slice(0, 2)
        .map((api) => api.id);
      log(2, "DECOMPOSE", `[DRY RUN] Selected: ${selectedIds.join(", ")}`);
    } else {
      try {
        selectedIds = await decomposeTask(task, allAPIs, budget);
        log(2, "DECOMPOSE", `Groq selected agents: ${selectedIds.join(", ")}`);
      } catch (e) {
        const fallback = (await chainRegistry.getAPIsUnderBudgetFromChain(budget))
          .filter((api) => !api.requiresKey)
          .slice(0, 2)
          .map((api) => api.id);
        if (fallback.length > 0) {
          selectedIds = fallback;
          log(2, "DECOMPOSE", `Fallback to: ${selectedIds.join(", ")}`);
        } else {
          log(2, "DECOMPOSE", "No affordable agents found.");
        }
      }
    }

    if (!selectedIds.length) {
      return {
        task,
        status: "budget_exhausted",
        stepsExecuted: 2,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC: 0,
        txHashes: [],
      };
    }

    const allChainAPIs = await chainRegistry.getAPIsFromChain();
    const selectedAPIs = selectedIds
      .map((id) => allChainAPIs.find(a => a.id === id || a.chainId === id))
      .filter(Boolean);

    const totalCost = selectedAPIs.reduce((sum, api) => sum + api.costUSDC, 0);
    log(3, "VALIDATE", `Total cost for ${selectedAPIs.length} agents: $${totalCost.toFixed(4)} KITE`);

    if (totalCost > budget && !dryRun) {
      log(3, "VALIDATE", "Insufficient budget for full plan. Reducing to affordable subset.");
      let running = 0;
      const affordable = [];
      for (const api of selectedAPIs) {
        if (running + api.costUSDC <= budget) {
          affordable.push(api);
          running += api.costUSDC;
        }
      }
      selectedAPIs.length = 0;
      selectedAPIs.push(...affordable);
      log(3, "VALIDATE", `Reduced to ${selectedAPIs.length} agents: $${running.toFixed(4)} KITE`);
    }

    log(3, "VALIDATE", `Dispatching ${selectedAPIs.length} agents ${dryRun ? "in parallel" : "sequentially"}...`);
    log(4, "DISPATCH", `Dispatching ${selectedAPIs.length} agents sequentially on Kite chain`);
    selectedAPIs.forEach((api, i) => {
      log(4, "DISPATCH", `Agent ${i + 1}: ${api.name} ($${api.costUSDC} KITE)`);
    });

    if (dryRun) {
      agentResults = await Promise.all(
        selectedAPIs.map((api) => runSingleAgent(api, task, dryRun, 4))
      );
    } else {
      agentResults = [];
      for (let i = 0; i < selectedAPIs.length; i++) {
        const result = await runSingleAgent(selectedAPIs[i], task, dryRun, 4);
        agentResults.push(result);
        if (i < selectedAPIs.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    const successfulResults = agentResults.filter((result) => result.success);
    totalCostUSDC = successfulResults.reduce((sum, result) => sum + (result.amountUSDC || 0), 0);
    txHashes = successfulResults.map((result) => result.txHash).filter(Boolean);

    log(4, "DISPATCH", `Sequential execution complete. ${successfulResults.length}/${selectedAPIs.length} succeeded. Total cost: $${totalCostUSDC.toFixed(4)} KITE`);
    if (txHashes.length > 0) {
      log(4, "DISPATCH", `On-chain receipts: ${txHashes.join(", ")}`);
    }

    if (!successfulResults.length) {
      log(5, "SYNTHESIZE", "All agents failed. No results to synthesize.");
      return {
        task,
        status: "error",
        stepsExecuted: 4,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC,
        txHashes,
      };
    }

    log(5, "SYNTHESIZE", "Synthesizing results from all agents with Groq...");
    const resultsContext = successfulResults
      .map((result) => `${result.api.name}: ${JSON.stringify(result.data)}`)
      .join("\n");

    let summary = "";
    try {
      summary = await callGroq(
        `You are a helpful assistant. Answer this task clearly and concisely using the data provided.

Task: "${task}"

Data from specialist agents:
${resultsContext}

Give a clear, helpful answer in 2-3 sentences maximum.
Be specific — use the actual numbers and data provided.`,
        200
      );
      log(5, "SYNTHESIZE", `💡 ${summary}`);
    } catch (e) {
      summary = buildFallbackSummary(successfulResults);
      log(5, "SYNTHESIZE", "Groq synthesis failed, returning fallback summary.");
    }

    if (!summary || summary.trim() === "") {
      const parts = successfulResults.map((result) => {
        if (result.api.id === "coingecko-price" && result.data?.bitcoin) {
          return `Bitcoin is at $${result.data.bitcoin.usd}`;
        }
        if (result.api.id === "weather-basic" && result.data?.temperature) {
          return `Weather: ${result.data.temperature}°C`;
        }
        return `${result.api.name}: data retrieved`;
      });
      summary = parts.join(". ") + ".";
    }

    log(6, "REPORT", `Orchestration complete. ${selectedAPIs.length} agents hired. $${totalCostUSDC.toFixed(4)} KITE spent. ${txHashes.length} on-chain receipts.`);

    finalAnswer = {
      summary: summary,
      agentResults: successfulResults.map(r => ({
        agent: r.api.name,
        data: r.data,
        txHash: r.txHash,
        cost: r.amountUSDC
      })),
      totalAgents: selectedAPIs.length,
      successfulAgents: successfulResults.length
    };

    return {
      task,
      status: "complete",
      stepsExecuted: 6,
      actionLog: [...actionLog],
      finalResult: finalAnswer,
      totalCostUSDC,
      txHashes,
      txHash: txHashes[0] || null,
    };
  } catch (err) {
    log(0, "ERROR", `Orchestrator error: ${err.message}`);
    return {
      task,
      status: "error",
      stepsExecuted: 0,
      actionLog: [...actionLog],
      finalResult: null,
      totalCostUSDC: 0,
      txHashes: [],
      error: err.message,
    };
  }
}

module.exports = { runAgent };
