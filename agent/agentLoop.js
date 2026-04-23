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
    step, type, message, data,
    timestamp: new Date().toISOString()
  };
  actionLog.push(entry);
  console.log(`[ORCHESTRATOR][${step}][${type}] ${message}`);
  return entry;
}

async function callGroq(prompt, maxTokens = 200) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  if (!data.choices?.[0]?.message?.content) {
    throw new Error("Empty response from Groq");
  }
  return data.choices[0].message.content;
}

async function analyzeTask(task) {
  const prompt = `Analyze this task for an autonomous AI agent.

Task: "${task}"

Return ONLY valid JSON, no markdown:
{
  "type": "data_query|analysis|comparison|prediction|multi_step",
  "subQuestions": ["atomic", "questions", "this", "task", "contains"],
  "requiresLiveData": true,
  "requiresReasoning": true,
  "requiresMultipleDataSources": true,
  "dataDomains": ["crypto", "weather", "ai_analysis"],
  "complexity": "simple|moderate|complex",
  "intent": "one sentence what user actually wants"
}`;

  try {
    const response = await callGroq(prompt, 300);
    const cleaned = response.trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    return JSON.parse(match[0]);
  } catch (e) {
    return {
      type: "data_query",
      subQuestions: [task],
      requiresLiveData: /price|weather|current|today|now/i.test(task),
      requiresReasoning: /should|analyze|recommend|best|why|how/i.test(task),
      requiresMultipleDataSources: /and|also|plus|both/i.test(task),
      dataDomains: [
        /crypto|bitcoin|ethereum|price/i.test(task) ? "crypto" : null,
        /weather|temperature|forecast/i.test(task) ? "weather" : null,
        /analyze|recommend|explain|strategy/i.test(task) ? "ai_analysis" : null
      ].filter(Boolean),
      complexity: "moderate",
      intent: task
    };
  }
}

async function selectAPIsWithReasoning(task, analysis, availableAPIs, budget) {
  const apiDescriptions = availableAPIs
    .map(api =>
      `ID: ${api.id} | Name: ${api.name} | ` +
      `Cost: $${api.costUSDC} | ` +
      `Reputation: ${api.reputationScore}/100 | ` +
      `Calls: ${api.totalCalls || 0} | ` +
      `Slashed: ${api.slashed || false}`
    )
    .join("\n");

  const prompt = `You are an intelligent orchestrator on Kite chain.

TASK: "${task}"

TASK ANALYSIS:
- Type: ${analysis.type}
- Sub-questions: ${analysis.subQuestions?.join(", ")}
- Needs live data: ${analysis.requiresLiveData}
- Needs reasoning: ${analysis.requiresReasoning}
- Data domains: ${analysis.dataDomains?.join(", ")}

AVAILABLE APIs ON KITE CHAIN:
${apiDescriptions}

BUDGET: $${budget} KITE

RULES:
1. "crypto" domain → MUST include coingecko-price
2. "weather" domain → MUST include weather-basic
3. "ai_analysis" domain OR requiresReasoning → MUST include openai-gpt4o-mini
4. NEVER select slashed providers
5. PREFER higher reputation scores
6. Total cost MUST stay under budget
7. For complex tasks select ALL relevant agents

Return ONLY JSON:
{
  "selected": ["api-id-1", "api-id-2"],
  "reasoning": "one sentence why these agents",
  "estimatedCost": 0.00,
  "expectedOutcome": "what combined output enables"
}`;

  try {
    const response = await callGroq(prompt, 250);
    const cleaned = response.trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");

    const result = JSON.parse(match[0]);
    log(3, "DECOMPOSE", `Reasoning: ${result.reasoning}`);
    log(3, "DECOMPOSE", `Expected: ${result.expectedOutcome}`);

    return result.selected
      .map(id => availableAPIs.find(a => a.id === id))
      .filter(Boolean)
      .filter(a => !a.slashed);

  } catch (e) {
    log(3, "DECOMPOSE", `AI selection failed, using domain fallback: ${e.message}`);

    const domainMap = {
      crypto: "coingecko-price",
      weather: "weather-basic",
      ai_analysis: "openai-gpt4o-mini"
    };

    const selectedIds = (analysis.dataDomains || [])
      .map(domain => domainMap[domain])
      .filter(Boolean);

    if (analysis.requiresReasoning && !selectedIds.includes("openai-gpt4o-mini")) {
      selectedIds.push("openai-gpt4o-mini");
    }

    if (selectedIds.length === 0) {
      selectedIds.push("coingecko-price");
    }

    let runningCost = 0;
    return selectedIds
      .map(id => availableAPIs.find(a => a.id === id))
      .filter(Boolean)
      .filter(a => {
        if (a && runningCost + a.costUSDC <= budget) {
          runningCost += a.costUSDC;
          return true;
        }
        return false;
      });
  }
}

async function intermediateReasoning(task, completedResults, remainingAPIs) {
  if (!completedResults.length || !remainingAPIs.length) {
    return {
      insight: "Proceeding with plan",
      shouldAddAgent: false
    };
  }

  const completedSummary = completedResults
    .map(r => `${r.api.name}: ${JSON.stringify(r.data).slice(0, 200)}`)
    .join("\n");

  const prompt = `You are mid-execution of a multi-agent task.

Original task: "${task}"

Data retrieved so far:
${completedSummary}

Remaining agents: ${remainingAPIs.map(a => a.name).join(", ")}

Return ONLY JSON:
{
  "insight": "one sentence interim finding",
  "shouldAddAgent": false,
  "suggestedAgent": null,
  "planChange": "none"
}`;

  try {
    const response = await callGroq(prompt, 150);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    return JSON.parse(match[0]);
  } catch (e) {
    return {
      insight: "Data collected, proceeding",
      shouldAddAgent: false
    };
  }
}

async function deepSynthesis(task, analysis, successfulResults) {
  const dataContext = successfulResults.map(r => {
    const data = r.data || {};
    let readable = "";

    if (data.bitcoin || data.ethereum) {
      readable =
        `BTC: $${data.bitcoin?.usd ?? "N/A"}, ` +
        `ETH: $${data.ethereum?.usd ?? "N/A"}`;
    } else if (data.temperature !== undefined) {
      readable =
        `${data.city || "Location"}: ${data.temperature}°C, ` +
        `wind ${data.windspeed}km/h`;
    } else if (data.response) {
      readable = data.response.slice(0, 300);
    } else {
      readable = JSON.stringify(data).slice(0, 200);
    }

    return `[${r.api.name} — rep ${r.api.reputationScore}/100]: ${readable}`;
  }).join("\n\n");

  const prompt = `You are an autonomous AI agent that executed ${successfulResults.length} paid API calls on Kite blockchain.

TASK: "${task}"
INTENT: ${analysis?.intent || task}

REAL-TIME DATA FROM BLOCKCHAIN-VERIFIED SOURCES:
${dataContext}

Think step by step:
1. What does each data source tell us?
2. How do the data points relate?
3. What is the direct answer?
4. What actionable insight can we provide?

Return ONLY JSON:
{
  "reasoningChain": "step 1 finding → step 2 connection → step 3 conclusion",
  "answer": "2-3 sentences using actual numbers, direct and specific",
  "confidence": 0.85,
  "caveat": "any important limitation",
  "actionableInsight": "one specific thing user can do now"
}`;

  try {
    const response = await callGroq(prompt, 400);
    const cleaned = response.trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");

    const result = JSON.parse(match[0]);
    if (!result.answer || result.answer.trim() === "") {
      throw new Error("Empty answer");
    }
    return result;

  } catch (e) {
    const parts = successfulResults.map(r => {
      const data = r.data || {};
      if (data.bitcoin?.usd) {
        return `Bitcoin is at $${data.bitcoin.usd.toLocaleString()} and Ethereum at $${data.ethereum?.usd?.toLocaleString()}`;
      }
      if (data.temperature !== undefined) {
        return `Weather: ${data.temperature}°C in ${data.city}`;
      }
      if (data.response) return data.response.slice(0, 200);
      return `${r.api.name} data retrieved`;
    });

    return {
      reasoningChain: "Data retrieved → formatted → synthesized",
      answer: parts.join(". ") + ".",
      confidence: 0.65,
      caveat: "AI synthesis failed, showing raw summary",
      actionableInsight: "Review the data above for decision making"
    };
  }
}

async function runSingleAgent(api, task, dryRun, stepNum) {
  function agentLog(type, message, data = {}) {
    return log(stepNum, type, `[${api.name}] ${message}`, data);
  }

  try {
    const sufficient = dryRun ? true : await paymentService.checkBudgetSufficient(api.costUSDC);
    if (!sufficient) {
      agentLog("BUDGET_CHECK", `Insufficient budget for ${api.id}`);
      return {
        api, success: false,
        error: "Insufficient budget"
      };
    }
    agentLog("BUDGET_CHECK", "Budget sufficient ✓");

    let paymentResult;
    if (dryRun) {
      agentLog("PAY", `[DRY RUN] Skipping payment for ${api.id}`);
      paymentResult = {
        success: true,
        txHash: "0xDRYRUN_" + api.id,
        amountUSDC: api.costUSDC
      };
    } else {
      agentLog("PAY", `Paying $${api.costUSDC} KITE on chain...`);
      paymentResult = await paymentService.recordPayment(
        api.id,
        api.costUSDC,
        `Orchestrator hired ${api.name} for: ${task.slice(0, 50)}`
      );
      if (!paymentResult.success) {
        agentLog("PAY", `Payment failed: ${paymentResult.error}`);
        return {
          api, success: false,
          error: paymentResult.error
        };
      }
      agentLog("PAY", `Payment confirmed. TxHash: ${paymentResult.txHash}`);
    }

    agentLog("EXECUTE", `Calling ${api.name}...`);
    const result = await executor.executeAPI(api, task);

    if (!result.success) {
      agentLog("EXECUTE", `Failed: ${result.error}`);
      return {
        api, success: false,
        error: result.error,
        txHash: paymentResult.txHash
      };
    }

    agentLog("EXECUTE", `Success: ${JSON.stringify(result.data).slice(0, 100)}`);
    agentLog("EXECUTE", `Reputation score: ${api.reputationScore}/100`);

    return {
      api,
      success: true,
      data: result.data,
      txHash: paymentResult.txHash,
      amountUSDC: api.costUSDC
    };

  } catch (err) {
    log(stepNum, "ERROR", `[${api.name}] ${err.message}`);
    return { api, success: false, error: err.message };
  }
}

async function runAgent(task, options = {}) {
  const { dryRun = false } = options;
  actionLog.length = 0;

  let totalCostUSDC = 0;
  let txHashes = [];

  try {
    log(1, "PLAN", `Orchestrator received task: "${task}"`);

    const statusData = dryRun ? { remainingBudget: "1.0" } : await paymentService.getStatus();
    const budget = dryRun ? 1.0 : parseFloat(statusData.remainingBudget || "0");

    log(1, "PLAN", `Budget: $${budget} KITE | Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

    if (budget <= 0 && !dryRun) {
      log(1, "PLAN", "Budget exhausted.");
      return {
        task, status: "budget_exhausted",
        stepsExecuted: 1,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC: 0, txHashes: []
      };
    }

    log(2, "ANALYZE", "Running deep task analysis...");
    const taskAnalysis = await analyzeTask(task);
    log(2, "ANALYZE", `Type: ${taskAnalysis.type} | Complexity: ${taskAnalysis.complexity}`);
    log(2, "ANALYZE", `Sub-questions: ${taskAnalysis.subQuestions?.join(" | ")}`);
    log(2, "ANALYZE", `Domains needed: ${taskAnalysis.dataDomains?.join(", ")}`);

    log(3, "DECOMPOSE", "Querying on-chain registry on Kite chain...");
    let allAPIs;
    if (dryRun) {
      allAPIs = registryLoader.getAllAPIs();
      log(3, "DECOMPOSE", `Fallback: ${allAPIs.length} services from local registry`);
    } else {
      try {
        allAPIs = await chainRegistry.getAPIsFromChain();
        log(3, "DECOMPOSE", `${allAPIs.length} services loaded from chain`);
      } catch (e) {
        allAPIs = registryLoader.getAllAPIs();
        log(3, "DECOMPOSE", `Fallback: ${allAPIs.length} services from local registry`);
      }
    }

    const availableAPIs = allAPIs.filter(api => !api.slashed);

    let selectedAPIs = [];
    if (dryRun) {
      selectedAPIs = availableAPIs
        .filter(api => !api.requiresKey)
        .slice(0, 2);
      log(3, "DECOMPOSE", `[DRY RUN] Selected: ${selectedAPIs.map(a => a.id).join(", ")}`);
    } else {
      selectedAPIs = await selectAPIsWithReasoning(task, taskAnalysis, availableAPIs, budget);
      log(3, "DECOMPOSE", `Selected ${selectedAPIs.length} agents: ${selectedAPIs.map(a => a.id).join(", ")}`);
    }

    if (!selectedAPIs.length) {
      return {
        task, status: "budget_exhausted",
        stepsExecuted: 3,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC: 0, txHashes: []
      };
    }

    log(4, "DISPATCH", `Dispatching ${selectedAPIs.length} agents sequentially on Kite chain`);
    const rawResults = [];
    for (let i = 0; i < selectedAPIs.length; i++) {
      const api = selectedAPIs[i];
      log(4, "DISPATCH", `Agent ${i + 1}/${selectedAPIs.length}: ${api.name}`);

      const result = await runSingleAgent(api, task, dryRun, 4);
      rawResults.push(result);

      if (!dryRun && result.success && i < selectedAPIs.length - 1) {
        try {
          const interim = await intermediateReasoning(task, rawResults.filter(r => r.success), selectedAPIs.slice(i + 1));
          log(4, "REASON", `Interim insight: ${interim.insight}`);

          if (interim.shouldAddAgent && interim.suggestedAgent) {
            const extra = availableAPIs.find(a => a.id === interim.suggestedAgent);
            const runningCost = rawResults.reduce((s, r) => s + (r.amountUSDC || 0), 0);
            if (extra && !selectedAPIs.find(a => a.id === extra.id) && runningCost + extra.costUSDC <= budget) {
              selectedAPIs.push(extra);
              log(4, "REASON", `Dynamically added: ${extra.name}`);
            }
          }
        } catch (e) {
        }
      }

      if (i < selectedAPIs.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const successfulResults = rawResults.filter(r => r.success);
    totalCostUSDC = successfulResults.reduce((sum, r) => sum + (r.amountUSDC || 0), 0);
    txHashes = successfulResults.map(r => r.txHash).filter(Boolean);

    log(4, "DISPATCH", `Sequential execution complete. ${successfulResults.length}/${selectedAPIs.length} succeeded. Cost: $${totalCostUSDC.toFixed(4)} KITE`);
    if (txHashes.length > 0) {
      log(4, "DISPATCH", `On-chain receipts: ${txHashes.join(", ")}`);
    }

    if (!successfulResults.length) {
      return {
        task, status: "error",
        stepsExecuted: 4,
        actionLog: [...actionLog],
        finalResult: null,
        totalCostUSDC, txHashes
      };
    }

    log(5, "SYNTHESIZE", "Running chain-of-thought synthesis with Groq...");
    const synthesis = await deepSynthesis(task, taskAnalysis, successfulResults);

    log(5, "SYNTHESIZE", `Reasoning: ${synthesis.reasoningChain}`);
    log(5, "SYNTHESIZE", `💡 ${synthesis.answer}`);
    log(5, "SYNTHESIZE", `Confidence: ${(synthesis.confidence * 100).toFixed(0)}%`);
    if (synthesis.actionableInsight) {
      log(5, "SYNTHESIZE", `→ ${synthesis.actionableInsight}`);
    }

    log(6, "REPORT", `✅ Complete. ${selectedAPIs.length} agents · $${totalCostUSDC.toFixed(4)} KITE · ${txHashes.length} receipts · ${(synthesis.confidence * 100).toFixed(0)}% confidence`);

    return {
      task,
      status: "complete",
      stepsExecuted: 6,
      actionLog: [...actionLog],
      finalResult: {
        summary: synthesis.answer,
        reasoning: synthesis.reasoningChain,
        confidence: synthesis.confidence,
        caveat: synthesis.caveat,
        actionableInsight: synthesis.actionableInsight,
        agentResults: successfulResults.map(r => ({
          agent: r.api.name,
          data: r.data,
          txHash: r.txHash,
          cost: r.amountUSDC
        })),
        totalAgents: selectedAPIs.length,
        successfulAgents: successfulResults.length
      },
      totalCostUSDC,
      txHashes,
      txHash: txHashes[0] || null
    };

  } catch (err) {
    log(0, "ERROR", `Orchestrator error: ${err.message}`);
    return {
      task, status: "error",
      stepsExecuted: 0,
      actionLog: [...actionLog],
      finalResult: null,
      totalCostUSDC: 0, txHashes: [],
      error: err.message
    };
  }
}

module.exports = { runAgent };
