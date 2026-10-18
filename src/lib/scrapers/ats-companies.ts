/**
 * Curated ATS company seeds — Italia / Europa focus.
 * Breezy / Pinpoint / JOIN seeded with verified public slugs.
 */

export interface AtsCompany {
  slug: string;
  name: string;
  country?: string;
}

export const GREENHOUSE_COMPANIES: AtsCompany[] = [
  // Italian seeds verified dead (404) as of 2026-10-18:
  // satispay, bendingspoons, scalapay, casavo, moneyfarm (moved to Workable),
  // docebo, everli, treatwell (moved to Workable), nexi, prima
  { slug: "sumup", name: "SumUp" }, // ~49 Italian jobs verified 2026-10-18
  { slug: "n26", name: "N26" },
  { slug: "revolut", name: "Revolut" },
  { slug: "remote", name: "Remote" },
  { slug: "deel", name: "Deel" },
  { slug: "miro", name: "Miro" },
  { slug: "notion", name: "Notion" },
  { slug: "stripe", name: "Stripe" },
  { slug: "spotify", name: "Spotify" },
  { slug: "qonto", name: "Qonto" },
  { slug: "doctolib", name: "Doctolib" },
];

export const LEVER_COMPANIES: AtsCompany[] = [
  // Verified dead (404) as of 2026-10-18: mollie, pleo, spendesk, glovo, factorial
  { slug: "figma", name: "Figma" },
  { slug: "linear", name: "Linear" },
  { slug: "vercel", name: "Vercel" },
  { slug: "supabase", name: "Supabase" },
  { slug: "posthog", name: "PostHog" },
  { slug: "anthropic", name: "Anthropic" },
  { slug: "openai", name: "OpenAI" },
  { slug: "octoenergy", name: "Octopus Energy", country: "IT" },
];

export const ASHBY_COMPANIES: AtsCompany[] = [
  { slug: "vercel", name: "Vercel" },
  { slug: "linear", name: "Linear" },
  { slug: "ramp", name: "Ramp" },
  { slug: "posthog", name: "PostHog" },
  { slug: "supabase", name: "Supabase" },
  { slug: "openai", name: "OpenAI" },
  { slug: "anthropic", name: "Anthropic" },
  { slug: "cursor", name: "Cursor" },
  { slug: "lexroom", name: "Lexroom", country: "IT" },
];

export const WORKABLE_COMPANIES: AtsCompany[] = [
  { slug: "speexx", name: "Speexx", country: "DE" },
  { slug: "workmotion", name: "WorkMotion", country: "DE" },
  { slug: "jeenka", name: "Jeenka", country: "IT" },
  { slug: "bizaway", name: "BizAway", country: "IT" },
  { slug: "garmin-cluj", name: "Garmin Cluj", country: "RO" },
  { slug: "specify", name: "Specify" },
  { slug: "springa", name: "Springa", country: "IT" },
  { slug: "instilla-srl", name: "Instilla", country: "IT" },
  { slug: "velasca", name: "Velasca", country: "IT" },
  { slug: "opinno", name: "Opinno", country: "IT" },
  { slug: "truelayer", name: "TrueLayer", country: "UK" },
  { slug: "webranking", name: "Webranking", country: "IT" },
  { slug: "empatica", name: "Empatica", country: "IT" },
  { slug: "moneyfarm", name: "Moneyfarm", country: "IT" }, // 20 jobs, 11 Italian verified 2026-10-18
  { slug: "alfadocs", name: "AlfaDocs", country: "IT" },
  { slug: "gemmo", name: "Gemmo", country: "IT" },
  { slug: "deblock", name: "Deblock", country: "UK" },
  { slug: "treatwell", name: "Treatwell", country: "UK" }, // 98 jobs, 12 Italian verified 2026-10-18
  { slug: "prima", name: "Prima Assicurazioni", country: "IT" },
  { slug: "cleafy", name: "Cleafy", country: "IT" },
];

export const SMARTRECRUITERS_COMPANIES: AtsCompany[] = [
  { slug: "BoschGroup", name: "Bosch", country: "DE" },
  // Verified dead (0 postings) as of 2026-10-18: IKEA, Generali, Eni, UniCredit
  { slug: "Santen", name: "Santen", country: "IT" },
];

export const RECRUITEE_COMPANIES: AtsCompany[] = [
  { slug: "bunq", name: "bunq", country: "NL" },
  { slug: "jobandtalent", name: "Job&Talent", country: "ES" },
  { slug: "docplanner", name: "Docplanner", country: "PL" },
  { slug: "mollie", name: "Mollie", country: "NL" },
  { slug: "sendcloud", name: "Sendcloud", country: "NL" },
  // Verified dead (404) as of 2026-10-18: growens, subito
  { slug: "italiaonline", name: "Italiaonline", country: "IT" },
  { slug: "musement", name: "Musement", country: "IT" },
  { slug: "casavo", name: "Casavo", country: "IT" },
  { slug: "tiledesk", name: "Tiledesk", country: "IT" },
  { slug: "boggimilano1", name: "Boggi Milano", country: "IT" },
  { slug: "jobsdeerns", name: "Deerns Italia", country: "IT" },
  { slug: "wacomeurope", name: "Wacom Europe", country: "DE" },
  { slug: "navinfoeurope", name: "NavInfo Europe", country: "NL" },
  { slug: "benqeuropebv", name: "BenQ Europe", country: "NL" },
  { slug: "heilindelectronicseurope", name: "Heilind Electronics Europe", country: "NL" },
  { slug: "ccmeurope", name: "Carlisle CM Europe", country: "DE" },
];

export const PERSONIO_COMPANIES: AtsCompany[] = [
  { slug: "cycle", name: "CYCLE", country: "DE" },
  { slug: "scalapay", name: "Scalapay", country: "IT" },
  { slug: "cortilia", name: "Cortilia", country: "IT" },
  { slug: "everli", name: "Everli", country: "IT" },
  { slug: "fiscozen", name: "Fiscozen", country: "IT" },
];

export const TEAMTAILOR_COMPANIES: AtsCompany[] = [
  { slug: "qonto", name: "Qonto", country: "FR" },
  { slug: "bolt", name: "Bolt", country: "EE" },
  { slug: "pleo", name: "Pleo", country: "DK" },
  { slug: "nexi", name: "Nexi", country: "IT" },
  { slug: "wolt", name: "Wolt", country: "FI" },
  { slug: "nidec", name: "Nidec Conversion", country: "IT" },
  { slug: "obicamozzarellabar", name: "Obicà", country: "IT" },
  { slug: "clubdelsolesrl", name: "Club del Sole", country: "IT" },
  { slug: "oneexpressitaliaspa", name: "One Express Italia", country: "IT" },
  { slug: "unobravo", name: "Unobravo", country: "IT" },
  { slug: "meatcrew", name: "Meat Crew", country: "IT" },
  { slug: "swegonitaly", name: "Swegon Italy", country: "IT" },
];

export const BAMBOOHR_COMPANIES: AtsCompany[] = [
  { slug: "zapier", name: "Zapier", country: "US" },
  { slug: "buffer", name: "Buffer", country: "US" },
  { slug: "hotjar", name: "Hotjar", country: "MT" },
  { slug: "typeform", name: "Typeform", country: "ES" },
  { slug: "prezly", name: "Prezly", country: "BE" },
  { slug: "userlane", name: "Userlane", country: "DE" },
  { slug: "italist", name: "Italist", country: "IT" },
  { slug: "yoox", name: "YOOX", country: "IT" },
  { slug: "doctolib", name: "Doctolib", country: "FR" },
  { slug: "spendesk", name: "Spendesk", country: "FR" },
  { slug: "wildix", name: "Wildix", country: "IT" },
  { slug: "gamingtec", name: "Gamingtec", country: "CY" },
  { slug: "readymag", name: "Readymag", country: "EU" },
  { slug: "mdotm", name: "MdotM", country: "IT" },
  { slug: "stackinfra", name: "Stackinfra", country: "IT" },
  { slug: "talixo", name: "Talixo", country: "DE" },
  { slug: "talentgarden", name: "Talent Garden", country: "IT" },
];

/** Breezy HR — slug = subdomain di https://<slug>.breezy.hr/json (verificati HTTP 200). */
export const BREEZY_COMPANIES: AtsCompany[] = [
  { slug: "information-resources-italy", name: "IRI Italy", country: "IT" },
  { slug: "fatturaelettronicapa", name: "FatturaElettronica APP", country: "IT" },
  { slug: "entando", name: "Entando", country: "IT" },
  { slug: "methode", name: "Méthode", country: "IT" },
  { slug: "wstudio", name: "WSTUDIO", country: "IT" },
  { slug: "welld-sagl", name: "WellD", country: "CH" },
  { slug: "midsummer-agency", name: "Midsummer Agency", country: "IT" },
  { slug: "contiamo", name: "Contiamo", country: "DE" },
  { slug: "stacklet", name: "Stacklet", country: "US" },
  { slug: "zact-inc", name: "Zact", country: "US" },
];

/** Pinpoint — slug = subdomain di https://<slug>.pinpointhq.com/postings.json (verificati HTTP 200). */
export const PINPOINT_COMPANIES: AtsCompany[] = [
  { slug: "workwithus", name: "Pinpoint", country: "UK" },
  { slug: "field", name: "Field", country: "UK" },
  { slug: "cfc", name: "CFC", country: "UK" },
  { slug: "zencargo", name: "Zencargo", country: "UK" },
  { slug: "zinc", name: "Zinc", country: "UK" },
  { slug: "lush", name: "Lush", country: "UK" },
  { slug: "nccgroup", name: "NCC Group", country: "UK" },
  { slug: "bmt", name: "BMT", country: "UK" },
  { slug: "confluence", name: "Confluence", country: "UK" },
  { slug: "ttep", name: "TTEP", country: "UK" },
];

/** JOIN — slug = path di https://join.com/companies/<slug> (verificati __NEXT_DATA__). */
export const JOIN_COMPANIES: AtsCompany[] = [
  { slug: "join", name: "JOIN", country: "DE" },
  { slug: "alwaysfriday", name: "Always Friday", country: "IT" },
  { slug: "offerista", name: "Shopfully / Offerista", country: "DE" },
  { slug: "scalapay", name: "Scalapay", country: "IT" },
  { slug: "jointly", name: "Jointly", country: "IT" },
  { slug: "cashlink", name: "Cashlink", country: "DE" },
  { slug: "factorial", name: "Factorial", country: "ES" },
  { slug: "spendesk", name: "Spendesk", country: "FR" },
  { slug: "toogoodtogo", name: "Too Good To Go", country: "DK" },
  { slug: "tekkr", name: "Tekkr", country: "DE" },
  { slug: "cygridio", name: "Cygrid", country: "DE" },
  { slug: "atmoearth", name: "atmo", country: "DE" },
];
