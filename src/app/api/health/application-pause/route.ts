import { applicationsPaused } from "@/lib/application-pause";
import { applicationRolloutConfig } from "@/lib/application-rollout";
import { RELEASE_COMMIT_PATTERN, RELEASE_NONCE_PATTERN, RELEASE_REPAIR_VERSION } from "@/lib/release-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const headers = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

/** Public, side-effect-free release health. No database or privileged action. */
export async function GET(request: Request): Promise<Response> {
  const nonce = new URL(request.url).searchParams.get("nonce");
  if (!nonce || !RELEASE_NONCE_PATTERN.test(nonce)) {
    return Response.json({ error: "invalid_probe" }, { status: 400, headers });
  }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!commit || !RELEASE_COMMIT_PATTERN.test(commit)) {
    return Response.json({ error: "build_identity_unavailable" }, { status: 503, headers });
  }
  const rollout = applicationRolloutConfig();
  return Response.json({
    applicationsPaused: applicationsPaused(),
    repairVersion: RELEASE_REPAIR_VERSION,
    deploymentCommit: commit,
    nonce,
    observedAt: Date.now(),
  }, { headers: {
    ...headers,
    "X-Lavorai-Rollout-Mode": rollout.enabled ? rollout.mode! : "closed",
    "X-Lavorai-Rollout-Cap": rollout.dailyCap?.toString() ?? "0",
    "X-Lavorai-Rollout-Start": rollout.startedAt?.toISOString() ?? "unavailable",
    "X-Lavorai-Automatic-Producers": rollout.enabled && rollout.mode === "automatic" && !applicationsPaused() ? "enabled" : "blocked",
  } });
}
