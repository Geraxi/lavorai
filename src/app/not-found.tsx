import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          className="mono"
          style={{
            fontSize: 14,
            color: "var(--fg-subtle)",
            marginBottom: 8,
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            margin: 0,
          }}
        >
          Pagina non trovata
        </h1>
        <p
          style={{
            marginTop: 10,
            color: "var(--fg-muted)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Il link che hai seguito potrebbe essere scaduto o non esistere.
        </p>
        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <Link href="/" className="ds-btn">
            Torna alla home
          </Link>
          <Link href="/dashboard" className="ds-btn ds-btn-primary">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
