import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isApplicationAccessPaused, TIERS } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { TrialExpiredActions } from "./trial-expired-actions";

export const metadata = { title: "Free trial expired | LavorAI", robots: { index: false, follow: false } };

export default async function TrialExpiredPage({ searchParams }: { searchParams: Promise<{ subscribed?: string; canceled?: string }> }) {
  const params = await searchParams;
  const confirming = params.subscribed === "1";
  const canceled = params.canceled === "1";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.email) || !isApplicationAccessPaused(user)) redirect("/dashboard");
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6 py-12">
      <section className="w-full max-w-2xl rounded-2xl border bg-card p-6 sm:p-9 shadow-lg">
        <div className="text-center max-w-xl mx-auto">
          <p className="text-sm font-semibold text-muted-foreground mb-3">LavorAI</p>
          <h1 className="text-3xl font-bold mb-3">La tua prova Pro è terminata</h1>
          <p className="text-muted-foreground mb-7">Scegli un piano per riattivare subito candidature, CV personalizzati e accesso alla dashboard.</p>
        </div>
        <TrialExpiredActions
          confirming={confirming}
          canceled={canceled}
          proPrice={TIERS.pro.priceDisplay}
          proPlusPrice={TIERS.pro_plus.priceDisplay}
        />
      </section>
    </main>
  );
}
