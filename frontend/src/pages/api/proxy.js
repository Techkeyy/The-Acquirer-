// File: Desktop/The-Acquirer/frontend/src/pages/api/proxy.js
export default async function handler(req, res) {
  try {
    const path = Array.isArray(req.query.path) ? req.query.path.join("/") : (req.query.path || "");
    const url = `http://localhost:4000/${path}`;
    const init = { method: req.method, headers: { "Content-Type": "application/json" } };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = JSON.stringify(req.body || {});
    const response = await fetch(url, init);
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}