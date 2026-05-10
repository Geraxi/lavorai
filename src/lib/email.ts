import { Resend } from "resend";

let cachedClient: Resend | null = null;

function getClient(): Resend {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY mancante. Aggiungila a .env.local per inviare email.",
    );
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

/**
 * From address ufficiale di LavorAI. Il dominio lavorai.it deve essere
 * verificato su Resend per usare questo mittente. Durante lo sviluppo
 * si può sovrascrivere con RESEND_FROM_OVERRIDE=onboarding@resend.dev
 * in .env.local senza modificare il codice.
 */
function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_OVERRIDE ?? "LavorAI <noreply@lavorai.it>"
  );
}

type Locale = "it" | "en";

const COPY = {
  it: {
    subject: "Il tuo CV ottimizzato è pronto 🎯",
    greetingDefault: "ciao",
    greetingFmt: "Ciao",
    introFor: "Abbiamo ottimizzato il tuo CV per la posizione:",
    attachmentNote: "In allegato trovi <strong>CV_Ottimizzato.docx</strong> e <strong>Lettera_Motivazionale.docx</strong>, pronti da inviare.",
    atsLabel: "Compatibilità ATS",
    suggestionsLabel: "Suggerimenti per migliorare",
    ctaTryAgain: "Prova ancora LavorAI",
    footer: "Ricevi questa email perché hai usato LavorAI per ottimizzare un CV.",
    privacy: "privacy",
    terms: "termini",
    cvFilename: "CV_Ottimizzato.docx",
    letterFilename: "Lettera_Motivazionale.docx",
  },
  en: {
    subject: "Your optimized CV is ready 🎯",
    greetingDefault: "hi",
    greetingFmt: "Hi",
    introFor: "We optimized your CV for the role:",
    attachmentNote: "Attached you'll find <strong>Optimized_CV.docx</strong> and <strong>Cover_Letter.docx</strong>, ready to send.",
    atsLabel: "ATS compatibility",
    suggestionsLabel: "Suggestions to improve",
    ctaTryAgain: "Try LavorAI again",
    footer: "You're receiving this because you used LavorAI to optimize a CV.",
    privacy: "privacy",
    terms: "terms",
    cvFilename: "Optimized_CV.docx",
    letterFilename: "Cover_Letter.docx",
  },
} as const;

export interface SendOptimizedCVEmailInput {
  to: string;
  firstName: string;
  cvBuffer: Buffer;
  coverLetterBuffer: Buffer;
  atsScore: number;
  suggestions: string[];
  jobTitle: string;
  /** "it" | "en" — default "it". Determina lingua dell'email. */
  locale?: string;
}

export async function sendOptimizedCVEmail(
  input: SendOptimizedCVEmailInput,
): Promise<void> {
  const client = getClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const loc: Locale = input.locale === "en" ? "en" : "it";
  const m = COPY[loc];

  const { error } = await client.emails.send({
    from: getFromAddress(),
    to: input.to,
    subject: m.subject,
    html: renderHtml({ ...input, siteUrl, locale: loc }),
    attachments: [
      {
        filename: m.cvFilename,
        content: input.cvBuffer,
      },
      {
        filename: m.letterFilename,
        content: input.coverLetterBuffer,
      },
    ],
  });

  if (error) {
    console.error("[sendOptimizedCVEmail] Resend error", error);
    throw new Error(
      "Email send failed. Please retry in a few minutes or contact support.",
    );
  }
}

function renderHtml(
  input: SendOptimizedCVEmailInput & { siteUrl: string; locale: Locale },
): string {
  const m = COPY[input.locale];
  const suggestionsHtml = input.suggestions
    .map((s) => `<li style="margin:6px 0;">${escapeHtml(s)}</li>`)
    .join("");

  const greetingName =
    input.firstName && input.firstName.trim() !== ""
      ? escapeHtml(input.firstName)
      : m.greetingDefault;
  const greeting =
    greetingName === m.greetingDefault
      ? `${m.greetingFmt}!`
      : `${m.greetingFmt} ${greetingName}!`;

  return `<!doctype html>
<html lang="${input.locale}">
  <body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0F172A;">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.01em;margin-bottom:24px;">
        Lavor<span style="color:#16A34A;">AI</span>
      </div>

      <h1 style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;">
        ${greeting}
      </h1>

      <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">
        ${m.introFor}
        <strong>${escapeHtml(input.jobTitle)}</strong>.
      </p>

      <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 24px;">
        ${m.attachmentNote}
      </p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:8px;">
          ${m.atsLabel}
        </div>
        <div style="font-size:36px;font-weight:700;color:#16A34A;line-height:1;">
          📊 ${input.atsScore}<span style="color:#94A3B8;font-size:20px;">/100</span>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:20px;margin-bottom:24px;">
        <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:12px;">
          ${m.suggestionsLabel}
        </div>
        <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#334155;">
          ${suggestionsHtml}
        </ul>
      </div>

      <div style="text-align:center;margin:32px 0;">
        <a href="${input.siteUrl}/optimize"
           style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
          ${m.ctaTryAgain}
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0 16px;" />

      <p style="font-size:12px;color:#94A3B8;line-height:1.6;margin:0;">
        ${m.footer}
        <a href="${input.siteUrl}/privacy" style="color:#64748B;">${m.privacy}</a>
        · <a href="${input.siteUrl}/termini" style="color:#64748B;">${m.terms}</a>.
        <br/>© 2026 LavorAI
      </p>
    </div>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
