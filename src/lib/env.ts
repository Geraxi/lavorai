/**
 * Validazione runtime delle env vars critiche in produzione.
 * Chiamato al boot: fa fail fast con messaggio chiaro se manca qualcosa
 * di essenziale, così non scopri il problema quando un utente prova
 * a fare signup e il server crasha in mezzo.
 *
 * In dev non blocca — mostra solo warning per quello che manca.
 */

interface EnvCheck {
  name: string;
  required: boolean; // required in production
  validate?: (v: string) => true | string; // ritorna string per error
  description: string;
}

const CHECKS: EnvCheck[] = [
  {
    name: "AUTH_SECRET",
    required: true,
    validate: (v) => v.length >= 32 || "deve essere lunga almeno 32 caratteri (openssl rand -hex 32)",
    description: "Segreto per firmare i JWT NextAuth",
  },
  {
    name: "AUTH_URL",
    required: true,
    validate: (v) => /^https?:\/\//.test(v) || "deve iniziare con http(s)://",
    description: "URL pubblico del sito (es. https://lavorai.it)",
  },
  {
    name: "DATABASE_URL",
    required: true,
    description: "Connection string Postgres in prod",
  },
  {
    name: "ANTHROPIC_API_KEY",
    required: true,
    description: "Claude API key per estrazione profilo CV + ottimizzazione",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    description: "Resend API key — senza, email features (verify/reset) sono no-op",
  },
  {
    name: "EMAIL_FROM",
    required: false,
    description: "Sender email da dominio Resend verificato",
  },
  {
    name: "SUPABASE_URL",
    required: false,
    description: "Supabase Storage — alternativa a Vercel Blob",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: false,
    description: "Supabase service role key — solo se usi Supabase",
  },
  {
    name: "BLOB_READ_WRITE_TOKEN",
    required: false,
    description: "Vercel Blob token — auto-iniettato se hai linked un Blob store",
  },
  {
    name: "APP_ENCRYPTION_KEY",
    required: true,
    validate: (v) => v.length >= 32 || "deve essere lunga almeno 32 caratteri",
    description: "Chiave per cifrare session cookies dei portali terzi",
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    required: false,
    description: "Rate limiter distribuito (fallback in-memory se mancante, sconsigliato in prod)",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: false,
    description: "Token Upstash Redis",
  },
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    description: "Necessario se vuoi abilitare subscription Pro",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: false,
    description: "Webhook secret Stripe per billing events",
  },
  {
    name: "ADZUNA_APP_ID",
    required: false,
    description: "Senza questo /jobs usa 10 mock jobs",
  },
  {
    name: "ADZUNA_APP_KEY",
    required: false,
    description: "Adzuna job API",
  },
];

export function validateEnv(): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  for (const check of CHECKS) {
    const v = process.env[check.name];
    if (!v || v.length === 0) {
      const msg = `${check.name} mancante — ${check.description}`;
      if (check.required && isProd) {
        errors.push(msg);
      } else if (check.required) {
        warnings.push(`[dev ok] ${msg}`);
      } else {
        warnings.push(msg);
      }
      continue;
    }
    if (check.validate) {
      const valid = check.validate(v);
      if (valid !== true) {
        const msg = `${check.name} invalido — ${valid}`;
        if (check.required && isProd) errors.push(msg);
        else warnings.push(msg);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Chiamala al boot del server. Se in prod manca qualcosa di essenziale,
 * throwa per crashare il container invece di servire errori 500 random.
 */
export function assertEnvOrCrash(): void {
  const { ok, errors, warnings } = validateEnv();
  if (warnings.length > 0 && process.env.NODE_ENV !== "test") {
    console.warn("[env] warnings:\n  " + warnings.join("\n  "));
  }
  if (!ok) {
    const header =
      "\n================ LavorAI: env vars mancanti in produzione ================\n";
    const footer =
      "\n==========================================================================\n" +
      "Configurale su Vercel → Settings → Environment Variables.\n" +
      "Vedi DEPLOY.md per la lista completa.\n";
    throw new Error(header + errors.map((e) => "  • " + e).join("\n") + footer);
  }
}
