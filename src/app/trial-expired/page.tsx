import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isApplicationAccessPaused } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { TrialExpiredActions } from "./trial-expired-actions";

export const metadata = { title: "Free trial expired | LavorAI", robots: { index: false, follow: false } };

export default async function TrialExpiredPage({ searchParams }: { searchParams: Promise<{ subscribed?: string }> }) {
  const confirming = (await searchParams).subscribed === "1";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.email) || !isApplicationAccessPaused(user)) redirect("/dashboard");
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6 py-12">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-lg text-center">
        <p className="text-sm font-semibold text-muted-foreground mb-3">LavorAI</p>
        <h1 className="text-3xl font-bold mb-4">Free trial expired</h1>
        <p className="text-muted-foreground mb-6">La tua prova gratuita di 7 giorni dalla registrazione è terminata. Durante la prova potevi inviare fino a 5 candidature al giorno. Per tornare a utilizzare le funzionalità, attiva un abbonamento.</p>
        <TrialExpiredActions confirming={confirming} />
      </section>
    </main>
  );
}
