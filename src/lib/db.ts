import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma client con Neon serverless driver adapter.
 *
 * PERCHÉ: il client Postgres vanilla apre una connessione TCP a Neon
 * ad ogni cold instance di una Vercel Function. L'handshake TCP+TLS
 * costa 150-400ms ed è pagato su OGNI navigazione che tocca il DB
 * dopo che la function è andata fredda (~5 min idle).
 *
 * Il driver Neon serverless instrada le query via HTTP/WebSocket
 * (connectionless) → niente handshake TCP, init quasi istantaneo su
 * serverless. È l'ottimizzazione canonica Vercel + Neon + Prisma.
 *
 * Fallback: se DATABASE_URL non è un endpoint postgres (es. sqlite
 * `file:` in dev locale), usa il client vanilla — l'adapter Neon
 * funziona solo con Postgres.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makePrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";
  const isPostgres = /^postgres(ql)?:\/\//.test(url);
  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (isPostgres) {
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter, log });
  }
  // Dev locale senza Postgres (sqlite/file:): client classico.
  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

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
