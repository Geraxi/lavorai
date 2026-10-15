import type { PinKind } from "./dashboard-globe-data";

const italian = {
  pins: { open: "Opportunità", sent: "Inviata", desired: "Desiderata", saved: "Salvata" },
  cta: { open: "Invia candidatura", sent: "Vedi candidatura", desired: "Cerca qui", saved: "Approva e invia" },
  company: "Azienda", desiredLocation: "Località desiderata", lookingHere: "Cerchiamo opportunità qui",
  noJobs: "Nessun annuncio", opportunities: "opportunità", loading: "Carico il mondo…",
};
const english: typeof italian = {
  pins: { open: "Opportunity", sent: "Submitted", desired: "Preferred", saved: "Saved" },
  cta: { open: "Apply", sent: "View application", desired: "Search here", saved: "Approve and submit" },
  company: "Company", desiredLocation: "Preferred location", lookingHere: "Looking for opportunities here",
  noJobs: "No job listing", opportunities: "opportunities", loading: "Loading globe…",
};

export const globeCopy = (locale: string) => locale === "en" ? english : italian;
export const globePinLabel = (kind: PinKind, locale: string) => globeCopy(locale).pins[kind];

const regionNames: Record<string, string> = {
  lombardia: "Lombardy", piemonte: "Piedmont", toscana: "Tuscany", puglia: "Apulia",
  sicilia: "Sicily", sardegna: "Sardinia", "trentino-alto-adige": "Trentino-South Tyrol",
  "valle-d-aosta": "Aosta Valley", italia: "Italy", "regno-unito": "United Kingdom",
  germania: "Germany", francia: "France", spagna: "Spain", svizzera: "Switzerland",
  "paesi-bassi": "Netherlands", "stati-uniti": "United States", europa: "Europe",
  "nord-america": "North America", "america-latina": "Latin America", "medio-oriente": "Middle East",
};
// Translate application-owned region labels, preserving stored geographic keys and job data.
export const regionDisplayName = (region: { key: string; name: string }, locale: string) =>
  locale === "en" ? regionNames[region.key] ?? region.name : region.name;
