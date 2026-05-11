"use client";

import { motion } from "motion/react";
import { Check, Loader2, Clock } from "lucide-react";

/**
 * Mockup statico-animato della dashboard candidature.
 * Mostra l'esperienza "auto-apply che gira": progress bar, lista live
 * con stati (Inviata / In invio / In coda).
 * Pure visual: nessun dato reale.
 */
const APPS = [
  { company: "Intercom", role: "Senior Product Designer", status: "applied", color: "#3b82f6" },
  { company: "Plaid", role: "Compliance Analyst", status: "applied", color: "#a855f7" },
  { company: "Algolia", role: "Site Reliability Engineer", status: "applied", color: "#06b6d4" },
  { company: "SumUp", role: "Product Manager · Bookings", status: "applying", color: "#10b981" },
  { company: "Treatwell", role: "Product Manager Payments", status: "pending", color: "#f59e0b" },
  { company: "Bending Spoons", role: "UX/UI Designer", status: "pending", color: "#ec4899" },
];

export function DashboardMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative rounded-2xl"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01)), var(--bg-elev)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(22px) saturate(160%)",
        WebkitBackdropFilter: "blur(22px) saturate(160%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.20), 0 40px 80px -20px rgba(0,0,0,0.55), 0 12px 28px -12px rgba(0,0,0,0.40)",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--fg-subtle)",
            letterSpacing: "0.04em",
          }}
        >
          lavorai.it/dashboard
        </span>
      </div>

      <div style={{ padding: 22 }}>
        {/* Progress card (inner glass) */}
        <div
          style={{
            padding: "18px 18px 16px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.07)",
            background:
              "linear-gradient(180deg, hsl(var(--primary)/0.10), rgba(255,255,255,0.02)), rgba(255,255,255,0.02)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.15)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                Auto-apply attivo
              </div>
              <div style={{ marginTop: 2, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
                23 / 50 candidature
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 9px",
                borderRadius: 999,
                background: "hsl(var(--primary)/0.15)",
                color: "hsl(var(--primary))",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "hsl(var(--primary))",
                  animation: "pulse 1.6s ease-in-out infinite",
                }}
              />
              Live
            </span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 8,
              background: "var(--bg-sunken)",
              borderRadius: 999,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "46%" }}
              transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: "100%",
                background:
                  "linear-gradient(90deg, hsl(var(--primary)/0.85), hsl(var(--primary)))",
                borderRadius: 999,
              }}
            />
          </div>
        </div>

        {/* Applications list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {APPS.map((a, i) => (
            <motion.div
              key={a.company}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.7 + i * 0.07 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-ds)",
                background: "var(--bg)",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: a.color,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {a.company.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.company}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--fg-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.role}
                </div>
              </div>
              <StatusPill status={a.status as "applied" | "applying" | "pending"} />
            </motion.div>
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
      `}</style>
    </motion.div>
  );
}

function StatusPill({ status }: { status: "applied" | "applying" | "pending" }) {
  if (status === "applied") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "3px 8px",
          borderRadius: 999,
          background: "hsl(142 70% 95% / 0.15)",
          color: "hsl(142 70% 60%)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          border: "1px solid hsl(142 70% 50% / 0.25)",
        }}
      >
        <Check size={11} strokeWidth={3} /> Inviata
      </span>
    );
  }
  if (status === "applying") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: "3px 8px",
          borderRadius: 999,
          background: "hsl(38 92% 95% / 0.15)",
          color: "hsl(38 92% 60%)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          border: "1px solid hsl(38 92% 50% / 0.25)",
        }}
      >
        <Loader2 size={11} strokeWidth={2.5} className="animate-spin" /> In invio
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: 999,
        background: "var(--bg-sunken)",
        color: "var(--fg-muted)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "1px solid var(--border-ds)",
      }}
    >
      <Clock size={11} strokeWidth={2.5} /> In coda
    </span>
  );
}
