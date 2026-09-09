/**
 * Template email di brand — unico per tutte le comunicazioni transazionali
 * e di lifecycle (prova, digest, inviti, avvisi). Stessa lingua visiva del
 * sito: fondo avorio #FAFAF7, inchiostro #0F1012, grigio #5B5D61, accento
 * smeraldo #34D399, bottone scuro pieno. Niente immagini pesanti: il mark è
 * la PNG 192px già servita dal sito.
 *
 * Uso:
 *   renderBrandEmail({ locale, preheader, title, paragraphs, cta, ... })
 */

export interface BrandEmailInput {
  locale?: "it" | "en" | string | null;
  /** Testo nascosto mostrato dai client come anteprima. */
  preheader?: string;
  /** Etichetta piccola sopra il titolo (es. "Prova Pro · giorno 1"). */
  eyebrow?: string;
  title: string;
  /** Saluto opzionale (es. "Ciao Marco,"). */
  greeting?: string;
  /** Paragrafi (HTML inline consentito: <strong>, <a>). */
  paragraphs: string[];
  /** Blocco evidenziato: righe chiave (es. cosa succede ora). */
  highlights?: Array<{ label: string; value: string }>;
  /** Lista puntata semplice. */
  bullets?: string[];
  cta?: { label: string; url: string };
  /** Link secondario sotto il bottone. */
  secondary?: { label: string; url: string };
  /** Nota in piccolo prima del footer (es. "Puoi disattivare…"). */
  footnote?: string;
  /** Tabella righe custom (es. offerte): già HTML. */
  rawBlock?: string;
}

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderBrandEmail(i: BrandEmailInput): { html: string; text: string } {
  const site = SITE();
  const en = i.locale === "en";
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
  const highlights = i.highlights?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 22px;border:1px solid #E6E4DD;border-radius:12px;background:#FFFFFF;">${i.highlights
        .map(
          (h, idx) => `<tr><td style="padding:12px 16px;${idx ? "border-top:1px solid #EEECE6;" : ""}font-size:12.5px;color:#8A8C90;letter-spacing:.02em;text-transform:uppercase;">${esc(h.label)}</td><td style="padding:12px 16px;${idx ? "border-top:1px solid #EEECE6;" : ""}font-size:14.5px;color:#0F1012;font-weight:600;text-align:right;">${h.value}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const bullets = i.bullets?.length
    ? `<ul style="margin:0 0 22px;padding-left:18px;color:#0F1012;font-size:15px;line-height:1.65;">${i.bullets.map((b) => `<li style="margin:0 0 6px;">${b}</li>`).join("")}</ul>`
    : "";
  const cta = i.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;"><tr><td style="background:#0F1012;border-radius:8px;"><a href="${i.cta.url}" style="display:inline-block;padding:13px 24px;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14.5px;">${esc(i.cta.label)}</a></td></tr></table>`
    : "";
  const secondary = i.secondary ? `<p style="margin:0 0 22px;font-size:13.5px;"><a href="${i.secondary.url}" style="color:#5B5D61;">${esc(i.secondary.label)} →</a></p>` : "";
  const footnote = i.footnote ? `<p style="font-size:12.5px;color:#8A8C90;line-height:1.55;margin:26px 0 0;">${i.footnote}</p>` : "";

  const html = `<!doctype html>
<html lang="${en ? "en" : "it"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(i.title)}</title></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:${font};color:#0F1012;-webkit-font-smoothing:antialiased;">
${i.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FAFAF7;">${esc(i.preheader)}</div>` : ""}
<div style="max-width:560px;margin:0 auto;padding:36px 24px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:30px;"><tr>
    <td style="vertical-align:middle;padding-right:9px;"><img src="${site}/icon-192.png" width="26" height="26" alt="" style="display:block;border-radius:7px;"></td>
    <td style="vertical-align:middle;font-size:18px;font-weight:700;letter-spacing:-0.02em;">Lavor<span style="color:#1FA97A;">AI</span></td>
  </tr></table>
  ${i.eyebrow ? `<div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1FA97A;margin:0 0 10px;">${esc(i.eyebrow)}</div>` : ""}
  <h1 style="font-size:23px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;margin:0 0 14px;">${esc(i.title)}</h1>
  ${i.greeting ? `<p style="font-size:15px;line-height:1.6;color:#0F1012;margin:0 0 12px;">${esc(i.greeting)}</p>` : ""}
  ${i.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.65;color:#3A3C40;margin:0 0 14px;">${p}</p>`).join("")}
  ${highlights}${bullets}${i.rawBlock ?? ""}${cta}${secondary}${footnote}
  <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 14px;">
  <p style="font-size:11.5px;color:#8A8C90;line-height:1.6;margin:0;">
    LavorAI · ${en ? "Your applications, sent for you." : "Le tue candidature, inviate al posto tuo."}<br>
    <a href="${site}/settings" style="color:#8A8C90;">${en ? "Preferences" : "Preferenze"}</a> · <a href="${site}/privacy" style="color:#8A8C90;">Privacy</a> · <a href="${site}/contatti" style="color:#8A8C90;">${en ? "Contact" : "Contatti"}</a>
  </p>
</div>
</body></html>`;

  const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const text = [
    i.eyebrow ? i.eyebrow.toUpperCase() : null,
    i.title,
    "",
    i.greeting ?? null,
    ...i.paragraphs.map(strip),
    ...(i.highlights ?? []).map((h) => `- ${h.label}: ${strip(h.value)}`),
    ...(i.bullets ?? []).map((b) => `- ${strip(b)}`),
    i.cta ? `\n${i.cta.label}: ${i.cta.url}` : null,
    i.secondary ? `${i.secondary.label}: ${i.secondary.url}` : null,
    i.footnote ? `\n${strip(i.footnote)}` : null,
    "\nLavorAI · " + site,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  return { html, text };
}
