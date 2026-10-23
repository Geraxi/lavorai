/**
 * Keyword classifier (Italian + English) for mail received on a user inbox,
 * with an optional, injectable AI fallback for "other". Pure by default.
 */
export type InboundCategory = "confirmation" | "incomplete" | "interview" | "rejection" | "other";

const RULES: Array<[Exclude<InboundCategory, "other">, RegExp[]]> = [
  ["rejection", [
    /\bunfortunately\b[^.]{0,120}\b(not|other candidates|another candidate|decided|unable)\b/i,
    /\bregret to inform\b/i, /\b(decided|chosen) (not )?to (move|proceed) forward with (other|another)\b/i,
    /\bnot (be )?(moving|move) forward\b/i, /\bwill not be (moving|progressing|proceeding)\b/i,
    /\bposition has (now )?been filled\b/i, /\bnot been selected\b/i,
    /\bpurtroppo\b[^.]{0,120}\b(non|altri candidat|altro candidat|deciso)\b/i,
    /\babbiamo deciso di (proseguire|procedere) con altr/i, /\bnon (è|e'|sei) stat[ao] selezionat/i,
    /\bnon (potremo|possiamo) (dare seguito|procedere|proseguire)\b/i, /\bla posizione è stata (già )?coperta\b/i,
  ]],
  ["incomplete", [
    /\b(complete|finish) your application\b/i, /\bapplication (is )?(incomplete|not (yet )?complete)\b/i,
    /\b(verify|confirm) your (email|e-mail|address|account)\b/i, /\baction required\b/i,
    /\b(verification|security|confirmation) code\b/i, /\bone[- ]time (code|password)\b/i,
    /\bcompleta (la tua|la) candidatura\b/i, /\bcandidatura (incompleta|non (ancora )?completata)\b/i,
    /\bconferma (il tuo|la tua) (indirizzo|email|e-mail|account)\b/i, /\bverifica (il tuo|la tua) (indirizzo|email|e-mail|account)\b/i,
    /\bcodice (di )?(verifica|sicurezza|conferma)\b/i, /\bazione richiesta\b/i,
  ]],
  ["interview", [
    /\b(invite|invitation) (you )?(to|for) (an? )?(interview|call|chat|video call|phone screen)\b/i,
    /\b(schedule|book|arrange|set up) (an? )?(interview|call|phone screen|chat)\b/i,
    /\b(interview|phone screen) (invitation|request|slot)\b/i, /\byour availability\b/i,
    /\b(invitarti|invito) (a|per) (un|una) (colloquio|call|chiamata|videochiamata)\b/i,
    /\b(fissare|organizzare|programmare) (un|una) (colloquio|call|chiamata)\b/i,
    /\bla tua disponibilità\b/i, /\bcolloquio conoscitivo\b/i,
  ]],
  ["confirmation", [
    /\bthank(s| you) for (applying|your application|your interest)\b/i,
    /\bwe('ve| have) (successfully )?received your application\b/i, /\byour application (has been|was) (successfully )?(received|submitted)\b/i,
    /\bapplication (received|submitted|confirmation)\b/i,
    /\bgrazie per (la tua candidatura|aver(ti)? candidat|esserti candidat|il tuo interesse)\b/i,
    /\babbiamo ricevuto la tua candidatura\b/i, /\bla tua candidatura (è stata|e' stata) (correttamente )?(ricevuta|inviata|registrata)\b/i,
    /\bcandidatura (ricevuta|inviata con successo|registrata)\b/i, /\bconferma (di )?candidatura\b/i,
  ]],
];

const CONDITIONAL = /\b(if|should|may|might|whether|in case|qualora|nel caso|eventual\w*|potremmo|potrebbe)\b|\bse (il|la|tu|sarai|dovesse|ci)\b/i;

export function classifyByRules(subject: string, body: string): InboundCategory {
  const text = `${subject}\n${body}`.slice(0, 20_000);
  // "If your profile matches we may invite you to an interview" is a
  // confirmation, not an invitation: drop conditional sentences for interview.
  const assertive = text.split(/(?<=[.!?\n])/).filter((s) => !CONDITIONAL.test(s)).join(" ");
  for (const [category, patterns] of RULES) if (patterns.some((p) => p.test(category === "interview" ? assertive : text))) return category;
  return "other";
}

export type AiClassifier = (input: { subject: string; body: string }) => Promise<InboundCategory | null>;

export async function classifyInbound(subject: string, body: string, ai?: AiClassifier | null): Promise<{ category: InboundCategory; by: "rules" | "ai" }> {
  const category = classifyByRules(subject, body);
  if (category !== "other" || !ai) return { category, by: "rules" };
  const guess = await ai({ subject: subject.slice(0, 300), body: body.slice(0, 4000) }).catch(() => null);
  return guess && guess !== "other" && ["confirmation", "incomplete", "interview", "rejection"].includes(guess) ? { category: guess, by: "ai" } : { category: "other", by: "rules" };
}
