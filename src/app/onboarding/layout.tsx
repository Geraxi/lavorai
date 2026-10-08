import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VerifyEmailBanner } from "@/components/verify-email-banner";

/**
 * Auth guard server-side: /onboarding richiede sessione.
 * Lo stato iniziale viene caricato in /onboarding/page.tsx (server component)
 * e passato via props al client.
 * Utenti password non verificati vedono un banner: possono completare
 * l'onboarding, ma le candidature partono solo dopo la verifica email.
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
  const user = await prisma.user
    .findUnique({
      where: { id: session.user.id },
      select: { email: true, emailVerified: true, passwordHash: true },
    })
    .catch(() => null);
  const needsVerification =
    !!user && !!user.passwordHash && !user.emailVerified && !!user.email;
  return (
    <>
      {needsVerification && user ? <VerifyEmailBanner email={user.email} /> : null}
      {children}
    </>
  );
}
