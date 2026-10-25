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
