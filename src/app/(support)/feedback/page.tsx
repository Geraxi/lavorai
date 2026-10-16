import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireReportActor, ReportError } from "@/lib/feedback-server";
import { FeedbackView } from "@/components/feedback-view";
import { SupportShell } from "@/components/support-shell";
export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback e bug", robots: { index: false, follow: false } };
export default async function FeedbackPage() {
  try { await requireReportActor(); } catch (error) {
    if (error instanceof ReportError && error.status === 401) redirect("/login?next=/feedback");
    // Suspension is an account-security decision, not expired billing access.
    if (error instanceof ReportError && error.status === 403) redirect("/login?error=AccountSuspended");
    throw error;
  }
  const locale = await getLocale();
  return <SupportShell locale={locale}><FeedbackView locale={locale} standalone /></SupportShell>;
}
