/**
 * Binds a CV staged on the public /optimize form to the browser that staged
 * it. Without this, anyone could stage a CV for someone else's email and have
 * it adopted as that person's CV at their next sign-in.
 */
export const CV_STAGE_COOKIE = "lavorai_cv_stage";

const STAGING_ID = /^staging-[a-f0-9]{24}$/;

export function isStagingId(value: string | null | undefined): value is string {
  return typeof value === "string" && STAGING_ID.test(value);
}

/** True only when the staged file lives under the staging id held by this browser. */
export function stagedCvBelongsToBrowser(storagePath: string, cookieValue: string | null | undefined): boolean {
  if (!isStagingId(cookieValue)) return false;
  return storagePath.includes(`/${cookieValue}/`) || storagePath.startsWith(`${cookieValue}/`);
}
