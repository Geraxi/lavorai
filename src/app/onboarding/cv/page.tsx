import { redirect } from "next/navigation";

/** Keep links in previously sent CV reminders usable. */
export default function LegacyCvOnboardingPage() {
  redirect("/onboarding");
}
