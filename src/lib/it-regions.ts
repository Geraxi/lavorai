import { REGIONS, type RegionInfo } from "@/lib/city-centroids";

/**
 * Risoluzione della regione italiana dal geo header Vercel
 * (`x-vercel-ip-country-region` = suddivisione ISO 3166-2: per l'Italia può
 * essere il codice numerico della regione, es. "25" = Lombardia, oppure la
 * sigla della provincia, es. "MI") e/o dalla città (`x-vercel-ip-city`).
 */

const ISO_REGION: Record<string, string> = {
  "21": "piemonte", "23": "valle-d-aosta", "25": "lombardia", "32": "trentino-alto-adige", "34": "veneto",
  "36": "friuli-venezia-giulia", "42": "liguria", "45": "emilia-romagna", "52": "toscana", "55": "umbria",
  "57": "marche", "62": "lazio", "65": "abruzzo", "67": "molise", "72": "campania", "75": "puglia",
  "77": "basilicata", "78": "calabria", "82": "sicilia", "88": "sardegna",
};

const PROVINCE_REGION: Record<string, string> = {
  // Piemonte
  TO: "piemonte", VC: "piemonte", NO: "piemonte", CN: "piemonte", AT: "piemonte", AL: "piemonte", BI: "piemonte", VB: "piemonte",
  AO: "valle-d-aosta",
  // Lombardia
  MI: "lombardia", BG: "lombardia", BS: "lombardia", CO: "lombardia", CR: "lombardia", LC: "lombardia", LO: "lombardia", MN: "lombardia", MB: "lombardia", PV: "lombardia", SO: "lombardia", VA: "lombardia",
  TN: "trentino-alto-adige", BZ: "trentino-alto-adige",
  // Veneto
  VE: "veneto", VR: "veneto", VI: "veneto", PD: "veneto", TV: "veneto", BL: "veneto", RO: "veneto",
  UD: "friuli-venezia-giulia", GO: "friuli-venezia-giulia", TS: "friuli-venezia-giulia", PN: "friuli-venezia-giulia",
  GE: "liguria", IM: "liguria", SP: "liguria", SV: "liguria",
  // Emilia-Romagna
  BO: "emilia-romagna", MO: "emilia-romagna", PR: "emilia-romagna", RE: "emilia-romagna", PC: "emilia-romagna", FE: "emilia-romagna", RA: "emilia-romagna", FC: "emilia-romagna", RN: "emilia-romagna",
  // Toscana
  FI: "toscana", PI: "toscana", LU: "toscana", LI: "toscana", AR: "toscana", SI: "toscana", GR: "toscana", MS: "toscana", PT: "toscana", PO: "toscana",
  PG: "umbria", TR: "umbria",
  AN: "marche", PU: "marche", MC: "marche", AP: "marche", FM: "marche",
  RM: "lazio", LT: "lazio", FR: "lazio", VT: "lazio", RI: "lazio",
  AQ: "abruzzo", PE: "abruzzo", CH: "abruzzo", TE: "abruzzo",
  CB: "molise", IS: "molise",
  NA: "campania", SA: "campania", CE: "campania", AV: "campania", BN: "campania",
  BA: "puglia", BT: "puglia", BR: "puglia", FG: "puglia", LE: "puglia", TA: "puglia",
  PZ: "basilicata", MT: "basilicata",
  CZ: "calabria", CS: "calabria", KR: "calabria", RC: "calabria", VV: "calabria",
  PA: "sicilia", CT: "sicilia", ME: "sicilia", AG: "sicilia", CL: "sicilia", EN: "sicilia", RG: "sicilia", SR: "sicilia", TP: "sicilia",
  CA: "sardegna", SS: "sardegna", NU: "sardegna", OR: "sardegna", SU: "sardegna",
};

/** Città → regione (capoluoghi e città frequenti), fallback quando il codice regione manca. */
const CITY_REGION: Record<string, string> = {
  milano: "lombardia", milan: "lombardia", bergamo: "lombardia", brescia: "lombardia", monza: "lombardia", como: "lombardia", varese: "lombardia", pavia: "lombardia",
  roma: "lazio", rome: "lazio", latina: "lazio", frosinone: "lazio",
  torino: "piemonte", turin: "piemonte", novara: "piemonte", cuneo: "piemonte", alessandria: "piemonte",
  napoli: "campania", naples: "campania", salerno: "campania", caserta: "campania",
  bologna: "emilia-romagna", modena: "emilia-romagna", parma: "emilia-romagna", "reggio emilia": "emilia-romagna", rimini: "emilia-romagna", ferrara: "emilia-romagna", ravenna: "emilia-romagna",
  firenze: "toscana", florence: "toscana", pisa: "toscana", livorno: "toscana", lucca: "toscana", prato: "toscana", siena: "toscana",
  venezia: "veneto", venice: "veneto", verona: "veneto", padova: "veneto", padua: "veneto", vicenza: "veneto", treviso: "veneto", mestre: "veneto",
  genova: "liguria", genoa: "liguria", "la spezia": "liguria", savona: "liguria",
  bari: "puglia", lecce: "puglia", taranto: "puglia", foggia: "puglia", brindisi: "puglia",
  palermo: "sicilia", catania: "sicilia", messina: "sicilia", siracusa: "sicilia", trapani: "sicilia",
  cagliari: "sardegna", sassari: "sardegna",
  trento: "trentino-alto-adige", bolzano: "trentino-alto-adige", bozen: "trentino-alto-adige",
  trieste: "friuli-venezia-giulia", udine: "friuli-venezia-giulia", pordenone: "friuli-venezia-giulia",
  perugia: "umbria", terni: "umbria",
  ancona: "marche", pesaro: "marche",
  "l'aquila": "abruzzo", pescara: "abruzzo", chieti: "abruzzo", teramo: "abruzzo",
  campobasso: "molise", isernia: "molise",
  potenza: "basilicata", matera: "basilicata",
  catanzaro: "calabria", cosenza: "calabria", "reggio calabria": "calabria", crotone: "calabria",
  aosta: "valle-d-aosta",
};

const BY_KEY = new Map(REGIONS.filter((r) => r.group === "Italia").map((r) => [r.key, r]));

/** Ritorna la regione italiana (con centroide) o null se non risolvibile. */
export function itRegionOf(regionCode: string | null | undefined, city: string | null | undefined): RegionInfo | null {
  const code = (regionCode ?? "").trim().toUpperCase();
  let key: string | undefined = ISO_REGION[code] ?? PROVINCE_REGION[code];
  if (!key && city) key = CITY_REGION[city.trim().toLowerCase()];
  return key ? (BY_KEY.get(key) ?? null) : null;
}

export function decodeGeoHeader(v: string | null): string | null {
  if (!v) return null;
  try { return decodeURIComponent(v).slice(0, 80); } catch { return v.slice(0, 80); }
}
