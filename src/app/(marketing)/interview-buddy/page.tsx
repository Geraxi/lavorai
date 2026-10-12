import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/session";
import { cardTrialAllowsPaidWork } from "@/lib/card-trial-access";
import { getResolvedPublicCardTrialCopy } from "@/lib/card-trial-copy-server";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { InterviewBuddyClient } from "./interview-buddy-client";

export async function generateMetadata(): Promise<Metadata> {
  const offer = await getResolvedPublicCardTrialCopy();
  return {
  title: offer.active ? "Interview Buddy: simula il colloquio con l'AI" : "Interview Buddy: simula il colloquio con l'AI, gratis",
  description:
    (offer.active ? offer.disclosure : "Practica un colloquio di 5 domande con AI. Carica un annuncio reale, ricevi feedback specifico turn-by-turn + summary finale con score. Gratis, niente registrazione."),
  alternates: { canonical: "/interview-buddy" },
  };
}

/**
 * /interview-buddy — mock interview AI text-based, gratis 3 sessioni.
 *
 * Server component minimal wrapper; tutta la logica chat in client.
 */
export default async function InterviewBuddyPage() {
  const offer = await getResolvedPublicCardTrialCopy();
  const active = offer.active;
  const user = active ? await getCurrentUser() : null;
  const allowed = !active || (!!user && await cardTrialAllowsPaidWork(user.id));
  const t = await getTranslations("interviewBuddy");
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        {allowed ? <InterviewBuddyClient /> : <section className="container max-w-2xl py-16 space-y-6">
          <h1 className="text-3xl font-bold">{t("paywallTitle")}</h1>
          <p>{t("paywallBody")}</p>
          <Link href="/pricing" className="ds-btn">{t("paywallCta")}</Link>
        </section>}
      </main>
      <SiteFooter />
    </div>
  );
}
