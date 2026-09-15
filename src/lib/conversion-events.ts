import { prisma } from "@/lib/db";
import type { AnalyticsEventName } from "@/lib/analytics";

type EventProperties = Record<string, string | number | boolean | null | undefined>;

export interface ConversionEventInput {
  userId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  plan?: string | null;
  source?: string | null;
  valueCents?: number | null;
  properties?: EventProperties;
  dedupeKey?: string | null;
}

function cleanProperties(properties?: EventProperties): string | null {
  if (!properties) return null;
  const safe = Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined)
      .slice(0, 12)
      .map(([key, value]) => [
        key.slice(0, 50),
        typeof value === "string" ? value.slice(0, 160) : value,
      ]),
  );
  return Object.keys(safe).length ? JSON.stringify(safe) : null;
}

/** Best-effort by design: measurement must never break a user flow. */
export async function recordConversionEvent(
  name: AnalyticsEventName,
  input: ConversionEventInput = {},
): Promise<void> {
  try {
    await prisma.conversionEvent.create({
      data: {
        name,
        userId: input.userId ?? null,
        sessionId: input.sessionId?.slice(0, 80) ?? null,
        path: input.path?.slice(0, 250) ?? null,
        plan: input.plan?.slice(0, 30) ?? null,
        source: input.source?.slice(0, 80) ?? null,
        valueCents: input.valueCents ?? null,
        propertiesJson: cleanProperties(input.properties),
        dedupeKey: input.dedupeKey?.slice(0, 190) ?? null,
      },
    });
  } catch {
    // Includes harmless unique-key conflicts from webhook retries.
  }
}
