// File: Desktop/The-Acquirer/agent/index.js
"use strict";
const { runAgent } = require("./agentLoop");

module.exports = { runAgent };

// Allow direct execution for testing
if (require.main === module) {
  const task = process.argv[2] || "What is the current Bitcoin price?";
  const dryRun = process.argv[3] === "--dry";

  console.log(`Running agent: "${task}"`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);

  runAgent(task, { dryRun })
    .then((result) => {
      console.log("\n=== RESULT ===");
      console.log("Status:", result.status);
      console.log("Summary:", result.finalResult?.summary);
      console.log("Cost:", result.totalCostUSDC, "KITE");
      console.log("TxHashes:", result.txHashes);
    })
    .catch(console.error);
}
