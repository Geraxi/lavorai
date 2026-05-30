/**
 * Seed di un utente di TEST pre-verificato.
 *
 * Crea (o aggiorna) un account email+password con `emailVerified` GIÀ
 * impostato, così supera il gate di login in src/lib/auth.ts (riga ~80,
 * `if (!user.emailVerified) throw "EmailNotVerified"`) SENZA dover cliccare
 * il link di verifica.
 *
 * NB: non tocca il codice di auth. Niente backdoor in produzione — è solo un
 * account legittimamente "verificato" via seed. L'unico modo per ottenere
 * questo bypass è eseguire deliberatamente questo script con accesso al DB.
 *
 * USO
 *   # DB locale (usa il DATABASE_URL del tuo ambiente / .env)
 *   tsx scripts/seed-test-user.ts [email] [password]
 *
 *   # DB di PRODUZIONE (carica prima le credenziali Neon di prod)
 *   set -a; source .vercel/.env.production.local; set +a
 *   tsx scripts/seed-test-user.ts test@lavorai.it 'UnaPasswordForte!'
 *
 * Default: email test@lavorai.it, password casuale (stampata a fine run).
 * Idempotente: ri-eseguendolo aggiorna password + verifica dello stesso email.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Node non espone un WebSocket globale, ma il driver Neon usato da Prisma ne
// ha bisogno per aprire la connessione. Lo cabliamo col pacchetto `ws` PRIMA
// di importare il client Prisma (costruito al momento dell'import in
// src/lib/db.ts). Tocca SOLO questo script: src/lib/db.ts resta invariato e
// su Vercel il WebSocket globale esiste già, quindi l'app non cambia.
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

/** Solo l'host del DB (mai user/password) — per sapere DOVE stai scrivendo. */
function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(host sconosciuto)";
  } catch {
    return "(DATABASE_URL assente o non valido)";
  }
}

async function main() {
  const email = (process.argv[2] ?? process.env.SEED_EMAIL ?? "test@lavorai.it")
    .trim()
    .toLowerCase();
  const password =
    process.argv[3] ??
    process.env.SEED_PASSWORD ??
    `lavorai-test-${randomBytes(5).toString("hex")}`;

  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    throw new Error(`Email non valida: ${email}`);
  }
  if (password.length < 8) {
    throw new Error("La password deve avere almeno 8 caratteri.");
  }

  console.log(`→ DB target : ${dbHost()}`);
  console.log(`→ Upsert utente di test: ${email}`);

  // Import dinamico DOPO aver configurato neonConfig: src/lib/db.ts costruisce
  // il client Prisma al momento dell'import, quindi il WebSocket dev'essere
  // già cablato.
  const { prisma } = await import("../src/lib/db");

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      emailVerified: now, // ← supera il gate "EmailNotVerified"
    },
    create: {
      email,
      name: "Test User",
      passwordHash,
      emailVerified: now,
      tier: "free",
      locale: "it",
    },
    select: { id: true, email: true, emailVerified: true, tier: true },
  });

  console.log("\n✓ Utente di test pronto (email già verificata):");
  console.log(`  id            : ${user.id}`);
  console.log(`  email         : ${user.email}`);
  console.log(`  password      : ${password}`);
  console.log(`  emailVerified : ${user.emailVerified?.toISOString()}`);
  console.log(`  tier          : ${user.tier}`);
  console.log("\n  Accedi da /login con email + password — nessuna verifica richiesta.");
  console.log("  ⚠  Solo per test: usa una password forte e rimuovi l'account quando non serve.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗ seed fallito:", e);
    process.exit(1);
  });
