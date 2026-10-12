import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  has_pw: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type GoogleRow = {
  userId: string;
  email: string;
  providerAccountId: string;
};

type CountRow = { count: string; max: string | null };

type Endpoint = {
  label: "DATABASE_URL" | "DIRECT_URL";
  host: string | null;
  identity: string | null;
  sourcePresent: boolean;
};

function endpoint(label: Endpoint["label"], connectionString: string | undefined): Endpoint {
  if (!connectionString) return { label, host: null, identity: null, sourcePresent: false };
  try {
    const url = new URL(connectionString);
    // The identity is intentionally not returned. It lets us identify two
    // databases at the same host without leaking a username, password or URL.
    return {
      label,
      host: url.hostname.replace(/-pooler\./, "."),
      identity: `${url.hostname.replace(/-pooler\./, ".")}/${url.pathname.slice(1)}`,
      sourcePresent: true,
    };
  } catch {
    return { label, host: null, identity: null, sourcePresent: true };
  }
}

async function inspect(label: Endpoint["label"], connectionString: string | undefined) {
  const target = endpoint(label, connectionString);
  if (!connectionString) return { target, ok: false, error: "not_configured" as const };

  try {
    const sql = neon(connectionString);
    const [rawUsers, rawGoogleAccounts, rawTotals] = await Promise.all([
      sql`
        SELECT id, email, "passwordHash" IS NOT NULL AS has_pw, "createdAt", "lastLoginAt"
        FROM "User"
        WHERE email ILIKE '%geraci%'
        ORDER BY "createdAt" ASC
      `,
      sql`
        SELECT a."userId", u.email, a."providerAccountId"
        FROM "Account" a
        JOIN "User" u ON u.id = a."userId"
        WHERE a.provider = 'google' AND u.email ILIKE '%geraci%'
      `,
      sql`SELECT count(*), max("createdAt") FROM "User"`,
    ]);
    const users = rawUsers as unknown as UserRow[];
    const googleAccounts = rawGoogleAccounts as unknown as GoogleRow[];
    const totals = rawTotals as unknown as CountRow[];

    return {
      target,
      ok: true,
      users,
      googleAccounts,
      totals: totals[0] ?? { count: "0", max: null },
    };
  } catch (error) {
    // Do not reveal raw driver messages: they can include a connection string.
    console.error("[admin/db-diagnostics] inspection failed", { label, kind: error instanceof Error ? error.name : "unknown" });
    return { target, ok: false, error: "query_failed" as const };
  }
}

/**
 * Admin-only, read-only database diagnostic for resolving authentication
 * routing issues. It never returns connection strings or credentials.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  const [database, direct] = await Promise.all([
    inspect("DATABASE_URL", databaseUrl),
    inspect("DIRECT_URL", directUrl),
  ]);

  const sameDatabase =
    database.target.identity !== null &&
    direct.target.identity !== null &&
    database.target.identity === direct.target.identity;

  return NextResponse.json({
    sameDatabase,
    // Keep only hosts in the response. `identity` is used above only and is
    // omitted by destructuring to make accidental secret leakage impossible.
    database: { ...database, target: { label: database.target.label, host: database.target.host, sourcePresent: database.target.sourcePresent } },
    direct: { ...direct, target: { label: direct.target.label, host: direct.target.host, sourcePresent: direct.target.sourcePresent } },
  });
}
