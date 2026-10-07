import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VerifyEmailBanner } from "@/components/verify-email-banner";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
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
  const needsVerification = !!user && !!user.passwordHash && !user.emailVerified && !!user.email;
  return (
    <>
      {needsVerification && user ? <VerifyEmailBanner email={user.email} /> : null}
      {children}
    </>
  );
}
