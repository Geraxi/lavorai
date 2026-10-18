/**
 * Versioned consent notice.
 *
 * CONSENT_NOTICE_VERSION identifies the EXACT text, purposes, recipients and
 * choices the visitor saw when answering. Every ConsentRecord stores this
 * version, so any change to the wording, a purpose or a recipient MUST bump
 * the version (and keep the previous entry in CONSENT_NOTICES so stored
 * evidence keeps resolving to the text that was actually shown).
 *
 * A grant given under an older version is treated as unanswered (the banner
 * asks again where consent is required); a refusal is always honoured.
 */

export type ConsentPurpose = "analytics" | "advertising";

export interface ConsentNoticeText {
  title: string;
  body: string;
  purposes: Record<ConsentPurpose, { label: string; description: string; recipients: string }>;
  choices: { acceptAll: string; rejectAll: string; customize: string; save: string; close: string };
  privacyLink: string;
  settingsLink: string;
}

export interface ConsentNotice {
  version: string;
  publishedAt: string;
  purposes: Record<ConsentPurpose, { recipients: string[]; tools: string[] }>;
  text: { it: ConsentNoticeText; en: ConsentNoticeText };
}

export const CONSENT_NOTICE_VERSION = "2026-10-18.meta-v1";

const NOTICE_2026_10_18: ConsentNotice = {
  version: "2026-10-18.meta-v1",
  publishedAt: "2026-10-18",
  purposes: {
    analytics: {
      recipients: ["Google Ireland Ltd (Google Analytics)"],
      tools: ["google-analytics"],
    },
    advertising: {
      recipients: ["Meta Platforms Ireland Ltd (Meta Pixel)", "Google Ireland Ltd (Google Ads)"],
      tools: ["meta-pixel", "google-ads"],
    },
  },
  text: {
    it: {
      title: "Cookie e strumenti facoltativi",
      body:
        "Usiamo cookie tecnici necessari per accesso e preferenze. Solo con il tuo consenso usiamo anche strumenti di analisi e pubblicità di terze parti. Puoi accettare, rifiutare o scegliere per categoria, e cambiare idea quando vuoi da “Impostazioni cookie”.",
      purposes: {
        analytics: {
          label: "Analisi",
          description: "Misurare in forma aggregata come viene usato il sito per migliorarlo.",
          recipients: "Google (Google Analytics)",
        },
        advertising: {
          label: "Pubblicità",
          description:
            "Misurare le registrazioni generate dai nostri annunci e ottimizzare le campagne. Il browser invia a Meta e Google l’evento, dati tecnici di dispositivo/browser, la pagina visitata e i loro cookie pubblicitari. Non inviamo il contenuto del CV né i tuoi dati di contatto.",
          recipients: "Meta (Meta Pixel), Google (Google Ads)",
        },
      },
      choices: {
        acceptAll: "Accetta tutto",
        rejectAll: "Rifiuta tutto",
        customize: "Personalizza",
        save: "Salva scelte",
        close: "Chiudi",
      },
      privacyLink: "Informativa privacy",
      settingsLink: "Impostazioni cookie",
    },
    en: {
      title: "Cookies and optional tools",
      body:
        "We use essential cookies for login and preferences. Only with your consent do we also use third-party analytics and advertising tools. You can accept, reject or choose by category, and change your mind any time from “Cookie settings”.",
      purposes: {
        analytics: {
          label: "Analytics",
          description: "Measure, in aggregate, how the site is used so we can improve it.",
          recipients: "Google (Google Analytics)",
        },
        advertising: {
          label: "Advertising",
          description:
            "Measure sign-ups that come from our ads and optimise campaigns. Your browser sends Meta and Google the event, technical device/browser data, the page visited and their advertising cookies. We never send your CV content or contact details.",
          recipients: "Meta (Meta Pixel), Google (Google Ads)",
        },
      },
      choices: {
        acceptAll: "Accept all",
        rejectAll: "Reject all",
        customize: "Customize",
        save: "Save choices",
        close: "Close",
      },
      privacyLink: "Privacy policy",
      settingsLink: "Cookie settings",
    },
  },
};

export const CONSENT_NOTICES: Record<string, ConsentNotice> = {
  [NOTICE_2026_10_18.version]: NOTICE_2026_10_18,
};

export function currentConsentNotice(): ConsentNotice {
  return CONSENT_NOTICES[CONSENT_NOTICE_VERSION];
}

export function isKnownNoticeVersion(version: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONSENT_NOTICES, version);
}
