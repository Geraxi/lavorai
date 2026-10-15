import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Adapter } from "next-auth/adapters";
import { registrationTrialEnd } from "./billing";

// Auth must not depend on every business/analytics column in the generated
// User model. Keep reads AND write return values limited to Auth.js fields.
export const authUserSelect = {
  id: true, email: true, name: true, image: true, emailVerified: true,
} satisfies Prisma.UserSelect;

export function createAuthAdapter(prisma: PrismaClient): Adapter {
  return {
    ...PrismaAdapter(prisma),
    getUser: (id) => prisma.user.findUnique({ where: { id }, select: authUserSelect }),
    async getUserByEmail(email) {
      // Detect legacy case variants without choosing an arbitrary account.
      // Email lookup does not authorize linking; Auth.js still owns that check.
      const users = await prisma.user.findMany({
        where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
        select: authUserSelect,
        take: 2,
      });
      if (users.length > 1) throw new Error("Ambiguous auth email");
      return users[0] ?? null;
    },
    async getUserByAccount(provider_providerAccountId) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId },
        select: { user: { select: authUserSelect } },
      });
      return account?.user ?? null;
    },
    async createUser({ id: _id, ...data }) {
      const now = new Date();
      return prisma.user.create({
        data: {
          ...data,
          email: data.email.trim().toLowerCase(),
          trialDurationDays: 7,
          trialEndsAt: registrationTrialEnd(now),
          proTrialUsedAt: now,
        },
        select: authUserSelect,
      });
    },
    updateUser: ({ id, ...data }) => prisma.user.update({
      where: { id }, data, select: authUserSelect,
    }),
    async getSessionAndUser(sessionToken) {
      const result = await prisma.session.findUnique({
        where: { sessionToken },
        select: { sessionToken: true, userId: true, expires: true, user: { select: authUserSelect } },
      });
      if (!result) return null;
      const { user, ...session } = result;
      return { user, session };
    },
  };
}
