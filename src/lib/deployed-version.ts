/**
 * Public git identity of the running worker/app. Used in cron/drain
 * reports so we can tell which revision processed a job. Never a secret.
 */
export function deployedAppVersion(
  env: Record<string, string | undefined> = process.env,
): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA
    || env.RAILWAY_GIT_COMMIT_SHA
    || env.GIT_COMMIT_SHA
    || env.COMMIT_SHA
    || "";
  return sha.trim() || "unknown";
}
