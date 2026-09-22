/** Display-only wording; original ATS labels and answer values are preserved. */
export function cleanQuestionLabel(raw: string): string {
  return (raw || "").replace(/SVGs? not supported by this browser\.?/gi, " ").split(/\s*\+\d{1,4}[A-Z]/)[0].replace(/\s+/g, " ").replace(/^\*+|\*+$/g, "").trim() || raw.slice(0, 80);
}

const italian: Array<[RegExp, string]> = [
  [/^(?:what is )?(?:your )?(?:first|given) name\??$/i, "Qual è il tuo nome?"],
  [/^(?:what is )?(?:your )?(?:last|family) name\??$/i, "Qual è il tuo cognome?"],
  [/^(?:what is )?(?:your )?full name\??$/i, "Qual è il tuo nome completo?"],
  [/^(?:what is )?(?:your )?e-?mail(?: address)?\??$/i, "Qual è il tuo indirizzo email?"],
  [/^(?:what is )?(?:your )?(?:phone|phone number|mobile number)\??$/i, "Qual è il tuo numero di telefono?"],
  [/^(?:what is )?(?:your )?(?:current )?city\??$/i, "In quale città vivi?"],
  [/^(?:what is )?(?:your )?(?:current employer|current company)\??$/i, "Qual è la tua azienda attuale?"],
  [/^(?:what is )?(?:your )?(?:current job title|current position)\??$/i, "Qual è il tuo ruolo attuale?"],
  [/^(?:what is )?(?:your )?(?:linkedin|linkedin url|linkedin profile)\??$/i, "Qual è il link al tuo profilo LinkedIn?"],
  [/^(?:what is )?(?:your )?(?:portfolio|portfolio url|personal website)\??$/i, "Qual è il link al tuo portfolio?"],
  [/^how many years of (?:professional )?experience do you have\??$/i, "Quanti anni di esperienza professionale hai?"],
  [/^(?:what is )?(?:your )?(?:english level|level of english|english proficiency)\??$/i, "Qual è il tuo livello di inglese?"],
  [/^(?:when can you start|what is your earliest start date|what is your notice period)\??$/i, "Quando potresti iniziare?"],
  [/^(?:are you willing to relocate|would you be willing to relocate)\??$/i, "Sei disponibile a trasferirti?"],
  [/^(?:what is your (?:desired|expected) salary|what are your salary expectations)\??$/i, "Qual è la tua aspettativa di stipendio?"],
  [/^how did you hear about (?:us|this (?:role|position))\??$/i, "Come hai conosciuto questa opportunità?"],
  [/^are you (?:legally )?(?:authorized|authorised|eligible) to work in (?:the )?(?:united kingdom|uk)\??$/i, "Hai il diritto di lavorare nel Regno Unito?"],
  [/^will you (?:now or in the future )?require (?:visa )?sponsorship\??$/i, "Hai bisogno di sponsorizzazione per il visto di lavoro?"],
];

export function displayQuestion(raw: string, locale: string): { text: string; translated: boolean } {
  const original = cleanQuestionLabel(raw);
  if (locale !== "it") return { text: original, translated: false };
  for (const [pattern, text] of italian) if (pattern.test(original)) return { text, translated: true };
  const sector = original.match(/^how many years of (?:professional )?experience (?:do you have|have you had) (?:in|within) the (financial|finance|technology|tech|healthcare) (?:sector|industry)\??$/i);
  if (sector) return { text: `Quanti anni di esperienza professionale hai nel settore ${/financ/i.test(sector[1]) ? "finanziario" : /health/i.test(sector[1]) ? "sanitario" : "tecnologico"}?`, translated: true };
  const skill = original.match(/^(?:do you have experience with|have you worked with|have you used) ([\w+#. -]+)\??$/i);
  if (skill) return { text: `Hai esperienza con ${skill[1].trim()}?`, translated: true };
  return { text: original, translated: false };
}

export function displayOption(value: string, locale: string): string {
  if (locale !== "it") return value;
  const known: Record<string, string> = { yes: "Sì", no: "No", "prefer not to say": "Preferisco non rispondere", "less than 1 year": "Meno di 1 anno", "1-2 years": "1–2 anni", "3-5 years": "3–5 anni", "6-10 years": "6–10 anni", "more than 10 years": "Più di 10 anni", immediate: "Subito", "not sure": "Non sono sicuro/a" };
  return known[value.trim().toLowerCase()] ?? value;
}
