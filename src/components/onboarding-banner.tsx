import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingStepForUser, type NudgeStep } from "@/lib/onboarding-nudge";
import { isAdmin } from "@/lib/admin";

interface StepConfig {
  label: string;
  body: string;
  cta: string;
  href: string;
}

const STEP_CONFIG: Record<NudgeStep, StepConfig> = {
  verify: {
    label: "Verifica la tua email",
    body: "Conferma l'indirizzo per attivare l'account e iniziare a candidarti.",
    cta: "Reinvia email di verifica",
    href: "/account?focus=verify",
  },
  cv: {
    label: "Carica il tuo CV",
    body: "Senza CV non possiamo ottimizzare le candidature. È lo step che sblocca tutto.",
    cta: "Carica CV",
    href: "/cv",
  },
  preferences: {
    label: "Imposta le preferenze",
    body: "Dicci che ruoli e dove cercare, così LavorAI candida solo a job rilevanti.",
    cta: "Apri preferenze",
    href: "/preferences",
  },
  first_application: {
    label: "Prima candidatura",
    body: "Tutto pronto: scegli un annuncio e candidati. La prima è quella che conta.",
    cta: "Vedi job board",
    href: "/jobs",
  },
};

/**
 * Banner persistente in-app che mostra lo step di onboarding mancante.
 * Non dismissable di proposito: sparisce SOLO quando l'utente completa
 * lo step. È il complemento in-platform dei nudge via email.
 */
export async function OnboardingBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  // Founder e admin non vedono il banner (loro testano).
  if (isAdmin(user.email)) return null;

  const step = await getOnboardingStepForUser(user.id);
  if (!step) return null;

  const cfg = STEP_CONFIG[step];

  return (
    <div
      role="status"
      className={step === "cv" ? "dashboard-cv-banner" : undefined}
      style={{
        margin: "12px 24px 0",
        padding: "12px 16px",
        borderRadius: 12,
        background: "rgba(22,163,74,0.08)",
        border: "1px solid rgba(22,163,74,0.35)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 6,
          height: 40,
          borderRadius: 4,
          background: "#16a34a",
          flexShrink: 0,
        }}
        aria-hidden
      />
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg)" }}>
          {cfg.label}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>
          {cfg.body}
        </div>
      </div>
      <Link
        href={cfg.href}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          background: "#16a34a",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {cfg.cta} →
      </Link>
    </div>
  );
}
