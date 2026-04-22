// File: Desktop/The-Acquirer/agent/executor.js
// File: Desktop/The-Acquirer/agent/executor.js
"use strict";
require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});

const KNOWN_HANDLERS = {
  "weather-basic": async (endpoint, task) => {
    const url = endpoint || "https://api.open-meteo.com/v1/forecast";
    const res = await fetch(`${url}?latitude=51.5&longitude=-0.1&current_weather=true`);
    const data = await res.json();
    return {
      success: true,
      data: {
        city: "London",
        temperature: data.current_weather?.temperature,
        windspeed: data.current_weather?.windspeed,
        weathercode: data.current_weather?.weathercode
      },
      source: "open-meteo"
    };
  },

  "crypto-price": async (endpoint, task) => {
    const url = endpoint || "https://api.coingecko.com/api/v3/simple/price";
    const res = await fetch(`${url}?ids=bitcoin,ethereum&vs_currencies=usd`);
    const data = await res.json();
    return {
      success: true,
      data,
      source: "coingecko"
    };
  },

  "coingecko-price": async (endpoint, task) => {
    const url = endpoint || "https://api.coingecko.com/api/v3/simple/price";
    const res = await fetch(`${url}?ids=bitcoin,ethereum&vs_currencies=usd`);
    const data = await res.json();
    return {
      success: true,
      data,
      source: "coingecko"
    };
  },

  "ai-inference": async (endpoint, task) => callAI(endpoint, task),
  "openai-gpt4o-mini": async (endpoint, task) => callAI(endpoint, task),
  "ai-inference-v1": async (endpoint, task) => callAI(endpoint, task)
};

async function callAI(endpoint, task) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GROQ_API_KEY not set", source: "groq" };
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 150,
      messages: [{ role: "user", content: task }]
    })
  });

  const data = await res.json();
  if (data.error) {
    return { success: false, error: data.error.message, source: "groq" };
  }

  return {
    success: true,
    data: {
      response: data.choices[0].message.content,
      model: data.model,
      tokens: data.usage?.completion_tokens
    },
    source: "groq"
  };
}

async function executeAPI(apiEntry, task) {
  const id = apiEntry.id || apiEntry.chainId || "";
  const endpoint = apiEntry.endpoint || "";

  const handler = KNOWN_HANDLERS[id];
  if (handler) {
    try {
      console.log(`[EXECUTOR] Using known handler for: ${id}`);
      return await handler(endpoint, task);
    } catch (err) {
      return {
        success: false,
        error: err.message,
        source: id
      };
    }
  }

  console.log(`[EXECUTOR] Unknown API ${id} — calling endpoint directly: ${endpoint}`);

  if (!endpoint) {
    return {
      success: false,
      error: "No endpoint registered for: " + id,
      source: id
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      const postRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: task, task }),
        signal: AbortSignal.timeout(10000)
      });
      const postData = await postRes.json();
      return {
        success: true,
        data: postData,
        source: id,
        dynamic: true
      };
    }

    const data = await res.json();
    return {
      success: true,
      data,
      source: id,
      dynamic: true
    };
  } catch (err) {
    return {
      success: false,
      error: `Dynamic call to ${endpoint} failed: ${err.message}`,
      source: id
    };
  }
}

module.exports = { executeAPI };