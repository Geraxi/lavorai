import { neon } from "@neondatabase/serverless";

type UserRow = { id: string; email: string; has_pw: boolean; createdAt: string; lastLoginAt: string | null };
type GoogleRow = { userId: string; email: string; providerAccountId: string };
type CountRow = { count: string; max: string | null };
type Label = "DATABASE_URL" | "DIRECT_URL";

function target(label: Label, connectionString: string | undefined) {
  if (!connectionString) return { label, host: null, identity: null, sourcePresent: false };
  try {
    const url = new URL(connectionString);
    const host = url.hostname.replace(/-pooler\./, ".");
    return { label, host, identity: `${host}/${url.pathname.slice(1)}`, sourcePresent: true };
  } catch {
    return { label, host: null, identity: null, sourcePresent: true };
  }
}

async function inspect(label: Label, connectionString: string | undefined) {
  const endpoint = target(label, connectionString);
  if (!connectionString) return { target: endpoint, ok: false, error: "not_configured" as const };
  try {
    const sql = neon(connectionString);
    const [rawUsers, rawGoogleAccounts, rawTotals] = await Promise.all([
      sql`SELECT id, email, "passwordHash" IS NOT NULL AS has_pw, "createdAt", "lastLoginAt" FROM "User" WHERE email ILIKE '%geraci%' ORDER BY "createdAt" ASC`,
      sql`SELECT a."userId", u.email, a."providerAccountId" FROM "Account" a JOIN "User" u ON u.id = a."userId" WHERE a.provider = 'google' AND u.email ILIKE '%geraci%'`,
      sql`SELECT count(*), max("createdAt") FROM "User"`,
    ]);
    return {
      target: endpoint,
      ok: true,
      users: rawUsers as unknown as UserRow[],
      googleAccounts: rawGoogleAccounts as unknown as GoogleRow[],
      totals: (rawTotals as unknown as CountRow[])[0] ?? { count: "0", max: null },
    };
  } catch (error) {
    console.error("[admin/db-diagnostics] inspection failed", { label, kind: error instanceof Error ? error.name : "unknown" });
    return { target: endpoint, ok: false, error: "query_failed" as const };
  }
}

/** Admin-only callers may use this to compare configured databases safely. */
export async function getDbDiagnostics() {
  const [database, direct] = await Promise.all([
    inspect("DATABASE_URL", process.env.DATABASE_URL),
    inspect("DIRECT_URL", process.env.DIRECT_URL),
  ]);
  const sameDatabase = database.target.identity !== null && direct.target.identity !== null && database.target.identity === direct.target.identity;
  const redactIdentity = <T extends { target: { label: Label; host: string | null; sourcePresent: boolean } }>(result: T) => result;
  return {
    sameDatabase,
    database: redactIdentity({ ...database, target: { label: database.target.label, host: database.target.host, sourcePresent: database.target.sourcePresent } }),
    direct: redactIdentity({ ...direct, target: { label: direct.target.label, host: direct.target.host, sourcePresent: direct.target.sourcePresent } }),
  };
}
