import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { InterviewBuddyClient } from "./interview-buddy-client";

export const metadata: Metadata = {
  title: "Interview Buddy · mock interview AI gratis · LavorAI",
  description:
    "Practica un colloquio di 5 domande con AI. Carica un annuncio reale, ricevi feedback specifico turn-by-turn + summary finale con score. Gratis, niente registrazione.",
};

/**
 * /interview-buddy — mock interview AI text-based, gratis 3 sessioni.
 *
 * Server component minimal wrapper; tutta la logica chat in client.
 */
export default function InterviewBuddyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <InterviewBuddyClient />
      </main>
      <SiteFooter />
    </div>
  );
}
