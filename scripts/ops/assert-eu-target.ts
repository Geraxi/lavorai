/**
 * Fail-closed EU write-target guard.
 * Prints hostnames only. Never prints URLs or passwords.
 * Exits non-zero unless every check holds.
 */
import { neon } from "@neondatabase/serverless";

export const EU_HOST = "ep-gentle-butterfly-aljrsiuw.c-3.eu-central-1.aws.neon.tech";
export const US_HOST_MARKER = "ep-raspy-violet";
export const EXPECTED_DATABASE = "neondb";
export const EXPECTED_SCHEMA = "public";
export const FINGERPRINT_MIGRATION = "20261025003000_submission_attempt_evidence";

export class EuTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EuTargetError";
  }
}

export type ParsedTarget = { host: string; database: string };

export type IdentityRow = {
  current_database: string;
  current_schema: string;
  inet_server_addr: string | null;
};

export type FingerprintRow = {
  evidence_exists: boolean;
  application_count: number;
};

export type EuQuery = {
  identity: () => Promise<IdentityRow>;
  fingerprint: () => Promise<FingerprintRow>;
};

export function parsePostgresTarget(url: string): ParsedTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EuTargetError("ABORT: unparseable database URL");
  }
  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    throw new EuTargetError("ABORT: unparseable database URL");
  }
  const host = parsed.hostname.trim().toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "").trim();
  if (!host) throw new EuTargetError("ABORT: unparseable database URL");
  if (!database) throw new EuTargetError("ABORT: database name mismatch");
  return { host, database };
}

export function assertNoUsMarker(...values: Array<string | undefined>): void {
  for (const value of values) {
    if (value && value.toLowerCase().includes(US_HOST_MARKER)) {
      throw new EuTargetError("ABORT: US host marker present");
    }
  }
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

export function createLiveQuery(directUrl: string): EuQuery {
  return {
    async identity() {
      const sql = neon(directUrl);
      const rows = await sql`SELECT current_database(), current_schema(), inet_server_addr()`;
      const row = (rows[0] ?? {}) as Record<string, unknown>;
      return {
        current_database: String(row.current_database ?? ""),
        current_schema: String(row.current_schema ?? ""),
        inet_server_addr: row.inet_server_addr == null ? null : String(row.inet_server_addr),
      };
    },
    async fingerprint() {
      const sql = neon(directUrl);
      const rows = await sql`
        SELECT
          EXISTS (
            SELECT 1 FROM "_prisma_migrations"
            WHERE migration_name = ${FINGERPRINT_MIGRATION}
          ) AS evidence_exists,
          (SELECT COUNT(*)::int FROM "Application") AS application_count
      `;
      const row = (rows[0] ?? {}) as Record<string, unknown>;
      return {
        evidence_exists: asBoolean(row.evidence_exists),
        application_count: asCount(row.application_count),
      };
    },
  };
}

export async function assertEuTarget(
  env: NodeJS.ProcessEnv,
  query?: EuQuery,
  log: (line: string) => void = (line) => {
    console.log(line);
  },
): Promise<void> {
  const directUrl = env.DIRECT_URL;
  const databaseUrl = env.DATABASE_URL;
  if (!directUrl || !databaseUrl) {
    throw new EuTargetError("ABORT: missing DIRECT_URL or DATABASE_URL");
  }
  assertNoUsMarker(directUrl, databaseUrl);
  const direct = parsePostgresTarget(directUrl);
  const database = parsePostgresTarget(databaseUrl);
  assertNoUsMarker(direct.host, database.host);
  log(`DIRECT_URL host: ${direct.host}`);
  log(`DATABASE_URL host: ${database.host}`);
  if (direct.host !== EU_HOST || database.host !== EU_HOST) {
    throw new EuTargetError("ABORT: host is not EU");
  }
  if (direct.database !== database.database) {
    throw new EuTargetError("ABORT: DIRECT_URL and DATABASE_URL databases differ");
  }
  if (direct.database !== EXPECTED_DATABASE) {
    throw new EuTargetError("ABORT: database name mismatch");
  }
  const q = query ?? createLiveQuery(directUrl);
  let identity: IdentityRow;
  try {
    identity = await q.identity();
  } catch (error) {
    if (error instanceof EuTargetError) throw error;
    throw new EuTargetError("ABORT: live identity query failed");
  }
  if (identity.current_database !== EXPECTED_DATABASE) {
    throw new EuTargetError("ABORT: live database name mismatch");
  }
  if (identity.current_schema !== EXPECTED_SCHEMA) {
    throw new EuTargetError("ABORT: schema mismatch");
  }
  let fingerprint: FingerprintRow;
  try {
    fingerprint = await q.fingerprint();
  } catch (error) {
    if (error instanceof EuTargetError) throw error;
    throw new EuTargetError("ABORT: fingerprint query failed");
  }
  if (!fingerprint.evidence_exists) {
    throw new EuTargetError("ABORT: fingerprint migration missing");
  }
  if (!Number.isFinite(fingerprint.application_count) || fingerprint.application_count <= 0) {
    throw new EuTargetError("ABORT: fingerprint application count is zero");
  }
  log("EU target confirmed");
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    await assertEuTarget(env);
  } catch (error) {
    const message = error instanceof EuTargetError ? error.message : "ABORT: EU target check failed";
    console.error(message);
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ?? "";
if (/(?:^|[\\/])assert-eu-target\.(?:ts|js)$/.test(entry)) {
  void main();
}
