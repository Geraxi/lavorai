/** Pure preference checks shared by enqueue admission and the locked delivery gate.
 * Location is job-location evidence, never evidence of citizenship/work authorization.
 */
import { matchCity } from "@/lib/city-centroids";
export function parsePreferenceList(raw: string | null | undefined): string[] | null {
  try {
    const values: unknown = JSON.parse(raw ?? "");
    if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) return null;
    return values.map((v: string) => v.trim()).filter(Boolean);
  } catch { return null; }
}

export function expandLocationPref(loc: string): string[] {
  const k = loc
    .trim()
    .toLowerCase()
    .trim();
  const aliases: Record<string, string[]> = {
    milan: ["milan", "milano"],
    milano: ["milan", "milano"],
    rome: ["rome", "roma"],
    roma: ["rome", "roma"],
    turin: ["turin", "torino"],
    torino: ["turin", "torino"],
    bologna: ["bologna"],
    naples: ["naples", "napoli"],
    napoli: ["naples", "napoli"],
    florence: ["florence", "firenze"],
    firenze: ["florence", "firenze"],
    italy: [
      "italy", "italia", "milan", "milano", "rome", "roma",
      "turin", "torino", "bologna", "naples", "napoli",
      "florence", "firenze", "lombardia", "lazio", "veneto",
    ],
    italia: [
      "italy", "italia", "milan", "milano", "rome", "roma",
      "turin", "torino", "bologna", "naples", "napoli",
      "florence", "firenze",
    ],
    dubai: ["dubai"],
    "dubai/uae": ["dubai", "uae", "united arab emirates", "emirates", "abu dhabi"],
    uae: ["dubai", "uae", "united arab emirates", "emirates", "abu dhabi"],
    it: ["italy", "italia"],
    europa: ["europe", "eu", "european union"],
    remote: ["remote", "remoto", "anywhere", "worldwide", "fully remote"],
    remoto: ["remote", "remoto", "anywhere", "fully remote"],
    europe: [
      "europe", "eu", "european union", "remote eu", "europe remote",
      "berlin", "london", "amsterdam", "paris", "madrid", "barcelona",
      "dublin", "lisbon", "warsaw", "prague",
    ],
    eu: [
      "eu", "european union", "remote eu",
      "berlin", "amsterdam", "paris", "madrid",
    ],
  };
  if (aliases[k]) return aliases[k];
  // "Philadelphia, PA USA" → also match the city on its own, because job
  // feeds write "Philadelphia, Pennsylvania" or "Philadelphia, PA".
  const city = k.split(",")[0].trim();
  if (city !== k && city.length >= 3) return [k, city];
  // Fallback: ritorna la stringa così com'è (lowercase).
  return [k];
}


function containsLocation(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

/** In free text (eligibility sentences, descriptions) the token "us" is
 * usually the pronoun. Only an upper-case "US"/"U.S." names the country. */
function containsLocationInProse(raw: string, alias: string): boolean {
  if (alias === "us" || alias === "u.s.") return /(?:^|[^A-Za-z.])U\.?S\.?(?=$|[^A-Za-z])/.test(raw);
  return containsLocation(raw.toLowerCase(), alias);
}

const EU_COUNTRIES = new Set(["IT", "DE", "FR", "ES", "NL", "BE", "IE", "PT", "AT", "SE", "DK", "FI", "PL", "CZ", "GR", "RO", "HU", "SK", "SI", "HR", "BG", "LT", "LV", "EE", "LU", "MT", "CY"]);
const EUROPE_NON_EU = new Set(["GB", "CH", "NO", "IS"]);
const COUNTRY_REGION_NAMES: Record<string, string[]> = {
  US: ["united states", "usa", "us", "u.s.", "u.s.a.", "north america", "americas"],
  CA: ["canada", "north america", "americas"],
  GB: ["united kingdom", "uk", "england", "great britain"],
  IT: ["italy", "italia"], DE: ["germany", "deutschland"], FR: ["france"], ES: ["spain", "españa"],
  NL: ["netherlands"], IE: ["ireland"], PT: ["portugal"], CH: ["switzerland"], AT: ["austria"],
  BE: ["belgium"], SE: ["sweden"], DK: ["denmark"], FI: ["finland"], PL: ["poland"], NO: ["norway"],
  GR: ["greece"], CZ: ["czech republic", "czechia"], RO: ["romania"],
};

/** Countries the candidate lives or wants to work in, read from their own
 * non-remote location preferences ("Philadelphia, PA USA" → US, "Brescia" →
 * IT). Unrecognised towns add nothing. */
export function homeCountries(prefs: string[]): string[] {
  const out = new Set<string>();
  for (const raw of prefs) {
    const pref = raw.trim();
    if (!pref || /^(remote|remoto)(?:\s|$|\()/i.test(pref)) continue;
    const cc = matchCity(pref)?.cc;
    if (cc) out.add(cc);
  }
  return [...out];
}

/** Region labels under which a remote vacancy is open to someone in `cc`. */
export function remoteRegionAliases(cc: string): string[] {
  const out = [...(COUNTRY_REGION_NAMES[cc] ?? [])];
  if (EU_COUNTRIES.has(cc)) out.push("eu", "european union", "europe", "europa", "emea", "eea");
  else if (EUROPE_NON_EU.has(cc)) out.push("europe", "emea");
  return out;
}

const SCOPE_REGION = "(united states|usa|u\\.s\\.a?\\.?|us|canada|north america|americas|latin america|latam|europe|eu|emea|eea|uk|united kingdom|italy|italia|germany|spain|france|portugal|ireland|netherlands|apac|asia|australia|india)";
const SCOPE_PATTERNS = [
  new RegExp(`\\bremote\\s*(?:\\(|-|–|—|,|:|/)?\\s*(?:only\\s+)?(?:in|within|from|across)?\\s*(?:the\\s+)?${SCOPE_REGION}(?![a-z])`, "gi"),
  new RegExp(`\\b(?:anywhere|located|based|reside|residing|living|work authori[sz]ation)\\s+(?:in|within)\\s+(?:the\\s+)?${SCOPE_REGION}(?![a-z])`, "gi"),
  new RegExp(`\\b${SCOPE_REGION}[- ]based\\b`, "gi"),
  new RegExp(`\\b${SCOPE_REGION}\\s+(?:only|time\\s?zones?)\\b`, "gi"),
];
const SCOPE_WORLDWIDE = /\bremote\s*(?:\(|-|–|—|,|:)\s*(?:worldwide|global|anywhere)\b|\banywhere in the world\b|\bwork from anywhere\b(?!\s+in\s)|\bhire (?:from|in) any country\b|\bopen to candidates (?:worldwide|globally|from anywhere)\b|\blocation[- ]independent\b/i;

/**
 * For a posting whose location field is just "Remote", the posting text often
 * says where: "Remote (US)", "anywhere in the US", "EU-based", or "work from
 * anywhere in the world". Regions win over a worldwide phrase.
 */
export function remoteScopeFromDescription(description: string | null | undefined): { worldwide: boolean; regions: string[] } {
  const text = description ?? "";
  const regions = new Set<string>();
  for (const re of SCOPE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      const key = raw.toLowerCase().replace(/\.$/, "");
      if (/^u\.?s\.?a?$/.test(key) && key !== "usa" && !/^U\.?S/.test(raw)) continue; // pronoun "us"
      regions.add(/^u\.s/.test(key) ? "us" : key);
    }
  }
  return { worldwide: regions.size === 0 && SCOPE_WORLDWIDE.test(text), regions: [...regions] };
}

export interface LocationMatchOptions {
  /** The user picked the "remoto" work mode, so a remote vacancy open to
   * their home country is a place they want to work even when the location
   * list holds only towns. */
  acceptsRemote?: boolean;
}

/** "(Bangkok - Based, Relocation Provided)", "London-based": a place the
 * title itself says the job is based in. Null when the title names none. */
export function titleBasedPlace(title: string | null | undefined): string | null {
  const t = title ?? "";
  const m = t.match(/\(([^()]{2,40}?)\s*[-–]?\s*based\b/i) ?? t.match(/\b([A-Z][A-Za-z.'’ ]{1,30}?)\s*[-–]\s*based\b/) ?? t.match(/\b([A-Z][A-Za-z.'’]{1,30})-based\b/);
  const place = m?.[1]?.trim();
  if (!place || /^(remote|remoto|home|office|hybrid)$/i.test(place)) return null;
  return place;
}

export function locationPreferenceMismatch(
  job: { location: string | null; remote: boolean; description?: string; title?: string }, prefs: string[], opts: LocationMatchOptions = {},
): "location" | "location_unverified" | null {
  if (!prefs.length) return null; // callers with automatic authority must require a valid nonempty list
  // A title that names where the job is based beats a feed location that
  // only echoes the search query (LinkedIn: "Milan, Lombardy, Italy" on a
  // "(Bangkok - Based, Relocation Provided)" vacancy).
  const basedIn = titleBasedPlace(job.title);
  if (basedIn) {
    const aliases = [...prefs.filter((p) => !/^(remote|remoto)(?:\s|$|\()/i.test(p.trim())).flatMap((p) => expandLocationPref(p)),
      ...homeCountries(prefs).flatMap(remoteRegionAliases)];
    if (!aliases.some((alias) => containsLocationInProse(basedIn, alias))) return "location";
  }
  // Aggregators join location parts with "·" ("Remote · Remote",
  // "Remote · EMEA"). Split and de-duplicate so a doubled bare "Remote" is
  // classified like a bare "Remote" (unverified), never as a region.
  let location = Array.from(new Set((job.location ?? "").toLowerCase().split(/\s*·\s*/)
    .map((part) => part.trim()).filter(Boolean))).join(", ");
  if (!location) return "location_unverified";
  const remote = job.remote || /\b(remot[eo]|fully remote|anywhere|worldwide)\b/i.test(location);
  // "Anywhere in France" is remote within one country, not worldwide: only a
  // bare "anywhere" (not followed by "in <place>") opens the job to everyone.
  let worldwide = /\b(anywhere(?!\s+in\s)|worldwide|global)\b/i.test(location);
  const bareRemote = remote && !worldwide && /^(?:fully\s+)?remot[eo]\s*$/i.test(location);
  // A bare "Remote" field: read the scope the posting itself states.
  let scopedFromText = false;
  if (bareRemote) {
    const scope = remoteScopeFromDescription(job.description);
    if (scope.regions.length) { location = `${location}, ${scope.regions.join(", ")}`; scopedFromText = true; }
    else if (scope.worldwide) worldwide = true;
  }
  // Use only an explicit eligibility sentence from the posting. Company-office
  // lists and global-culture boilerplate are not job-location restrictions.
  let restrictions = (job.description ?? "").split(/[.\n]/).filter((line) =>
    /(?:must|only|require[ds]?|need to)\s+(?:candidates?\s+)?(?:be\s+)?(?:based|reside|located|living)|(?:candidates?|applicants?)\s+(?:based|residing|located)\s+(?:only\s+)?in|(?:remote|remoto)\s+(?:only|solo)\s+(?:in|within|da)/i.test(line),
  ).join(" ");
  // A posting whose location field claims "anywhere/worldwide" but whose body
  // carries an explicit "Location: EMEA"-style header (seen on aggregator
  // reposts) is region-restricted: the header wins, the field does not.
  const headerRegions = worldwide ? Array.from((job.description ?? "").matchAll(
    /\blocation\s*:\s*(emea|europe|eu|latam|apac|americas|north america|united states|usa|us|uk|united kingdom|canada)(?=$|[^a-z])/gi,
  ), (m) => (/^us$/i.test(m[1]) ? "US" : m[1].toLowerCase())) : [];
  if (headerRegions.length) restrictions = `${restrictions} ${headerRegions.join(" ")}`.trim();
  const inLocation = (aliases: string[]) => aliases.some((alias) => containsLocation(location, alias));
  const inRestrictions = (aliases: string[]) => aliases.some((alias) => containsLocationInProse(restrictions, alias));
  const homeAliases = homeCountries(prefs).flatMap(remoteRegionAliases);
  const hasRemotePref = prefs.some((p) => /^(remote|remoto)(?:\s|$|\()/i.test(p.trim()));
  const effective = opts.acceptsRemote && !hasRemotePref && homeAliases.length ? [...prefs, "remote"] : prefs;
  for (const raw of effective) {
    const pref = raw.trim().toLowerCase();
    const remotePref = /^(remote|remoto)(?:\s|$|\()/.test(pref);
    const qualifier = remotePref ? pref.match(/\(([^)]+)\)/)?.[1]?.trim() : undefined;
    if (remotePref && !remote) continue;
    // A bare "Remote" preference means remote from where the user lives:
    // the countries of their own location preferences. Without one, it says
    // nothing about geographic eligibility (worldwide postings only).
    const aliases = qualifier ? expandLocationPref(qualifier) : remotePref ? (homeAliases.length ? homeAliases : null) : expandLocationPref(pref);
    if (restrictions && (!aliases || !inRestrictions(aliases))) continue;
    // Worldwide field + no restriction, or a restriction this preference's
    // region satisfies (checked just above): eligible.
    if (worldwide) return null;
    // "Remote" alone says nothing about geographic eligibility. Do not turn a
    // remote flag into permission for US-only or otherwise restricted vacancies.
    if (aliases && inLocation(aliases)) return null;
    // Bare "Remote" field whose explicit eligibility sentence names this
    // preference's region ("Candidates must be based in the US").
    if (remotePref && aliases && bareRemote && restrictions) return null;
  }
  if (bareRemote && !scopedFromText && !restrictions) return "location_unverified";
  return "location";
}

export function jobMatchesLocationPrefs(job: { location: string | null; remote: boolean; description?: string }, prefs: string[], opts: LocationMatchOptions = {}): boolean {
  return locationPreferenceMismatch(job, prefs, opts) === null;
}

/**
 * Stored job salaries are mostly annual euros, but some feeds (Adzuna IT via
 * Joinrs/agency listings, occasionally RemoteOK) publish RAL in thousands:
 * "28-32" means €28,000-€32,000. No real annual salary is between 10 and 499
 * euros, so values in that band are read as k-units. Anything else is left as
 * stored: values under 10 (hourly) and 500-9,999 (monthly/part-time) keep
 * failing a set salary floor exactly as before, so the gate is never relaxed
 * on an ambiguous unit.
 */
export function annualSalaryEur(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value >= 10 && value < 500 ? Math.round(value * 1000) : value;
}

export function autoApplyPreferenceMismatch(
  job: { location: string | null; remote: boolean; title: string; contractType: string | null;
    description: string; salaryMin: number | null; salaryMax: number | null },
  prefs: { employmentType: string; salaryMin: number; sourcesJson?: string | null }, locationPrefs: string[],
): "location" | "location_unverified" | "employment" | "salary" | null {
  const acceptsRemote = parsePreferenceList(prefs.sourcesJson)?.some((mode) => mode.toLowerCase() === "remoto") ?? false;
  const locationReason = locationPreferenceMismatch(job, locationPrefs, { acceptsRemote });
  if (locationReason) return locationReason;
  const employment = prefs.employmentType ?? "employee";
  if (employment !== "both") {
    const primary = `${job.title} ${job.contractType ?? ""}`.toLowerCase();
    const description = (job.description ?? "").slice(0, 1500);
    const isFreelance = /\b(freelance|freelancer|contractor|p\.?\s?iva|partita\s?iva|project-based|ad hoc)\b/.test(primary)
      || /^(contract|consultant|consulente)$/i.test(job.contractType?.trim() ?? "")
      || /(?:freelance|contractor)\s+(?:role|position|opportunity|basis)|(?:on|su)\s+(?:a\s+)?freelance\s+basis|(?:richiesta|necessaria|required)\s+(?:la\s+)?partita\s+iva/i.test(description);
    if ((employment === "piva" && !isFreelance) || (employment === "employee" && isFreelance)) return "employment";
  }
  const jobTop = annualSalaryEur(job.salaryMax ?? job.salaryMin ?? 0);
  if (prefs.salaryMin > 0 && jobTop > 0 && jobTop < prefs.salaryMin * 1000) return "salary";
  return null;
}

export function isAvoidedCompany(company: string | null, avoided: string | null): boolean {
  if (!company || !avoided) return false;
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return avoided.split(/[,;\n]/).some((entry) => normalize(entry) === normalize(company));
}
