import type { PrismaClient } from "@prisma/client";
import type { Account, Profile } from "next-auth";

function verifiedGoogleEmail(account: Account, profile?: Profile) {
  if (account.provider !== "google" || profile?.email_verified !== true ||
      typeof profile.sub !== "string" || profile.sub !== account.providerAccountId ||
      typeof profile.email !== "string" || !profile.email.trim()) return null;
  return profile.email.trim().toLowerCase();
}

/** Called only after Auth.js has validated the OAuth/OIDC response. */
export async function allowGoogleSignIn(
  prisma: PrismaClient,
  account: Account,
  profile: Profile | undefined,
  currentUserId: string | undefined,
) {
  const email = verifiedGoogleEmail(account, profile);
  if (!email) return false;
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
    select: { user: { select: { id: true, suspendedAt: true } } },
  });
  if (linked) return !linked.user.suspendedAt && (!currentUserId || currentUserId === linked.user.id);
  if (!currentUserId) return true; // Auth.js rejects email collisions; never merge here.

  // An authenticated account link must also match the verified Google email.
  // An event after linkAccount is too late to reject a mismatched link.
  const current = await prisma.user.findUnique({
    where: { id: currentUserId }, select: { email: true, suspendedAt: true },
  });
  return !!current && !current.suspendedAt && current.email.trim().toLowerCase() === email;
}

/** Repair verification on a successful login, never from email equality alone. */
export async function verifyGoogleSignInEmail(
  prisma: PrismaClient, userId: string, account: Account, profile?: Profile,
) {
  const email = verifiedGoogleEmail(account, profile);
  if (!email) return;
  // Auth.js resets emailVerified to null for newly created OAuth users, even
  // when profile() supplies a date. At signIn, the Account is already linked.
  await prisma.user.updateMany({
    where: {
      id: userId, email: { equals: email, mode: "insensitive" },
      emailVerified: null, suspendedAt: null,
      accounts: { some: { provider: "google", providerAccountId: account.providerAccountId } },
    },
    data: { emailVerified: new Date() },
  });
}
