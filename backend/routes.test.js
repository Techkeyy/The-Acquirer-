// File: Desktop/The-Acquirer/backend/routes.test.js
const { spawn } = require("child_process");
const path = require("path");

const server = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: __dirname, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: "4000" } });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function test(name, fn) { try { await fn(); console.log(`✅ PASS: ${name}`); } catch (error) { console.log(`❌ FAIL: ${name} ${error.message}`); } }
const ready = new Promise((resolve, reject) => { server.stdout.on("data", (chunk) => { if (chunk.toString().includes("Backend running")) resolve(); }); server.stderr.on("data", (chunk) => { const text = chunk.toString(); if (text) console.error(text.trim()); }); server.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`server exited with code ${code}`))); });

(async () => {
  await Promise.race([ready, wait(1500)]);
  await test("GET /health", async () => {
    const response = await fetch("http://localhost:4000/health");
    const body = await response.json();
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    if (body.status !== "ok") throw new Error("status not ok");
  });
  await test("GET /api/registry", async () => {
    const response = await fetch("http://localhost:4000/api/registry");
    const body = await response.json();
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    if (body.success !== true) throw new Error("success false");
    if (!Array.isArray(body.apis) || body.apis.length !== 3) throw new Error("apis length mismatch");
  });
  await test("POST /api/run dryRun", async () => {
    const response = await fetch("http://localhost:4000/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "What is the Bitcoin price?", dryRun: true }) });
    const body = await response.json();
    if (response.status !== 200) throw new Error(`status ${response.status}`);
    if (body.success !== true) throw new Error("success false");
    if (body.status !== "complete") throw new Error(`status ${body.status}`);
    if (body.txHash !== "0xDRYRUN") throw new Error(`txHash ${body.txHash}`);
  });
})().finally(() => server.kill());