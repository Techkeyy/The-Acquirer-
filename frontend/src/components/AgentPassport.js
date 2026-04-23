// File: Desktop/The-Acquirer/frontend/src/components/AgentPassport.js
import { useEffect, useState } from "react";

export default function AgentPassport({ contractAddress }) {
  const [passport, setPassport] = useState(null);

  useEffect(() => {
    fetch("/api/agent-passport")
      .then((response) => response.json())
      .then((data) => setPassport(data))
      .catch(() => {});

    const interval = setInterval(() => {
      fetch("/api/agent-passport")
        .then((response) => response.json())
        .then((data) => setPassport(data))
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const reputationColor = !passport
    ? "#6366f1"
    : passport.reputationScore >= 70
      ? "#10b981"
      : passport.reputationScore >= 40
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div
      style={{
        background: "rgba(99,102,241,0.06)",
        border: "1px solid rgba(99,102,241,0.25)",
        borderLeft: "3px solid #6366f1",
        borderRadius: "4px",
        padding: "20px",
        marginBottom: "24px"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px"
        }}
      >
        <div>
          <div
            style={{
              fontSize: "10px",
              letterSpacing: "0.16em",
              color: "#a5b4fc",
              marginBottom: "4px",
              fontWeight: "700"
            }}
          >
            🪪 KITE AGENT PASSPORT
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.35)",
              fontFamily: "monospace"
            }}
          >
            {contractAddress
              ? contractAddress.slice(0, 10) + "..." + contractAddress.slice(-6)
              : "Loading..."}
          </div>
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "#10b981",
            letterSpacing: "0.12em"
          }}
        >
          ● KITE CHAIN VERIFIED
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px"
        }}
      >
        {[
          { label: "TOTAL ATTESTATIONS", value: passport?.totalAttestations ?? "—" },
          { label: "AGENT CALLS", value: passport?.agentCalls ?? "—" },
          {
            label: "REPUTATION",
            value:
              passport?.reputationScore !== undefined && passport?.reputationScore !== null
                ? `${passport.reputationScore}/100`
                : "—",
            color: reputationColor
          }
        ].map((stat, index) => (
          <div
            key={index}
            style={{
              background: "rgba(0,0,0,0.2)",
              padding: "12px",
              borderRadius: "2px"
            }}
          >
            <div
              style={{
                fontSize: "9px",
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.3)",
                marginBottom: "6px"
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: "800",
                color: stat.color || "white"
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {passport?.latestAttestation &&
        passport.latestAttestation !==
          "0x0000000000000000000000000000000000000000000000000000000000000000" && (
          <div
            style={{
              marginTop: "12px",
              fontFamily: "monospace",
              fontSize: "10px",
              color: "rgba(255,255,255,0.25)"
            }}
          >
            Latest: {passport.latestAttestation.slice(0, 20)}...
            <a
              href={`https://testnet.kitescan.ai/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#6366f1",
                textDecoration: "none",
                marginLeft: "8px"
              }}
            >
              View on Kitescan ↗
            </a>
          </div>
        )}
    </div>
  );
}
