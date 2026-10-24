import { resolveAdapterByUrl, noAdapterMessageFor } from "@/lib/ats-adapter-resolution";
import { applicationsPaused, assertApplicationsRunning } from "@/lib/application-pause";
import { parseScopedApplicationAnswers } from "@/lib/application-question-answers";
import { notSubmitted } from "@/lib/proof-of-send";
import { attestAnswerPause, beginApplicationSubmission, completeApplicationSubmission, NOT_SUBMITTED, reserveApplicationWork, recheckApplicationSubmission } from "@/lib/application-worker-gates";
import { BLANK_FORM_EVIDENCE, STAGED_CHANNELS } from "@/lib/application-answer-continuation";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { getUserInboxAddress } from "@/lib/inbound/service";
import { optimizeCV } from "@/lib/claude";
import {
  generateCoverLetterDocx,
  generateOptimizedCVDocx,
} from "@/lib/docx-generator";
import { saveUserFile, readUserFile } from "@/lib/storage";
import { decryptJson } from "@/lib/crypto";
import { isPortalId, PORTALS } from "@/lib/portals";
import { checkJobUrlLiveness, JOB_CLOSED_HELD_MESSAGE, JOB_LIVENESS_UNKNOWN_HELD_MESSAGE, markJobClosed } from "@/lib/job-liveness";
import {
  extractFullProfile,
  tailorProfileForJob,
} from "@/lib/cv-profile-ai-full";
import { profileToRow, rowToProfile } from "@/lib/cv-profile-types";
import { detectLanguage } from "@/lib/lang-detect";
import { renderCVPdf } from "@/lib/cv-pdf";
import { coverLetterHintsFor } from "@/lib/cover-letter-hints";
import { sendWithinQuota } from "@/lib/email-quota";
import { inboundReplyAddress } from "@/lib/email";
import { alertFounder, isCreditExhaustedError } from "@/lib/founder-alert";
import { humanContext, launchBrowser } from "@/lib/browser";
import { findVerifiedRecruiterEmail } from "@/lib/recruiter-email";
import { sendRecruiterEmailOnce, type RecruiterDeliveryResult } from "@/lib/recruiter-delivery";
import { receiptJobId, hasVerifiedSubmissionReceipt } from "@/lib/submission-receipt";
import { resolveFinalUrl } from "@/lib/resolve-job-url";
import {
  GREENHOUSE_COMPANIES,
  LEVER_COMPANIES,
  ASHBY_COMPANIES,
  WORKABLE_COMPANIES,
  SMARTRECRUITERS_COMPANIES,
} from "@/lib/scrapers/ats-companies";
import { AnalyticsEvent } from "@/lib/analytics";
import { recordConversionEvent } from "@/lib/conversion-events";
import { withAiUsageContext } from "@/lib/ai-usage";

// Set di nomi azienda con board ATS noto (normalizzati). Usato per evitare
// il fallback email verso indirizzi scrapati quando esiste un portale
// ufficiale di candidatura.
const KNOWN_ATS_COMPANY_NAMES = new Set(
  [
    ...GREENHOUSE_COMPANIES,
    ...LEVER_COMPANIES,
    ...ASHBY_COMPANIES,
    ...WORKABLE_COMPANIES,
    ...SMARTRECRUITERS_COMPANIES,
  ].map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "")),
);

function isKnownAtsCompany(company: string | null | undefined): boolean {
  if (!company) return false;
  return KNOWN_ATS_COMPANY_NAMES.has(company.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function applicationDocumentFilename(
  prefix: string,
  jobTitle: string | null | undefined,
  applicationId: string,
  extension: "docx" | "pdf",
): string {
  const role = (jobTitle ?? "posizione")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "posizione";
  return `${prefix}_${role}_${applicationId.slice(-8)}.${extension}`;
}

/**
 * Worker: processa una candidatura fino a consegna al utente.
 *
 * STATI:
 *   queued       → appena creata, in attesa di processing
 *   optimizing   → OpenAI sta ottimizzando CV + cover letter
 *   ready_to_apply → CV+CL generati, utente può cliccare apply sul portale
 *   applying     → Playwright sta tentando submit automatico (solo prod con worker)
 *   success      → candidatura effettivamente inviata sul portale
 *   failed       → errore in qualche fase
 *   needs_session → credenziali portale scadute
 *
 * In MVP (no Playwright worker persistente), il target principale è
 * "ready_to_apply" + email all'utente con i file. L'auto-submit è
 * gated da `AUTO_APPLY_ENABLED=true`.
 */

export async function processApplication(
  applicationId: string,
  opts?: { forceRealSubmit?: boolean; forceDryRun?: boolean },
): Promise<void> {
  // Binds AI token usage of this run to the application (cost per application).
  return withAiUsageContext({ applicationId }, () => processApplicationRun(applicationId, opts));
}

async function processApplicationRun(
  applicationId: string,
  opts?: { forceRealSubmit?: boolean; forceDryRun?: boolean },
): Promise<void> {
  if (applicationsPaused()) return;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: true,
      session: { select: { id: true, title: true, customContext: true } },
      user: {
        include: {
          cvDocuments: { orderBy: { createdAt: "desc" }, take: 1 },
          portalSessions: true,
          preferences: true,
          cvProfile: { select: { linksJson: true } },
        },
      },
    },
  });

  if (!app) {
    console.error(`[worker] Application ${applicationId} non trovata`);
    return;
  }

  // Atomic admission rechecks the current account/round and reserves capacity.
  // All queue backends, including direct invocations, pass through this guard.
  const workToken = await reserveApplicationWork(applicationId);
  if (!workToken) return;
  if (!await ensureLiveJobForApplication(applicationId, workToken, app.job.id, app.job.url)) return;

  const cv = app.user.cvDocuments[0];
  if (!cv) {
    await markFailed(applicationId, "CV utente mancante.", workToken);
    return;
  }

  // Budget AI giornaliero globale: oltre AI_DAILY_APP_BUDGET candidature
  // avviate oggi, le altre restano in coda e vengono riprese tra 20 minuti
  // (o domani). Evita di bruciare crediti AI in una notte.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  // Queue/eligibility backoff timestamps are not AI work and must not consume the budget.
  const startedToday = await prisma.application.count({ where: { startedAt: { gte: dayStart }, status: { not: "queued" }, id: { not: applicationId } } });
  const budget = Number(process.env.AI_DAILY_APP_BUDGET ?? 300);
  if (startedToday >= budget) {
    await prisma.application.updateMany({ where: { id: applicationId, status: "optimizing", startedAt: workToken }, data: { status: "queued", startedAt: new Date() } });
    console.warn(`[worker] budget AI giornaliero raggiunto (${startedToday}/${budget}): ${applicationId} rimandata di 20 min (alza AI_DAILY_APP_BUDGET per cambiare)`);
    return;
  }

  const jobPosting = `${app.job.title}\n${app.job.company ?? ""}\n\n${app.job.description}`;
  const jobLang = detectLanguage(`${app.job.title} ${app.job.description}`);

  let result: Awaited<ReturnType<typeof optimizeCV>>;
  let cvPath: string;
  let clPath: string;
  let cvBuffer: Buffer;
  let clBuffer: Buffer;

  try {
    // 1. OpenAI: ottimizza CV + cover letter per questo job specifico
    const coverLetterHints = coverLetterHintsFor(app.user.email, {
      title: app.job.title,
      category: app.job.category,
    });
    // Se l'utente è in modalità P.IVA/both E l'annuncio sembra freelance,
    // passiamo al modello il contesto commerciale per generare un pitch B2B
    // invece di una classica cover letter motivazionale.
    const prefs = app.user.preferences;
    const empType = prefs?.employmentType ?? "employee";
    const looksFreelance =
      /\b(freelance|freelancer|contract|contractor|p\.?\s?iva|partita\s?iva|consultant|consulente|project-based|ad hoc|short[-\s]?term|6\s?months?|12\s?months?)\b/i.test(
        `${app.job.title} ${app.job.contractType ?? ""} ${app.job.description ?? ""}`.slice(
          0,
          2000,
        ),
      );
    const usePivaPitch =
      empType !== "employee" &&
      (empType === "piva" || looksFreelance) &&
      (prefs?.dailyRate != null ||
        prefs?.availableFrom != null ||
        prefs?.vatNumber != null ||
        prefs?.portfolioUrl != null);

    result = await optimizeCV({
      cvText: cv.extractedText,
      jobPosting,
      jobLang,
      coverLetterHints,
      sessionContext: app.session?.customContext ?? null,
      pivaContext: usePivaPitch
        ? {
            dailyRate: prefs?.dailyRate ?? null,
            availableFrom: prefs?.availableFrom ?? null,
            vatNumber: prefs?.vatNumber ?? null,
            portfolioUrl: prefs?.portfolioUrl ?? null,
            candidateName: app.user.name ?? null,
          }
        : undefined,
    });

    // 2. Genera DOCX — la cover letter contiene un blocco "Get in touch"
    // con multi-link tracciati (portfolio, LinkedIn, GitHub, email) tutti
    // routati via lavorai.it/r/<token>?ref=... Ogni click dal recruiter
    // dentro l'ATS logga viewedAt. Più link = più chance di tracciare
    // una view senza falsi positivi.
    const trackingLinks = computeTrackingLinks(
      app.user.cvProfile?.linksJson ?? null,
    );
    [cvBuffer, clBuffer] = await Promise.all([
      generateOptimizedCVDocx({
        ...result.optimizedCV,
        targetRole: app.job.title,
      }),
      generateCoverLetterDocx(
        result.coverLetter,
        undefined,
        app.trackingToken ?? undefined,
        app.user.locale === "en" ? "en" : "it",
        trackingLinks,
      ),
    ]);

    // 3. Salva DOCX su storage
    cvPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      applicationDocumentFilename("CV", app.job.title, applicationId, "docx"),
      cvBuffer,
    );
    clPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      applicationDocumentFilename("Lettera", app.job.title, applicationId, "docx"),
      clBuffer,
    );
  } catch (err) {
    console.error(`[worker] ${applicationId} AI/generate failed`, err);
    const errMsg = err instanceof Error ? err.message : String(err);
    
    // Blob storage sospeso (116 casi reali): FAIL LOUD con messaggio chiaro
    if (/BLOB_SUSPENDED|suspended|store.*disabled/i.test(errMsg)) {
      await markFailed(
        applicationId,
        "STORAGE SOSPESO: Vercel Blob non disponibile. Configura Supabase Storage nelle impostazioni. Candidatura in coda per retry automatico.",
        workToken,
      );
      await alertFounder(
        "blob_suspended",
        "Vercel Blob sospeso — storage candidature bloccato",
        `Candidatura ${applicationId} fallita: Vercel Blob store sospeso o quota superata.\n\n` +
        `AZIONE IMMEDIATA:\n` +
        `1. Controlla dashboard Vercel Blob → Unsuspend se possibile\n` +
        `2. OPPURE configura Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)\n` +
        `   Il fallover automatico userà Supabase se Blob non disponibile.\n\n` +
        `Errore: ${errMsg}`,
      ).catch(() => void 0);
      return;
    }
    
    // Crediti AI esauriti / quota: è un outage di SISTEMA, non un errore
    // della singola candidatura. Avvisa subito il founder (deduplicato) così
    // non resta in silenzio come è successo dal 12/05.
    if (isCreditExhaustedError(err)) {
      await markFailed(
        applicationId,
        "CREDITI AI ESAURITI: servizio temporaneamente non disponibile. Ricarica crediti OpenAI/Anthropic. Candidatura in coda per retry automatico.",
        workToken,
      );
      await alertFounder(
        "ai_credits",
        "Crediti provider AI esauriti — pipeline candidature ferma",
        `Una candidatura (${applicationId}) è fallita perché i crediti o la quota del provider AI sono esauriti.\n` +
          `OpenAI è il provider primario: controlla il billing su platform.openai.com e l'eventuale fallback Anthropic.\n\n` +
          `Errore grezzo: ${err instanceof Error ? err.message : String(err)}`,
      ).catch(() => void 0);
      return;
    }
    await markFailed(
      applicationId,
      err instanceof Error ? err.message : "Errore generazione CV",
      workToken,
    );
    return;
  }

  // 3b. PDF tailoring (structured CVProfile → tailored → ATS PDF). Non-fatal.
  let cvPdfPath: string | null = null;
  try {
    let profileRow = await prisma.cVProfile.findUnique({
      where: { userId: app.userId },
    });
    if (
      !profileRow ||
      (!profileRow.firstName &&
        !profileRow.lastName &&
        profileRow.experiencesJson === "[]")
    ) {
      const seeded = await extractFullProfile(cv.extractedText);
      const row = profileToRow(seeded);
      profileRow = await prisma.cVProfile.upsert({
        where: { userId: app.userId },
        create: { userId: app.userId, ...row },
        update: row,
      });
    }
    const baseProfile = rowToProfile(profileRow);
    const tailored = await tailorProfileForJob({
      profile: baseProfile,
      jobPosting,
      lang: jobLang,
    });
    let photoBuffer: Buffer | null = null;
    let photoMime: string | undefined;
    if (profileRow.photoPath) {
      try {
        photoBuffer = await readUserFile(profileRow.photoPath);
        photoMime = profileRow.photoPath.endsWith(".png")
          ? "image/png"
          : profileRow.photoPath.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
      } catch {
        photoBuffer = null;
      }
    }
    const pdfBuffer = await renderCVPdf(
      tailored,
      jobLang,
      photoBuffer,
      photoMime,
      app.job.title,
    );
    cvPdfPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      applicationDocumentFilename("CV", app.job.title, applicationId, "pdf"),
      pdfBuffer,
    );
  } catch (err) {
    console.error(`[worker] ${applicationId} PDF tailoring failed`, err);
  }

  // A recovered worker cannot overwrite a newer owner or reach delivery.
  const prepared = await prisma.application.updateMany({
    where: { id: applicationId, status: "optimizing", startedAt: workToken },
    data: {
      status: "ready_to_apply",
      atsScore: result.atsScore,
      suggestionsJson: JSON.stringify(result.suggestions),
      cvDocxPath: cvPath,
      coverLetterPath: clPath,
      coverLetterText: result.coverLetter,
      cvPdfPath,
      cvLanguage: jobLang,
    },
  });

  if (prepared.count !== 1) return;

  // 5. (rimossa) Email "CV pronto" prematura — era fuorviante: usciva
  // PRIMA del tentativo di submit, dando all'utente l'impressione che
  // la candidatura fosse stata inviata. Ora inviamo UNA SOLA email alla
  // fine, con l'esito reale (success / ready_to_apply manuale / failed).

  // 6. DELIVERY — priorità in ordine:
  //    (a) Portal adapter (Greenhouse/Lever/Workable): submit diretto nel form ATS
  //    (b) Email recruiter (scraped dall'annuncio)
  //    (c) Manual: ready_to_apply con istruzioni
  // Default ON: l'invio via form ATS è il cuore del prodotto. Si spegne
  // solo con PORTAL_SUBMIT_ENABLED=false esplicito (prima: acceso solo con
  // "true" → bastava dimenticare la env su Vercel per non avere mai un
  // submit ATS e finire sempre in email/manual).
  const portalSubmitEnabled = process.env.PORTAL_SUBMIT_ENABLED !== "false";
  // Passo 1: risoluzione URL reale
  //   - HTTP redirect follow (funziona per short-URL normali)
  //   - Adzuna wrapper? Serve Playwright per estrarre il vero link
  let resolvedUrl = app.job.url;
  const isAdzuna = /\badzuna\.(it|com|co\.uk|de|fr|es|at|ch|ca)\b/i.test(
    app.job.url,
  );
  if (portalSubmitEnabled && isAdzuna) {
    const viaBrowser = await resolveAdzunaViaBrowser(app.job.url).catch(
      (err) => {
        console.warn(`[worker] ${applicationId} Adzuna resolve failed`, err);
        return null;
      },
    );
    if (viaBrowser && viaBrowser !== app.job.url) {
      resolvedUrl = viaBrowser;
      console.log(
        `[worker] ${applicationId} Adzuna resolved → ${resolvedUrl}`,
      );
    } else {
      console.log(
        `[worker] ${applicationId} Adzuna wrapper non risolvibile — fallback email/manual`,
      );
    }
  } else {
    try {
      resolvedUrl = await resolveFinalUrl(app.job.url);
      if (resolvedUrl !== app.job.url) {
        console.log(
          `[worker] ${applicationId} resolved ${app.job.url} → ${resolvedUrl}`,
        );
      }
    } catch (err) {
      console.warn(`[worker] ${applicationId} URL resolve failed`, err);
    }
  }
  // Recheck after document generation; a formerly live posting may close.
  if (!await ensureLiveJobForApplication(applicationId, workToken, app.job.id, app.job.url)) return;

  const { isContractorMarketplace } = await import("@/lib/portal-adapters/safety-stops");
  if (isContractorMarketplace(resolvedUrl) || isContractorMarketplace(app.job.url)) {
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: workToken, status: { in: ["optimizing", "ready_to_apply", "applying"] } },
      data: {
        status: "failed",
        submitConfirmation: "FAILED:marketplace",
        errorMessage: "Contractor marketplace: we never create accounts on Mercor, Toptal, Upwork or similar. Nothing was sent.",
        completedAt: new Date(),
      },
    });
    return;
  }

  // Prova il match sull'URL canonico (Job.url) PRIMA di quello risolto:
  // alcuni ATS (Greenhouse) redirigono a career page custom dove il form
  // non è raggiungibile. L'URL canonico porta al form puro dell'ATS.
  // Risoluzione per host URL: app.portal è un'etichetta storica e non decide.
  const resolvedAdapter = portalSubmitEnabled ? resolveAdapterByUrl([app.job.url, resolvedUrl]) : null;
  const adapter = resolvedAdapter?.adapter ?? null;
  const adapterUrl = resolvedAdapter?.url ?? app.job.url;
  const { preferredDeliveryChannel } = await import("@/lib/delivery-channel");
  const preferRecruiterEmail = preferredDeliveryChannel(app.job) === "email_recruiter";
  if (preferRecruiterEmail && adapter) {
    console.log(`[worker] ${applicationId} recruiter email present — skipping portal ${adapter.id}, using email_recruiter`);
  }

  if (adapter && !preferRecruiterEmail) {
    const canonicalJobId = receiptJobId(adapter.id, app.job.url);
    if (!canonicalJobId || canonicalJobId !== receiptJobId(adapter.id, adapterUrl)) {
      await prisma.application.updateMany({ where: { id: applicationId, startedAt: workToken, status: "ready_to_apply" }, data: {
        submitConfirmation: NOT_SUBMITTED,
        errorMessage: "Destinazione ATS non correlabile con certezza a questo annuncio. Nessun invio effettuato: verifica il link ufficiale.",
      } });
      return;
    }
    const { parseAnswers } = await import("@/lib/application-answers");
    const userAnswers = parseAnswers(
      (app.user.preferences as { applicationAnswersJson?: string } | null)
        ?.applicationAnswersJson ?? null,
    );
    // A search salary floor is not the candidate's approved application answer.
    // Explicit employer/form answers belong only to this application. Global
    // answer history cannot authorize another employer's terms or declarations.
    const answerRow = await prisma.application.findUnique({
      where: { id: applicationId }, select: { userProvidedAnswersJson: true },
    });
    const storedAnswers = parseScopedApplicationAnswers(answerRow?.userProvidedAnswersJson, applicationId);
    const reusableAnswers = await prisma.userAnswer.findMany({ where: { userId: app.userId, source: "user", answeredAt: { not: null } }, select: { label: true, kind: true, answer: true, source: true, answeredAt: true, optionsJson: true } });
    // Unknown failures may follow an accepted submit. Never retry them or
    // switch to another delivery channel without proof that nothing was sent.
    const outcome = await attemptPortalAdapterSubmit({
      applicationId,
      workToken,
      adapter,
      jobUrl: adapterUrl,
      cvPath,
      clPath,
      coverLetterText: result.coverLetter,
      userId: app.userId,
      userEmail: app.user.email,
      userName: app.user.name,
      answers: userAnswers,
      storedAnswers,
      reusableAnswers,
      userYearsExperience: app.user.yearsExperience,
      userEnglishLevel: app.user.englishLevel,
      userNoticePeriod: app.user.noticePeriod,
      privacyConsentAt: app.user.privacyConsentAt,
      // Unknown facts and declarations always wait for the candidate.
      autonomous: true,
      preferredCity: firstPreferredCity(app.user.preferences?.locationsJson),
      jobLocation: app.job.location,
      protectedCategory: app.user.preferences?.protectedCategory ?? null,
      jobTitle: app.job.title,
      company: app.job.company,
      jobDescription: app.job.description,
      forceRealSubmit: opts?.forceRealSubmit === true,
      forceDryRun: opts?.forceDryRun === true,
    }).catch((err) => {
      console.error(
        `[worker] ${applicationId} adapter ${adapter.id} threw`,
        err,
      );
      return {
        ok: false as const,
        status: "unknown_error" as const,
        error: err instanceof Error ? err.message : "unknown",
      };
    });


    if (!outcome.ok && outcome.status === "worker_gate_blocked") return;

    if (outcome.ok) {
      const isDryRun =
        "confirmation" in outcome && outcome.confirmation === "DRY_RUN";
      const confState =
        "confirmation" in outcome ? outcome.confirmation : "UNKNOWN";

      // CONTRATTO "success": deve esserci prova HARD del submit accettato.
      //   - DETECTED_HTTP_2xx / DETECTED_HTTP_3xx → POST catturata, status
      //     server-confirmed → success.
      //   - DETECTED_DOM     → fallback DOM (thank-you page rilevata).
      //   - DRY_RUN          → branch separato (non success).
      //   - qualsiasi altro  → trattalo come UNCONFIRMED, NON success.
      //
      // Pre-refactor era: "ok:true → success". Ora è: "ok:true E prova
      // di conferma → success". Senza prova, l'application resta in
      // ready_to_apply col messaggio "verifica a mano" e NIENTE email
      // "inviata" mandata all'utente.
      const isConfirmed =
        !isDryRun &&
        typeof confState === "string" &&
        confState.startsWith("DETECTED") &&
        !!outcome.receipt && outcome.receipt.provider === adapter.id;
      const isUnconfirmed = !isDryRun && !isConfirmed;

      console.log(
        `[worker] ${applicationId} adapter ${adapter.id} → submitted (${confState})${isUnconfirmed ? " [UNCONFIRMED — needs review]" : ""}`,
      );
      const now = new Date();
      const completionData = {
        // In dry-run non marchiamo come success.
        // Se UNCONFIRMED, marchiamo come ready_to_apply con messaggio
        // esplicito così l'utente può verificare manualmente.
        status: isDryRun
          ? "ready_to_apply"
          : isUnconfirmed
            ? "ready_to_apply"
            : "success",
        submittedVia:
          isDryRun || isUnconfirmed ? null : `portal_${adapter.id}`,
        completedAt: isDryRun || isUnconfirmed ? null : now,
        // submittedAt REALE: popolato SOLO per invii confermati con prova HARD.
        // Usato per contare giorni senza risposta (ghosting UX onesta).
        submittedAt: !isDryRun && isConfirmed ? now : null,
        // Persistiamo confState (DETECTED/UNCONFIRMED/DRY_RUN) per
        // diagnosi successive — pre-fix non c'era e non possiamo
        // sapere retroattivamente lo stato delle vecchie candidature.
        submitConfirmation: isUnconfirmed ? "UNCONFIRMED" : confState,
        submissionReceiptJson: isConfirmed ? JSON.stringify(outcome.receipt) : null,
        // Proof-of-send: confirmed rows get their proof inside
        // completeApplicationSubmission; anything else is NOT sent.
        ...(isUnconfirmed ? notSubmitted("needs_user", "portal_submit_without_receipt") : {}),
        // Persist canary log se l'adapter l'ha popolato (env CANARY_DEBUG=1).
        // Non sovrascriviamo se outcome.canary è undefined (run normale).
        ...("canary" in outcome && outcome.canary
          ? { canaryLog: JSON.stringify(outcome.canary) }
          : {}),
        errorMessage: isDryRun
          ? `[DRY RUN] Form ${adapter.label} compilato correttamente ma submit non eseguito (PORTAL_SUBMIT_DRY_RUN=true).`
          : isUnconfirmed
            ? `Submit cliccato ma non abbiamo rilevato la pagina di conferma di ${adapter.label}. La candidatura potrebbe non essere stata accettata (validazione silenziosa, captcha, errore modale). Verifica manualmente sul portale.`
            : null,
      };
      if (isConfirmed) {
        if (!await completeApplicationSubmission(applicationId, workToken, completionData)) return;
      } else {
        await prisma.application.updateMany({ where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } }, data: completionData });
      }
      // Solo confirmed (= conferma rilevata davvero) bumpa sessione e
      // manda l'email "candidatura inviata". UNCONFIRMED resta in coda
      // di review, niente email fuorviante.
      if (!isDryRun && !isUnconfirmed) {
        await notifyApplicationSent(applicationId).catch((err) =>
          console.error(`[worker] ${applicationId} notify email failed`, err),
        );
      }
      return; // fatto
    }

    if (["submission_unconfirmed", "unknown_error", "validation_failed", "missing_field"].includes(outcome.status)) {
      await prisma.application.updateMany({ where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } }, data: {
        status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
        errorMessage: outcome.error,
        ...notSubmitted("needs_user", `portal_${outcome.status}`),
        canaryLog: JSON.stringify(("canary" in outcome ? outcome.canary : null) ?? { adapterFailure: outcome.status, error: outcome.error }),
      } });
      return; // A missing receipt is not permission to submit the same application again.
    }

    if (["needs_user_input", "form_not_found", "job_closed"].includes(outcome.status)) {
      await prisma.application.updateMany({ where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } }, data: {
        status: "ready_to_apply", submitConfirmation: NOT_SUBMITTED,
      } });
    }

    // L'adapter ha trovato campi OBBLIGATORI che non sappiamo rispondere:
    // chiediamo all'utente invece di inviare un form incompleto o fingere.
    if (outcome.status === "needs_user_input") {
      const questions = outcome.pendingQuestions ?? [];
      // Persisti le domande come UserAnswer riutilizzabili (answer vuoto).
      const { normalizeLabel } = await import("@/lib/portal-adapters/ai-answer");
      for (const q of questions) {
        const labelKey = normalizeLabel(q.label);
        if (!labelKey) continue;
        await prisma.userAnswer
          .upsert({
            where: { userId_labelKey: { userId: app.userId, labelKey } },
            create: {
              userId: app.userId,
              labelKey,
              label: q.label,
              kind: q.kind,
              optionsJson: q.options ? JSON.stringify(q.options) : null,
            },
            update: {}, // preserve the wording/options originally answered by the user
          })
          .catch((err) =>
            console.error(`[worker] upsert UserAnswer failed`, err),
          );
      }
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply", "needs_answers"] } },
        data: {
          status: "needs_answers",
          submitConfirmation: "NEEDS_ANSWERS",
          pendingQuestionsJson: JSON.stringify(questions),
          errorMessage: `${questions.length} domande del form richiedono la tua risposta. Rispondi per completare questa candidatura dopo i controlli di consenso e validità.`,
          canaryLog:
            "canary" in outcome && outcome.canary
              ? JSON.stringify(outcome.canary)
              : JSON.stringify({
                  needsUserInput: true,
                  aiDebug: "debug" in outcome ? outcome.debug : undefined,
                  questions: questions.map((q) => q.label),
                  at: new Date().toISOString(),
                }),
        },
      });
      await notifyNeedsAnswers(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify needs-answers failed`, err),
      );
      return; // in attesa delle risposte utente
    }

    if (outcome.status === "job_closed") {
      // L'adapter ha visto la pagina "Job not found": chiudi nel pool e non
      // passare al fallback email (nessuna azienda da contattare).
      console.warn(`[worker] ${applicationId} job chiuso rilevato dall'adapter ${adapter.id}: ${app.job.url}`);
      await markJobClosed(app.job.id);
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
        data: {
          status: "failed",
          submitConfirmation: "JOB_CLOSED",
          errorMessage: "Annuncio non più online (chiuso dall'azienda). Nessun invio effettuato.",
          completedAt: new Date(),
        },
      });
      return;
    }

    if (["login_required", "not_eligible", "stuck", "unsafe_permissions", "sso_required", "marketplace", "id_verification", "not_a_job_application"].includes(outcome.status)) {
      const { confirmationForFailureStatus, persistAttemptConfirmation } = await import("@/lib/attempt-outcome");
      const confirmation = persistAttemptConfirmation(confirmationForFailureStatus(outcome.status) ?? `FAILED:${outcome.status}`);
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
        data: {
          status: "failed",
          submitConfirmation: confirmation,
          errorMessage: outcome.error,
          completedAt: new Date(),
        },
      });
      return;
    }

    if (outcome.status === "captcha") {
      // Never a silent skip, in any mode: route to the manual queue + notify.
      const { captchaHandoff } = await import("@/lib/captcha-handoff");
      const handoff = captchaHandoff({ mode: app.user.preferences?.autoApplyMode, company: app.job.company,
        adapterLabel: adapter.label, detail: outcome.error });
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
        data: {
          status: handoff.status,
          submitConfirmation: handoff.submitConfirmation,
          errorMessage: handoff.errorMessage,
          canaryLog: "canary" in outcome && outcome.canary ? JSON.stringify(outcome.canary) : handoff.canaryLog,
        },
      });
      if (handoff.notifyUser) {
        await notifyApplicationManual(applicationId).catch((err) =>
          console.error(`[worker] ${applicationId} notify manual (captcha) failed`, err),
        );
      }
      return; // the user completes captcha + submit by hand
    }

    // se l'adapter non ci è riuscito (form cambiato / captcha / …) proseguiamo
    // al fallback email. Logghiamo l'errore sull'Application per debugging.
    console.warn(
      `[worker] ${applicationId} adapter ${adapter.id} → ${outcome.status}: ${outcome.error}`,
    );
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
      data: {
        errorMessage: `Portal ${adapter.label}: ${outcome.error}`,
        // Persisti SEMPRE il motivo del fallimento adapter in canaryLog (anche
        // senza screenshot): il fallback email sotto sovrascrive errorMessage,
        // quindi senza questo perderemmo la causa reale (diagnostica prod).
        canaryLog:
          "canary" in outcome && outcome.canary
            ? JSON.stringify(outcome.canary)
            : JSON.stringify({
                adapterFailure: outcome.status,
                error: outcome.error,
                at: new Date().toISOString(),
              }),
      },
    });
  }

  // Guardia anti-email-sbagliata: se l'azienda ha un board ATS noto
  // (Greenhouse/Lever/Workable/...), NON facciamo il fallback email a un
  // indirizzo scrapato (spesso caselle sbagliate). Preferiamo l'invio sul
  // portale ufficiale. Se nel pool esiste già una copia ATS dello stesso
  // job (diversa dall'aggregatore Adzuna), puntiamo l'utente lì in manuale;
  // al prossimo ciclo l'auto-apply userà direttamente quella copia.
  if (!app.job.recruiterEmail && isKnownAtsCompany(app.job.company)) {
    const ATS_SOURCES = ["greenhouse", "lever", "workable", "ashby", "smartrecruiters", "recruitee", "personio", "teamtailor", "bamboohr", "breezy", "pinpoint"];
    const isAtsSourceJob = ATS_SOURCES.includes(app.job.source);

    if (isAtsSourceJob) {
      // Questo job È GIÀ da sorgente ATS ma l'adapter non ha confermato il
      // submit (form cambiato, campo mancante, ecc.). NON mandiamo a email
      // scrapate: marchiamo failed così viene ritentato al ciclo successivo.
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
        data: {
          status: "failed",
          errorMessage:
            `Submit sul portale ${app.job.source} non confermato (form cambiato o campo mancante). ` +
            `Esito da verificare prima di un altro tentativo.`,
          completedAt: new Date(),
        },
      });
      return;
    }

    // Copia da AGGREGATORE (Adzuna/other) di un'azienda con ATS noto:
    // esiste una copia ATS diretta nel pool → puntiamo lì invece di
    // mandare a una casella scrapata sbagliata.
    const atsAlt = await prisma.job.findFirst({
      where: {
        company: app.job.company,
        title: app.job.title,
        source: { in: ATS_SOURCES },
        id: { not: app.job.id },
      },
      select: { url: true },
      orderBy: { cachedAt: "desc" },
    });
    const officialUrl = atsAlt?.url ?? resolvedUrl;
    // In "auto" niente handoff manuale: skip silenzioso, il cron pescherà
    // la copia ATS diretta al prossimo ciclo. In hybrid/manual l'handoff ok.
    const mode = app.user.preferences?.autoApplyMode ?? "manual";
    const handoff = mode !== "auto";
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
      data: {
        status: "ready_to_apply",
        submittedVia: null,
        errorMessage: handoff
          ? `${app.job.company} usa un sistema di candidatura ufficiale (ATS). ` +
            `Per non mandare la candidatura a una casella sbagliata, candidati dal portale: ${officialUrl} — CV e lettera sono pronti.`
          : `Skippato in auto: copia da aggregatore di ${app.job.company}. ` +
            `L'auto-apply userà la copia ATS diretta al prossimo ciclo.`,
        completedAt: new Date(),
      },
    });
    if (handoff) {
      await notifyApplicationManual(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify manual (ats-known) failed`, err),
      );
    }
    return;
  }

  // A cached address or DNS record is not provenance. Verify a fresh
  // recruiting instruction on the employer's actual job page every time.
  const verifiedRecruiter = await findVerifiedRecruiterEmail(resolvedUrl, app.job.company, app.job.recruiterEmail);
  const recruiterEmail = verifiedRecruiter?.email ?? null;

  if (recruiterEmail) {
    const appRow = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { trackingToken: true },
    });
    const trackingToken = appRow?.trackingToken ?? null;
    if (!await beginApplicationSubmission(applicationId, workToken, undefined, "email_recruiter")) return;
    const delivered = await deliverApplicationToRecruiter({
      applicationId,
      attemptKey: `application-${applicationId}-${workToken.getTime()}`,
      recipientProvenanceJson: JSON.stringify(verifiedRecruiter),
      beforeSend: () => recheckBeforePortalSubmit(applicationId, workToken, resolvedUrl, "email_recruiter"),
      to: recruiterEmail,
      replyTo: app.user.email,
      userName: app.user.name,
      job: app.job,
      cvBuffer,
      clBuffer,
      cvPdfPath,
      cvLanguage: jobLang,
      coverLetterText: result.coverLetter,
      trackingToken,
    }).catch((err) => {
      console.error(`[worker] ${applicationId} recruiter delivery state unavailable`);
      return { kind: "uncertain", attemptId: null } as RecruiterDeliveryResult;
    });

    if (delivered.kind === "accepted") {
      const now = new Date();
      if (!await completeApplicationSubmission(applicationId, workToken, {
          status: "success",
          submittedVia: "email_recruiter",
          completedAt: now,
          // API acceptance is recorded separately from delivery webhooks.
          submittedAt: now,
          submitConfirmation: "EMAIL_SENT",
      })) return;
      await notifyApplicationSent(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify email failed`, err),
      );
    } else {
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken,
          ...(delivered.kind === "not_sent" ? {
            // The final pre-send gate may already have held the row. This
            // invocation proved it never crossed the provider boundary; only
            // this exact token with no accepted email may release that fence.
            status: { in: ["applying", "ready_to_apply"] },
            submitConfirmation: { in: ["SUBMISSION_STARTED", "UNCONFIRMED"] },
            emailAttempts: { none: { providerEmailId: { not: null } } },
          } : { status: "applying", submitConfirmation: "SUBMISSION_STARTED" }),
        },
        data: {
          status: "ready_to_apply",
          submitConfirmation: delivered.kind === "not_sent" ? NOT_SUBMITTED : "UNCONFIRMED",
          ...(delivered.kind === "not_sent"
            ? notSubmitted("failed", "recruiter_email_not_sent")
            : notSubmitted("needs_user", "recruiter_email_acceptance_unknown")),
          errorMessage: delivered.kind === "not_sent"
            ? "Email non inviata: canale non disponibile, quota o richiesta rifiutata. Nessun invio effettuato."
            : "Esito email non confermato. Verifica la consegna prima di ritentare per evitare un doppio invio.",
          completedAt: new Date(),
        },
      });
    }
  } else {
    // Nessuna email del recruiter trovata nell'annuncio → fallback: se
    // AUTO_APPLY_ENABLED + portal session → prova Playwright; altrimenti
    // resta ready_to_apply con errorMessage esplicito.
    if (process.env.AUTO_APPLY_ENABLED === "true") {
      await attemptAutoSubmit({
        applicationId,
        workToken,
        portal: app.portal,
        jobUrl: app.job.url,
        portalSubmitEnabled,
        userSessions: app.user.portalSessions,
        cvPath,
        clPath,
        jobTitle: app.job.title,
      });
    } else {
      // Nessuna email recruiter, adapter fallito o non disponibile → stato
      // Nessuna email recruiter, adapter fallito o non disponibile.
      // Comportamento per modalità:
      //   - hybrid/manual → ready_to_apply + email "candidati in 1 click"
      //   - auto         → awaiting_consent (visibile su /applications con
      //                     bottone Consenti) invece di ready_to_apply,
      //                     così l'utente Pro/paying vede materiale REALE
      //                     su cui agire, non solo un elenco muto.
      const userAutoMode = app.user.preferences?.autoApplyMode ?? "manual";
      const isAutoMode = userAutoMode === "auto";
      await prisma.application.updateMany({
        where: { id: applicationId, startedAt: workToken, status: { in: ["applying", "ready_to_apply"] } },
        data: {
          status: isAutoMode ? "awaiting_consent" : "ready_to_apply",
          errorMessage: isAutoMode
            ? "Fonte senza email recruiter accessibile. CV e lettera pronti — approva l'invio manuale dalla tua dashboard."
            : "Non siamo riusciti a trovare l'email del recruiter in questo annuncio. Apri il link e invia manualmente — CV e lettera sono pronti.",
          completedAt: new Date(),
        },
      });
      if (!isAutoMode) {
        await notifyApplicationManual(applicationId).catch((err) =>
          console.error(`[worker] ${applicationId} notify manual failed`, err),
        );
      } else {
        console.log(
          `[worker] ${applicationId} → awaiting_consent (auto mode, no recruiter email; user will approve on /applications)`,
        );
      }
    }
  }
}

async function markFailed(id: string, message: string, workToken: Date): Promise<void> {
  await prisma.application.updateMany({
    where: { id, status: "optimizing", startedAt: workToken },
    data: {
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    },
  });
}

async function ensureLiveJobForApplication(id: string, token: Date, jobId: string, url: string): Promise<boolean> {
  const check = await checkJobUrlLiveness(url);
  if (check.state === "live") return true;
  if (check.state === "closed") await markJobClosed(jobId);
  await prisma.application.updateMany({
    where: { id, startedAt: token, status: { in: ["optimizing", "ready_to_apply"] },
      OR: [{ submitConfirmation: null }, { submitConfirmation: { in: [NOT_SUBMITTED, "DRY_RUN", "JOB_CLOSED"] } }] },
    data: {
      status: check.state === "closed" ? "failed" : "queued",
      submitConfirmation: check.state === "closed" ? "JOB_CLOSED" : NOT_SUBMITTED,
      startedAt: new Date(),
      completedAt: check.state === "closed" ? new Date() : null,
      errorMessage: check.state === "closed"
        ? JOB_CLOSED_HELD_MESSAGE
        : JOB_LIVENESS_UNKNOWN_HELD_MESSAGE,
    },
  });
  return false;
}

// ---------- Email delivery ----------

async function sendApplicationEmail(input: {
  to: string;
  userName: string | null;
  job: { title: string; company: string | null; url: string };
  cvBuffer: Buffer;
  clBuffer: Buffer;
  atsScore: number;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n\n📧 [app-email DEV] Avrei inviato a ${input.to} — CV+CL per "${input.job.title}" @ ${input.job.company ?? "—"}\n\n`,
      );
      return;
    }
    console.error("[worker] RESEND_API_KEY mancante, email non inviata");
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
  const firstName = (input.userName ?? "").split(/\s+/)[0] || "";
  const company = input.job.company ?? "l'azienda";

  await sendWithinQuota("cv_ready", input.to, async () => {
    await resend.emails.send({
      from,
      to: input.to,
      subject: `CV pronto per "${input.job.title}" — ${company}`,
      html: renderEmail({
        firstName,
        jobTitle: input.job.title,
        company,
        jobUrl: input.job.url,
        atsScore: input.atsScore,
      }),
      text: `Ciao ${firstName},\n\nIl tuo CV ottimizzato per "${input.job.title}" è pronto. ATS score: ${input.atsScore}/100.\n\nIn allegato trovi CV + lettera motivazionale già adattati.\nApri l'annuncio: ${input.job.url}\n\n— LavorAI`,
      attachments: [
        { filename: "CV_Ottimizzato.docx", content: input.cvBuffer },
        { filename: "Lettera_Motivazionale.docx", content: input.clBuffer },
      ],
    });
  });
}

function renderEmail(data: {
  firstName: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  atsScore: number;
}): string {
  return `<!doctype html>
<html lang="it"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">CV pronto${data.firstName ? `, ${data.firstName}` : ""} 🎯</h1>
    <p style="font-size:15px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      Il tuo CV e la lettera motivazionale sono stati adattati per:
    </p>
    <div style="padding:16px 18px;border:1px solid #E6E4DD;border-radius:8px;margin-bottom:20px;">
      <div style="font-weight:600;font-size:15px;">${escapeHtml(data.jobTitle)}</div>
      <div style="font-size:13px;color:#5B5D61;margin-top:2px;">${escapeHtml(data.company)}</div>
      <div style="margin-top:10px;font-size:12.5px;color:#5B5D61;">
        <strong style="color:#0F1012;">ATS score: ${data.atsScore}/100</strong> · compatibile con filtri automatici
      </div>
    </div>
    <p style="font-size:14px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      Trovi entrambi i file allegati a questa email (DOCX). Apri l'annuncio e candidati — i file sono già ottimizzati per questo ruolo specifico.
    </p>
    <a href="${data.jobUrl}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">Apri annuncio →</a>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      Vuoi che candidiamo noi in automatico? L'auto-apply su portali è in arrivo.<br/>
      Hai domande? Rispondi a questa email.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- Playwright auto-submit (feature-flagged) ----------

interface AutoSubmitInput {
  applicationId: string;
  workToken: Date;
  portal: string;
  jobUrl: string;
  userSessions: Array<{
    portal: string;
    encryptedCookies: string;
    userAgent: string;
  }>;
  cvPath: string;
  clPath: string;
  jobTitle: string;
  portalSubmitEnabled?: boolean;
}

async function attemptAutoSubmit(input: AutoSubmitInput): Promise<void> {
  assertApplicationsRunning();
  const { applicationId, portal, jobUrl } = input;

  // Job mock/demo ESPLICITO: solo URL di sviluppo (example.com/org).
  // NON facciamo più fake-success su job reali con portale sconosciuto
  // — lasciamo ready_to_apply con messaggio chiaro.
  const isMockOrDemo =
    jobUrl.includes("example.com") || jobUrl.includes("example.org");
  if (isMockOrDemo) {
    await prisma.application.updateMany({ where: {
      id: applicationId, startedAt: input.workToken, status: "ready_to_apply",
    }, data: {
      status: "ready_to_apply", submitConfirmation: "DRY_RUN",
      errorMessage: "Demo: nessuna candidatura inviata.",
    } });
    return;
  }

  // Portal sconosciuto (non nei nostri adapter né in infojobs): no-op,
  // lascio ready_to_apply con errorMessage esplicito. Niente email
  // "candidati a mano" se l'utente è in auto mode (vedi gate sotto).
  if (!isPortalId(portal)) {
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: input.workToken, status: "ready_to_apply" },
      data: {
        status: "ready_to_apply",
        // ATS supportato per host (adapter non riuscito/disattivato) ≠ portale non supportato.
        errorMessage: noAdapterMessageFor(jobUrl, { portalSubmitEnabled: input.portalSubmitEnabled ?? true }),
        completedAt: new Date(),
      },
    });
    // Gate email "candidati a mano": solo se l'utente NON è in auto mode.
    // In attemptAutoSubmit non abbiamo `app` in scope → query targeted
    // sulla relazione user → preferences.
    const appForMode = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { user: { select: { preferences: { select: { autoApplyMode: true } } } } },
    });
    const userAutoMode =
      appForMode?.user?.preferences?.autoApplyMode ?? "manual";
    if (userAutoMode !== "auto") {
      await notifyApplicationManual(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify manual failed`, err),
      );
    } else {
      console.log(
        `[worker] ${applicationId} suppressed manual-apply email (user in auto mode, portal not supported)`,
      );
    }
    return;
  }

  const cfg = PORTALS[portal];
  const session = input.userSessions.find((s) => s.portal === portal);
  if (!session) {
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: input.workToken, status: "ready_to_apply" },
      data: {
        status: "needs_session",
        errorMessage: `Collega prima il portale ${cfg.label}.`,
        completedAt: new Date(),
      },
    });
    return;
  }

  if (!await beginApplicationSubmission(applicationId, input.workToken, undefined, "playwright_portal")) return;
  let browser: import("playwright").Browser | undefined;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      userAgent: session.userAgent,
      locale: "it-IT",
      timezoneId: "Europe/Rome",
    });

    const cookies = decryptJson<Parameters<typeof context.addCookies>[0]>(
      session.encryptedCookies,
    );
    await context.addCookies(cookies);

    const page = await context.newPage();
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Per Playwright serve il file sul filesystem locale. Se storage è remoto
    // (Supabase), lo scaricare temporaneamente.
    const localCvPath = await ensureLocalPath(
      input.cvPath,
      applicationDocumentFilename("CV", input.jobTitle, applicationId, "docx"),
    );

    const applied = await portalSubmitStrategy(portal, page, {
      localCvPath,
      jobUrl,
      beforeSubmit: () => recheckBeforePortalSubmit(applicationId, input.workToken, jobUrl, "playwright_portal"),
    });

    // The legacy strategy only reports a click, not a server receipt. It
    // cannot release a slot as confirmed success or be retried automatically.
    await prisma.application.updateMany({ where: { id: applicationId, startedAt: input.workToken, status: "applying", submitConfirmation: "SUBMISSION_STARTED" }, data: {
      status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
      errorMessage: applied.error ?? "Submit eseguito senza ricevuta verificata. Verifica sul portale prima di ritentare.",
    } });
  } catch (err) {
    console.error(`[worker/${portal}] playwright error`, err);
    await prisma.application.updateMany({
      where: { id: applicationId, startedAt: input.workToken, status: "applying", submitConfirmation: "SUBMISSION_STARTED" },
      data: {
        status: "ready_to_apply",
        submitConfirmation: "UNCONFIRMED",
        errorMessage: err instanceof Error ? err.message : "Playwright errore",
        completedAt: new Date(),
      },
    });
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}

async function ensureLocalPath(
  storagePath: string,
  localFilename: string,
): Promise<string> {
  // Se è già un path fs locale (dev), usa direttamente
  if (storagePath.startsWith("/") || storagePath.match(/^[A-Z]:[\\/]/i)) {
    return storagePath;
  }
  // Altrimenti download dal remote storage a tmp
  const { tmpdir } = await import("node:os");
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const buffer = await readUserFile(storagePath);
  const localPath = join(tmpdir(), `${Date.now()}-${localFilename}`);
  await writeFile(localPath, buffer);
  return localPath;
}

async function recheckBeforePortalSubmit(applicationId: string, workToken: Date, jobUrl: string, channel: string, boundary: "final_submit" | "candidate_data" | "verification_submit" = "final_submit"): Promise<boolean> {
  const live = await checkJobUrlLiveness(jobUrl);
  if (live.state !== "live") {
    if (live.state === "closed") {
      const row = await prisma.application.findUnique({ where: { id: applicationId }, select: { jobId: true } });
      if (row) await markJobClosed(row.jobId);
    }
    await prisma.application.updateMany({ where: {
      id: applicationId, startedAt: workToken, status: "applying", submitConfirmation: "SUBMISSION_STARTED",
    }, data: {
      status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
      errorMessage: live.state === "closed"
        ? "Annuncio chiuso durante la compilazione. Invio finale fermato; verifica eventuali dati già trasmessi prima di ritentare."
        : "Disponibilità dell'annuncio non verificabile durante la compilazione. Invio finale fermato, senza nuovo tentativo automatico.",
    } });
    return false;
  }
  return recheckApplicationSubmission(applicationId, workToken, undefined, channel, boundary);
}

async function portalSubmitStrategy(
  portal: string,
  page: import("playwright").Page,
  input: { localCvPath: string; jobUrl: string; beforeSubmit: () => Promise<boolean> },
): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (portal === "infojobs") {
    const applyButton = page.locator(
      'button:has-text("Candidati"), a:has-text("Candidati"), [data-automation="apply-button"]',
    );
    if ((await applyButton.count()) === 0) {
      return {
        ok: false,
        error: "Bottone 'Candidati' non trovato — selector da aggiornare.",
      };
    }
    // Some portals submit immediately on the first button, so guard both clicks.
    if (!await input.beforeSubmit()) return { ok: false, error: "Invio fermato dai controlli attuali." };
    await applyButton.first().click();
    const fileInput = page.locator('input[type="file"]');
    if ((await fileInput.count()) > 0) {
      await fileInput.first().setInputFiles(input.localCvPath);
    }
    const submitButton = page.locator(
      'button[type="submit"], button:has-text("Invia candidatura"), button:has-text("Invia")',
    );
    if ((await submitButton.count()) > 0) {
      if (!await input.beforeSubmit()) return { ok: false, error: "Invio finale fermato dai controlli attuali." };
      await submitButton.first().click();
      await page.waitForTimeout(3000);
    }
    return { ok: true };
  }

  return {
    ok: false,
    error: `Auto-submit per ${portal} non ancora implementato. Apri il link e candidati manualmente — i file sono pronti.`,
  };
}

// ---------- Notifica utente: candidatura consegnata ----------

/**
 * Livello di consegna comunicato all'utente — onesto sul grado di prova:
 *  - "confirmed": submit sul portale ATS con conferma rilevata (DETECTED)
 *  - "portal":    submit sul portale ma senza conferma chiara (UNCONFIRMED)
 *  - "email":     inviata via email al recruiter (nessuna conferma ATS)
 */
type DeliveryLevel = "confirmed" | "portal" | "email";

function deliveryLevelOf(
  submittedVia: string | null,
  submissionReceiptJson: string | null,
): DeliveryLevel {
  if (submittedVia === "email_recruiter") return "email";
  return hasVerifiedSubmissionReceipt(submissionReceiptJson, submittedVia) ? "confirmed" : "portal";
}

/**
 * Anti-spam: verifica se abbiamo mandato un'email dello stesso tipo
 * all'utente nelle ultime N ore. Prima di questa gate, un burst di 15
 * candidature in 2 minuti causava 15 email consecutive → utente
 * cancellava l'account (case reale Giuseppe 08/08).
 *
 * Con la gate + daily_summary (che manda un digest onesto giornaliero),
 * l'utente riceve al massimo 1 email individuale per tipo/6h + 1 report.
 */
async function shouldSuppressForCooldown(
  email: string,
  kind: string,
  cooldownHours: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - cooldownHours * 3600_000);
    const recent = await prisma.emailLog.count({
      where: { to: email, kind, createdAt: { gte: since } },
    });
    return recent > 0;
  } catch {
    return false; // in caso di errore DB, non blocchiamo (fail-open)
  }
}

async function notifyApplicationSent(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { title: true, company: true, url: true } },
      user: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!app) return;

  await recordConversionEvent(AnalyticsEvent.FIRST_APPLICATION_DELIVERED, {
    userId: app.userId,
    path: "/applications",
    properties: {
      channel: app.submittedVia ?? "unknown",
      confirmation: app.submitConfirmation ?? "unknown",
    },
    dedupeKey: `first_application_delivered:${app.userId}`,
  });

  // Cooldown 2h: burst di N success in pochi minuti = 1 sola email
  // individuale; le successive vengono raccolte dal daily_summary. Case
  // reale Giuseppe: 15 success in 2 min → 15 email → churn.
  if (await shouldSuppressForCooldown(app.user.email, "application_sent", 2)) {
    console.log(
      `[worker] ${applicationId} suppressed application_sent (cooldown 2h — daily_summary catch-up)`,
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const firstName = (app.user.name ?? "").split(/\s+/)[0] || "";
  const company = app.job.company ?? "l'azienda";
  const jobTitle = app.job.title;
  const jobUrl = app.job.url;
  const level = deliveryLevelOf(app.submittedVia, app.submissionReceiptJson);

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n📧 [sent-email DEV] Avrei avvisato ${app.user.email} — candidatura "${jobTitle}" @ ${company} (livello: ${level})\n`,
      );
    }
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";

  const locale = app.user.locale === "en" ? "en" : "it";
  const en = locale === "en";

  // Oggetto + testo onesti per livello. Niente "✓ consegnata" se non
  // abbiamo conferma reale.
  const subject =
    level === "confirmed"
      ? en
        ? `Application submitted to ${company} ✓`
        : `Candidatura inviata a ${company} ✓`
      : level === "portal"
        ? en
          ? `Application outcome to verify: ${company}`
          : `Esito candidatura da verificare: ${company}`
        : en
          ? `Application emailed to ${company}`
          : `Candidatura inviata via email a ${company}`;

  const textBody = en
    ? `Hi ${firstName},\n\n${
        level === "confirmed"
          ? `Your application for "${jobTitle}" was submitted to ${company} and we detected a confirmation.`
          : level === "portal"
            ? `We could not verify the outcome of your application for "${jobTitle}" at ${company}. Check the portal or its email before submitting again.`
            : `We emailed your application for "${jobTitle}" to ${company}'s recruiting address. Provider acceptance does not confirm delivery or a recruiter response. Track this application before considering another submission.`
      }\n\nJob link: ${jobUrl}\n\n— LavorAI`
    : `Ciao ${firstName},\n\n${
        level === "confirmed"
          ? `La tua candidatura per "${jobTitle}" è stata inviata a ${company} e abbiamo rilevato una conferma.`
          : level === "portal"
            ? `Non abbiamo potuto verificare l'esito della candidatura per "${jobTitle}" a ${company}. Controlla il portale o le sue email prima di inviare di nuovo.`
            : `Abbiamo inviato la tua candidatura per "${jobTitle}" via email all'indirizzo di recruiting di ${company}. L'accettazione del provider non conferma la consegna o una risposta del recruiter. Controlla questo invio prima di candidarti di nuovo.`
      }\n\nLink annuncio: ${jobUrl}\n\n— LavorAI`;

  await sendWithinQuota("application_sent", app.user.email, async () => {
    await resend.emails.send({
      from,
      to: app.user.email,
      subject,
      html: renderSentEmail({ firstName, jobTitle, company, jobUrl, locale, level }),
      text: textBody,
    });
  });
}

function renderSentEmail(data: {
  firstName: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  locale: "it" | "en";
  level: DeliveryLevel;
}): string {
  const checkmark = data.level === "confirmed" ? " ✓" : "";
  const m =
    data.locale === "en"
      ? {
          title: `${
            data.level === "email" ? "Application emailed" : data.level === "confirmed" ? "Application submitted" : "Application outcome to verify"
          }${data.firstName ? `, ${data.firstName}` : ""}${checkmark}`,
          delivered:
            data.level === "confirmed"
              ? "We submitted your application — confirmation detected:"
              : data.level === "portal"
                ? "The portal outcome could not be verified:"
                : "We emailed your application to the recruiting address:",
          updates:
            data.level === "email"
              ? "Track delivery and replies from your dashboard. Verify the existing application before submitting again to avoid duplicates."
              : "Track verified delivery evidence and received replies in your dashboard. A recruiter response is never guaranteed.",
          openCta: "Open job →",
          dashboardHint: "View all your applications at lavorai.it/applications",
          questions: "Questions? Just reply to this email.",
        }
      : {
          title: `${
            data.level === "email" ? "Candidatura inviata via email" : data.level === "confirmed" ? "Candidatura inviata" : "Esito candidatura da verificare"
          }${data.firstName ? `, ${data.firstName}` : ""}${checkmark}`,
          delivered:
            data.level === "confirmed"
              ? "Abbiamo inviato la tua candidatura — conferma rilevata:"
              : data.level === "portal"
                ? "L'esito sul portale non è verificato:"
                : "Abbiamo inviato la candidatura via email all'indirizzo di recruiting:",
          updates:
            data.level === "email"
              ? "Monitora consegna e risposte dalla dashboard. Verifica la candidatura esistente prima di inviarla di nuovo, per evitare duplicati."
              : "Monitora le prove di invio e le risposte ricevute nella dashboard. La risposta di un recruiter non è garantita.",
          openCta: "Apri annuncio →",
          dashboardHint:
            "Vedrai tutte le candidature su lavorai.it/applications",
          questions: "Hai domande? Rispondi a questa email.",
        };
  return `<!doctype html>
<html lang="${data.locale}"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">${m.title}</h1>
    <p style="font-size:15px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      ${m.delivered}
    </p>
    <div style="padding:16px 18px;border:1px solid #E6E4DD;border-radius:8px;margin-bottom:20px;">
      <div style="font-weight:600;font-size:15px;">${escapeHtml(data.jobTitle)}</div>
      <div style="font-size:13px;color:#5B5D61;margin-top:2px;">${escapeHtml(data.company)}</div>
    </div>
    <p style="font-size:14px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      ${m.updates}
    </p>
    <a href="${data.jobUrl}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">${m.openCta}</a>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      ${m.dashboardHint}<br/>
      ${m.questions}
    </p>
  </div>
</body></html>`;
}

/**
 * Notifica all'utente che la candidatura NON è stata inviata in
 * automatico (career page custom, no recruiter email, ecc) — il CV
 * è pronto, deve cliccare il link e candidarsi a mano.
 *
 * Una sola email per applicationId. Ha priorità sull'email "CV pronto"
 * (che ora è rimossa dal flusso).
 */
async function notifyApplicationManual(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { title: true, company: true, url: true } },
      user: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!app) return;

  // Cooldown 6h: burst di 15 candidature "candidati a mano" in 2 minuti
  // ha causato la cancellazione di Giuseppe (case reale 08/08). Con la
  // gate + daily_summary onesto (che elenca TUTTE le "preparate"),
  // l'utente riceve al massimo 1 email individuale ogni 6h.
  if (await shouldSuppressForCooldown(app.user.email, "application_manual", 6)) {
    console.log(
      `[worker] ${applicationId} suppressed application_manual (cooldown 6h — user has already received one recently; daily_summary will include this)`,
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const firstName = (app.user.name ?? "").split(/\s+/)[0] || "";
  const company = app.job.company ?? "l'azienda";
  const jobTitle = app.job.title;
  const jobUrl = app.job.url;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n📧 [manual-email DEV] Avrei avvisato ${app.user.email} — candidatura per "${jobTitle}" pronta, manuale\n`,
      );
    }
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";

  const locale = app.user.locale === "en" ? "en" : "it";
  const subject =
    locale === "en"
      ? `📄 CV ready for ${company} — apply manually (1 click)`
      : `📄 CV pronto per ${company} — candidati a mano (1 click)`;
  const textBody =
    locale === "en"
      ? `Hi ${firstName},\n\nYour CV for "${jobTitle}" at ${company} is ready, but I couldn't submit it automatically (custom career page or non-standard form).\n\nOpen the job and click "Apply" — the files are already attached: ${jobUrl}\n\n— LavorAI`
      : `Ciao ${firstName},\n\nIl tuo CV per "${jobTitle}" presso ${company} è pronto, ma non sono riuscito a inviarlo in automatico (career page custom o form non standard).\n\nApri l'annuncio e clicca "Apply" — i file sono già allegati: ${jobUrl}\n\n— LavorAI`;

  await sendWithinQuota("application_manual", app.user.email, async () => {
    await resend.emails.send({
      from,
      to: app.user.email,
      subject,
      html: renderManualEmail({ firstName, jobTitle, company, jobUrl, locale }),
      text: textBody,
    });
  });
}

/**
 * Avvisa l'utente che una candidatura richiede risposte a domande del form
 * prima di poter essere inviata. Lo manda a /questions.
 */
async function notifyNeedsAnswers(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { title: true, company: true } },
      user: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!app) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const firstName = (app.user.name ?? "").split(/\s+/)[0] || "";
  const company = app.job.company ?? "l'azienda";
  const jobTitle = app.job.title;
  const locale = app.user.locale === "en" ? "en" : "it";
  const url = `${siteUrl}/questions`;

  const subject =
    locale === "en"
      ? `❓ A few questions to finish applying at ${company}`
      : `❓ Poche domande per completare la candidatura a ${company}`;
  const text =
    locale === "en"
      ? `Hi ${firstName},\n\nThe application for "${jobTitle}" at ${company} has a few required questions only you can answer (e.g. work authorization, screening questions).\n\nAnswer them once here and we'll submit automatically (and reuse your answers next time): ${url}\n\n— LavorAI`
      : `Ciao ${firstName},\n\nLa candidatura per "${jobTitle}" presso ${company} ha alcune domande obbligatorie a cui solo tu puoi rispondere (es. diritto al lavoro, domande di screening).\n\nRispondi una volta qui e inviamo in automatico (e riusiamo le risposte la prossima volta): ${url}\n\n— LavorAI`;

  await sendWithinQuota("application_manual", app.user.email, async () => {
    await resend.emails.send({
      from,
      to: app.user.email,
      subject,
      text,
      html: `<!doctype html><html lang="${locale}"><body style="font-family:-apple-system,Inter,sans-serif;color:#0F172A;max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="font-size:20px;font-weight:700;margin-bottom:20px;">Lavor<span style="color:#16A34A;">AI</span></div>
  <h1 style="font-size:20px;margin:0 0 10px;">${locale === "en" ? "A few quick questions" : "Poche domande veloci"}</h1>
  <p style="font-size:15px;line-height:1.6;color:#334155;">${locale === "en" ? `The application for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(company)}</strong> has required questions only you can answer.` : `La candidatura per <strong>${escapeHtml(jobTitle)}</strong> presso <strong>${escapeHtml(company)}</strong> ha domande obbligatorie a cui solo tu puoi rispondere.`}</p>
  <p style="font-size:15px;line-height:1.6;color:#334155;">${locale === "en" ? "We reuse explicit facts when they agree. Review declarations for this application. Saving does not send it: confirm continuation separately when a safe pre-submission pause is verified." : "Riutilizziamo i fatti espliciti quando concordano. Verifica le dichiarazioni per questa candidatura. Salvare non invia: conferma la ripresa separatamente quando la pausa prima dell’invio è verificata."}</p>
  <div style="text-align:center;margin:28px 0;"><a href="${url}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;">${locale === "en" ? "Answer the questions" : "Rispondi alle domande"}</a></div>
</body></html>`,
    });
  });
}

function renderManualEmail(data: {
  firstName: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  locale: "it" | "en";
}): string {
  const m =
    data.locale === "en"
      ? {
          title: `CV ready${data.firstName ? `, ${data.firstName}` : ""} 📄`,
          intro:
            "I couldn't submit the application automatically — this listing uses a custom career page I can't handle. But the CV and cover letter are ready.",
          instruction:
            'Open the job, click <strong>Apply</strong>, and upload the files you\'ll find in the Materials section of your dashboard.',
          cta: "Open job →",
          dashboardHint:
            "All application files are saved at lavorai.it/applications",
          questions: "Questions? Just reply to this email.",
        }
      : {
          title: `CV pronto${data.firstName ? `, ${data.firstName}` : ""} 📄`,
          intro:
            "Non sono riuscito a inviare la candidatura in automatico — questo annuncio usa una career page custom che non gestisco. Ma il CV e la lettera sono pronti.",
          instruction:
            "Apri l'annuncio, clicca <strong>Apply</strong>, e carica i file che trovi sulla tua dashboard nella sezione Materiali.",
          cta: "Apri annuncio →",
          dashboardHint:
            "Tutti i file della candidatura sono salvati su lavorai.it/applications",
          questions: "Hai domande? Rispondi a questa email.",
        };
  return `<!doctype html>
<html lang="${data.locale}"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">${m.title}</h1>
    <p style="font-size:15px;line-height:1.55;color:#5B5D61;margin:0 0 16px;">
      ${m.intro}
    </p>
    <div style="padding:16px 18px;border:1px solid #E6E4DD;border-radius:8px;margin-bottom:20px;">
      <div style="font-weight:600;font-size:15px;">${escapeHtml(data.jobTitle)}</div>
      <div style="font-size:13px;color:#5B5D61;margin-top:2px;">${escapeHtml(data.company)}</div>
    </div>
    <p style="font-size:14px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      ${m.instruction}
    </p>
    <a href="${data.jobUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">${m.cta}</a>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      ${m.dashboardHint}<br/>
      ${m.questions}
    </p>
  </div>
</body></html>`;
}

// ---------- DELIVERY: email la candidatura al recruiter ----------

interface DeliverInput {
  applicationId: string;
  beforeSend: () => Promise<boolean>;
  attemptKey: string;
  recipientProvenanceJson: string;
  to: string;
  replyTo: string;
  userName: string | null;
  job: { title: string; company: string | null; url: string };
  cvBuffer: Buffer;
  clBuffer: Buffer;
  cvPdfPath?: string | null;
  cvLanguage: "it" | "en";
  coverLetterText: string;
  trackingToken: string | null;
}

async function deliverApplicationToRecruiter(
  input: DeliverInput,
): Promise<RecruiterDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n📨 [recruiter-delivery DEV] Avrei inviato a ${input.to} (reply-to ${input.replyTo}) — "${input.job.title}" @ ${input.job.company ?? "—"}\n`,
      );
      return { kind: "not_sent", reason: "email_provider_not_configured" };
    }
    console.error("[worker] RESEND_API_KEY mancante — no delivery");
    return { kind: "not_sent", reason: "email_provider_not_configured" };
  }

  const from =
    process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";

  // GUARDIA PROD: onboarding@resend.dev è il sandbox di Resend — accetta
  // SOLO invii a caselle dello stesso account. In produzione con
  // recruiter esterni Resend rigetta silenziosamente (o accetta e non
  // consegna). Se in prod, rifiuta prima di illudere "sent".
  if (
    process.env.NODE_ENV === "production" &&
    from.toLowerCase().includes("resend.dev")
  ) {
    console.error(
      `[worker] EMAIL_FROM è sandbox Resend (${from}) — nessuna delivery reale possibile a recruiter esterni. Configura EMAIL_FROM con dominio verificato.`,
    );
    await alertFounder(
      "email_from_sandbox",
      "EMAIL_FROM è sandbox — delivery bloccata",
      `L'app sta cercando di inviare candidature ai recruiter ma EMAIL_FROM punta ancora al sandbox Resend (${from}).\nResend accetta invii sandbox solo verso caselle interne all'account → NIENTE candidatura arriva ai recruiter esterni.\n\nFix: su Resend verifica un dominio (es. lavorai.it), poi setta EMAIL_FROM="LavorAI <candidature@lavorai.it>" (o simile) su Vercel.`,
    ).catch(() => void 0);
    return { kind: "not_sent", reason: "email_provider_not_configured" };
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const pixel = input.trackingToken
    ? `${siteUrl}/api/track/open/${input.trackingToken}`
    : null;

  const candidateName = (input.userName ?? "").trim() || input.replyTo;
  const subject = input.cvLanguage === "en"
    ? `Application for ${input.job.title}${input.job.company ? ` — ${input.job.company}` : ""}`
    : `Candidatura — ${input.job.title}${input.job.company ? ` · ${input.job.company}` : ""}`;

  // Se è configurato un dominio inbound, le risposte del recruiter passano da
  // noi (per il parsing) e poi le inoltriamo all'utente. Altrimenti fallback
  // storico: reply diretta alla casella dell'utente (nessun parsing possibile).
  const inboundReply = inboundReplyAddress(input.applicationId);
  const effectiveReplyTo = inboundReply ?? input.replyTo;

  // Attachments: always include DOCX, and PDF if available (preferred format)
  const attachments: Array<{ filename: string; content: Buffer }> = [];
  
  // If PDF is available, attach it in addition to (or instead of) DOCX
  if (input.cvPdfPath) {
    try {
      const pdfBuffer = await readUserFile(input.cvPdfPath);
      attachments.push({
        filename: `CV_${slugName(candidateName)}.pdf`,
        content: pdfBuffer,
      });
    } catch (err) {
      console.warn(`[worker] ${input.applicationId} failed to read PDF, falling back to DOCX only`, err);
    }
  }
  
  // Always attach DOCX as fallback if PDF failed or wasn't available
  if (attachments.length === 0 || input.cvPdfPath) {
    attachments.push({
      filename: `CV_${slugName(candidateName)}.docx`,
      content: input.cvBuffer,
    });
  }
  
  attachments.push({
    filename: `${input.cvLanguage === "en" ? "Cover_Letter" : "Lettera_Motivazionale"}_${slugName(candidateName)}.docx`,
    content: input.clBuffer,
  });

  return sendRecruiterEmailOnce({
    applicationId: input.applicationId,
    attemptKey: input.attemptKey,
    recipient: input.to,
    recipientProvenanceJson: input.recipientProvenanceJson,
    beforeSend: input.beforeSend,
    payload: {
      from,
      to: input.to,
      replyTo: effectiveReplyTo,
      subject,
      html: renderRecruiterEmail({
        candidateName,
        candidateEmail: input.replyTo,
        jobTitle: input.job.title,
        company: input.job.company,
        jobUrl: input.job.url,
        coverLetterText: input.coverLetterText,
        lang: input.cvLanguage,
        pixelUrl: pixel,
      }),
      text:
        input.cvLanguage === "en"
          ? `${input.coverLetterText}\n\n---\nCV and cover letter attached.\nSent via LavorAI on behalf of ${candidateName} (${input.replyTo}).\nReply directly to this email to reach ${candidateName}.`
          : `${input.coverLetterText}\n\n---\nCV e lettera motivazionale in allegato.\nInviato tramite LavorAI per conto di ${candidateName} (${input.replyTo}).\nRispondi direttamente a questa email per contattare ${candidateName}.`,
      attachments,
      headers: {
        "X-Lavorai-App-Id": input.applicationId,
      },
    },
  });
}

function slugName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 40) || "candidato"
  );
}

function renderRecruiterEmail(d: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  company: string | null;
  jobUrl: string;
  coverLetterText: string;
  lang: "it" | "en";
  pixelUrl: string | null;
}): string {
  const isIt = d.lang === "it";
  const clHtml = escapeHtml(d.coverLetterText).replace(/\n/g, "<br/>");
  const footer = isIt
    ? `Inviato tramite <a href="https://lavorai.it" style="color:#16a34a;text-decoration:none;">LavorAI</a> per conto di <strong>${escapeHtml(d.candidateName)}</strong> · Rispondi a questa email per contattare direttamente il candidato.`
    : `Sent via <a href="https://lavorai.it" style="color:#16a34a;text-decoration:none;">LavorAI</a> on behalf of <strong>${escapeHtml(d.candidateName)}</strong> · Reply to this email to reach the candidate directly.`;
  const docsLine = isIt
    ? "CV e lettera motivazionale in allegato."
    : "CV and cover letter attached.";

  // Removed: bold subject-style header before the letter (was duplicate of email subject)
  // Removed: 1x1 tracking pixel (d.pixelUrl)
  return `<!doctype html>
<html lang="${d.lang}"><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Inter,Helvetica,sans-serif;color:#0F1012;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:14.5px;color:#0F1012;">
      ${clHtml}
    </div>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:28px 0 12px;"/>
    <p style="font-size:12.5px;color:#5B5D61;margin:0 0 6px;">
      ${docsLine}
    </p>
    <p style="font-size:11.5px;color:#8A8C90;margin:0;">
      ${footer}
    </p>
  </div>
</body></html>`;
}

// ---------- Portal adapter submit (Greenhouse / Lever / Workable / ...) ----------

interface AdapterSubmitInput {
  applicationId: string;
  workToken: Date;
  adapter: ReturnType<typeof import("@/lib/portal-adapters").findPortalAdapter> extends infer T
    ? T extends null
      ? never
      : T
    : never;
  jobUrl: string;
  cvPath: string;
  clPath: string;
  coverLetterText: string;
  userId: string;
  userEmail: string;
  userName?: string | null;
  answers?: import("@/lib/application-answers").ApplicationAnswers;
  reusableAnswers?: import("@/lib/candidate-facts").SavedFactAnswer[];
  storedAnswers?: Array<{ label: string; answer: string; kind?: string; options?: string[]; fingerprint?: string }>;
  userYearsExperience?: number | null;
  userEnglishLevel?: string | null;
  userNoticePeriod?: string | null;
  privacyConsentAt?: Date | string | null;
  /** Auto-apply "auto": l'AI risponde da sola alle domande del form. */
  autonomous?: boolean;
  preferredCity?: string | null;
  jobLocation?: string | null;
  protectedCategory?: boolean | null;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  /** Override chirurgico: forza l'invio REALE anche se PORTAL_SUBMIT_DRY_RUN=true.
   *  Usato dal test admin per un singolo invio confermato, senza toccare il
   *  flag globale (che farebbe partire il backlog dal worker locale). */
  forceRealSubmit?: boolean;
  forceDryRun?: boolean;
}

async function attemptPortalAdapterSubmit(input: AdapterSubmitInput): Promise<
  import("@/lib/portal-adapters").ApplyOutcome | { ok: false; status: "worker_gate_blocked"; error: string }
> {
  const { applicationId, adapter, jobUrl, cvPath, clPath, userId } = input;
  assertApplicationsRunning();

  // Profilo utente per compilare i campi del form
  const profileRow = await prisma.cVProfile.findUnique({
    where: { userId },
  });
  if (!profileRow) {
    return {
      ok: false,
      status: "missing_field",
      error: "Profilo CV mancante — vai su /cv per compilarlo.",
    };
  }
  const profile = rowToProfile(profileRow);

  // Email candidato nei form ATS: se l'inbound è configurato
  // (INBOUND_EMAIL_DOMAIN), usiamo SEMPRE l'alias reply+<appId>@inbound così le
  // conferme ATS (security codes, etc.) e le risposte dei recruiter passano da
  // LavorAI (auto-OTP, Inbox, stato "risposta/colloquio") e vengono inoltrate
  // all'utente. Senza inbound, tutto va direttamente all'utente e non possiamo
  // completare automaticamente gli OTP né misurare le risposte.
  //
  // FAIL LOUD: se manca INBOUND_EMAIL_DOMAIN su Railway/worker, il submit di
  // portali che richiedono OTP (Greenhouse, Ashby) fallirà con errore chiaro.
  const inboundAlias = process.env.INBOUND_ROUTE_ATS_EMAIL === "false" ? null : inboundReplyAddress(applicationId);
  
  // Per portali ATS che richiedono verifica OTP (Greenhouse/Ashby), l'inbound
  // è OBBLIGATORIO. Se manca, fail con messaggio chiaro invece di usare l'email
  // personale dell'utente (che causerebbe invio di codici alla sua casella).
  const portalNeedsOtp = adapter.id === "greenhouse" || adapter.id === "ashby";
  if (portalNeedsOtp && !inboundAlias) {
    return {
      ok: false,
      status: "missing_field",
      error: `${adapter.label} richiede verifica email automatica. Configura INBOUND_EMAIL_DOMAIN sul worker (Railway) per abilitare l'auto-OTP. Senza, i codici arriverebbero all'utente invece che al sistema.`,
    };
  }
  
  // Per-user LavorAI inbox (<slug>@apply.lavorai.it) when present: ATS
  // confirmations land in /api/inbound/email and become proof-of-send.
  // OTP portals keep the per-application alias (auto-OTP is keyed by appId).
  const userInbox = portalNeedsOtp ? null : await getUserInboxAddress(prisma, userId).catch(() => null);
  const formEmail = userInbox ?? inboundAlias ?? input.userEmail;
  if (formEmail !== input.userEmail) profile.email = formEmail;

  // Scarica i file localmente se storage remoto (Blob/Supabase)
  const [cvLocalPath, clLocalPath] = await Promise.all([
    ensureLocalPath(
      cvPath,
      applicationDocumentFilename("CV", input.jobTitle, applicationId, "docx"),
    ),
    ensureLocalPath(
      clPath,
      applicationDocumentFilename("Lettera", input.jobTitle, applicationId, "docx"),
    ),
  ]);

  let browser: import("playwright").Browser | undefined;
  try {
    browser = await launchBrowser();
    const context = await humanContext(browser);
    const page = await context.newPage();
    if (!await beginApplicationSubmission(applicationId, input.workToken, undefined, `portal_${adapter.id}`)) {
      return { ok: false, status: "worker_gate_blocked", error: "Current worker gates blocked delivery." };
    }
    let finalBoundaryEntered = false;
    let candidateDataEntered = false;
    let verificationEntered = false;
    let pauseEntered = false;
    // Greenhouse and Ashby pause on the untouched form (resumable proof).
    const stagedChannel = `portal_${adapter.id}`;
    const staged = STAGED_CHANNELS.includes(stagedChannel);
    const audit: import("@/lib/portal-adapters/ai-answer").GivenAnswer[] = [];
    const outcome = await adapter.apply(page, {
      profile,
      beforeSubmit: () => {
        if (finalBoundaryEntered || pauseEntered || (staged && !candidateDataEntered)) return Promise.resolve(false);
        finalBoundaryEntered = true;
        return recheckBeforePortalSubmit(applicationId, input.workToken, jobUrl, `portal_${adapter.id}`);
      },
      ...(staged ? {
        onPreTransmissionPause: (questions: import("./portal-adapters/types").PendingQuestion[]) => {
          if (candidateDataEntered || finalBoundaryEntered || pauseEntered) return Promise.resolve(false);
          pauseEntered = true;
          return attestAnswerPause(applicationId, input.workToken, stagedChannel, JSON.stringify(questions), jobUrl, undefined, BLANK_FORM_EVIDENCE[stagedChannel]);
        },
        beforeCandidateData: () => {
          if (candidateDataEntered || finalBoundaryEntered || pauseEntered) return Promise.resolve(false);
          candidateDataEntered = true;
          return recheckBeforePortalSubmit(applicationId, input.workToken, jobUrl, stagedChannel, "candidate_data");
        },
      } : {}),
      ...(adapter.id === "greenhouse" ? {
        beforeVerificationSubmit: () => {
          if (!candidateDataEntered || !finalBoundaryEntered || verificationEntered || pauseEntered) return Promise.resolve(false);
          verificationEntered = true;
          return recheckBeforePortalSubmit(applicationId, input.workToken, jobUrl, "portal_greenhouse", "verification_submit");
        },
      } : {}),
      userEmail: formEmail,
      userName: input.userName ?? undefined,
      userPhone: profile.phone || undefined,
      privacyConsentAt: input.privacyConsentAt ?? null,
      cvLocalPath,
      clLocalPath,
      coverLetterText: input.coverLetterText,
      jobUrl,
      dryRun: input.forceRealSubmit
        ? false
        : input.forceDryRun === true || process.env.PORTAL_SUBMIT_DRY_RUN === "true",
      answers: input.answers,
      storedAnswers: input.storedAnswers,
      reusableAnswers: input.reusableAnswers,
      userYearsExperience: input.userYearsExperience,
      userEnglishLevel: input.userEnglishLevel,
      userNoticePeriod: input.userNoticePeriod,
      applicationId: input.applicationId, // per naming canary assets
      autonomous: input.autonomous === true,
      preferredCity: input.preferredCity,
      jobLocation: input.jobLocation,
      protectedCategory: input.protectedCategory,
      jobTitle: input.jobTitle,
      company: input.company,
      jobDescription: input.jobDescription,
      // Audit of generated answers is separate from explicit application-bound
      // permission. Historical values never authorize another form.
      onAiAnswers: (given) => { audit.push(...given); },
    });
    if (audit.length) await persistAiAnswers(userId, applicationId, input.workToken, audit);
    // Greenhouse attests only from its blank-form callback above. Later browser
    // questions (after autosave/uploads) must never create or renew that proof.
    if (adapter.id === "recruitee" && !finalBoundaryEntered && !outcome.ok && outcome.status === "needs_user_input") {
      await attestAnswerPause(applicationId, input.workToken, "portal_recruitee", JSON.stringify(outcome.pendingQuestions), jobUrl);
    }
    return outcome;
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}

/** Prima località "vera" (non remote) dalle preferenze, per il campo City dei form. */
function firstPreferredCity(locationsJson: string | null | undefined): string | null {
  try {
    const arr = JSON.parse(locationsJson ?? "[]");
    if (!Array.isArray(arr)) return null;
    const hit = arr.find((x) => typeof x === "string" && x.trim() && !/remot|ovunque|anywhere|italia$|italy$|europe|europa/i.test(x));
    return hit ? String(hit).split(/[,(]/)[0].trim() : null;
  } catch {
    return null;
  }
}

/** Generated answers remain an application audit, never user facts. Awaited and
 * fenced by the worker token so an old callback cannot overwrite a continuation. */
async function persistAiAnswers(userId: string, applicationId: string, token: Date,
  given: import("@/lib/portal-adapters/ai-answer").GivenAnswer[]): Promise<void> {
  await prisma.application.updateMany({
    where: { id: applicationId, userId, startedAt: token, status: "applying" },
    data: { answersUsedJson: JSON.stringify(given) },
  });
}

// ---------- Adzuna URL resolver via Playwright ----------
/**
 * Adzuna wrappa gli annunci in /details/<id> (client-side React) e
 * /land/ad/<id> (bot-blocked). Il solo modo per estrarre il vero URL
 * company → aprire la pagina in un browser reale, aspettare il bottone
 * "Candidati ora" / "Apply", prendere il suo href.
 */
async function resolveAdzunaViaBrowser(adzunaUrl: string): Promise<string | null> {
  let browser: import("playwright").Browser | undefined;
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({
      locale: "it-IT",
      timezoneId: "Europe/Rome",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    await page.goto(adzunaUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Aspetta che l'app React carichi il bottone apply
    const candidates = [
      'a[href*="/land/ad/"]',
      'a:has-text("Candidati")',
      'a:has-text("Apply")',
      'a[data-testid*="apply" i]',
      'a.adp-apply-button',
      'button:has-text("Candidati")',
      'button:has-text("Apply")',
    ];
    for (const sel of candidates) {
      const loc = page.locator(sel).first();
      try {
        await loc.waitFor({ timeout: 3000, state: "visible" });
        const href = await loc.getAttribute("href");
        if (href) {
          const absolute = new URL(href, adzunaUrl).toString();
          // Se è un /land/ad/, segui il redirect in browser per arrivare al vero URL
          if (/\/land\/ad\//.test(absolute)) {
            const resp = await page.goto(absolute, {
              waitUntil: "domcontentloaded",
              timeout: 20_000,
            });
            const finalUrl = page.url();
            // Se ci ha rimandato su adzuna ancora, fallimento
            if (/\badzuna\./i.test(finalUrl)) {
              console.warn(
                "[adzuna-resolve] landed back on adzuna:",
                finalUrl.slice(0, 100),
              );
              return null;
            }
            return finalUrl;
          }
          return absolute;
        }
      } catch {
        // prova il prossimo selector
      }
    }
    return null;
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}

/**
 * Determina quali tracking link includere nel footer della cover letter
 * basandosi su cvProfile.linksJson dell'utente. Il blocco "Get in touch"
 * mostra solo le righe per cui l'utente ha effettivamente un link.
 * Email è sempre presente (mailto:user@email).
 */
function computeTrackingLinks(linksJson: string | null): {
  hasPortfolio: boolean;
  hasLinkedin: boolean;
  hasGithub: boolean;
} {
  if (!linksJson) {
    return { hasPortfolio: false, hasLinkedin: false, hasGithub: false };
  }
  try {
    const links = JSON.parse(linksJson) as Array<{
      label?: string;
      url?: string;
    }>;
    if (!Array.isArray(links)) {
      return { hasPortfolio: false, hasLinkedin: false, hasGithub: false };
    }
    const has = (re: RegExp) =>
      links.some((l) => re.test(l.url ?? "") || re.test(l.label ?? ""));
    return {
      hasPortfolio: has(
        /behance|dribbble|portfolio|personal|website|\.me\/|\.io\//i,
      ),
      hasLinkedin: has(/linkedin\.com/i),
      hasGithub: has(/github\.com/i),
    };
  } catch {
    return { hasPortfolio: false, hasLinkedin: false, hasGithub: false };
  }
}
