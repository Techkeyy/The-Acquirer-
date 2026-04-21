import Nav from "../components/Nav";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "quick-start", label: "Quick Start" },
  { id: "endpoints", label: "Endpoints" },
  { id: "x402", label: "x402 Protocol" },
  { id: "reputation", label: "Reputation System" },
  { id: "sdk", label: "SDK Reference" },
];

function CodeBlock({ children }) {
  return (
    <pre
      style={{
        background: "#0d0d1a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "4px",
        padding: "24px",
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e2e8f0",
        overflowX: "auto",
        whiteSpace: "pre",
        lineHeight: 1.7,
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

function EndpointCard({ title, method, path, children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "4px",
        padding: "20px",
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span
          style={{
            fontSize: "10px",
            letterSpacing: "0.15em",
            color: method === "POST" ? "#f59e0b" : "#10b981",
            fontWeight: "700",
          }}
        >
          {method}
        </span>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "white" }}>{path}</span>
      </div>
      <div style={{ fontSize: "20px", fontWeight: "800", color: "white", marginBottom: "10px" }}>{title}</div>
      <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.62)", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function Docs() {
  return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "#e2e8f0" }}>
      <Nav />

      <div style={{ display: "flex", paddingTop: "56px" }}>
        <aside
          style={{
            width: "260px",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            padding: "32px 24px",
            position: "sticky",
            top: "56px",
            height: "calc(100vh - 56px)",
          }}
        >
          <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)", marginBottom: "16px" }}>
            DOCUMENTATION
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                style={{
                  color: "rgba(255,255,255,0.68)",
                  textDecoration: "none",
                  fontSize: "14px",
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {section.label}
              </a>
            ))}
          </div>
        </aside>

        <main style={{ flex: 1, padding: "40px 48px 80px", maxWidth: "1100px" }}>
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#6366f1", marginBottom: "14px" }}>
              KITE CHAIN · x402 PROTOCOL
            </div>
            <h1 style={{ fontSize: "52px", lineHeight: 1.05, marginBottom: "14px", color: "white", fontWeight: 900 }}>
              Integration docs for agent-to-agent payments
            </h1>
            <p style={{ maxWidth: "760px", fontSize: "18px", lineHeight: 1.7, color: "rgba(255,255,255,0.55)" }}>
              The Acquirer lets any agent discover services, pay on-chain, and retry with proof of payment. HTTP 402 is the handshake.
            </p>
          </div>

          <section id="overview" style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>Overview</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.8, color: "rgba(255,255,255,0.62)", maxWidth: "840px" }}>
              The Acquirer is an on-chain API acquisition protocol on Kite chain. An external agent calls an endpoint, receives an HTTP 402 challenge, pays the contract, and retries with payment proof. The backend verifies the transaction and returns the answer.
            </p>
          </section>

          <section id="quick-start" style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>Quick Start</h2>
            <ol style={{ paddingLeft: "18px", color: "rgba(255,255,255,0.7)", lineHeight: 1.9, marginBottom: "16px" }}>
              <li>Call <span style={{ color: "white" }}>POST /agent/execute</span> with your task.</li>
              <li>Receive HTTP 402 with payment details, nonce, and contract address.</li>
              <li>Send ETH to the contract, then retry with payment headers.</li>
            </ol>
            <CodeBlock>{`curl -X POST https://your-deployment.railway.app/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task":"What is the Bitcoin price?"}'`}</CodeBlock>
          </section>

          <section id="endpoints" style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>Endpoints</h2>
            <EndpointCard title="Execute an agent task" method="POST" path="/agent/execute">
              Requires x402 payment headers on retry. Request body: <code>task</code> and optional <code>maxCost</code>. The first call returns HTTP 402 with a nonce and payment challenge. The second call, with on-chain proof, returns the answer and receipts.
            </EndpointCard>
            <EndpointCard title="Protocol discovery" method="GET" path="/agent/info">
              Returns protocol metadata, network info, supported endpoints, and the payment flow for external agent clients.
            </EndpointCard>
            <EndpointCard title="Service registry" method="GET" path="/marketplace">
              Lists the live API services registered on Kite chain, including endpoint, price, provider, and current status.
            </EndpointCard>
            <EndpointCard title="Reputation leaderboard" method="GET" path="/leaderboard">
              Returns the ranked provider reputation view so agents can prioritize higher-trust services.
            </EndpointCard>
            <EndpointCard title="Register an API" method="POST" path="/register-api">
              Providers submit their API metadata to the on-chain registry so agents can discover and pay for the service automatically.
            </EndpointCard>
          </section>

          <section id="x402" style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>x402 Protocol</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.8, color: "rgba(255,255,255,0.62)", marginBottom: "16px" }}>
              x402 is the pay-first retry pattern for autonomous agents. The server returns 402 Payment Required, the agent pays on-chain, then retries with the payment receipt and nonce.
            </p>
            <CodeBlock>{`Agent request -> 402 challenge -> on-chain payment -> retry with receipt -> verified result`}</CodeBlock>
          </section>

          <section id="reputation" style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>Reputation System</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.8, color: "rgba(255,255,255,0.62)", marginBottom: "12px" }}>
              Providers stake KITE when registering services. Good calls increase reputation, disputes lower it, and repeated disputes can slash the stake and deactivate the service.
            </p>
            <ul style={{ paddingLeft: "18px", lineHeight: 1.9, color: "rgba(255,255,255,0.7)" }}>
              <li>Minimum stake: 0.001 ETH</li>
              <li>Reputation range: 0 to 100</li>
              <li>Slash threshold: 3 disputes</li>
            </ul>
          </section>

          <section id="sdk">
            <h2 style={{ fontSize: "28px", color: "white", marginBottom: "12px" }}>SDK Reference</h2>
            <p style={{ fontSize: "15px", lineHeight: 1.8, color: "rgba(255,255,255,0.62)", marginBottom: "16px" }}>
              Use <code>AcquirerClient</code> to discover protocol metadata, request a challenge, pay on Kite chain, and retry automatically.
            </p>
            <CodeBlock>{`const { AcquirerClient } = require("acquirer-sdk");

const client = new AcquirerClient({
  baseUrl: "https://your-deployment.railway.app",
  privateKey: process.env.AGENT_WALLET_KEY,
  rpcUrl: "https://rpc-testnet.gokite.ai/"
});

const result = await client.execute("What is the current Bitcoin price?");`}</CodeBlock>
          </section>
        </main>
      </div>

      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }
      `}</style>
    </div>
  );
}
