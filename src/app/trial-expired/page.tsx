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
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6 py-12">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-card shadow-lg">
        <div className="border-b border-border bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,.16),transparent_44%)] px-8 py-8 sm:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">La tua ricerca, in pausa</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Riprendi da dove eri arrivato.</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">La prova Pro di 7 giorni è terminata. Attiva Pro per far ripartire la ricerca, le candidature su misura e il monitoraggio delle risposte.</p>
        </div>
        <div className="grid gap-6 px-8 py-7 sm:grid-cols-[1fr_auto] sm:px-10">
          <div>
            <p className="text-sm font-medium text-foreground">{applicationsSent > 0 ? `Durante la prova LavorAI ha inviato ${applicationsSent} ${applicationsSent === 1 ? "candidatura" : "candidature"} per te.` : "Il tuo profilo resta pronto: Pro riattiva subito la tua ricerca."}</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>• 50 candidature al mese</li>
              <li>• CV e lettera adattati a ogni posizione</li>
              <li>• Nessuna carta o vincolo nascosto: disdici quando vuoi</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-4 text-left sm:min-w-48">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pro</p>
            <p className="mt-1 text-2xl font-bold">€19,99<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Pagamento sicuro con Stripe</p>
          </div>
        </div>
        <div className="border-t border-border px-8 py-7 sm:px-10">
          <TrialExpiredActions confirming={confirming} />
        </div>
      </section>
    </main>
  );
}
