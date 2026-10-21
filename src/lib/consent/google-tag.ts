import { expireCookies, type PixelDocument } from "./meta-pixel";

export const GOOGLE_ADS_ID = "AW-18528829051";
export const GOOGLE_SIGNUP_DESTINATION = `${GOOGLE_ADS_ID}/UJCMCILUxaQdEPv8nYNF`;
export const GOOGLE_CONSENT_DEFAULT = `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.__lavoraiGoogleDefaults=true;`;

export interface GoogleWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __lavoraiGoogleDefaults?: boolean;
  __lavoraiGtagLoaded?: boolean;
  __lavoraiGtagReady?: boolean;
  __lavoraiGtagConfigured?: Record<string, boolean>;
  location?: { href: string };
  [disableFlag: `ga-disable-${string}`]: boolean | undefined;
}

/** Never forward arbitrary URL parameters, OAuth codes, contact details or titles. */
export function googlePageLocation(href: string, advertising: boolean): string {
  const url = new URL(href);
  const path = ["/", "/signup", "/login", "/privacy"].includes(url.pathname) ? url.pathname : "/account";
  const clean = new URL(path, url.origin);
  const gclid = url.searchParams.get("gclid");
  if (advertising && path === "/signup" && gclid && /^[A-Za-z0-9_-]{1,256}$/.test(gclid)) clean.searchParams.set("gclid", gclid);
  return clean.href;
}

function defaults(win: GoogleWindow) {
  win.dataLayer ??= [];
  win.gtag ??= function () {
    // Google consumes Arguments objects.
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer!.push(arguments);
  };
  if (win.__lavoraiGoogleDefaults) return;
  win.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  win.__lavoraiGoogleDefaults = true;
}

export function syncGoogleConsent(win: GoogleWindow, doc: PixelDocument, analytics: boolean, advertising: boolean, gaId?: string) {
  defaults(win);
  const ids = [GOOGLE_ADS_ID, ...(gaId ? [gaId] : [])];
  // Disable destinations BEFORE updating consent, including on withdrawal.
  win[`ga-disable-${GOOGLE_ADS_ID}`] = !advertising;
  if (gaId) win[`ga-disable-${gaId}`] = !analytics;
  if (!advertising) {
    // Drop events still queued while the library is loading: never replay on reaccept.
    const retained = (win.dataLayer ?? []).filter((entry) => {
      const args = entry as ArrayLike<unknown>;
      if (args[0] === "event" && (args[2] as { send_to?: string })?.send_to === GOOGLE_SIGNUP_DESTINATION) return false;
      if (!win.__lavoraiGtagReady) {
        // A slow script must never consume an earlier grant/config after revocation.
        if (args[0] === "config" && args[1] === GOOGLE_ADS_ID) return false;
        if (args[0] === "consent" && args[2] && typeof args[2] === "object") {
          Object.assign(args[2], { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
        }
        const params = args[0] === "set" ? args[1] : args[0] === "config" ? args[2] : null;
        if (params && typeof params === "object" && "page_location" in params) {
          Object.assign(params, { page_location: googlePageLocation(win.location?.href ?? "https://lavorai.it/", false) });
        }
      }
      return true;
    });
    win.dataLayer!.splice(0, win.dataLayer!.length, ...retained);
    if (!win.__lavoraiGtagReady && win.__lavoraiGtagConfigured) delete win.__lavoraiGtagConfigured[GOOGLE_ADS_ID];
    expireCookies(doc, ["_gcl_au", "_gcl_aw", "_gcl_dc", "_gcl_gs"]);
  }
  win.gtag!("consent", "update", {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: advertising ? "granted" : "denied",
    ad_user_data: advertising ? "granted" : "denied",
    ad_personalization: advertising ? "granted" : "denied",
  });
  if (!advertising && !(gaId && analytics)) return;
  const page = googlePageLocation(win.location?.href ?? "https://lavorai.it/", advertising);
  win.gtag!("set", { page_location: page, page_referrer: "", page_title: "LavorAI", ads_data_redaction: true, url_passthrough: false });
  if (!win.__lavoraiGtagLoaded) {
    win.__lavoraiGtagLoaded = true;
    win.gtag!("js", new Date());
    const script = doc.createElement("script") as ReturnType<PixelDocument["createElement"]> & { onload?: () => void };
    script.onload = () => { win.__lavoraiGtagReady = true; };
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(advertising ? GOOGLE_ADS_ID : gaId!)}`;
    doc.head?.appendChild(script);
  }
  win.__lavoraiGtagConfigured ??= {};
  for (const id of ids) {
    if (win[`ga-disable-${id}`] || win.__lavoraiGtagConfigured[id]) continue;
    win.__lavoraiGtagConfigured[id] = true;
    win.gtag!("config", id, { send_page_view: id !== GOOGLE_ADS_ID, allow_enhanced_conversions: false, page_location: page, page_referrer: "", page_title: "LavorAI" });
  }
}

export function trackGoogleRegistration(win: GoogleWindow, eventId: string, allowed: () => boolean): boolean {
  if (!allowed() || !win.gtag || !win.__lavoraiGtagConfigured?.[GOOGLE_ADS_ID] || win[`ga-disable-${GOOGLE_ADS_ID}`]) return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) return false;
  win.gtag("event", "conversion", { send_to: GOOGLE_SIGNUP_DESTINATION, transaction_id: eventId });
  return true;
}
