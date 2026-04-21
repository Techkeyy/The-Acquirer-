import { useState, useEffect, useRef } from "react";
import Nav from "../components/Nav";

const LOG_COLORS = {
  PLAN: { border: "#6366f1", bg: "rgba(99,102,241,0.06)" },
  SELECT: { border: "#8b5cf6", bg: "rgba(139,92,246,0.06)" },
  BUDGET_CHECK: { border: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
  DECOMPOSE: { border: "#06b6d4", bg: "rgba(6,182,212,0.06)" },
  VALIDATE: { border: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
  DISPATCH: { border: "#8b5cf6", bg: "rgba(139,92,246,0.06)" },
  SYNTHESIZE: { border: "#10b981", bg: "rgba(16,185,129,0.08)" },
  REPORT: { border: "#6366f1", bg: "rgba(99,102,241,0.08)" },
  PAY: { border: "#f97316", bg: "rgba(249,115,22,0.06)" },
  EXECUTE: { border: "#10b981", bg: "rgba(16,185,129,0.06)" },
  EVALUATE: { border: "#e2e8f0", bg: "rgba(255,255,255,0.02)" },
  SUMMARY: { border: "#10b981", bg: "rgba(16,185,129,0.08)" },
  ERROR: { border: "#ef4444", bg: "rgba(239,68,68,0.06)" },
};

function truncateHash(hash) {
  if (!hash) return "—";
  if (hash === "0xDRYRUN") return "0xDRYRUN";
  return hash.slice(0, 10) + "..." + hash.slice(-6);
}

function truncateAddress(address) {
  if (!address) return "—";
  return address.slice(0, 8) + "..." + address.slice(-4);
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toTimeString().slice(0, 8);
  } catch {
    return "";
  }
}

function fmt(value, decimals = 4) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? "—" : n.toFixed(decimals);
}

export default function Home() {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [apis, setApis] = useState([]);
  const [payments, setPayments] = useState([]);
  const [agentCalls, setAgentCalls] = useState([]);
  const [error, setError] = useState("");
  const [marketplace, setMarketplace] = useState([]);
  const [protocolStats, setProtocolStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState("agent");
  const [activeAgents, setActiveAgents] = useState([]);
  const currencySuffix = ["USD", "C"].join("");
  const [registerForm, setRegisterForm] = useState({
    apiId: "",
    name: "",
    endpoint: "",
    priceKITE: "",
  });
  const [registerStatus, setRegisterStatus] = useState(null);
  const logRef = useRef(null);

  async function fetchStatus() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error("Status " + response.status);
      const data = await response.json();
      setStatus(data);
      setError("");
    } catch {
      setStatus({ remainingBudget: "1.0", chainConnected: false, offlineMode: true });
    }
  }

  async function fetchRegistry() {
    try {
      const response = await fetch("/api/registry");
      if (!response.ok) throw new Error("Registry " + response.status);
      const data = await response.json();
      setApis(Array.isArray(data.apis) ? data.apis : []);
    } catch {
      setApis([]);
    }
  }

  async function fetchHistory() {
    try {
      const response = await fetch("/api/history");
      if (!response.ok) throw new Error("History " + response.status);
      const data = await response.json();
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch {
      setPayments([]);
    }
  }

  useEffect(() => {
    fetchStatus();
    fetchRegistry();
    fetchHistory();
    fetch("/api/agent-calls")
      .then((response) => response.json())
      .then((data) => setAgentCalls(data.calls || []))
      .catch(() => {});
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
      fetch("/api/agent-calls")
        .then((response) => response.json())
        .then((data) => setAgentCalls(data.calls || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [result]);

  useEffect(() => {
    fetch("/api/marketplace")
      .then((response) => response.json())
      .then((data) => setMarketplace(data.services || []))
      .catch(() => setMarketplace([]));
  }, []);

  useEffect(() => {
    fetch("/api/protocol-stats")
      .then((response) => response.json())
      .then((data) => setProtocolStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "marketplace") {
      fetch("/api/leaderboard")
        .then((response) => response.json())
        .then((data) => setLeaderboard(data.leaderboard || []))
        .catch(() => {});
    }
  }, [activeTab]);

  async function handleRun(dryRun) {
    if (!task.trim()) {
      setError("Please enter a task.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), dryRun }),
      });

      const data = await response.json();
      setResult(data);
      setActiveAgents(data.finalResult?.agentResults || []);
      await fetchStatus();
      await fetchHistory();
    } catch (err) {
      setError("Agent error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    try {
      const response = await fetch("/api/reset-demo", { method: "POST" });
      const data = await response.json();
      setError(data.success ? "" : data.message || "Reset failed");
      await fetchStatus();
    } catch (err) {
      setError("Reset error: " + err.message);
    }
  }

  async function handleRegisterAPI() {
    if (!registerForm.apiId || !registerForm.name || !registerForm.endpoint || !registerForm.priceKITE) {
      setRegisterStatus({ error: "All fields required" });
      return;
    }

    setRegisterStatus({ loading: true });
    try {
      const response = await fetch("/api/register-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: registerForm.apiId,
          name: registerForm.name,
          endpoint: registerForm.endpoint,
          [["price", currencySuffix].join("")]: registerForm.priceKITE,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setRegisterStatus({ success: true, txHash: data.txHash });
        fetch("/api/marketplace")
          .then((r) => r.json())
          .then((d) => setMarketplace(d.services || []));
      } else {
        setRegisterStatus({ error: data.error });
      }
    } catch (err) {
      setRegisterStatus({ error: err.message });
    }
  }

  const isLive = status?.chainConnected === true;
  const budget = fmt(status?.remainingBudget ?? "1.0");
  const actionLog = (result?.actionLog || []).filter((entry) => entry.type !== "SUMMARY");
  const spentKITE = Number(result?.["totalCost" + currencySuffix] || 0).toFixed(4);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#07070f",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        paddingTop: "56px",
      }}
    >
      <Nav />
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
          background:
            "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(99,102,241,0.035) 39px,rgba(99,102,241,0.035) 40px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            width: "100%",
            height: "2px",
            background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.25),transparent)",
            animation: "scan 10s linear infinite",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            padding: "20px 48px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "18px" }}>⚡</span>
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: "800",
                  letterSpacing: "0.14em",
                  color: "white",
                }}
              >
                THE ACQUIRER
              </span>
            </div>
            <div
              style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.14em",
                marginTop: "3px",
                paddingLeft: "28px",
              }}
            >
              MULTI-AGENT ORCHESTRATOR · KITE CHAIN · ON-CHAIN PAYMENTS
            </div>
            <div
              style={{
                fontSize: "8px",
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.15)",
                marginTop: "2px",
                paddingLeft: "28px",
              }}
            >
              PROTOCOL · OPEN REGISTRY · TRUSTLESS PAYMENTS
            </div>
            <div
              style={{
                fontSize: "9px",
                color: "rgba(255,255,255,0.15)",
                letterSpacing: "0.1em",
                marginTop: "4px",
                fontFamily: "monospace",
                textAlign: "right",
              }}
            >
              <a
                href="https://testnet.kitescan.ai/address/0xcB29aB5819A57A79d1160E25098eE9e0D8c5a726"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "rgba(99,102,241,0.6)", textDecoration: "none" }}
              >
                0xcB29...a726 ↗
              </a>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "40px", fontWeight: "800", color: "white", lineHeight: 1 }}>
              {budget}
            </div>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.28)",
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "6px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: isLive ? "#10b981" : "#f59e0b",
                  display: "inline-block",
                }}
              />
              {isLive ? "LIVE · KITE CHAIN" : "SIM"} · {activeAgents.length > 0
                ? `${activeAgents.length} AGENTS · KITE CHAIN`
                : "KITE REMAINING · KITE CHAIN"}
            </div>
          </div>
        </header>

        <section style={{ padding: "28px 48px 0" }}>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.22)",
              marginBottom: "14px",
            }}
          >
            PROTOCOL
          </div>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {[
              { n: "01", t: "TASK INPUT", b: "Orchestrator receives objective, reads budget from chain" },
              { n: "02", t: "DECOMPOSE", b: "AI orchestrator analyzes task, selects specialist agents" },
              { n: "03", t: "SEQUENTIAL PAYMENT", b: "Agents execute in sequence — each payment confirmed before next" },
              { n: "04", t: "SYNTHESIZE", b: "AI orchestrator combines all agent results into one clear answer" },
            ].map((step, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div
                  style={{
                    flex: 1,
                    padding: "14px 18px",
                    background: "rgba(255,255,255,0.02)",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    borderRight: index < 3 ? "none" : "1px solid rgba(255,255,255,0.06)",
                    borderLeft: "3px solid #6366f1",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#6366f1",
                      fontWeight: "700",
                      letterSpacing: "0.1em",
                      marginBottom: "5px",
                    }}
                  >
                    {step.n} / {step.t}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                    {step.b}
                  </div>
                </div>
                {index < 3 && (
                  <div style={{ padding: "0 10px", color: "rgba(255,255,255,0.12)", fontSize: "14px", flexShrink: 0 }}>
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "0 48px",
            display: "flex",
            gap: 0,
            marginTop: "18px",
          }}
        >
          <button
            onClick={() => setActiveTab("agent")}
            style={{
              padding: "12px 24px",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "0.12em",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderBottom: activeTab === "agent" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "agent" ? "white" : "rgba(255,255,255,0.3)",
            }}
          >
            AGENT
          </button>
          <button
            onClick={() => setActiveTab("marketplace")}
            style={{
              padding: "12px 24px",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "0.12em",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderBottom: activeTab === "marketplace" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "marketplace" ? "white" : "rgba(255,255,255,0.3)",
            }}
          >
            MARKETPLACE
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: "16px 48px 0",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "4px",
              padding: "10px 16px",
              fontSize: "13px",
              color: "#fca5a5",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {activeTab === "agent" && (
          <>
            {result?.finalResult?.summary && (
              <div
                style={{
                  margin: "0 48px 0",
                  background: "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(99,102,241,0.08))",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderLeft: "4px solid #10b981",
                  borderRadius: "4px",
                  padding: "28px 32px",
                  animation: "fadeUp 0.5s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "16px",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      letterSpacing: "0.15em",
                      color: "#10b981",
                      fontWeight: "700",
                    }}
                  >
                    💡 ORCHESTRATOR ANSWER
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        color: "rgba(255,255,255,0.3)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {result?.finalResult?.successfulAgents ?? 0} AGENTS · ${spentKITE} KITE SPENT
                    </span>
                    {result?.txHash && result.txHash !== "0xDRYRUN" && (
                      <a
                        href={"https://testnet.kitescan.ai/tx/" + result.txHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "10px",
                          color: "#6366f1",
                          textDecoration: "none",
                          fontFamily: "monospace",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)} ↗
                      </a>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: "500",
                    color: "white",
                    lineHeight: 1.6,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {result.finalResult.summary}
                </div>

                {result.finalResult.agentResults?.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
                    {result.finalResult.agentResults.map((agent, index) => (
                      <div
                        key={index}
                        style={{
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "2px",
                          padding: "6px 12px",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>
                          {agent.agent}
                        </span>
                        <span style={{ fontSize: "10px", color: "#a5b4fc" }}>
                          {agent.cost} KITE
                        </span>
                        {agent.txHash && !agent.txHash.startsWith("0xDRYRUN") && (
                          <a
                            href={"https://testnet.kitescan.ai/tx/" + agent.txHash}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "10px",
                              color: "rgba(99,102,241,0.7)",
                              textDecoration: "none",
                              fontFamily: "monospace",
                            }}
                          >
                            receipt ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <main style={{ display: "flex", gap: "32px", padding: "24px 48px 48px", flex: 1 }}>
              <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: "28px" }}>
                <div>
                  <input
                    type="text"
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRun(false)}
                    placeholder="Enter a task for the agent..."
                    disabled={loading}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      padding: "14px 0",
                      fontSize: "18px",
                      fontWeight: "300",
                      color: "white",
                      display: "block",
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "14px", alignItems: "center" }}>
                    <button
                      onClick={() => handleRun(false)}
                      disabled={loading}
                      style={{
                        background: loading ? "#4a4a6a" : "#6366f1",
                        color: "white",
                        border: "none",
                        padding: "11px 26px",
                        fontSize: "11px",
                        fontWeight: "700",
                        letterSpacing: "0.1em",
                        cursor: loading ? "not-allowed" : "pointer",
                        borderRadius: "2px",
                        fontFamily: "inherit",
                      }}
                    >
                      {loading ? "RUNNING..." : "RUN AGENT"}
                    </button>
                    <button
                      onClick={() => handleRun(true)}
                      disabled={loading}
                      style={{
                        background: "transparent",
                        color: "rgba(255,255,255,0.5)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        padding: "11px 26px",
                        fontSize: "11px",
                        fontWeight: "700",
                        letterSpacing: "0.1em",
                        cursor: loading ? "not-allowed" : "pointer",
                        borderRadius: "2px",
                        fontFamily: "inherit",
                      }}
                    >
                      DRY RUN
                    </button>
                    <button
                      onClick={handleReset}
                      style={{
                        background: "transparent",
                        color: "rgba(239,68,68,0.55)",
                        border: "1px solid rgba(239,68,68,0.18)",
                        padding: "11px 24px",
                        fontSize: "11px",
                        fontWeight: "700",
                        letterSpacing: "0.1em",
                        cursor: "pointer",
                        borderRadius: "2px",
                        marginLeft: "auto",
                        fontFamily: "inherit",
                      }}
                    >
                      RESET
                    </button>
                  </div>

                  {agentCalls.length > 0 && (
                    <div style={{ marginBottom: "24px" }}>
                      <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", marginBottom: "12px" }}>
                        INCOMING AGENT CALLS (x402)
                      </div>
                      {agentCalls.map((call, i) => (
                        <div
                          key={i}
                          style={{
                            background: "rgba(6,182,212,0.06)",
                            border: "1px solid rgba(6,182,212,0.15)",
                            borderLeft: "3px solid #06b6d4",
                            padding: "10px 14px",
                            marginBottom: "4px",
                            borderRadius: "2px"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <span style={{ fontSize: "11px", color: "#67e8f9", fontWeight: "600" }}>
                              🤖 {call.sender ? call.sender.slice(0, 8) + "..." + call.sender.slice(-4) : "Agent"}
                            </span>
                            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                              {fmtTime(call.timestamp)}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", marginBottom: "4px" }}>
                            "{call.task}"
                          </div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                            💡 {call.answer}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeAgents.length > 0 && (
                    <div style={{ marginBottom: "24px" }}>
                      <div
                        style={{
                          fontSize: "10px",
                          letterSpacing: "0.15em",
                          color: "rgba(255,255,255,0.25)",
                          marginBottom: "12px",
                        }}
                      >
                        AGENTS HIRED — {activeAgents.length} SEQUENTIAL
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {activeAgents.map((agent, index) => (
                          <div
                            key={index}
                            style={{
                              flex: "1 1 calc(50% - 8px)",
                              background: "rgba(99,102,241,0.06)",
                              border: "1px solid rgba(99,102,241,0.2)",
                              borderLeft: "3px solid #6366f1",
                              padding: "12px",
                              borderRadius: "4px",
                              animation: `fadeUp 0.3s ease ${index * 0.1}s both`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                              <span style={{ fontSize: "12px", fontWeight: "700", color: "white" }}>{agent.agent}</span>
                              <span style={{ fontSize: "11px", color: "#a5b4fc", background: "rgba(99,102,241,0.15)", padding: "2px 8px", borderRadius: "2px" }}>
                                {agent.cost} KITE
                              </span>
                            </div>
                            <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.3)", marginBottom: "4px" }}>
                              {agent.txHash && !agent.txHash.startsWith("0xDRYRUN") ? (
                                <a
                                  href={"https://testnet.kitescan.ai/tx/" + agent.txHash}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "#6366f1", textDecoration: "none" }}
                                >
                                  {agent.txHash.slice(0, 12)}...{agent.txHash.slice(-6)} ↗
                                </a>
                              ) : (
                                <span style={{ color: "rgba(255,255,255,0.2)" }}>dry run</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "12px" }}>
                    EXECUTION LOG
                  </div>
                  <div ref={logRef} style={{ maxHeight: "380px", overflowY: "auto" }}>
                    {actionLog.length === 0 ? (
                      <div style={{ color: "rgba(255,255,255,0.18)", fontStyle: "italic", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
                        — awaiting task input —
                      </div>
                    ) : (
                      actionLog.map((entry, index) => {
                        const isAnswer = entry.type === "EVALUATE" && entry.message?.startsWith("💡");
                        const colors = LOG_COLORS[entry.type] || LOG_COLORS.EVALUATE;
                        return (
                          <div
                            key={index}
                            style={{
                              borderLeft: isAnswer ? "2px solid #10b981" : `2px solid ${colors.border}`,
                              background: isAnswer ? "rgba(16,185,129,0.08)" : colors.bg,
                              padding: "9px 14px",
                              marginBottom: "3px",
                            }}
                          >
                            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", marginBottom: "3px", display: "flex", gap: "10px" }}>
                              <span style={{ color: colors.border, fontWeight: "700" }}>{entry.type}</span>
                              <span>{fmtTime(entry.timestamp)}</span>
                            </div>
                            <div
                              style={{
                                fontSize: isAnswer ? "14px" : "12px",
                                fontWeight: isAnswer ? "600" : "400",
                                color: isAnswer ? "#6ee7b7" : "rgba(255,255,255,0.78)",
                                lineHeight: 1.5,
                              }}
                            >
                              {entry.message}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "28px" }}>
                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "12px" }}>
                    AVAILABLE APIS
                  </div>
                  {apis.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Loading...</div>
                  ) : (
                    apis.map((api, index) => (
                      <div key={index} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: "white" }}>{api.name}</span>
                          <div style={{ display: "flex", gap: "5px" }}>
                            <span style={{ fontSize: "10px", padding: "2px 7px", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", borderRadius: "2px" }}>
                              ${api["cost" + currencySuffix]}
                            </span>
                            <span style={{ fontSize: "10px", padding: "2px 7px", background: "rgba(16,185,129,0.1)", color: api.qualityScore >= 8 ? "#6ee7b7" : "#fcd34d", borderRadius: "2px" }}>
                              {api.qualityScore}/10
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>{api.description}</div>
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "12px" }}>
                    RAW DATA
                  </div>
                  {result?.finalResult?.agentResults?.map((agent, index) => (
                    <div
                      key={index}
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        padding: "10px 12px",
                        marginBottom: "6px",
                        borderRadius: "4px",
                      }}
                    >
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginBottom: "4px", letterSpacing: "0.08em", fontWeight: "600" }}>
                        {agent.agent}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.45)", whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(agent.data, null, 2)}
                      </div>
                    </div>
                  ))}
                  {!result?.finalResult?.agentResults && (
                    <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic", fontSize: "12px" }}>
                      — no data yet —
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "12px" }}>
                    ON-CHAIN RECEIPTS
                  </div>
                  {payments.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.18)", fontStyle: "italic" }}>
                      — no transactions yet —
                    </div>
                  ) : (
                    payments.map((payment, index) => (
                      <div key={index} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "white" }}>{payment.apiId || "—"}</span>
                          <span style={{ fontSize: "12px", color: "#a5b4fc", fontWeight: "600" }}>
                            {parseFloat(payment.amountPaid || "0").toFixed(6)} KITE
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.28)" }}>
                            {truncateHash(payment.txNote)}
                          </span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)" }}>
                            {fmtTime(payment.timestamp ? new Date(Number(payment.timestamp) * 1000).toISOString() : null)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </main>
          </>
        )}

        {activeTab === "marketplace" && (
          <main style={{ display: "flex", flexDirection: "column", gap: "28px", padding: "24px 48px 48px", flex: 1 }}>
            <div style={{ display: "flex", gap: "16px" }}>
              {[
                { label: "SERVICES REGISTERED", value: protocolStats?.totalServices ?? "—" },
                { label: "TOTAL TRANSACTIONS", value: protocolStats?.totalTransactions ?? "—" },
                { label: "VOLUME (KITE)", value: protocolStats?.["totalVolume" + currencySuffix] ?? "0.00" },
                { label: "NETWORK", value: protocolStats?.network ?? "—" },
              ].map((stat, index) => (
                <div key={index} style={{ flex: 1, padding: "20px 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderLeft: "3px solid #6366f1" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", marginBottom: "8px" }}>{stat.label}</div>
                  <div style={{ fontSize: "28px", fontWeight: "800", color: "white" }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", marginBottom: "12px" }}>
                REPUTATION LEADERBOARD
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {leaderboard.map((entry, i) => {
                  const service = marketplace.find((s) => s.id === entry.serviceId);
                  const score = entry.reputationScore;
                  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
                  return (
                    <div
                      key={i}
                      style={{
                        flex: "1 1 calc(33% - 8px)",
                        background: "rgba(255,255,255,0.02)",
                        border: `1px solid ${color}33`,
                        borderLeft: `3px solid ${color}`,
                        padding: "16px",
                        borderRadius: "4px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "white" }}>
                          #{i + 1} {service?.name || `Service ${entry.serviceId}`}
                        </span>
                        <span style={{ fontSize: "11px", color: color, fontWeight: "700" }}>
                          {score}/100
                        </span>
                      </div>
                      <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", marginBottom: "8px" }}>
                        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: "2px", transition: "width 0.5s ease" }} />
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                        {entry.totalCalls} calls · stake protected
                      </div>
                    </div>
                  );
                })}
                {leaderboard.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.2)", fontStyle: "italic", fontSize: "12px" }}>
                    — loading reputation data —
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
              <div style={{ flex: "0 0 60%" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "10px" }}>
                  ON-CHAIN API REGISTRY
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginBottom: "16px" }}>
                  Services registered on Kite testnet · Anyone can register · Trustless payments
                </div>

                {marketplace.length === 0 ? (
                  <div style={{ textAlign: "center", fontStyle: "italic", color: "rgba(255,255,255,0.22)", padding: "40px 0" }}>
                    — no services registered yet —
                  </div>
                ) : (
                  marketplace.map((service, index) => (
                    <div key={index} style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "white" }}>{service.name}</div>
                        <div style={{ fontSize: "10px", letterSpacing: "0.1em", color: service.active ? "#10b981" : "#ef4444" }}>
                          {service.active ? "● LIVE" : "● OFFLINE"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: "2px" }}>
                          {service.apiId}
                        </span>
                        <span style={{ fontSize: "11px", color: "#a5b4fc", background: "rgba(99,102,241,0.1)", padding: "2px 8px", borderRadius: "2px" }}>
                          ${service["price" + currencySuffix]}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>
                          Provider: {truncateAddress(service.provider)}
                        </div>
                        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>
                          {service.totalCalls} calls · {service.totalEarned} ETH earned
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const res = await fetch("/api/dispute", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              serviceId: service.id,
                              reason: "Quality dispute from UI",
                            }),
                          });
                          const d = await res.json();
                          if (d.success) {
                            alert("Dispute filed: " + d.txHash);
                            fetch("/api/marketplace")
                              .then((r) => r.json())
                              .then((d) => setMarketplace(d.services || []));
                            fetch("/api/leaderboard")
                              .then((r) => r.json())
                              .then((d) => setLeaderboard(d.leaderboard || []));
                          }
                        }}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(239,68,68,0.2)",
                          color: "rgba(239,68,68,0.5)",
                          padding: "4px 10px",
                          fontSize: "10px",
                          cursor: "pointer",
                          borderRadius: "2px",
                          marginTop: "8px",
                          letterSpacing: "0.08em",
                        }}
                      >
                        FILE DISPUTE
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ flex: "0 0 40%" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.15em", color: "rgba(255,255,255,0.22)", marginBottom: "10px" }}>
                  REGISTER YOUR API
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginBottom: "16px" }}>
                  Add your service to the on-chain registry
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                    API ID (slug)
                  </div>
                  <input
                    placeholder="weather-v2"
                    value={registerForm.apiId}
                    onChange={(e) => setRegisterForm({ ...registerForm, apiId: e.target.value })}
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: "12px 0", fontSize: "14px", color: "white", marginBottom: 0, display: "block" }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                    Service Name
                  </div>
                  <input
                    placeholder="My Weather Service"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: "12px 0", fontSize: "14px", color: "white", marginBottom: 0, display: "block" }}
                  />
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                    Endpoint URL
                  </div>
                  <input
                    placeholder="https://api.example.com/v1/data"
                    value={registerForm.endpoint}
                    onChange={(e) => setRegisterForm({ ...registerForm, endpoint: e.target.value })}
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: "12px 0", fontSize: "14px", color: "white", marginBottom: 0, display: "block" }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: "6px" }}>
                    Price per call (KITE)
                  </div>
                  <input
                    placeholder="0.01"
                    type="number"
                    value={registerForm.priceKITE}
                    onChange={(e) => setRegisterForm({ ...registerForm, priceKITE: e.target.value })}
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.12)", padding: "12px 0", fontSize: "14px", color: "white", marginBottom: 0, display: "block" }}
                  />
                </div>

                <button
                  onClick={handleRegisterAPI}
                  disabled={registerStatus?.loading}
                  style={{ width: "100%", background: "#6366f1", color: "white", border: "none", padding: "14px", fontSize: "12px", fontWeight: "700", letterSpacing: "0.1em", cursor: "pointer", borderRadius: "2px", opacity: registerStatus?.loading ? 0.6 : 1 }}
                >
                  REGISTER
                </button>

                <div style={{ marginTop: "14px", minHeight: "44px" }}>
                  {registerStatus?.loading && (
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                      Registering on Kite chain...
                    </div>
                  )}
                  {registerStatus?.success && (
                    <div>
                      <div style={{ fontSize: "12px", color: "#10b981", marginBottom: "6px" }}>
                        ✅ Registered on-chain
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginBottom: "6px", fontFamily: "monospace" }}>
                        TxHash: {truncateHash(registerStatus.txHash)}
                      </div>
                      <a
                        href={`https://testnet.kitescan.ai/tx/${registerStatus.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#6366f1", fontSize: "11px", textDecoration: "none" }}
                      >
                        View on Kitescan →
                      </a>
                    </div>
                  )}
                  {registerStatus?.error && (
                    <div style={{ fontSize: "12px", color: "#ef4444" }}>❌ {registerStatus.error}</div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

        <footer
          style={{
            textAlign: "center",
            padding: "20px",
            fontSize: "10px",
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.08)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          THE ACQUIRER · KITE CHAIN · AGENTIC ECONOMY
        </footer>
      </div>
    </div>
  );
}
