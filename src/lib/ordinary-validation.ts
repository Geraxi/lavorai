/** One short, explicit ordinary-path validation window. Never opens producers.
 * This exempts only the global pause; no user/consent/billing/quota overlays.
 */
type Env = Record<string, string | undefined>;
export function ordinaryValidationConfig(env: Env = process.env, now = new Date()) {
  if (env.APPLICATIONS_PAUSED !== 'true' || env.USER_NOTIFICATIONS_HOLD !== 'true'
    || env.ATS_TEST_REAL_SUBMIT !== 'false') return null;
  const id=env.ORDINARY_VALIDATION_APPLICATION_ID?.trim();
  const userId=env.ORDINARY_VALIDATION_USER_ID?.trim();
  const jobId=env.ORDINARY_VALIDATION_JOB_ID?.trim();
  const userEmail=env.ORDINARY_VALIDATION_USER_EMAIL?.trim();
  const recipient=env.ORDINARY_VALIDATION_RECIPIENT?.trim();
  const raw=env.ORDINARY_VALIDATION_OFFER_URL;
  const start=new Date(env.ORDINARY_VALIDATION_STARTED_AT ?? '');
  const end=new Date(env.ORDINARY_VALIDATION_EXPIRES_AT ?? '');
  if (!id || !userId || !jobId || !userEmail || !recipient || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)
    || !Number.isFinite(+start) || !Number.isFinite(+end) || +start>+now || +end<=+now || +end-+start>30*60_000 || +end<=+start) return null;
  try {
    const url=new URL(raw ?? '');
    if (url.protocol!=='https:' || url.username || url.password || url.port || url.search || url.hash
      || !/^[a-z0-9-]+\.recruitee\.com$/.test(url.hostname) || !/^\/o\/[a-z0-9-]+$/.test(url.pathname)) return null;
    return {id,userId,jobId,userEmail,recipient,url:url.href,start,end};
  } catch { return null; }
}
export function ordinaryValidationId(id: string): boolean {
  return ordinaryValidationConfig()?.id === id;
}
export function ordinaryValidationRow(row: {
  id: string; userId: string; jobId: string; createdAt: Date;
  job: {url: string}; user: {email: string};
}): boolean {
  const c=ordinaryValidationConfig();
  return !!c && row.id===c.id && row.userId===c.userId && row.jobId===c.jobId
    && row.job.url===c.url && row.user.email===c.userEmail && +row.createdAt>=+c.start && +row.createdAt<=Date.now();
}
export function ordinaryValidationDestination(id: string, adapter: string, url: string, recipient: string): boolean {
  const c=ordinaryValidationConfig();
  return !!c && c.id===id && adapter==='recruitee' && url===c.url && recipient===c.recipient;
}
