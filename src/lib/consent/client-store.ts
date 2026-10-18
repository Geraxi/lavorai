/**
 * Browser-only consent store (singleton per tab). Combines stored answers and
 * the visit's region into effective permissions, keeps every open tab in sync
 * (storage event + BroadcastChannel), and records each explicit choice as
 * server-side evidence (POST /api/consent, append-only).
 */
import { CONSENT_NOTICE_VERSION, type ConsentPurpose } from "./notice";
import { resolveRegionForVisit } from "./region";
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_CHANNEL,
  CONSENT_STORAGE_KEY,
  CONSENT_VISITOR_KEY,
  LEGACY_CONSENT_KEY,
  answersFromStorage,
  classifyAction,
  effectiveConsent,
  serializeConsent,
  type ConsentAnswers,
  type ConsentChoice,
  type EffectiveConsent,
  type RegionState,
} from "./state";

export interface ConsentSnapshot {
  answers: ConsentAnswers;
  region: RegionState;
  effective: EffectiveConsent;
}

type Listener = () => void;

const SERVER_SNAPSHOT: ConsentSnapshot = {
  answers: { analytics: null, advertising: null },
  region: { status: "pending" },
  effective: { analytics: false, advertising: false, showBanner: false, ready: false },
};

let snapshot: ConsentSnapshot = SERVER_SNAPSHOT;
let started = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function recompute(region: RegionState = snapshot.region) {
  const answers = answersFromStorage(safeGet(CONSENT_STORAGE_KEY), safeGet(LEGACY_CONSENT_KEY));
  snapshot = { answers, region, effective: effectiveConsent(answers, region) };
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  recompute({ status: "pending" });
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === CONSENT_STORAGE_KEY || e.key === LEGACY_CONSENT_KEY) recompute();
  });
  try {
    channel = new BroadcastChannel(CONSENT_CHANNEL);
    channel.onmessage = () => recompute();
  } catch {
    channel = null;
  }
  let session: Storage | null = null;
  try { session = window.sessionStorage; } catch { session = null; }
  void resolveRegionForVisit((input, init) => fetch(input, init), session).then((region) => {
    recompute({ status: "resolved", ...region });
  });
}

export function subscribeConsent(listener: Listener): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConsentSnapshot(): ConsentSnapshot {
  return snapshot;
}

export function getServerConsentSnapshot(): ConsentSnapshot {
  return SERVER_SNAPSHOT;
}

/** Live check used right before any ad/analytics call. */
export function hasConsent(purpose: ConsentPurpose): boolean {
  if (typeof window === "undefined") return false;
  start();
  return snapshot.effective[purpose];
}

function visitorId(): string {
  let id = safeGet(CONSENT_VISITOR_KEY);
  if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    safeSet(CONSENT_VISITOR_KEY, id);
  }
  return id;
}

export function saveConsent(
  next: Record<ConsentPurpose, ConsentChoice>,
  source: "banner" | "settings",
): void {
  if (typeof window === "undefined") return;
  start();
  const action = classifyAction(snapshot.answers, next);
  const { stored, legacy } = serializeConsent(next, new Date());
  safeSet(CONSENT_STORAGE_KEY, stored);
  safeSet(LEGACY_CONSENT_KEY, legacy);
  recompute();
  try { channel?.postMessage({ type: "changed" }); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: legacy }));

  const region = snapshot.region.status === "resolved" ? snapshot.region : null;
  void fetch("/api/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      visitorId: visitorId(),
      noticeVersion: CONSENT_NOTICE_VERSION,
      region: region?.country ?? "unknown",
      consentRequired: region ? region.requiresConsent : true,
      analytics: next.analytics,
      advertising: next.advertising,
      action,
      source,
    }),
  }).catch(() => { /* evidence is best-effort; the choice itself is applied locally */ });
}
