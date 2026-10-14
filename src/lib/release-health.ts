import { randomBytes } from "node:crypto";

/** Public build identity only. Never grants permission to submit an application. */
export const RELEASE_REPAIR_VERSION = "delivery-replies-20261014-v1";
export const RELEASE_HEALTH_URL = "https://lavorai.it/api/health/application-pause";
export const RELEASE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
export const RELEASE_NONCE_PATTERN = /^[a-f0-9]{32}$/;

/** Read-only fixed-origin probe. Automatic provider commit metadata must match
 * on both runtimes; missing metadata, redirects and stale/cache replay fail closed.
 * No credentials, owner identity or application data enter this request.
 */
export async function verifyProductionApplicationPause(): Promise<boolean> {
  const expectedCommit = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (!expectedCommit || !RELEASE_COMMIT_PATTERN.test(expectedCommit)) return false;
  const nonce = randomBytes(16).toString("hex");
  const url = `${RELEASE_HEALTH_URL}?nonce=${nonce}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET", redirect: "error", cache: "no-store", credentials: "omit",
      headers: { accept: "application/json", "cache-control": "no-cache, no-store", pragma: "no-cache" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200 || response.redirected || response.url !== url) return false;
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
    if (!response.headers.get("cache-control")?.split(",").some(value => value.trim().toLowerCase() === "no-store")) return false;
    const age = response.headers.get("age");
    if (age !== null && age !== "0") return false;
    const text = await response.text();
    if (text.length > 2048) return false;
    const result = JSON.parse(text);
    const finishedAt = Date.now();
    return result?.applicationsPaused === true
      && result?.repairVersion === RELEASE_REPAIR_VERSION
      && result?.deploymentCommit === expectedCommit
      && result?.nonce === nonce
      && Number.isSafeInteger(result?.observedAt)
      && result.observedAt >= startedAt - 5_000
      && result.observedAt <= finishedAt + 5_000
      && finishedAt - startedAt <= 15_000;
  } catch { return false; }
}
