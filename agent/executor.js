// File: Desktop/The-Acquirer/agent/executor.js
async function executeAPI(apiEntry, task) {
  try {
    switch (apiEntry.id) {
      case "weather-basic":
        try {
          const cityMatch = task.match(/(?:in|for|weather in)\s+([A-Za-z\s-]+)/i);
          const city = cityMatch ? cityMatch[1].trim() : "London";
          const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&current_weather=true");
          const payload = await response.json();
          const current = payload.current_weather || {};
          return { success: true, data: { city: city || "London", temperature: current.temperature, windspeed: current.windspeed, weathercode: current.weathercode }, source: "open-meteo" };
        } catch (err) {
          return { success: false, error: err.message, source: apiEntry.id };
        }
      case "crypto-price":
      case "coingecko-price":
        try {
          const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd");
          const data = await response.json();
          return { success: true, data: { bitcoin: { usd: data.bitcoin?.usd }, ethereum: { usd: data.ethereum?.usd } }, source: "coingecko" };
        } catch (err) {
          return { success: false, error: err.message, source: apiEntry.id };
        }
      case "openai-gpt4o-mini":
      case "ai-inference-v1": {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          return {
            success: false,
            error: "GROQ_API_KEY not set",
            source: "groq"
          };
        }
        try {
          const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
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
            }
          );
          const data = await response.json();
          if (data.error) {
            return {
              success: false,
              error: data.error.message,
              source: "groq"
            };
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
        } catch (err) {
          return {
            success: false,
            error: err.message,
            source: "groq"
          };
        }
      }
      default:
        return { success: false, error: "Unknown API id: " + apiEntry.id };
    }
  } catch (err) {
    return { success: false, error: err.message, source: apiEntry.id };
  }
}

module.exports = { executeAPI };