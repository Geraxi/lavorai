import type { CVProfile } from "@/lib/cv-profile-types";

/** Only direct, unambiguous facts from the candidate's CV are suggested. */
export function suggestAnswerFromCv(
  label: string,
  kind: string,
  options: string[] | undefined,
  profile: CVProfile | null,
  yearsExperience?: number | null,
): string | null {
  if (!profile || kind === "checkbox" || kind === "radio") return null;
  const normalized = label.toLocaleLowerCase("en").replace(/[?*:.]/g, "").replace(/\s+/g, " ").trim();
  const field = normalized.replace(/^(what is|please enter|please provide|enter|provide) (your )?/, "").replace(/^your /, "");
  // Preferences, consent, legal status and role-specific experience cannot be
  // proved by a name, a CV headline or a total years-of-experience field.
  if (/authori[sz]|visa|sponsor|permit|citizen|right to work|eligible|criminal|disabilit|ethnic|gender|salary|stipend|compens|retribuz|relocat|trasfer|remote|remot|hybrid|ibrid|availab|disponib|notice|preavviso|prefer|consent|privacy|financial sector|settore finanziario/.test(normalized)) return null;

  const current = profile.experiences.find((experience) => experience.company.trim() && !experience.endDate.trim());
  const recent = profile.experiences.find((experience) => experience.company.trim());
  const link = (pattern: RegExp) => profile.links.find((item) => pattern.test(`${item.label} ${item.url}`))?.url ?? "";
  let answer = "";
  if (/^(first name|given name|nome)$/.test(field)) answer = profile.firstName;
  else if (/^(last name|family name|surname|cognome)$/.test(field)) answer = profile.lastName;
  else if (/^(full name|nome e cognome)$/.test(field)) answer = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  else if (/^(email|e-mail|email address|indirizzo email)$/.test(field)) answer = profile.email;
  else if (/^(phone|phone number|telephone|mobile|telefono|numero di telefono|cellulare)$/.test(field)) answer = profile.phone;
  else if (/^(city|current city|city of residence|città|citta|città di residenza|citta di residenza)$/.test(field)) answer = profile.city;
  else if (/^(current employer|current company|azienda attuale|datore di lavoro attuale)$/.test(field)) answer = current?.company ?? "";
  else if (/^(most recent employer|last employer|ultima azienda)$/.test(field)) answer = recent?.company ?? "";
  else if (/^(current job title|current position|ruolo attuale|posizione attuale)$/.test(field)) answer = current?.role ?? "";
  else if (/^(linkedin|linkedin url|linkedin profile|profilo linkedin)$/.test(field)) answer = link(/linkedin/i);
  else if (/^(portfolio|portfolio url|personal website|sito web personale)$/.test(field)) answer = link(/portfolio|behance|dribbble/i);
  else if (/^(english level|level of english|livello di inglese)$/.test(field)) answer = profile.languages.find((language) => /^(english|inglese)$/i.test(language.name.trim()))?.level ?? "";
  else if (/^(most recent university|most recent school|ultima università|ultima universita)$/.test(field)) answer = profile.education[0]?.school ?? "";
  else if (/^(most recent degree|ultimo titolo di studio)$/.test(field)) answer = profile.education[0]?.degree ?? "";
  else if (/^(years of experience|years of professional experience|how many years of professional experience do you have|anni di esperienza professionale|quanti anni di esperienza professionale hai)$/.test(field) && yearsExperience != null && yearsExperience >= 0) answer = String(yearsExperience);
  else {
    const skillQuestion = field.match(/^(?:do you have experience with|have you worked with|have you used|hai esperienza con) ([a-z0-9+#. -]+)$/);
    const target = skillQuestion?.[1]?.trim();
    if (target && profile.skills.some((skill) => skill.name.toLocaleLowerCase("en").trim() === target)) {
      answer = options?.find((option) => /^(yes|sì|si)$/i.test(option.trim())) ?? (options?.length ? "" : "Yes");
    }
  }

  answer = answer.trim();
  if (!answer) return null;
  if (kind === "select" || kind === "react-select") {
    if (!options?.length) return null;
    return options.find((option) => option.trim().toLocaleLowerCase("en") === answer.toLocaleLowerCase("en")) ?? null;
  }
  return answer;
}
