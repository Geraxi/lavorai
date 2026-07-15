import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

const EMAILS = [
  "pietrosartori777@gmail.com",
  "mikelamgbusiness@gmail.com",
];

async function main() {
  for (const email of EMAILS) {
    const urows = await sql`SELECT * FROM "User" WHERE email = ${email}` as any[];
    if (!urows.length) { console.log(`\n### ${email} — NON TROVATO\n`); continue; }
    const u = urows[0];
    const cvDocs = await sql`SELECT id, "originalFilename", LENGTH("extractedText") AS textlen, "parsedProfileJson" IS NOT NULL AS parsed, "createdAt" FROM "CVDocument" WHERE "userId" = ${u.id} ORDER BY "createdAt" DESC` as any[];
    const prof = await sql`SELECT "firstName","lastName",phone,city,title, LENGTH(summary) AS summarylen, "pdfPath", "experiencesJson"::text AS exp, "skillsJson"::text AS skills FROM "CVProfile" WHERE "userId" = ${u.id}` as any[];
    const pref = await sql`SELECT "autoApplyMode","autoApplyOn","dailyCap","matchMin","employmentType","rolesJson"::text AS roles,"locationsJson"::text AS locs,"sourcesJson"::text AS sources FROM "UserPreferences" WHERE "userId" = ${u.id}` as any[];
    const apps = await sql`SELECT status, COUNT(*) AS n FROM "Application" WHERE "userId" = ${u.id} GROUP BY status` as any[];

    console.log(`\n================ ${email} ================`);
    console.log(`tier=${u.tier}  emailVerified=${u.emailVerified ? "SI" : "NO"}  onboardedAt=${u.onboardedAt ?? "—"}  lastLogin=${u.lastLoginAt ?? "—"}`);
    console.log(`privacyConsent=${u.privacyConsentAt ?? "—"}  seniority=${u.seniority ?? "—"}  euAuthorized=${u.euAuthorized}`);
    console.log(`--- CV caricati: ${cvDocs.length}`);
    for (const d of cvDocs) console.log(`     • ${d.originalFilename}  textLen=${d.textlen}  parsed=${d.parsed}  (${new Date(d.createdAt).toISOString().slice(0,10)})`);
    console.log(`--- CVProfile: ${prof.length ? "presente" : "ASSENTE"}`);
    if (prof.length) {
      const p = prof[0];
      console.log(`     nome="${p.firstName} ${p.lastName}" title="${p.title}" city="${p.city}" phone="${p.phone ? "si" : "no"}" summaryLen=${p.summarylen} pdf=${p.pdfPath ? "si" : "no"}`);
      console.log(`     experiences=${(p.exp||"[]").slice(0,60)}  skills=${(p.skills||"[]").slice(0,60)}`);
    }
    console.log(`--- Preferences: ${pref.length ? "presenti" : "ASSENTI"}`);
    if (pref.length) {
      const pr = pref[0];
      console.log(`     autoApplyMode=${pr.autoApplyMode}  autoApplyOn=${pr.autoApplyOn}  dailyCap=${pr.dailyCap}  matchMin=${pr.matchMin}  employmentType=${pr.employmentType}`);
      console.log(`     roles=${pr.roles}  locations=${pr.locs}  sources=${pr.sources}`);
    }
    console.log(`--- Applications per stato: ${apps.length ? apps.map(a=>`${a.status}:${a.n}`).join(", ") : "NESSUNA"}`);
  }
}

main().catch(e => { console.error("ERRORE:", e.message); process.exit(1); });
