import Link from "next/link";
import { Icon } from "@/components/design/icon";

export interface ChecklistState {
  hasUploadedCv: boolean;
  hasSetPreferences: boolean;
  hasBrowsedJobs: boolean;
  hasFirstApplication: boolean;
}

export function OnboardingChecklist({ state }: { state: ChecklistState }) {
  const items: {
    key: keyof ChecklistState;
    label: string;
    cta: { href: string; text: string };
    active: boolean;
  }[] = [
    {
      key: "hasUploadedCv",
      label: "Carica il tuo CV",
      cta: { href: "/onboarding", text: "Carica" },
      active: !state.hasUploadedCv,
    },
    {
      key: "hasSetPreferences",
      label: "Imposta preferenze (ruoli, città, RAL)",
      cta: { href: "/preferences", text: "Configura" },
      active: state.hasUploadedCv && !state.hasSetPreferences,
    },
    {
      key: "hasBrowsedJobs",
      label: "Sfoglia il job board",
      cta: { href: "/jobs", text: "Apri" },
      active:
        state.hasUploadedCv && state.hasSetPreferences && !state.hasBrowsedJobs,
    },
    {
      key: "hasFirstApplication",
      label: "Invia la prima candidatura con LavorAI",
      cta: { href: "/jobs", text: "Candidati" },
      active: false,
    },
  ];

  const completed = items.filter((i) => state[i.key]).length;
  const allDone = completed === items.length;
  if (allDone) return null;

  const pct = (completed / items.length) * 100;

  return (
    <div
      className="ds-section-card"
    >
      <div
        className="ds-section-head"
        style={{ borderColor: "rgba(0,0,0,0.05)" }}
      >
        <div className="ds-section-head-title">
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "var(--primary-ds)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="sparkles" size={13} />
          </div>
          Iniziamo insieme
        </div>
        <div
          className="mono"
          style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
        >
          {completed} / {items.length}
        </div>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--bg-sunken)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--primary-ds)",
            transition: "width 0.3s",
          }}
        />
      </div>
      <div className="ds-section-body flush">
        {items.map((it, i) => {
          const done = state[it.key];
          return (
            <div
              key={it.key}
              style={{
                padding: "14px 16px",
                borderBottom:
                  i === items.length - 1
                    ? "none"
                    : "1px solid var(--border-ds)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: it.active ? "rgba(255,255,255,0.5)" : "transparent",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: done
                    ? "var(--primary-ds)"
                    : "var(--bg-sunken)",
                  border: done
                    ? "none"
                    : "1.5px solid var(--border-strong)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {done && <Icon name="check" size={13} />}
              </div>
              <span
                style={{
                  flex: 1,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: done ? "var(--fg-muted)" : "var(--fg)",
                  textDecoration: done ? "line-through" : "none",
                }}
              >
                {it.label}
              </span>
              {!done && it.active && (
                <Link
                  href={it.cta.href}
                  className="ds-btn ds-btn-sm ds-btn-primary"
                >
                  {it.cta.text} <Icon name="arrow-right" size={11} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
