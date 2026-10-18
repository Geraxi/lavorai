/**
 * Meta Pixel loader, consent-aware.
 *
 * - Loads fbevents.js at most once per page (guarded by a window flag and by
 *   the standard `if (f.fbq) return` stub check), and fires exactly one
 *   PageView per load.
 * - Automatic advanced matching is disabled (`set autoConfig false`) and init
 *   carries NO user data.
 * - Never called unless advertising consent is effective; every track call
 *   re-checks permission through the `allowed` callback.
 */

export const META_PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js";
const LOADED_FLAG = "__lavoraiMetaPixelLoaded";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown };

export interface PixelWindow {
  fbq?: Fbq;
  _fbq?: Fbq;
  [LOADED_FLAG]?: string;
}

export interface PixelDocument {
  createElement(tag: "script"): { async: boolean; src: string };
  getElementsByTagName(tag: "script"): ArrayLike<{ parentNode: { insertBefore(a: unknown, b: unknown): void } | null }>;
  head?: { appendChild(el: unknown): void } | null;
  cookie: string;
  location?: { hostname: string };
}

function installStub(win: PixelWindow, doc: PixelDocument): Fbq {
  if (win.fbq) return win.fbq;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as Fbq;
  win.fbq = n;
  if (!win._fbq) win._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  const t = doc.createElement("script");
  t.async = true;
  t.src = META_PIXEL_SRC;
  const s = doc.getElementsByTagName("script")[0];
  if (s?.parentNode) s.parentNode.insertBefore(t, s);
  else doc.head?.appendChild(t);
  return n;
}

/** Loads + inits the pixel once. Returns true when the pixel is (now) loaded. */
export function loadMetaPixel(win: PixelWindow, doc: PixelDocument, pixelId: string): boolean {
  if (!/^\d{5,20}$/.test(pixelId)) return false;
  if (win[LOADED_FLAG] === pixelId) {
    win.fbq?.("consent", "grant");
    return true;
  }
  if (win[LOADED_FLAG]) return true; // another id already loaded: never double-load
  const fbq = installStub(win, doc);
  fbq("consent", "grant");
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
  fbq("track", "PageView");
  win[LOADED_FLAG] = pixelId;
  return true;
}

export function isMetaPixelLoaded(win: PixelWindow): boolean {
  return Boolean(win[LOADED_FLAG]);
}

/** Withdrawal: revoke on the already-loaded pixel and drop Meta's first-party cookies. */
export function revokeMetaPixel(win: PixelWindow, doc: PixelDocument): void {
  if (win.fbq) {
    try { win.fbq("consent", "revoke"); } catch { /* ignore */ }
  }
  expireCookies(doc, ["_fbp", "_fbc"]);
}

export function expireCookies(doc: PixelDocument, names: string[]): void {
  const host = doc.location?.hostname ?? "";
  const parts = host.split(".");
  const domains = [""];
  if (parts.length >= 2) domains.push(`; domain=.${parts.slice(-2).join(".")}`);
  if (host) domains.push(`; domain=${host}`);
  for (const name of names) {
    for (const d of domains) {
      doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
    }
  }
}

/**
 * Sends CompleteRegistration with the server-issued opaque event ID.
 * No params, no value, no customer data. Returns whether it was sent.
 */
export function trackCompleteRegistration(
  win: PixelWindow,
  eventId: string,
  allowed: () => boolean,
): boolean {
  if (!allowed()) return false;
  if (!win.fbq || !isMetaPixelLoaded(win)) return false;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(eventId)) return false;
  win.fbq("track", "CompleteRegistration", {}, { eventID: eventId });
  return true;
}
