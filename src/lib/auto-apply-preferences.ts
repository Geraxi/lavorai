/** Pure preference checks shared by enqueue admission and the locked delivery gate.
 * Location is job-location evidence, never evidence of citizenship/work authorization.
 */
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
  // Fallback: ritorna la stringa così com'è (lowercase).
  return [k];
}


function containsLocation(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

export function locationPreferenceMismatch(
  job: { location: string | null; remote: boolean; description?: string }, prefs: string[],
): "location" | "location_unverified" | null {
  if (!prefs.length) return null; // callers with automatic authority must require a valid nonempty list
  // Aggregators join location parts with "·" ("Remote · Remote",
  // "Remote · EMEA"). Split and de-duplicate so a doubled bare "Remote" is
  // classified like a bare "Remote" (unverified), never as a region.
  const location = Array.from(new Set((job.location ?? "").toLowerCase().split(/\s*·\s*/)
    .map((part) => part.trim()).filter(Boolean))).join(", ");
  if (!location) return "location_unverified";
  const remote = job.remote || /\b(remot[eo]|fully remote|anywhere|worldwide)\b/i.test(location);
  const worldwide = /\b(anywhere|worldwide|global|work from anywhere)\b/i.test(location);
  // Use only an explicit eligibility sentence from the posting. Company-office
  // lists and global-culture boilerplate are not job-location restrictions.
  let restrictions = (job.description ?? "").split(/[.\n]/).filter((line) =>
    /(?:must|only|require[ds]?|need to)\s+(?:candidates?\s+)?(?:be\s+)?(?:based|reside|located|living)|(?:candidates?|applicants?)\s+(?:based|residing|located)\s+(?:only\s+)?in|(?:remote|remoto)\s+(?:only|solo)\s+(?:in|within|da)/i.test(line),
  ).join(" ").toLowerCase();
  // A posting whose location field claims "anywhere/worldwide" but whose body
  // carries an explicit "Location: EMEA"-style header (seen on aggregator
  // reposts) is region-restricted: the header wins, the field does not.
  const headerRegions = worldwide ? Array.from((job.description ?? "").matchAll(
    /\blocation\s*:\s*(emea|europe|eu|latam|apac|americas|north america|united states|usa|us|uk|united kingdom|canada)(?=$|[^a-z])/gi,
  ), (m) => m[1].toLowerCase()) : [];
  if (headerRegions.length) restrictions = `${restrictions} ${headerRegions.join(" ")}`.trim();
  const matches = (text: string, pref: string) => expandLocationPref(pref).some((alias) => containsLocation(text, alias));
  for (const raw of prefs) {
    const pref = raw.trim().toLowerCase();
    const remotePref = /^(remote|remoto)(?:\s|$|\()/.test(pref);
    const qualifier = remotePref ? pref.match(/\(([^)]+)\)/)?.[1]?.trim() : undefined;
    if (remotePref && !remote) continue;
    const region = qualifier ?? (remotePref ? null : pref);
    if (restrictions && (!region || !matches(restrictions, region))) continue;
    // Worldwide field + no restriction, or a restriction this preference's
    // region satisfies (checked just above): eligible.
    if (worldwide) return null;
    // "Remote" alone says nothing about geographic eligibility. Do not turn a
    // remote flag into permission for US-only or otherwise restricted vacancies.
    if (region && matches(location, region)) return null;
  }
  if (remote && !worldwide && /^(?:fully\s+)?remot[eo]\s*$/i.test(location)) return "location_unverified";
  return "location";
}

export function jobMatchesLocationPrefs(job: { location: string | null; remote: boolean; description?: string }, prefs: string[]): boolean {
  return locationPreferenceMismatch(job, prefs) === null;
}

export function autoApplyPreferenceMismatch(
  job: { location: string | null; remote: boolean; title: string; contractType: string | null;
    description: string; salaryMin: number | null; salaryMax: number | null },
  prefs: { employmentType: string; salaryMin: number }, locationPrefs: string[],
): "location" | "location_unverified" | "employment" | "salary" | null {
  const locationReason = locationPreferenceMismatch(job, locationPrefs);
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
  const jobTop = job.salaryMax ?? job.salaryMin ?? 0;
  if (prefs.salaryMin > 0 && jobTop > 0 && jobTop < prefs.salaryMin * 1000) return "salary";
  return null;
}

export function isAvoidedCompany(company: string | null, avoided: string | null): boolean {
  if (!company || !avoided) return false;
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return avoided.split(/[,;\n]/).some((entry) => normalize(entry) === normalize(company));
}
