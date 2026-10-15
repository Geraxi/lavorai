/** First-party diagnostic counts only. No identity, tokens, OAuth URL or raw error. */
export function recordGoogleLoginObservation(stage: "started" | "launch_failed" | "callback_error") {
  if (typeof window === "undefined") return;
  const key = "lavorai-google-attempt";
  if (stage === "started") { try { sessionStorage.setItem(key, String(Date.now())); } catch { /* optional */ } }
  else { try { sessionStorage.removeItem(key); } catch { /* optional */ } }
  void fetch("/api/analytics/event", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ name: stage === "started" ? "google_login_started_observed" : "google_login_failure_observed", path: window.location.pathname, source: "google_client_observation", payload: { stage } }) }).catch(() => {});
}
export function observeGoogleCallbackError(error: string | null) {
  if (!error || !["OAuthSignin", "OAuthCallback", "OAuthSignInError", "OAuthCallbackError", "CallbackRouteError", "OAuthAccountNotLinked", "AccessDenied", "Configuration"].includes(error)) return;
  try { const started = Number(sessionStorage.getItem("lavorai-google-attempt")); if (started > 0 && Date.now() - started < 15 * 60_000) recordGoogleLoginObservation("callback_error"); } catch { /* optional */ }
}
