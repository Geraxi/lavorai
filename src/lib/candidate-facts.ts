import type { CVProfile } from "./cv-profile-types";
import type { ApplicationAnswers } from "./application-answers";

export type FactSource = "cv" | "profile" | "preferences" | "previous_user";
export type Fact = { key: string; value: string; source: FactSource; reference: string };
export type SavedFactAnswer = { label: string; kind?: string; answer: string | null; source: string; answeredAt: Date | string | null; optionsJson?: string | null };
export type FactQuestion = { label: string; kind: string; options?: string[] };
export type FactResolution = { answer: string | null; provenance: Fact[]; conflict: boolean };
export type FactContext = {
  facts?: Fact[];
  storedAnswers?: Array<{ label: string; answer: string; kind?: string; options?: string[]; fingerprint?: string }>;
  firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null;
  city?: string | null; country?: string | null; currentEmployer?: string | null; mostRecentEmployer?: string | null;
  currentJobTitle?: string | null; mostRecentJobTitle?: string | null; school?: string | null;
  linkedinUrl?: string | null; portfolioUrl?: string | null; salaryExpectationEur?: number | null;
  yearsExperience?: number | null; englishLevel?: string | null; noticePeriod?: string | null; highestEducation?: string | null;
  languages?: Array<{ name: string; level?: string }>;
};
export function factQuestionKey(label: string): string {
  return label.normalize("NFKC").toLowerCase().replace(/[?*:]/g, "").replace(/[.]$/, "").replace(/\s+/g, " ").trim()
    .replace(/^(?:what is|please enter|please provide|enter|provide) (?:your )?/, "").replace(/^your /, "");
}
const aliases: Record<string, string[]> = {
  firstName: ["first name", "given name", "nome", "qual è il tuo nome"],
  lastName: ["last name", "family name", "surname", "cognome", "qual è il tuo cognome"],
  fullName: ["full name", "nome e cognome", "come ti chiami"],
  email: ["email", "e-mail", "email address", "indirizzo email", "qual è il tuo indirizzo email"],
  phone: ["phone", "phone number", "telephone", "mobile", "telefono", "numero di telefono", "cellulare"],
  phoneCountry: ["phone country", "phone country code", "phone country/region", "country calling code", "dial code", "dialing code", "country code", "prefisso telefonico"],
  city: ["city", "location (city)", "current city", "city of residence", "current location", "città", "citta", "città di residenza", "citta di residenza", "where do you live", "where are you based", "where are you currently based", "where are you located", "what city do you live in", "dove vivi", "dove risiedi", "in quale città vivi", "qual è la tua città di residenza"],
  country: ["country", "current country", "country of residence", "current country of residence", "country/region of residence", "residence country", "country where you currently reside", "in which country do you currently reside", "which country do you currently live in", "what country do you live in", "paese", "nazione", "paese di residenza", "in quale paese risiedi"],
  currentEmployer: ["current employer", "current company", "azienda attuale", "datore di lavoro attuale", "qual è la tua azienda attuale", "where do you currently work"],
  currentOrPreviousEmployer: ["current or previous employer", "current/previous employer", "current / previous employer", "who is your current or previous employer"],
  previousEmployer: ["previous employer", "previous employer name", "name of your previous employer", "previous company", "most recent previous employer", "azienda precedente", "datore di lavoro precedente"],
  mostRecentEmployer: ["most recent employer", "last employer", "ultima azienda"],
  currentJobTitle: ["current job title", "current position", "current role", "ruolo attuale", "posizione attuale", "qual è il tuo ruolo attuale", "qual è la tua posizione attuale"],
  currentOrPreviousJobTitle: ["current or previous job title"],
  mostRecentJobTitle: ["most recent job title", "last job title"],
  school: ["most recent school", "most recent university", "ultima università", "ultima universita"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile", "profilo linkedin"],
  portfolioUrl: ["portfolio", "portfolio url"],
  githubUrl: ["github", "github url", "github profile"],
  websiteUrl: ["website", "personal website", "sito web personale"],
  yearsExperience: ["years of experience", "years of professional experience", "years of total experience", "total years of experience", "how many years of experience do you have", "how many years of professional experience do you have", "anni di esperienza", "anni di esperienza professionale", "quanti anni di esperienza hai", "quanti anni di esperienza professionale hai"],
  englishLevel: ["english level", "level of english", "english proficiency", "livello di inglese"],
  languages: ["languages", "languages spoken", "spoken languages", "lingue", "lingue parlate"],
  noticePeriod: ["notice period", "preavviso", "periodo di preavviso"],
  highestEducation: ["highest education", "highest level of education", "titolo di studio", "titolo di studio più alto"],
};
export function reusableFactKey(label: string): string | null {
  const key = factQuestionKey(label);
  if (/^(?:(?:expected|desired) annual (?:salary|compensation)|annual (?:salary|compensation) expectations?)\s*\(?\s*(?:eur|€|euros?)\s*\)?$/.test(key)
    || /^(?:ral desiderata|ral attesa|aspettativa (?:di )?ral)$/.test(key)) return "salaryExpectationEur";
  const skill = key.match(/^(?:do you have experience with|have you worked with|have you used|hai esperienza con) ([a-z0-9+#. -]+)$/);
  if (skill) return `skill:${skill[1].trim()}`;
  return Object.entries(aliases).find(([, values]) => values.includes(key))?.[0] ?? null;
}
const normalizedValue = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
function canonicalFactValue(key: string | null, value: string): string {
  const normalized = normalizedValue(value);
  if (key === "phone") return normalized.replace(/[\s().-]/g, "").replace(/^00/, "+");
  const groups: Record<string, string[][]> = {
    country: [["italy", "italia", "it", "ita"], ["united kingdom", "uk", "gb", "gbr", "regno unito"], ["united states", "united states of america", "us", "usa", "stati uniti"]],
    noticePeriod: [["immediate", "immediately", "immediata", "immediato"], ["2weeks", "2 weeks", "2 settimane"], ["1month", "1 month", "1 mese"], ["2months", "2 months", "2 mesi"], ["3months_plus", "3 months or more", "3 mesi o più"]],
    highestEducation: [["high_school", "high school", "high school diploma"], ["bachelor", "bachelor's degree", "bachelor’s degree"], ["master", "master's degree", "master’s degree"], ["phd", "ph.d.", "doctorate"]],
  };
  const group = groups[key ?? ""]?.find(values => values.includes(normalized));
  return group?.[0] ?? normalized;
}
export function matchFactOption(question: FactQuestion, value: string): string | null {
  const options = question.options ?? [];
  const phoneCountry = reusableFactKey(question.label) === "phoneCountry"
    || (reusableFactKey(question.label) === "country" && options.some(option => /\+\d/.test(option)));
  if (phoneCountry) {
    const phone = value.replace(/[\s().-]/g, "").replace(/^00/, "+");
    if (!/^\+\d{7,15}$/.test(phone)) return null;
    const matches = options.flatMap(option => {
      const prefix = option.match(/\+\s*(\d{1,4})\b/);
      return prefix && phone.startsWith(`+${prefix[1]}`) ? [{ option, length: prefix[1].length }] : [];
    });
    const longest = Math.max(...matches.map(match => match.length));
    const exact = matches.filter(match => match.length === longest);
    return exact.length === 1 ? exact[0].option : null;
  }
  if (!["select", "react-select", "radio"].includes(question.kind)) return value;
  const exact = options.filter(option => canonicalFactValue(reusableFactKey(question.label), option) === canonicalFactValue(reusableFactKey(question.label), value));
  return exact.length === 1 ? exact[0] : null;
}
/** Multiple sources must agree. Only a fresh application-scoped candidate answer
 * may override conflicting facts; never silently prefer CV, settings or history. */
export function resolveCandidateFact(question: FactQuestion, context: FactContext, allowSearchValue = false): FactResolution {
  let key = reusableFactKey(question.label);
  const empty = { answer: null, provenance: [], conflict: false };
  if (!key || question.kind === "checkbox") return empty;
  if (key === "phoneCountry" || (key === "country" && question.options?.some(option => /\+\d/.test(option)))) key = "phone";
  const facts = context.facts ?? Object.entries(context).flatMap(([field, value]): Fact[] => {
    if (typeof value === "string" || typeof value === "number") return [{ key: field, value: String(value), source: "profile", reference: field }];
    return [];
  });
  let keys = [key];
  if (key === "fullName") {
    const first = resolveCandidateFact({ label: "First name", kind: "text" }, context);
    const last = resolveCandidateFact({ label: "Last name", kind: "text" }, context);
    const direct = facts.filter(fact => fact.key === key);
    const provenance = [...direct, ...first.provenance, ...last.provenance];
    if (first.conflict || last.conflict) return { ...empty, conflict: true, provenance };
    if (first.answer && last.answer) {
      const combined = `${first.answer} ${last.answer}`;
      if (direct.some(fact => normalizedValue(fact.value) !== normalizedValue(combined))) return { ...empty, conflict: true, provenance };
      return { answer: matchFactOption(question, combined), provenance, conflict: false };
    }
  }
  if (key === "currentOrPreviousEmployer") keys = facts.some(fact => fact.key === "currentEmployer" && fact.value.trim()) ? ["currentEmployer", key] : ["mostRecentEmployer", key];
  if (key === "currentOrPreviousJobTitle") keys = facts.some(fact => fact.key === "currentJobTitle" && fact.value.trim()) ? ["currentJobTitle", key] : ["mostRecentJobTitle", key];
  const provenance = facts.filter(fact => keys.includes(fact.key) && fact.value.trim());
  const values = new Set(provenance.map(fact => canonicalFactValue(key, fact.value)));
  if (values.size !== 1) return { answer: null, provenance, conflict: values.size > 1 };
  const value = provenance[0].value.trim();
  const answer = matchFactOption(question, value);
  // A search string is never a selected answer: the browser must fetch current
  // options and map them again before clicking. Offline suggestions stay strict.
  return { answer: answer ?? (allowSearchValue && question.kind === "react-select" && reusableFactKey(question.label) !== "phoneCountry" ? value : null), provenance, conflict: false };
}

/** Only a fully elapsed, explicit calendar period proves a job has ended.
 * Current-year-only, empty, ambiguous and invalid dates remain unknown. */
export function employmentEnded(endDate: string, now = new Date()): boolean {
  const value = endDate.trim();
  const year = value.match(/^(19\d{2}|20\d{2})$/);
  if (year) return +year[1] < now.getUTCFullYear();
  const month = value.match(/^(19\d{2}|20\d{2})-(\d{2})$/);
  if (month) return +month[2] >= 1 && +month[2] <= 12 && Date.UTC(+month[1], +month[2], 1) <= +now;
  const day = value.match(/^(19\d{2}|20\d{2})-(\d{2})-(\d{2})$/);
  if (!day) return false;
  const date = new Date(Date.UTC(+day[1], +day[2] - 1, +day[3]));
  return date.toISOString().slice(0, 10) === value && +date + 86400000 <= +now;
}

export function candidateFacts(profile: CVProfile | null, user: { email?: string | null; yearsExperience?: number | null; englishLevel?: string | null; noticePeriod?: string | null } = {}, preferences: ApplicationAnswers = {}, saved: SavedFactAnswer[] = [], now = new Date()): Fact[] {
  const facts: Fact[] = [];
  const add = (key: string, value: unknown, source: FactSource, reference = key) => {
    if ((typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value) && value >= 0)) facts.push({ key, value: String(value).trim(), source, reference });
  };
  if (profile) {
    for (const key of ["firstName", "lastName", "email", "phone", "city"] as const) add(key, profile[key], "cv");
    if (profile.firstName?.trim() && profile.lastName?.trim()) add("fullName", `${profile.firstName.trim()} ${profile.lastName.trim()}`, "cv", "firstName,lastName");
    const current = profile.experiences.filter(e => e.company.trim() && /^(?:present|current|now|oggi|presente|attuale|in corso)$/i.test(e.endDate.trim()));
    // An empty end date is not proof of current employment. Ordered CV history
    // supplies the most recent employer; multiple current jobs remain ambiguous.
    current.forEach((e, i) => { add("currentEmployer", e.company, "cv", `experiences.current.${i}`); add("currentJobTitle", e.role, "cv", `experiences.current.${i}`); });
    const previous = profile.experiences.findIndex(e => e.company.trim() && employmentEnded(e.endDate, now));
    if (previous >= 0) add("previousEmployer", profile.experiences[previous].company, "cv", `experiences.${previous}.company`);
    add("mostRecentEmployer", profile.experiences[0]?.company, "cv", "experiences.0.company");
    add("mostRecentJobTitle", profile.experiences[0]?.role, "cv", "experiences.0.role");
    add("school", profile.education[0]?.school, "cv", "education.0.school");
    // No qualification is inferred from an education entry, including a past end date.
    (profile.skills ?? []).forEach((skill, i) => add(`skill:${skill.name.toLowerCase().trim()}`, "Yes", "cv", `skills.${i}`));
    profile.links.forEach((link, i) => { if (/linkedin/i.test(`${link.label} ${link.url}`)) add("linkedinUrl", link.url, "cv", `links.${i}`); else if (/portfolio|behance|dribbble/i.test(`${link.label} ${link.url}`)) add("portfolioUrl", link.url, "cv", `links.${i}`); else if (/github/i.test(`${link.label} ${link.url}`)) add("githubUrl", link.url, "cv", `links.${i}`); else if (/^(?:website|personal website|sito web personale)$/i.test(link.label.trim())) add("websiteUrl", link.url, "cv", `links.${i}`); });
    (profile.languages ?? []).filter(l => /^(english|inglese)$/i.test(l.name.trim())).forEach(l => add("englishLevel", l.level, "cv", "languages.english"));
    add("languages", (profile.languages ?? []).map(l => l.level ? `${l.name} (${l.level})` : l.name).join(", "), "cv");
  }
  for (const key of ["yearsExperience", "englishLevel", "noticePeriod"] as const) add(key, user[key], "profile");
  if (!profile?.email?.trim()) add("email", user.email, "profile");
  for (const key of ["city", "country", "linkedinUrl", "portfolioUrl", "githubUrl", "websiteUrl", "salaryExpectationEur", "yearsExperience", "englishLevel", "noticePeriod", "highestEducation"] as const) add(key, preferences[key], "preferences");
  add("languages", preferences.languagesText, "preferences", "languagesText");
  // Do not reuse a bare historical label/value or any generated/assumed source.
  for (const answer of saved) {
    if (answer.source !== "user" || !answer.answer?.trim() || !answer.answeredAt || !Number.isFinite(+new Date(answer.answeredAt)) || answer.kind === "checkbox") continue;
    const key = reusableFactKey(answer.label);
    if (!key || key === "phoneCountry") continue;
    if (["select", "react-select", "radio"].includes(answer.kind ?? "")) {
      try { const options: unknown = JSON.parse(answer.optionsJson ?? "null"); if (!Array.isArray(options) || !options.includes(answer.answer) || (key === "country" && options.some(option => typeof option === "string" && /\+\d/.test(option)))) continue; } catch { continue; }
    }
    add(key, answer.answer, "previous_user", `answer:${answer.label}`);
  }
  return facts;
}
