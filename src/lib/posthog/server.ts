import { PostHog } from "posthog-node";
import { prisma } from "@/lib/db";
import { safeProperties, CONSENT_COOKIE, type FunnelEvent, type FunnelProperties } from "./shared";

const consentKey = (userId: string) => `posthog-consent:${userId}`;

/** Reuse the existing event store; optional analytics needs no schema migration. */
export async function rememberAnalyticsConsent(userId: string, accepted: boolean): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    await prisma.conversionEvent.upsert({ where: { dedupeKey: consentKey(userId) },
      create: { name: "posthog_consent", userId, dedupeKey: consentKey(userId), propertiesJson: JSON.stringify({ accepted }) },
      update: { propertiesJson: JSON.stringify({ accepted }) },
    });
  } catch { /* fail closed when consent cannot be read later */ }
}
async function userConsented(userId: string): Promise<boolean> {
  const consent = await prisma.conversionEvent.findUnique({ where: { dedupeKey: consentKey(userId) }, select: { propertiesJson: true } });
  return consent?.propertiesJson === '{"accepted":true}';
}

async function send(work: (client: PostHog) => void): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  let client: PostHog | undefined;
  try {
    client = new PostHog(key, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
      flushAt: 1, flushInterval: 0, requestTimeout: 3000, fetchRetryCount: 0, disableGeoip: true });
    client.on("error", () => { /* analytics must never affect the action */ });
    work(client);
  } catch { /* best effort */ }
  finally { try { await client?.shutdown(); } catch { /* best effort */ } }
}

export async function captureServerEvent(userId: string, event: FunnelEvent, properties?: FunnelProperties, insertId?: string): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    if (!await userConsented(userId)) return;
    await send(client => client.capture({ distinctId: userId, event,
      properties: { ...safeProperties(properties), ...(insertId ? { $insert_id: insertId } : {}) } }));
  } catch { /* consent lookup failures disable capture */ }
}

/** Used only from API catches. Request consent is required, even for anonymous errors. */
export async function captureApiException(_error: unknown, route: string): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    const { cookies } = await import("next/headers");
    if ((await cookies()).get(CONSENT_COOKIE)?.value !== "accepted") return;
    await send(client => {
      const safe = new Error("Unexpected API error");
      safe.name = "ApplicationError";
      safe.stack = undefined;
      client.captureException(safe, "anonymous-api", { route });
    });
  } catch { /* no request context / no consent */ }
}
