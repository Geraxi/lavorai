import { PrismaClient } from "@prisma/client";

/**
 * Singleton del Prisma client. Evita creazione di connessioni multiple
 * in hot-reload Next.js dev.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Demo user fallback per development senza auth setup.
 * In produzione non viene mai chiamato (auth gate ovunque).
 */
export const DEMO_USER_EMAIL = "demo@lavorai.it";

export async function getDemoUser() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Demo User", tier: "free" },
  });
  return user;
}
