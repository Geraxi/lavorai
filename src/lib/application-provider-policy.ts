/** Optional deployment restriction; never overrides pause, consent, quota or leases.
 * Absence preserves existing policy. Invalid values fail closed.
 * Set a fresh cutoff with the restriction to prevent releasing an old backlog.
 */
export function providerPolicy(env: Record<string, string | undefined> = process.env) {
  const mode = env.APPLICATION_PROVIDER_POLICY?.trim();
  if (!mode) return { restricted: false, valid: true, notBefore: null as Date | null };
  const raw = env.APPLICATION_PROVIDER_NOT_BEFORE;
  const date = raw ? new Date(raw) : null;
  const valid = mode === 'recruitee_only' && !!date && Number.isFinite(+date)
    && date.toISOString() === raw;
  return { restricted: true, valid, notBefore: valid ? date : null };
}
export function providerOfferAllowed(url: string, env: Record<string, string | undefined> = process.env) {
  const policy = providerPolicy(env);
  if (!policy.restricted) return true;
  if (!policy.valid) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash
      && /^[a-z0-9-]+\.recruitee\.com$/.test(u.hostname) && /^\/o\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname);
  } catch { return false; }
}
export function providerApplicationAllowed(row: {createdAt: Date; job: {url: string}}, env: Record<string, string | undefined> = process.env) {
  const policy = providerPolicy(env);
  if (!policy.restricted) return true;
  return providerOfferAllowed(row.job.url, env) && !!policy.notBefore && row.createdAt > policy.notBefore;
}
export function providerChannelAllowed(channel: string, env: Record<string, string | undefined> = process.env) {
  const policy = providerPolicy(env);
  return !policy.restricted || (policy.valid && channel === 'portal_recruitee');
}
