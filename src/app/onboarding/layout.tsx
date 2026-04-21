import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Auth guard server-side: /onboarding richiede sessione.
 * Lo stato iniziale viene caricato in /onboarding/page.tsx (server component)
 * e passato via props al client.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return <>{children}</>;
}
