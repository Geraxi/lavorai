import type { CVProfile } from "./cv-profile-types";
import type { ApplicationAnswers } from "./application-answers";
import { matchCity } from "./city-centroids";
import { COUNTRY_CENTROIDS } from "./country-centroids";
import { derivePhoneCountryLabel, matchPhoneCountryOption } from "./phone-country";

/** Employer privacy/GDPR consent only — never terms, marketing, or certifications. */
export function isPrivacyConsentQuestion(label: string): boolean {
  const key = factQuestionKey(label);
  if (/\b(terms of (?:service|use)|terms and conditions|i certify|i confirm that|marketing|newsletter|share my (?:data|information) with|third[ -]part)\b/.test(key)) {
    return false;
  }
  return /privacy policy|informativa privacy|gdpr|trattamento dei dati personali|processing of (?:my )?personal data|data protection(?: policy)?|consenso (?:privacy|gdpr)|i (?:agree to|accept|consent to) (?:the )?(?:privacy|gdpr)/.test(key);
}

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
  privacyConsentAt?: Date | string | null;
  /** True when location prefs include remote / hybrid. Missing means unknown — never invent No. */
  workRemote?: boolean | null;
  /** Employer on the current application; used for "previously employed by <company>". */
  company?: string | null;
  /** Every CV / work-history employer, including jobs older than current + most recent. */
  employers?: string[] | null;
};
export function factQuestionKey(label: string): string {
  return label.normalize("NFKC").toLowerCase().replace(/[?*:]/g, "").replace(/[.]$/, "").replace(/\s+/g, " ").trim()
    .replace(/^(?:what is|please enter|please provide|enter|provide) (?:your )?/, "").replace(/^your /, "");
}
const aliases: Record<string, string[]> = {
  firstName: ["first name", "given name", "nome", "qual è il tuo nome"],
  lastName: ["last name", "family name", "surname", "cognome", "qual è il tuo cognome"],
  fullName: ["name", "full name", "legal name", "applicant name", "nome e cognome", "come ti chiami"],
  email: ["email", "e-mail", "email address", "indirizzo email", "qual è il tuo indirizzo email"],
  phone: ["phone", "phone number", "telephone", "mobile", "best contact number", "best phone number", "contact number", "mobile number", "telefono", "numero di telefono", "cellulare"],
  phoneCountry: ["phone country", "phone country code", "phone country/region", "country calling code", "dial code", "dialing code", "country code", "prefisso telefonico"],
  city: ["city", "location", "your location", "location (city)", "current city", "city of residence", "current location", "current location (city)", "current location (country, city)", "current location (city, country)", "città", "citta", "città di residenza", "citta di residenza", "where do you live", "where are you based", "where are you currently based", "where are you located", "what city do you live in", "dove vivi", "dove risiedi", "in quale città vivi", "qual è la tua città di residenza"],
  country: ["country", "current country", "country of residence", "current country of residence", "country/region of residence", "residence country", "country where you currently reside", "in which country do you currently reside", "which country do you currently live in", "what country do you live in", "paese", "nazione", "paese di residenza", "in quale paese risiedi"],
  currentEmployer: ["current employer", "current company", "azienda attuale", "datore di lavoro attuale", "qual è la tua azienda attuale", "where do you currently work"],
  currentOrPreviousEmployer: ["current or previous employer", "current/previous employer", "current / previous employer", "who is your current or previous employer", "current or last company", "current or last employer", "current or most recent company", "current or most recent employer"],
  previousEmployer: ["previous employer", "previous employer name", "name of your previous employer", "previous company", "most recent previous employer", "azienda precedente", "datore di lavoro precedente"],
  mostRecentEmployer: ["most recent employer", "last employer", "ultima azienda"],
  currentJobTitle: ["current job title", "current position", "current role", "ruolo attuale", "posizione attuale", "qual è il tuo ruolo attuale", "qual è la tua posizione attuale"],
  currentOrPreviousJobTitle: ["current or previous job title"],
  mostRecentJobTitle: ["most recent job title", "last job title"],
  school: ["most recent school", "most recent university", "ultima università", "ultima universita"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile", "linkedin profile url", "linkedin profile link", "profilo linkedin"],
  portfolioUrl: ["portfolio", "portfolio url"],
  githubUrl: ["github", "github url", "github profile"],
  websiteUrl: ["website", "personal website", "sito web personale"],
  yearsExperience: ["years of experience", "years of professional experience", "years of total experience", "total years of experience", "how many years of experience do you have", "how many years of professional experience do you have", "anni di esperienza", "anni di esperienza professionale", "quanti anni di esperienza hai", "quanti anni di esperienza professionale hai"],
  englishLevel: ["english level", "level of english", "english proficiency", "livello di inglese"],
  languages: ["languages", "languages spoken", "spoken languages", "lingue", "lingue parlate"],
  noticePeriod: ["notice period", "preavviso", "periodo di preavviso", "available from", "available to start", "earliest start date", "earliest start", "when can you start", "start date", "disponibilità"],
  highestEducation: ["highest education", "highest level of education", "titolo di studio", "titolo di studio più alto"],
  howHeard: ["where did you hear about us", "how did you hear about us", "how did you hear about this role", "how did you hear about this job", "how did you find us", "where did you hear about this role", "come ci hai conosciuto", "come hai saputo di noi"],
  willingRemote: [
    "are you willing to work remotely", "willing to work remotely", "willingness to work remotely",
    "are you open to remote work", "open to remote work", "can you work remotely",
    "would you work remotely", "remote work", "disponibile a lavorare da remoto",
    "disponibile al lavoro da remoto", "lavoro da remoto", "accetti lavoro remoto",
    "are you willing to work hybrid", "open to hybrid work", "disponibile all'ibrido",
  ],
  marketingOptIn: [
    "whatsapp opt-in", "whatsapp opt in", "may we contact you via whatsapp",
    "can we contact you on whatsapp", "contact via whatsapp", "whatsapp updates",
    "sms opt-in", "sms opt in", "may we contact you via sms", "sms marketing",
    "marketing opt-in", "marketing opt in", "marketing communications",
    "receive marketing messages", "consent to marketing",
  ],
  previouslyEmployed: [
    "have you previously been employed by this company", "have you worked for this company",
    "have you previously worked for this company", "have you been employed by this company",
    "previously employed by this company", "former employee",
    "have you ever worked for us", "have you worked with us before",
  ],
};
export function screeningCountryFromLabel(label: string): string | null {
  const key = factQuestionKey(label);
  const pairs: Array<[RegExp, string]> = [
    [/\b(?:united states of america|united states|u\.s\.a\.|u\.s\.|\busa\b|in the us)\b/, "united_states"],
    [/\b(?:united kingdom|great britain|u\.k\.|\buk\b|in the uk)\b/, "united_kingdom"],
    [/\b(?:european union|\beu\b|europe)\b/, "european_union"],
    [/\b(?:italy|italia)\b/, "italy"],
    [/\b(?:germany|deutschland|germania)\b/, "germany"],
    [/\b(?:france|francia)\b/, "france"],
    [/\b(?:spain|spagna|españa|espana)\b/, "spain"],
    [/\b(?:netherlands|olanda|holland|paesi bassi)\b/, "netherlands"],
    [/\b(?:ireland|irlanda)\b/, "ireland"],
    [/\b(?:switzerland|svizzera|schweiz)\b/, "switzerland"],
    [/\b(?:austria|österreich|osterreich)\b/, "austria"],
    [/\b(?:belgium|belgio)\b/, "belgium"],
    [/\b(?:portugal|portogallo)\b/, "portugal"],
    [/\b(?:poland|polonia)\b/, "poland"],
    [/\b(?:sweden|svezia)\b/, "sweden"],
    [/\b(?:norway|norvegia)\b/, "norway"],
    [/\b(?:denmark|danimarca)\b/, "denmark"],
  ];
  for (const [re, id] of pairs) {
    if (re.test(key)) return id;
  }
  return null;
}
export function countryScopedScreeningKey(label: string): string | null {
  const key = factQuestionKey(label);
  const country = screeningCountryFromLabel(label);
  if (/\b(?:public official|public office|politically exposed|\bpep\b|carica pubblica|funzionario pubblic)\b/.test(key)) {
    return country ? `publicOfficial:${country}` : "publicOfficial";
  }
  if (/\b(?:authori[sz]ed to work|right to work|work authori[sz]ation|legally (?:able|allowed|authori[sz]ed) to work|permesso di lavoro|autorizzazione al lavoro)\b/.test(key)
    && !/\b(?:eu citizen|cittadino ue)\b/.test(key)) {
    return country ? `workAuthorization:${country}` : null;
  }
  if (/\b(?:require|need|need of) (?:visa )?sponsorship|visa sponsor|sponsorizzazione\b/.test(key)) {
    return country ? `sponsorship:${country}` : null;
  }
  return null;
}
const GENERIC_EMPLOYER_CATEGORY = /^(?:startup|start[- ]?up|early[- ]?stage(?: company)?|late[- ]?stage(?: company)?|fintech(?: company)?|scale[- ]?up|company|employer)s?$/;
const THIS_EMPLOYER_TARGET = /^(?:this company|this employer|us|our company|our organisation|our organization)$/;
const CANDIDATE_EMPLOYMENT_RE = /^(?:have you|were you|are you)\s+(?:ever|previously|formerly)?\s*(?:worked|been employed|been an employee|been a contractor|employed)\s+(?:for|at|with|by)\s+(.+)$/;
const FORMER_EMPLOYEE_RE = /^(?:are you (?:a )?)?(?:former|ex) employee(?: of (.+))?$/;
const BARE_EMPLOYED_BY_RE = /^(?:previously |formerly )?employed by (.+)$/;

function cleanEmployerName(raw: string): string {
  return raw
    .replace(/\s+or (?:a|an|any)(?: \S+)? (?:affiliates?|subsidiaries|subsidiary)\b.*$/i, "")
    .replace(/\s+or (?:its|their) (?:affiliates?|subsidiaries|subsidiary)\b.*$/i, "")
    .replace(/\b(?:before|previously|in the past)$/g, "")
    .replace(/^(?:the|a|an)\s+/g, "")
    .trim();
}

/** Candidate employment at this/named employer — never "why us", referrals, or how-heard. */
function parsePreviouslyEmployedQuestion(label: string): { deictic: true } | { deictic: false; name: string } | null {
  const key = factQuestionKey(label);
  if (aliases.previouslyEmployed.includes(key)) return { deictic: true };
  const former = key.match(FORMER_EMPLOYEE_RE);
  const raw = former ? former[1] : (key.match(CANDIDATE_EMPLOYMENT_RE)?.[1] ?? key.match(BARE_EMPLOYED_BY_RE)?.[1]);
  if (former && raw == null) return { deictic: true };
  if (raw == null) return null;
  const name = cleanEmployerName(raw);
  if (!name) return null;
  if (THIS_EMPLOYER_TARGET.test(name)) return { deictic: true };
  if (GENERIC_EMPLOYER_CATEGORY.test(name)) return null;
  return { deictic: false, name };
}

function isDeicticThisEmployerQuestion(label: string): boolean {
  return parsePreviouslyEmployedQuestion(label)?.deictic === true;
}

function namedEmployerFromQuestion(label: string): string | null {
  const parsed = parsePreviouslyEmployedQuestion(label);
  return parsed && !parsed.deictic ? parsed.name : null;
}

function previouslyEmployedLabel(label: string): boolean {
  return isDeicticThisEmployerQuestion(label);
}

function isYesNoQuestionKind(kind: string): boolean {
  return ["select", "react-select", "radio", "checkbox"].includes(kind);
}
export function isMarketingOptInQuestion(label: string): boolean {
  return aliases.marketingOptIn.includes(factQuestionKey(label));
}
export function isRemoteWillingnessQuestion(label: string): boolean {
  return aliases.willingRemote.includes(factQuestionKey(label));
}
export function isPreviouslyEmployedQuestion(label: string, company?: string | null): boolean {
  if (isDeicticThisEmployerQuestion(label)) return true;
  const named = namedEmployerFromQuestion(label);
  return !!(named && company && sameCompany(named, company));
}
export function reusableFactKey(label: string): string | null {
  const key = factQuestionKey(label);
  if (/^(?:(?:expected|desired) annual (?:salary|compensation)|annual (?:salary|compensation) expectations?)\s*\(?\s*(?:eur|€|euros?)\s*\)?$/.test(key)
    || /^(?:ral desiderata|ral attesa|aspettativa (?:di )?ral)$/.test(key)
    || /^(?:salary|compensation) expectations?$/.test(key)) return "salaryExpectationEur";
  const scoped = countryScopedScreeningKey(label);
  if (scoped) return scoped;
  if (previouslyEmployedLabel(label)) return "previouslyEmployed";
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
    howHeard: [["linkedin"], ["google", "google / search", "search"], ["referral", "referral / passaparola", "word of mouth", "passaparola"], ["other", "altro"]],
    highestEducation: [["high_school", "high school", "high school diploma"], ["bachelor", "bachelor's degree", "bachelor’s degree"], ["master", "master's degree", "master’s degree"], ["phd", "ph.d.", "doctorate"]],
  };
  const group = groups[key ?? ""]?.find(values => values.includes(normalized));
  return group?.[0] ?? normalized;
}
export function matchFactOption(question: FactQuestion, value: string, country?: string | null): string | null {
  const options = question.options ?? [];
  const phoneCountry = reusableFactKey(question.label) === "phoneCountry"
    || (reusableFactKey(question.label) === "country" && options.some(option => /\+\d/.test(option)));
  if (phoneCountry) {
    if (options.length) return matchPhoneCountryOption(options, value, country);
    return derivePhoneCountryLabel(value, country);
  }
  if (!["select", "react-select", "radio"].includes(question.kind)) return value;
  const exact = options.filter(option => canonicalFactValue(reusableFactKey(question.label), option) === canonicalFactValue(reusableFactKey(question.label), value));
  return exact.length === 1 ? exact[0] : null;
}
/** Multiple sources must agree. Only a fresh application-scoped candidate answer
 * may override conflicting facts; never silently prefer CV, settings or history. */
const NOTICE_TEXT: Record<string, string> = {
  immediate: "Immediate", "2weeks": "2 weeks", "1month": "1 month", "2months": "2 months", "3months_plus": "3 months",
};

function yesNoAnswer(question: FactQuestion, value: "Yes" | "No"): string | null {
  return matchFactOption(question, value)
    ?? (["select", "react-select", "radio"].includes(question.kind) ? null : value);
}

function employerNames(context: FactContext): string[] {
  const fromFacts = (context.facts ?? [])
    .filter((fact) => ["currentEmployer", "previousEmployer", "mostRecentEmployer", "currentOrPreviousEmployer", "employerHistory"].includes(fact.key) && fact.value.trim())
    .map((fact) => fact.value);
  const fromContext = [context.currentEmployer, context.mostRecentEmployer, ...(context.employers ?? [])]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return [...fromFacts, ...fromContext];
}

function normalizeCompany(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase()
    .replace(/\b(?:inc|ltd|llc|gmbh|s\.?p\.?a\.?|s\.?r\.?l\.?|ag|plc|corp|corporation|limited)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameCompany(a: string, b: string): boolean {
  const left = normalizeCompany(a);
  const right = normalizeCompany(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function resolveStandardScreening(question: FactQuestion, context: FactContext, key: string | null): FactResolution | null {
  const empty = { answer: null, provenance: [] as Fact[], conflict: false };
  if (key === "marketingOptIn" || isMarketingOptInQuestion(question.label)) {
    const facts = (context.facts ?? []).filter((fact) => fact.key === "marketingOptIn" && fact.value.trim());
    const values = new Set(facts.map((fact) => canonicalFactValue("marketingOptIn", fact.value)));
    if (values.size > 1) return { ...empty, conflict: true, provenance: facts };
    const value = (values.size === 1 ? facts[0].value : "No").trim();
    const yesNo = /^(yes|no|sì|si)$/i.test(value) ? ( /^(yes|sì|si)$/i.test(value) ? "Yes" : "No" ) : "No";
    const answer = yesNoAnswer(question, yesNo);
    return {
      answer,
      provenance: facts.length
        ? facts
        : [{ key: "marketingOptIn", value: "No", source: "profile", reference: "marketing_opt_in_default" }],
      conflict: false,
    };
  }
  if (key === "willingRemote" || isRemoteWillingnessQuestion(question.label)) {
    const facts = (context.facts ?? []).filter((fact) => fact.key === "willingRemote" && fact.value.trim());
    if (facts.length) {
      const values = new Set(facts.map((fact) => canonicalFactValue("willingRemote", fact.value)));
      if (values.size !== 1) return { answer: null, provenance: facts, conflict: values.size > 1 };
      if (!/^(yes|no|sì|si)$/i.test(facts[0].value.trim())) return empty;
      return { answer: yesNoAnswer(question, /^(yes|sì|si)$/i.test(facts[0].value.trim()) ? "Yes" : "No"), provenance: facts, conflict: false };
    }
    return empty;
  }
  if (key === "previouslyEmployed" || isPreviouslyEmployedQuestion(question.label, context.company)) {
    if (!isYesNoQuestionKind(question.kind)) return empty;
    if (!isPreviouslyEmployedQuestion(question.label, context.company)) return empty;
    const target = context.company?.trim() || null;
    if (!target) return empty;
    const history = employerNames(context);
    const hit = history.some((company) => sameCompany(company, target));
    if (!hit) return empty; // An incomplete CV cannot establish never having worked here.
    return {
      answer: yesNoAnswer(question, "Yes"),
      provenance: [{
        key: "previouslyEmployed",
        value: "Yes",
        source: "cv",
        reference: "experiences",
      }],
      conflict: false,
    };
  }
  return null;
}

export function resolveCandidateFact(question: FactQuestion, context: FactContext, allowSearchValue = false): FactResolution {
  let key = reusableFactKey(question.label);
  const empty = { answer: null, provenance: [], conflict: false };
  if (question.kind === "checkbox") {
    // Platform privacy consent does not accept a different employer’s agreement.
    if (key === "marketingOptIn" || isMarketingOptInQuestion(question.label)) {
      return { answer: "No", provenance: [{ key: "marketingOptIn", value: "No", source: "profile", reference: "marketing_opt_in_default" }], conflict: false };
    }
    if (isPreviouslyEmployedQuestion(question.label, context.company)) {
      return resolveStandardScreening(question, context, key) ?? empty;
    }
    return empty;
  }
  const screening = resolveStandardScreening(question, context, key);
  if (screening) return screening;
  if (!key) return empty;
  const facts = context.facts ?? Object.entries(context).flatMap(([field, value]): Fact[] => {
    if (typeof value === "string" || typeof value === "number") return [{ key: field, value: String(value), source: "profile", reference: field }];
    return [];
  });
  if (key === "phoneCountry" || (key === "country" && question.options?.some((option) => /\+\d/.test(option)))) {
    const phones = facts.filter((fact) => fact.key === "phone" && fact.value.trim());
    const countries = facts.filter((fact) => fact.key === "country" && fact.value.trim());
    const phoneValues = new Set(phones.map((fact) => canonicalFactValue("phone", fact.value)));
    if (phoneValues.size > 1) return { answer: null, provenance: phones, conflict: true };
    const phone = phones[0]?.value ?? context.phone ?? null;
    const country = countries[0]?.value ?? context.country ?? null;
    const provenance = [...phones, ...countries];
    const options = question.options ?? [];
    const answer = options.length
      ? matchPhoneCountryOption(options, phone ?? "", country)
      : derivePhoneCountryLabel(phone, country);
    return { answer, provenance, conflict: false };
  }
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
  let answer = matchFactOption(question, value)
    ?? (allowSearchValue && question.kind === "react-select" && reusableFactKey(question.label) !== "phoneCountry" ? value : null);
  if (answer && key === "noticePeriod" && !["select", "react-select", "radio"].includes(question.kind)) {
    answer = NOTICE_TEXT[canonicalFactValue("noticePeriod", answer)] ?? answer;
  }
  // A search string is never a selected answer: the browser must fetch current
  // options and map them again before clicking. Offline suggestions stay strict.
  return { answer, provenance, conflict: false };
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

export function candidateFacts(profile: CVProfile | null, user: { email?: string | null; name?: string | null; phone?: string | null; yearsExperience?: number | null; englishLevel?: string | null; noticePeriod?: string | null } = {}, preferences: ApplicationAnswers = {}, saved: SavedFactAnswer[] = [], now = new Date()): Fact[] {
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
    profile.experiences.forEach((e, i) => {
      if (e.company.trim()) add("employerHistory", e.company, "cv", `experiences.${i}.company`);
    });
    add("school", profile.education[0]?.school, "cv", "education.0.school");
    // No qualification is inferred from an education entry, including a past end date.
    (profile.skills ?? []).forEach((skill, i) => add(`skill:${skill.name.toLowerCase().trim()}`, "Yes", "cv", `skills.${i}`));
    profile.links.forEach((link, i) => { if (/linkedin/i.test(`${link.label} ${link.url}`)) add("linkedinUrl", link.url, "cv", `links.${i}`); else if (/portfolio|behance|dribbble/i.test(`${link.label} ${link.url}`)) add("portfolioUrl", link.url, "cv", `links.${i}`); else if (/github/i.test(`${link.label} ${link.url}`)) add("githubUrl", link.url, "cv", `links.${i}`); else if (/^(?:website|personal website|sito web personale)$/i.test(link.label.trim())) add("websiteUrl", link.url, "cv", `links.${i}`); });
    (profile.languages ?? []).filter(l => /^(english|inglese)$/i.test(l.name.trim())).forEach(l => add("englishLevel", l.level, "cv", "languages.english"));
    add("languages", (profile.languages ?? []).map(l => l.level ? `${l.name} (${l.level})` : l.name).join(", "), "cv");
  }
  for (const key of ["yearsExperience", "englishLevel", "noticePeriod"] as const) add(key, user[key], "profile");
  if (!profile?.email?.trim()) add("email", user.email, "profile");
  if (!profile?.phone?.trim()) add("phone", user.phone, "profile");
  if (!(profile?.firstName?.trim() && profile?.lastName?.trim()) && user.name?.trim()) {
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    add("fullName", user.name.trim(), "profile", "name");
    if (!profile?.firstName?.trim() && parts[0]) add("firstName", parts[0], "profile", "name");
    if (!profile?.lastName?.trim() && parts.length > 1) add("lastName", parts.slice(1).join(" "), "profile", "name");
  }
  for (const key of ["city", "country", "linkedinUrl", "portfolioUrl", "githubUrl", "websiteUrl", "salaryExpectationEur", "yearsExperience", "englishLevel", "noticePeriod", "highestEducation", "howHeard"] as const) add(key, preferences[key], "preferences");
  add("languages", preferences.languagesText, "preferences", "languagesText");
  if (profile?.city && !facts.some((fact) => fact.key === "country")) {
    const located = matchCity(profile.city);
    if (located?.cc && COUNTRY_CENTROIDS[located.cc]?.name) {
      add("country", COUNTRY_CENTROIDS[located.cc].name, "cv", "city");
    }
  }
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
