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

function parseNeonEndpoint(connStr: string): { host: string; database: string } | null {
  try {
    const url = new URL(connStr);
    if (!url.hostname || !url.pathname) return null;
    const host = url.hostname.replace(/-pooler\./, ".");
    const database = url.pathname.slice(1).split("/")[0];
    return { host, database };
  } catch {
    return null;
  }
}

function makePrisma(): PrismaClient {
  // DATABASE_URL is the canonical runtime database. DIRECT_URL is only a
  // fallback for environments that intentionally provide a direct connection
  // but no pooled/runtime URL. Keeping this order prevents a stale DIRECT_URL
  // from splitting Auth.js users from the active application database.
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
  const isPostgres = /^postgres(ql)?:\/\//.test(url);
  const log: ("error" | "warn")[] =
    process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

  if (process.env.NODE_ENV === "production") {
    const directUrl = process.env.DIRECT_URL;
    const databaseUrl = process.env.DATABASE_URL;
    if (directUrl && databaseUrl) {
      const direct = parseNeonEndpoint(directUrl);
      const pooled = parseNeonEndpoint(databaseUrl);
      if (direct && pooled) {
        const mismatch = direct.host !== pooled.host || direct.database !== pooled.database;
        if (mismatch) {
          const msg = `[db] DATABASE_URL/DIRECT_URL endpoint mismatch: host ${pooled.host} vs ${direct.host}, database ${pooled.database} vs ${direct.database}`;
          console.error(msg);
          if (process.env.STRICT_DB_URL_CHECK === "1") {
            throw new Error(msg);
          }
        }
      }
    }
  }

  // Use Neon adapter only in production for Vercel serverless optimization.
  // In CI/test environments, use standard Prisma client to avoid WebSocket connection issues.
  const useNeonAdapter = isPostgres && process.env.NODE_ENV === "production" && url.includes(".neon.tech");
  
  if (useNeonAdapter) {
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter, log });
  }
  
  // CI, dev locale, or non-Neon Postgres: client standard.
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
