import { useRouter } from "next/router";

export default function Nav() {
  const router = useRouter();

  const linkStyle = (href) => ({
    padding: "8px 16px",
    fontSize: "13px",
    color: router.pathname === href ? "white" : "rgba(255,255,255,0.5)",
    textDecoration: "none",
    borderBottom: router.pathname === href ? "1px solid #6366f1" : "1px solid transparent",
  });

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "56px",
        zIndex: 100,
        background: "rgba(7,7,15,0.95)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 48px",
      }}
    >
      <a
        href="/"
        style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}
      >
        <span style={{ fontSize: "16px" }}>⚡</span>
        <span
          style={{
            fontSize: "14px",
            fontWeight: "800",
            letterSpacing: "0.12em",
            color: "white",
          }}
        >
          THE ACQUIRER
        </span>
        <span
          style={{
            fontSize: "9px",
            padding: "2px 6px",
            background: "rgba(99,102,241,0.2)",
            color: "#a5b4fc",
            borderRadius: "2px",
            letterSpacing: "0.1em",
          }}
        >
          KITE CHAIN
        </span>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <a href="/docs" style={linkStyle("/docs")}>
          Docs
        </a>
        <a href="/dashboard" style={linkStyle("/dashboard")}>
          Dashboard
        </a>
        <a
          href="https://github.com/Techkeyy/The-Acquirer-"
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: "8px 16px", fontSize: "13px", color: "rgba(255,255,255,0.5)", textDecoration: "none" }}
        >
          GitHub ↗
        </a>
        <a
          href="/dashboard"
          style={{
            background: "#6366f1",
            color: "white",
            padding: "8px 20px",
            borderRadius: "2px",
            fontSize: "13px",
            fontWeight: "600",
            textDecoration: "none",
            marginLeft: "8px",
          }}
        >
          Launch App →
        </a>
      </div>
    </nav>
  );
}
