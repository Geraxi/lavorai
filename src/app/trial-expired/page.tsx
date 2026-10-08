import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isApplicationAccessPaused } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { TrialExpiredActions } from "./trial-expired-actions";
import { prisma } from "@/lib/db";

export const metadata = { title: "Free trial expired | LavorAI", robots: { index: false, follow: false } };

export default async function TrialExpiredPage({ searchParams }: { searchParams: Promise<{ subscribed?: string }> }) {
  const confirming = (await searchParams).subscribed === "1";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.email) || !isApplicationAccessPaused(user)) redirect("/dashboard");
  const applicationsSent = await prisma.application.count({
    where: { userId: user.id, status: "success" },
  });
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030712] px-5 py-10 text-white sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_25%,rgba(16,185,129,.16),transparent_26%),radial-gradient(circle_at_18%_85%,rgba(14,116,144,.13),transparent_25%)]" />
      <section role="dialog" aria-modal="true" aria-labelledby="trial-expired-title" className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/90 shadow-2xl shadow-black/50 backdrop-blur">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,.20),transparent_46%)] px-7 py-8 sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">La tua ricerca è in pausa</p>
          <h1 id="trial-expired-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Riprendi da dove eri arrivato.</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-slate-300">La prova Pro di 7 giorni è terminata. Scegli un piano per riattivare la ricerca, le candidature su misura e il monitoraggio delle risposte.</p>
        </div>
        <div className="grid gap-6 px-7 py-7 sm:grid-cols-[1fr_auto] sm:px-10">
          <div>
            <p className="text-sm font-medium text-white">{applicationsSent > 0 ? `Durante la prova LavorAI ha inviato ${applicationsSent} ${applicationsSent === 1 ? "candidatura" : "candidature"} per te.` : "Il tuo profilo resta pronto: Pro riattiva subito la tua ricerca."}</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
              <li>• 50 candidature al mese</li>
              <li>• CV e lettera adattati a ogni posizione</li>
              <li>• Carta, Apple Pay o Google Pay quando disponibili</li>
              <li>• Disdici quando vuoi dalle Impostazioni</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-left sm:min-w-48">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-200">Pro</p>
            <p className="mt-1 text-2xl font-bold">€19,99<span className="text-sm font-normal text-slate-300">/mese</span></p>
            <p className="mt-1 text-xs text-slate-300">Pagamento sicuro con Stripe</p>
          </div>
        </div>
        <div className="border-t border-white/10 px-7 py-7 sm:px-10">
          <TrialExpiredActions confirming={confirming} />
        </div>
      </section>
    </main>
  );
}
