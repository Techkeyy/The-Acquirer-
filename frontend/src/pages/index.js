import { useEffect, useMemo, useState } from "react";
import Nav from "../components/Nav";

const flowSteps = [
  { icon: "🤖", title: "AGENT REQUEST", text: "Agent calls POST /agent/execute with task", color: "#6366f1" },
  { icon: "⚡", title: "402 CHALLENGE", text: "Server returns HTTP 402 with payment details and nonce", color: "#f59e0b" },
  { icon: "🔗", title: "ON-CHAIN PAYMENT", text: "Agent pays on Kite chain, gets transaction hash", color: "#8b5cf6" },
  { icon: "✅", title: "VERIFIED RESULT", text: "Server verifies on-chain, returns answer + receipt", color: "#10b981" },
];

const codeTabs = {
  curl: `# Step 1: Request (get 402 challenge)
curl -X POST https://your-deployment.railway.app/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is the Bitcoin price?"}'

# Returns HTTP 402:
# { "nonce": "abc123", "amount": "0.00002", "payTo": "0x..." }

# Step 2: Pay on Kite chain, get txHash

# Step 3: Retry with payment proof
curl -X POST https://your-deployment.railway.app/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-Payment-Receipt: 0xYOUR_TX_HASH" \
  -H "X-Payment-Sender: 0xYOUR_WALLET" \
  -H "X-Payment-Nonce: abc123" \
  -d '{"task": "What is the Bitcoin price?"}'

# Returns HTTP 200:
# { "answer": "Bitcoin is at $76,210", "verified": true }`,
  node: `const { AcquirerClient } = require("acquirer-sdk");

const agent = new AcquirerClient({
  baseUrl: "https://your-deployment.railway.app",
  privateKey: process.env.AGENT_WALLET_KEY,
  rpcUrl: "https://rpc-testnet.gokite.ai/"
});

// Automatic x402 payment handling
const result = await agent.execute(
  "What is the current Bitcoin price?"
);

console.log(result.answer);
// "Bitcoin is at $76,210 USD"
console.log(result.payment.receipt);
// "0xabc123..." (on-chain proof)`,
  python: `import requests
from web3 import Web3

# Step 1: Get payment challenge
response = requests.post(
    "https://your-deployment.railway.app/agent/execute",
    json={"task": "What is the Bitcoin price?"}
)
# response.status_code == 402
challenge = response.json()

# Step 2: Pay on Kite chain
w3 = Web3(Web3.HTTPProvider(challenge["network"]))
tx_hash = w3.eth.send_transaction({...})

# Step 3: Retry with proof
result = requests.post(
    "https://your-deployment.railway.app/agent/execute",
    json={"task": "What is the Bitcoin price?"},
    headers={
        "X-Payment-Receipt": tx_hash,
        "X-Payment-Sender": your_wallet,
        "X-Payment-Nonce": challenge["nonce"]
    }
)
print(result.json()["answer"])`,
};

function SectionTitle({ eyebrow, title, subtitle }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "0.18em", color: "#6366f1", marginBottom: "10px" }}>{eyebrow}</div>
      <h2 style={{ fontSize: "32px", color: "white", marginBottom: "10px", fontWeight: 800 }}>{title}</h2>
      <p style={{ maxWidth: "720px", color: "rgba(255,255,255,0.5)", fontSize: "16px", lineHeight: 1.7 }}>{subtitle}</p>
    </div>
  );
}

function MiniMetric({ value, label }) {
  return (
    <div style={{ padding: "18px 0", minWidth: "140px" }}>
      <div style={{ fontSize: "28px", fontWeight: 800, color: "white", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginTop: "6px" }}>{label}</div>
    </div>
  );
}

function CodeBlock({ children }) {
  return (
    <pre style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "24px", fontFamily: "monospace", fontSize: "13px", color: "#e2e8f0", overflowX: "auto", whiteSpace: "pre", lineHeight: 1.7 }}>
      <code>{children}</code>
    </pre>
  );
}

export default function Home() {
  const [protocolStats, setProtocolStats] = useState(null);
  const [agentCalls, setAgentCalls] = useState([]);
  const [marketplace, setMarketplace] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeCodeTab, setActiveCodeTab] = useState("curl");

  const topServices = useMemo(() => marketplace.slice(0, 6), [marketplace]);
  const topThree = leaderboard.slice(0, 3);
  const protocolCurrency = protocolStats?.currency || "ETH";
  const protocolVolume = protocolStats?.totalVolume ?? protocolStats?.totalVolumeUSDC ?? protocolStats?.totalVolumeETH ?? "—";

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const [statsRes, callsRes, marketRes, leaderboardRes] = await Promise.all([
          fetch("/api/protocol-stats"),
          fetch("/api/agent-calls"),
          fetch("/api/marketplace"),
          fetch("/api/leaderboard"),
        ]);

        const [statsData, callsData, marketData, leaderboardData] = await Promise.all([
          statsRes.json().catch(() => ({})),
          callsRes.json().catch(() => ({})),
          marketRes.json().catch(() => ({})),
          leaderboardRes.json().catch(() => ({})),
        ]);

        setProtocolStats(statsData);
        setAgentCalls(Array.isArray(callsData.calls) ? callsData.calls : []);
        setMarketplace(Array.isArray(marketData.services) ? marketData.services : []);
        setLeaderboard(Array.isArray(leaderboardData.leaderboard) ? leaderboardData.leaderboard : []);
      } catch {
        setProtocolStats(null);
        setAgentCalls([]);
        setMarketplace([]);
        setLeaderboard([]);
      }
    };

    fetchLandingData();
    const interval = setInterval(fetchLandingData, 5000);
    return () => clearInterval(interval);
  }, []);

  const heroStats = [
    { value: protocolStats?.totalServices ?? "—", label: "Services Registered" },
    { value: protocolStats?.totalTransactions ?? "—", label: "Payments Processed" },
    { value: protocolVolume, label: `${protocolCurrency} Volume` },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "white", position: "relative", overflow: "hidden" }}>
      <Nav />

      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden", background: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(99,102,241,0.035) 39px,rgba(99,102,241,0.035) 40px)" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at top, rgba(99,102,241,0.18), transparent 40%), radial-gradient(circle at bottom right, rgba(6,182,212,0.1), transparent 28%)" }} />
        <div style={{ position: "absolute", left: 0, width: "100%", height: "2px", background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.25),transparent)", animation: "scan 10s linear infinite" }} />
      </div>

      <main style={{ position: "relative", zIndex: 1, paddingTop: "56px" }}>
        <section style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", padding: "0 48px" }}>
          <div style={{ maxWidth: "940px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "10px", letterSpacing: "0.2em", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)", padding: "4px 12px", borderRadius: "2px", marginBottom: "20px" }}>
              KITE CHAIN · x402 PAYMENT PROTOCOL
            </div>

            <h1 style={{ fontSize: "56px", lineHeight: 1.1, fontWeight: 800, color: "white", letterSpacing: "-0.03em", maxWidth: "760px" }}>
              The Payment Layer
              <br />
              for AI Agents
            </h1>

            <p style={{ fontSize: "18px", lineHeight: 1.8, color: "rgba(255,255,255,0.5)", maxWidth: "560px", marginTop: "22px" }}>
              Any AI agent can discover, pay for, and execute API services autonomously. HTTP 402 → on-chain payment → verified result. No humans. No middlemen.
            </p>

            <div style={{ display: "flex", gap: "12px", marginTop: "28px", flexWrap: "wrap" }}>
              <a href="/docs" style={{ background: "#6366f1", color: "white", padding: "14px 22px", borderRadius: "3px", textDecoration: "none", fontWeight: 700 }}>Start Building →</a>
              <a href="/dashboard" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.84)", padding: "14px 22px", borderRadius: "3px", textDecoration: "none", fontWeight: 600 }}>View Dashboard</a>
            </div>

            <div style={{ marginTop: "38px", display: "flex", alignItems: "stretch", gap: 0, maxWidth: "840px", borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {heroStats.map((stat, index) => (
                <div key={stat.label} style={{ flex: 1, padding: "20px 0", borderRight: index < heroStats.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                  <MiniMetric value={stat.value} label={stat.label} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "0 48px 80px" }}>
          <SectionTitle eyebrow="HOW IT WORKS" title="Three steps. Fully autonomous." subtitle="A clean x402 handshake for AI agents that pay on-chain, retry with proof, and receive verified results." />

          <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap" }}>
            {flowSteps.map((step, index) => (
              <div key={step.title} style={{ display: "flex", alignItems: "center", flex: "1 1 220px" }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${step.color}`, padding: "24px", borderRadius: "4px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "14px" }}>{step.icon}</div>
                  <div style={{ fontSize: "12px", letterSpacing: "0.12em", color: step.color, fontWeight: 700, marginBottom: "8px" }}>{step.title}</div>
                  <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{step.text}</div>
                </div>
                {index < flowSteps.length - 1 && (
                  <div style={{ padding: "0 12px", color: "rgba(255,255,255,0.2)", fontSize: "24px", animation: `pulse 1.5s ease-in-out ${index * 0.2}s infinite` }}>→</div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "0 48px 80px" }}>
          <SectionTitle eyebrow="LIVE ON KITE CHAIN" title="Real agent calls happening right now" subtitle="The protocol is live: external agents request access, pay on-chain, and get verified answers." />

          <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 60%" }}>
              {agentCalls.length > 0 ? agentCalls.slice(0, 5).map((call, index) => (
                <div key={index} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: "3px solid #06b6d4", padding: "14px 16px", marginBottom: "6px", borderRadius: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#67e8f9", fontWeight: 600 }}>🤖 {call.sender ? `${call.sender.slice(0, 8)}...${call.sender.slice(-4)}` : "Agent"}</span>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>{call.timestamp ? new Date(call.timestamp).toLocaleTimeString() : ""}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.78)", marginBottom: "4px", fontStyle: "italic" }}>Task: "{call.task}"</div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)", marginBottom: "6px" }}>💡 {(call.answer || "").slice(0, 80)}</div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "10px", color: "rgba(255,255,255,0.42)" }}>
                    <a href={`https://testnet.kitescan.ai/tx/${call.txHash}`} target="_blank" rel="noreferrer" style={{ color: "#6366f1", textDecoration: "none" }}>TxHash ↗</a>
                    <span>{call.cost} KITE</span>
                  </div>
                </div>
              )) : Array.from({ length: 3 }).map((_, index) => (
                <div key={index} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px 16px", marginBottom: "6px", borderRadius: "2px", animation: "shimmer 2.5s linear infinite" }}>
                  <div style={{ color: "rgba(255,255,255,0.22)", fontSize: "12px" }}>Waiting for agent calls...</div>
                </div>
              ))}
            </div>

            <div style={{ flex: "1 1 36%", minWidth: "300px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)", marginBottom: "12px" }}>ON-CHAIN METRICS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>
                  <a href="https://testnet.kitescan.ai/address/0x7b397100554Fc839dD1E46F2f1220fE6617e0c7D" target="_blank" rel="noreferrer" style={{ color: "#a5b4fc", textDecoration: "none" }}>CONTRACT ADDRESS ↗</a>
                  <div>NETWORK: Kite Testnet</div>
                  <div>CHAIN ID: 2368</div>
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "20px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.16em", color: "rgba(255,255,255,0.35)", marginBottom: "12px" }}>REPUTATION LEADERBOARD</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {topThree.length > 0 ? topThree.map((entry, index) => {
                    const color = entry.reputationScore >= 70 ? "#10b981" : entry.reputationScore >= 40 ? "#f59e0b" : "#ef4444";
                    const service = marketplace.find((item) => item.id === entry.serviceId);
                    return (
                      <div key={entry.serviceId}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
                          <span style={{ color: "white", fontWeight: 700 }}>#{index + 1} {service?.name || `Service ${entry.serviceId}`}</span>
                          <span style={{ color, fontWeight: 700 }}>{entry.reputationScore}/100</span>
                        </div>
                        <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${entry.reputationScore}%`, background: color, borderRadius: "2px" }} />
                        </div>
                      </div>
                    );
                  }) : <div style={{ color: "rgba(255,255,255,0.24)", fontStyle: "italic", fontSize: "12px" }}>Loading reputation data...</div>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "0 48px 80px" }}>
          <SectionTitle eyebrow="INTEGRATE IN MINUTES" title="Works with any AI agent or framework" subtitle="Copy-paste examples for curl, Node.js, and Python. x402 makes the payment step standard." />

          <div style={{ display: "flex", gap: "18px", marginBottom: "18px", flexWrap: "wrap" }}>
            {[{ key: "curl", label: "curl" }, { key: "node", label: "Node.js SDK" }, { key: "python", label: "Python" }].map((tab) => (
              <button key={tab.key} onClick={() => setActiveCodeTab(tab.key)} style={{ background: "transparent", border: "none", color: activeCodeTab === tab.key ? "white" : "rgba(255,255,255,0.3)", borderBottom: activeCodeTab === tab.key ? "2px solid #6366f1" : "2px solid transparent", padding: "10px 0", fontSize: "14px", cursor: "pointer" }}>{tab.label}</button>
            ))}
          </div>

          <CodeBlock>{codeTabs[activeCodeTab]}</CodeBlock>
        </section>

        <section style={{ padding: "0 48px 92px" }}>
          <SectionTitle eyebrow="OPEN SERVICE REGISTRY" title="Register your API. Get paid by agents automatically." subtitle="Services are discoverable on-chain, ranked by reputation, and paid by the protocol instead of custom integrations." />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            {topServices.length > 0 ? topServices.map((service) => {
              const reputationEntry = leaderboard.find((entry) => entry.serviceId === service.id);
              const score = reputationEntry?.reputationScore ?? service.reputationScore ?? 50;
              return (
                <div key={service.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "white" }}>{service.name}</div>
                    <div style={{ fontSize: "10px", color: "#10b981", letterSpacing: "0.12em" }}>● LIVE</div>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.42)", marginBottom: "12px", wordBreak: "break-all" }}>{service.endpoint}</div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.68)", marginBottom: "10px" }}>{service.priceUSDC || service.pricePerCall} KITE per call</div>
                  <div style={{ fontSize: "10px", fontFamily: "monospace", color: "rgba(255,255,255,0.34)", marginBottom: "10px" }}>Provider: {service.provider ? `${service.provider.slice(0, 8)}...${service.provider.slice(-4)}` : "—"}</div>
                  <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: `${score}%`, height: "100%", background: score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444" }} />
                  </div>
                </div>
              );
            }) : <div style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Loading services...</div>}
          </div>

          <div style={{ marginTop: "22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ color: "rgba(255,255,255,0.55)" }}>Want to register your API?</div>
            <a href="/dashboard" style={{ background: "#6366f1", color: "white", padding: "12px 18px", borderRadius: "3px", textDecoration: "none", fontWeight: 700 }}>Register Service →</a>
          </div>
        </section>

        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "22px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", color: "rgba(255,255,255,0.42)", fontSize: "12px" }}>
          <div>⚡ THE ACQUIRER — Kite AI Global Hackathon 2026</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <a href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>Dashboard</a>
            <a href="/docs" style={{ color: "inherit", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/Techkeyy/The-Acquirer-" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>GitHub</a>
            <a href="https://testnet.kitescan.ai/address/0x7b397100554Fc839dD1E46F2f1220fE6617e0c7D" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Kitescan ↗</a>
          </div>
          <div>Contract: <a href="https://testnet.kitescan.ai/address/0x7b397100554Fc839dD1E46F2f1220fE6617e0c7D" target="_blank" rel="noreferrer" style={{ color: "#a5b4fc", textDecoration: "none" }}>0x7b39...e0c7D ↗</a></div>
        </footer>
      </main>

      <style jsx global>{`
        html { scroll-behavior: smooth; }
        @keyframes pulse { 0%, 100% { opacity: 0.2; transform: translateX(0); } 50% { opacity: 1; transform: translateX(2px); } }
      `}</style>
    </div>
  );
}
