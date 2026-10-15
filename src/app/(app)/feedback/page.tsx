import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { FeedbackView } from "@/components/feedback-view";
export const dynamic = "force-dynamic";
export default async function FeedbackPage() {
  if (!await getCurrentUser()) redirect("/login?next=/feedback");
  return <FeedbackView locale={await getLocale()} />;
}
