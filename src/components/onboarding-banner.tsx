import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingStepForUser, type NudgeStep } from "@/lib/onboarding-nudge";
import { isAdmin } from "@/lib/admin";
import { FileText, MailCheck, Send, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Notice } from "@/components/ui-premium/notice";

const STEP_ICON: Record<NudgeStep, LucideIcon> = {
  verify: MailCheck,
  cv: FileText,
  preferences: SlidersHorizontal,
  first_application: Send,
};

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
    href: "/settings#account",
  },
  cv: {
    label: "Carica il tuo CV",
    body: "Senza CV non possiamo ottimizzare le candidature. È lo step che sblocca tutto.",
    cta: "Carica CV",
    href: "/cv",
  },
  preferences: {
    label: "Imposta le preferenze",
    body: "Dicci che ruoli e dove cercare, così LavorAI si candida solo a offerte pertinenti.",
    cta: "Apri preferenze",
    href: "/preferences",
  },
  first_application: {
    label: "Prima candidatura",
    body: "Tutto pronto: scegli un annuncio e candidati.",
    cta: "Vedi le offerte",
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

  // Calm card-style notice. On the dashboard the same step is already the
  // featured "Il prossimo passo" card, so shell.css hides it there.
  return (
    <Notice
      id={`onboarding-${step}`}
      icon={STEP_ICON[step]}
      title={cfg.label}
      body={cfg.body}
      action={{ href: cfg.href, label: cfg.cta, primary: step === "cv" }}
    />
  );
}
