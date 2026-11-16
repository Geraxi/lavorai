import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isApplicationAccessPaused } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { Logo } from "@/components/logo";
import { QuestionsView } from "@/app/(app)/questions/questions-view";
import "@/app/(app)/questions/questions.css";

export const metadata = { title: "Domande in sospeso | LavorAI", robots: { index: false, follow: false } };

/**
 * Pending form questions for free accounts whose Pro trial ended. The cron
 * still applies for them on the free weekly quota, so the questions holding
 * those applications must stay answerable outside the paid app shell.
 * /api/questions is allowed for these users in proxy.ts (trial-access.ts).
 */
export default async function TrialExpiredQuestionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/questions");
  if (isAdmin(user.email) || !isApplicationAccessPaused(user)) redirect("/questions");
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Logo />
        <Link href="/trial-expired" className="text-sm underline">Torna al piano</Link>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        {!user.privacyConsentAt && (
          <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm">
            Per riprendere le candidature serve anche il tuo consenso privacy. <Link href="/trial-expired#privacy-consent" className="underline">Apri il consenso privacy</Link>
          </p>
        )}
        <QuestionsView />
      </div>
    </main>
  );
}
