/**
 * Resend credential accessors. Never log the return values.
 *
 * RESEND_API_KEY is the sending key (sending-only for lavorai.it once the
 * receiving key is live). RESEND_RECEIVING_API_KEY is for inbound reads.
 * Until that var is set, receiving callers fall back to RESEND_API_KEY.
 */

export type ResendReceivingSlot = "receiving" | "fallback";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function trimKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  return key || undefined;
}

export function resendSendingApiKey(env: Env = process.env): string | undefined {
  return trimKey(env.RESEND_API_KEY);
}

export function resendReceivingKeySlot(env: Env = process.env): ResendReceivingSlot | null {
  if (trimKey(env.RESEND_RECEIVING_API_KEY)) return "receiving";
  if (trimKey(env.RESEND_API_KEY)) return "fallback";
  return null;
}

export function resendReceivingApiKey(env: Env = process.env): string | undefined {
  return trimKey(env.RESEND_RECEIVING_API_KEY) ?? resendSendingApiKey(env);
}

export function resendReceivingAuthorization(env: Env = process.env): {
  apiKey: string;
  slot: ResendReceivingSlot;
} | null {
  const slot = resendReceivingKeySlot(env);
  const apiKey = resendReceivingApiKey(env);
  if (!slot || !apiKey) return null;
  return { apiKey, slot };
}

/** Strip credential material from provider text. Never log raw keys. */
export function sanitizeResendLogText(value: string): string {
  return value
    .replace(/re_[A-Za-z0-9]+/g, "re_[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function logResendReceivingError(input: {
  name?: string;
  statusCode?: number | null;
  message?: string;
  slot: ResendReceivingSlot;
}): void {
  console.error("[resend-receiving]", {
    name: sanitizeResendLogText((input.name ?? "provider_error").trim() || "provider_error"),
    statusCode: typeof input.statusCode === "number" ? input.statusCode : null,
    message: input.message ? sanitizeResendLogText(input.message) : undefined,
    slot: input.slot,
  });
}

async function parseResendError(res: Response): Promise<{ name?: string; statusCode?: number | null; message?: string }> {
  const statusCode = res.status;
  try {
    const body = await res.json() as { name?: unknown; statusCode?: unknown; message?: unknown };
    return {
      name: typeof body?.name === "string" ? body.name : undefined,
      statusCode: typeof body?.statusCode === "number" ? body.statusCode : statusCode,
      message: typeof body?.message === "string" ? body.message : undefined,
    };
  } catch {
    return { statusCode };
  }
}

export type ResendReceivingCheckSlot = ResendReceivingSlot | "missing";

export type ResendReceivingCheckResult = {
  ok: boolean;
  keySlot: ResendReceivingCheckSlot;
  listStatus: number | null;
  fetchStatus: number | null;
  fetchedId: string | null;
  idMatches: boolean;
  receivedAt: string | null;
  hasBody: boolean;
  error?: { name: string; statusCode: number | null; message: string };
};

const RECEIVING_EMAIL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHECK_RESULT_KEYS = [
  "ok",
  "keySlot",
  "listStatus",
  "fetchStatus",
  "fetchedId",
  "idMatches",
  "receivedAt",
  "hasBody",
  "error",
] as const;

export function parseReceivingEmailId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return RECEIVING_EMAIL_UUID.test(id) ? id : null;
}

function emptyCheck(keySlot: ResendReceivingCheckSlot): Omit<ResendReceivingCheckResult, "error"> {
  return {
    ok: false,
    keySlot,
    listStatus: null,
    fetchStatus: null,
    fetchedId: null,
    idMatches: false,
    receivedAt: null,
    hasBody: false,
  };
}

function checkError(name: string, statusCode: number | null | undefined, message?: string) {
  return {
    name: sanitizeResendLogText((name || "provider_error").trim() || "provider_error"),
    statusCode: typeof statusCode === "number" ? statusCode : null,
    message: message ? sanitizeResendLogText(message) : "",
  };
}

function firstListedReceivingId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = (body as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function emailHasBody(body: Record<string, unknown>): boolean {
  const text = body.text;
  const html = body.html;
  return (typeof text === "string" && text.trim().length > 0)
    || (typeof html === "string" && html.trim().length > 0);
}

function sealedCheck(result: ResendReceivingCheckResult): ResendReceivingCheckResult {
  const sealed: ResendReceivingCheckResult = {
    ok: result.ok,
    keySlot: result.keySlot,
    listStatus: result.listStatus,
    fetchStatus: result.fetchStatus,
    fetchedId: result.fetchedId,
    idMatches: result.idMatches,
    receivedAt: result.receivedAt,
    hasBody: result.hasBody,
  };
  if (result.error) sealed.error = result.error;
  for (const key of Object.keys(sealed) as Array<keyof ResendReceivingCheckResult>) {
    if (!CHECK_RESULT_KEYS.includes(key as typeof CHECK_RESULT_KEYS[number])) delete sealed[key];
  }
  return sealed;
}

/**
 * Read-only receiving-key probe. Uses resendReceivingApiKey(). One GET of
 * /emails/receiving/{id} — either the given UUID or the first listed id.
 * Never returns from/to/subject/body/headers/attachments or the key.
 */
export async function checkResendReceivingCredential(input: {
  id?: unknown;
  requireReceivingKey?: boolean;
  env?: Env;
  fetch?: FetchLike;
} = {}): Promise<ResendReceivingCheckResult> {
  const env = input.env ?? process.env;
  const f = input.fetch ?? fetch;
  const slot = resendReceivingKeySlot(env);
  const keySlot: ResendReceivingCheckSlot = slot ?? "missing";
  const apiKey = resendReceivingApiKey(env);

  if (!slot || !apiKey) {
    return sealedCheck({
      ...emptyCheck("missing"),
      error: checkError("receiving_key_missing", null, "No receiving or sending Resend key is configured."),
    });
  }
  if (input.requireReceivingKey && slot === "fallback") {
    return sealedCheck({
      ...emptyCheck("fallback"),
      error: checkError(
        "receiving_key_required",
        null,
        "RESEND_RECEIVING_API_KEY is not set; the sending key would be used as fallback.",
      ),
    });
  }

  const rawId = typeof input.id === "string" ? input.id.trim() : "";
  const requestedId = rawId ? parseReceivingEmailId(rawId) : null;
  if (rawId && !requestedId) {
    return sealedCheck({
      ...emptyCheck(slot),
      error: checkError("invalid_id", null, "id must be a UUID."),
    });
  }

  const headers = { Authorization: `Bearer ${apiKey}` };
  let listStatus: number | null = null;
  let targetId = requestedId;

  if (!targetId) {
    const listRes = await f("https://api.resend.com/emails/receiving?limit=1", {
      headers,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    listStatus = listRes.status;
    if (!listRes.ok) {
      const parsed = await parseResendError(listRes);
      logResendReceivingError({ ...parsed, slot });
      return sealedCheck({
        ...emptyCheck(slot),
        listStatus,
        error: checkError(parsed.name ?? "list_failed", parsed.statusCode ?? listStatus, parsed.message),
      });
    }
    let listed: unknown = null;
    try { listed = await listRes.json(); } catch { listed = null; }
    targetId = firstListedReceivingId(listed);
    if (!targetId) {
      return sealedCheck({
        ...emptyCheck(slot),
        listStatus,
        error: checkError("empty_inbox", listStatus, "No received emails to fetch."),
      });
    }
  }

  const fetchRes = await f(`https://api.resend.com/emails/receiving/${encodeURIComponent(targetId)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const fetchStatus = fetchRes.status;
  if (!fetchRes.ok) {
    const parsed = await parseResendError(fetchRes);
    logResendReceivingError({ ...parsed, slot });
    return sealedCheck({
      ...emptyCheck(slot),
      listStatus,
      fetchStatus,
      fetchedId: targetId,
      idMatches: false,
      error: checkError(parsed.name ?? "fetch_failed", parsed.statusCode ?? fetchStatus, parsed.message),
    });
  }

  let body: unknown = null;
  try { body = await fetchRes.json(); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sealedCheck({
      ...emptyCheck(slot),
      listStatus,
      fetchStatus,
      fetchedId: targetId,
      idMatches: false,
      error: checkError("inbound_body_invalid", fetchStatus, "Received-email response was not an object."),
    });
  }

  const record = body as Record<string, unknown>;
  const fetchedId = typeof record.id === "string" && record.id.trim() ? record.id.trim() : targetId;
  const idMatches = fetchedId.toLowerCase() === targetId.toLowerCase();
  return sealedCheck({
    ok: idMatches,
    keySlot: slot,
    listStatus,
    fetchStatus,
    fetchedId,
    idMatches,
    receivedAt: isoTimestamp(record.received_at) ?? isoTimestamp(record.created_at),
    hasBody: emailHasBody(record),
  });
}

/** GET /emails/receiving/:id. Logs sanitized errors and the key slot, never the key. */
export async function fetchResendReceivedEmail(
  providerMessageId: string,
  env: Env = process.env,
  f: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const creds = resendReceivingAuthorization(env);
  if (!creds) throw new Error("inbound_body_credentials_unavailable");
  const res = await f(`https://api.resend.com/emails/receiving/${encodeURIComponent(providerMessageId)}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    logResendReceivingError({ ...(await parseResendError(res)), slot: creds.slot });
    throw new Error(`inbound_body_unavailable_${res.status}`);
  }
  const body = await res.json() as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("inbound_body_invalid");
  return body as Record<string, unknown>;
}
