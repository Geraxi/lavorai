import assert from "node:assert/strict";
import { genericPhraseHits, ghostSummary, normalizeCompany, scoreGhostJob, titleIdentityKey, type GhostJobInput } from "../src/lib/ghost-job";

const NOW = new Date("2026-10-20T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const LONG = "Cerchiamo un/una sviluppatore backend per il team pagamenti. Responsabilità: progettare API in Node.js, gestire PostgreSQL, code review. Requisiti: 3 anni di esperienza con TypeScript, conoscenza di Kafka. Offriamo RAL 40-48k, contratto indeterminato, 2 giorni di smart working, sede a Milano in via Tortona.".repeat(2);
const base = (o: Partial<GhostJobInput> = {}): GhostJobInput => ({
  id: "j1", title: "Backend Developer", company: "Acme S.r.l.", location: "Milano", description: LONG,
  remote: false, salaryMin: 40000, salaryMax: 48000, postedAt: daysAgo(3), closedAt: null, source: "greenhouse", ...o,
});

// Normalizzazione
assert.equal(titleIdentityKey("Backend Developer (m/f)"), titleIdentityKey("developer - BACKEND"));
assert.notEqual(titleIdentityKey("Sales Engineer - Milano"), titleIdentityKey("Sales Engineer - Roma"));
assert.equal(normalizeCompany("Acme S.r.l."), normalizeCompany("ACME srl"));
assert.equal(normalizeCompany("Èlite SpA"), "elite");

// Annuncio sano → basso, nessun motivo
{
  const r = scoreGhostJob(base(), [], NOW);
  assert.equal(r.level, "basso");
  assert.deepEqual(r.reasons, []);
  assert.match(ghostSummary(r), /Nessun segnale/);
}

// Annuncio vecchio
{
  const r = scoreGhostJob(base({ postedAt: daysAgo(75) }), [], NOW);
  assert.equal(r.score, 2);
  assert.ok(r.reasons.includes("Pubblicato da 75 giorni"));
  assert.equal(scoreGhostJob(base({ postedAt: daysAgo(40) }), [], NOW).score, 1);
}

// Repost: stesso titolo+azienda in date diverse
{
  const sibs = [
    { id: "j2", title: "backend developer", company: "ACME srl", location: "Milano", postedAt: daysAgo(30) },
    { id: "j3", title: "Developer, Backend", company: "Acme", location: "Milano", postedAt: daysAgo(60), closedAt: daysAgo(35) },
  ];
  const r = scoreGhostJob(base(), sibs, NOW);
  assert.ok(r.reasons.some((x) => x.startsWith("Ripubblicato 2 volte")), r.reasons.join("|"));
  assert.equal(r.score, 3);
  assert.equal(r.level, "medio");
}

// Posizioni parallele nello stesso giorno ≠ repost (span 0); ma 3 identiche aperte = segnale
{
  const sibs = [
    { id: "j2", title: "Backend Developer", company: "Acme", location: "Milano", postedAt: daysAgo(3) },
    { id: "j3", title: "Backend Developer", company: "Acme", location: "Milano", postedAt: daysAgo(3) },
  ];
  const r = scoreGhostJob(base(), sibs, NOW);
  assert.ok(!r.reasons.some((x) => x.startsWith("Ripubblicato")));
  assert.ok(r.reasons.includes("3 annunci identici aperti per la stessa azienda e sede"));
}

// Varianti per città non sono repost
{
  const sibs = [{ id: "j2", title: "Backend Developer Roma", company: "Acme", location: "Roma", postedAt: daysAgo(20) }];
  assert.equal(scoreGhostJob(base(), sibs, NOW).level, "basso");
}

// Repost oltre la finestra di 90 giorni ignorati
{
  const sibs = [{ id: "j2", title: "Backend Developer", company: "Acme", location: "Milano", postedAt: daysAgo(200) }];
  assert.ok(!scoreGhostJob(base(), sibs, NOW).reasons.some((x) => x.startsWith("Ripubblicato")));
}

// Link non più attivo → alto
{
  const r = scoreGhostJob(base({ closedAt: daysAgo(1), salaryMin: null, salaryMax: null }), [], NOW);
  assert.equal(r.level, "alto");
  assert.ok(r.reasons.includes("Il link di candidatura risulta non più attivo"));
}

// Dettagli mancanti + testo generico/talent pool → alto
{
  const r = scoreGhostJob(base({
    salaryMin: null, salaryMax: null, location: null,
    description: "Siamo sempre alla ricerca di talenti per il nostro talent pool! Ambiente giovane e dinamico, forte motivazione.",
  }), [], NOW);
  assert.equal(r.level, "alto");
  for (const x of ["Retribuzione non indicata", "Sede di lavoro non indicata", "Descrizione molto breve", "Linguaggio da candidatura spontanea / talent pool", "Testo generico, con poche informazioni concrete sul ruolo"]) assert.ok(r.reasons.includes(x), x);
}
assert.deepEqual(genericPhraseHits("Fast-paced, self starter, rockstar"), { generic: 3, evergreen: 0 });

// Remoto senza sede non penalizzato
assert.ok(!scoreGhostJob(base({ location: null, remote: true }), [], NOW).reasons.includes("Sede di lavoro non indicata"));

// Fonti con descrizione troncata: lunghezza non valutata, ma dichiarata
{
  const r = scoreGhostJob(base({ source: "linkedin", description: "Short." }), [], NOW);
  assert.ok(!r.reasons.includes("Descrizione molto breve"));
  assert.ok(r.missing.includes("descrizione completa"));
}

// Dati insufficienti: niente data né azienda → nessun punteggio inventato
{
  const r = scoreGhostJob(base({ postedAt: null, company: null }), [], NOW);
  assert.equal(r.level, "dati_insufficienti");
  assert.equal(r.score, null);
  assert.deepEqual(r.missing.slice(0, 2), ["data di pubblicazione", "azienda"]);
}
// Solo data mancante: si valuta comunque, ma lo si dichiara
{
  const r = scoreGhostJob(base({ postedAt: null }), [], NOW);
  assert.equal(r.level, "basso");
  assert.match(ghostSummary(r), /non valutato: data di pubblicazione/);
}

console.log("ghost-job scorer: all tests passed");
