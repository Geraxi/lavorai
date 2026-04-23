import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { optimizeCV } from "@/lib/claude";
import {
  generateCoverLetterDocx,
  generateOptimizedCVDocx,
} from "@/lib/docx-generator";
import { saveUserFile, readUserFile } from "@/lib/storage";
import { decryptJson } from "@/lib/crypto";
import { isPortalId, PORTALS } from "@/lib/portals";
import {
  extractFullProfile,
  tailorProfileForJob,
} from "@/lib/cv-profile-ai-full";
import { profileToRow, rowToProfile } from "@/lib/cv-profile-types";
import { detectLanguage } from "@/lib/lang-detect";
import { renderCVPdf } from "@/lib/cv-pdf";
import { coverLetterHintsFor } from "@/lib/cover-letter-hints";
import { sendWithinQuota } from "@/lib/email-quota";
import { scrapeRecruiterEmail } from "@/lib/recruiter-email";
import { findPortalAdapter } from "@/lib/portal-adapters";
import { resolveFinalUrl } from "@/lib/resolve-job-url";

/**
 * Worker: processa una candidatura fino a consegna al utente.
 *
 * STATI:
 *   queued       → appena creata, in attesa di processing
 *   optimizing   → Claude sta ottimizzando CV + cover letter
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

export async function processApplication(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: true,
      user: {
        include: {
          cvDocuments: { orderBy: { createdAt: "desc" }, take: 1 },
          portalSessions: true,
        },
      },
    },
  });

  if (!app) {
    console.error(`[worker] Application ${applicationId} non trovata`);
    return;
  }

  const cv = app.user.cvDocuments[0];
  if (!cv) {
    await markFailed(applicationId, "CV utente mancante.");
    return;
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "optimizing", startedAt: new Date() },
  });

  const jobPosting = `${app.job.title}\n${app.job.company ?? ""}\n\n${app.job.description}`;
  const jobLang = detectLanguage(`${app.job.title} ${app.job.description}`);

  let result: Awaited<ReturnType<typeof optimizeCV>>;
  let cvPath: string;
  let clPath: string;
  let cvBuffer: Buffer;
  let clBuffer: Buffer;

  try {
    // 1. Claude: ottimizza CV + cover letter per questo job specifico
    const coverLetterHints = coverLetterHintsFor(app.user.email, {
      title: app.job.title,
      category: app.job.category,
    });
    result = await optimizeCV({
      cvText: cv.extractedText,
      jobPosting,
      coverLetterHints,
    });

    // 2. Genera DOCX
    [cvBuffer, clBuffer] = await Promise.all([
      generateOptimizedCVDocx(result.optimizedCV),
      generateCoverLetterDocx(result.coverLetter),
    ]);

    // 3. Salva DOCX su storage
    cvPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      "CV_Ottimizzato.docx",
      cvBuffer,
    );
    clPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      "Lettera_Motivazionale.docx",
      clBuffer,
    );
  } catch (err) {
    console.error(`[worker] ${applicationId} AI/generate failed`, err);
    await markFailed(
      applicationId,
      err instanceof Error ? err.message : "Errore generazione CV",
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
    const pdfBuffer = await renderCVPdf(tailored, jobLang, photoBuffer, photoMime);
    cvPdfPath = await saveUserFile(
      app.userId,
      `applications/${applicationId}`,
      `CV_${jobLang}.pdf`,
      pdfBuffer,
    );
  } catch (err) {
    console.error(`[worker] ${applicationId} PDF tailoring failed`, err);
  }

  // 4. Update status + salva paths + score + PDF
  await prisma.application.update({
    where: { id: applicationId },
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

  // 5. Email all'utente con allegati (copia di backup + conferma interna)
  await sendApplicationEmail({
    to: app.user.email,
    userName: app.user.name,
    job: app.job,
    cvBuffer,
    clBuffer,
    atsScore: result.atsScore,
  }).catch((err) => {
    console.error(`[worker] ${applicationId} email to user failed`, err);
  });

  // 6. DELIVERY — priorità in ordine:
  //    (a) Portal adapter (Greenhouse/Lever/Workable): submit diretto nel form ATS
  //    (b) Email recruiter (scraped dall'annuncio)
  //    (c) Manual: ready_to_apply con istruzioni
  const portalSubmitEnabled = process.env.PORTAL_SUBMIT_ENABLED === "true";
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
  // Prova il match sull'URL canonico (Job.url) PRIMA di quello risolto:
  // alcuni ATS (Greenhouse) redirigono a career page custom dove il form
  // non è raggiungibile. L'URL canonico porta al form puro dell'ATS.
  let adapterUrl = app.job.url;
  let adapter = portalSubmitEnabled ? findPortalAdapter(app.job.url) : null;
  if (!adapter && portalSubmitEnabled) {
    adapter = findPortalAdapter(resolvedUrl);
    if (adapter) adapterUrl = resolvedUrl;
  }

  if (adapter) {
    const outcome = await attemptPortalAdapterSubmit({
      applicationId,
      adapter,
      jobUrl: adapterUrl,
      cvPath,
      clPath,
      coverLetterText: result.coverLetter,
      userId: app.userId,
    }).catch((err) => {
      console.error(`[worker] ${applicationId} adapter ${adapter.id} failed`, err);
      return {
        ok: false as const,
        status: "unknown_error" as const,
        error: err instanceof Error ? err.message : "unknown",
      };
    });

    if (outcome.ok) {
      const isDryRun =
        "confirmation" in outcome && outcome.confirmation === "DRY_RUN";
      const confState =
        "confirmation" in outcome ? outcome.confirmation : "DETECTED";
      console.log(
        `[worker] ${applicationId} adapter ${adapter.id} → submitted (${confState})`,
      );
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          // In dry-run non marchiamo come success: il form è stato compilato
          // ma NON è stato inviato. Lo stato resta ready_to_apply.
          status: isDryRun ? "ready_to_apply" : "success",
          submittedVia: isDryRun ? null : `portal_${adapter.id}`,
          completedAt: isDryRun ? null : new Date(),
          errorMessage: isDryRun
            ? `[DRY RUN] Form ${adapter.label} compilato correttamente ma submit non eseguito (PORTAL_SUBMIT_DRY_RUN=true).`
            : null,
        },
      });
      if (!isDryRun) {
        await notifyApplicationSent(applicationId).catch((err) =>
          console.error(`[worker] ${applicationId} notify email failed`, err),
        );
      }
      return; // fatto
    }
    // se l'adapter non ci è riuscito (form cambiato / captcha / …) proseguiamo
    // al fallback email. Logghiamo l'errore sull'Application per debugging.
    console.warn(
      `[worker] ${applicationId} adapter ${adapter.id} → ${outcome.status}: ${outcome.error}`,
    );
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        errorMessage: `Portal ${adapter.label}: ${outcome.error}`,
      },
    });
  }

  let recruiterEmail = app.job.recruiterEmail;
  if (!recruiterEmail) {
    recruiterEmail = await scrapeRecruiterEmail(
      resolvedUrl,
      app.job.company,
    );
    if (recruiterEmail) {
      await prisma.job.update({
        where: { id: app.job.id },
        data: {
          recruiterEmail,
          recruiterScrapedAt: new Date(),
        },
      });
    } else {
      await prisma.job.update({
        where: { id: app.job.id },
        data: { recruiterScrapedAt: new Date() },
      });
    }
  }

  if (recruiterEmail) {
    const appRow = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { trackingToken: true },
    });
    const trackingToken = appRow?.trackingToken ?? null;
    const delivered = await deliverApplicationToRecruiter({
      applicationId,
      to: recruiterEmail,
      replyTo: app.user.email,
      userName: app.user.name,
      job: app.job,
      cvBuffer,
      clBuffer,
      cvLanguage: jobLang,
      coverLetterText: result.coverLetter,
      trackingToken,
    }).catch((err) => {
      console.error(`[worker] ${applicationId} recruiter delivery failed`, err);
      return false;
    });

    if (delivered) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "success",
          submittedVia: "email_recruiter",
          completedAt: new Date(),
        },
      });
      await notifyApplicationSent(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify email failed`, err),
      );
    } else {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "failed",
          errorMessage:
            "Consegna email al recruiter fallita. Apri l'annuncio per candidarti manualmente.",
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
        portal: app.portal,
        jobUrl: app.job.url,
        userSessions: app.user.portalSessions,
        cvPath,
        clPath,
      });
    } else {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          errorMessage:
            "Non siamo riusciti a trovare l'email del recruiter in questo annuncio. Apri il link e invia manualmente — CV e lettera sono pronti.",
        },
      });
    }
  }
}

async function markFailed(id: string, message: string): Promise<void> {
  await prisma.application.update({
    where: { id },
    data: {
      status: "failed",
      errorMessage: message,
      completedAt: new Date(),
    },
  });
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
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;margin-right:8px;vertical-align:-4px;font-family:ui-monospace,monospace;">L</span>
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
  portal: string;
  jobUrl: string;
  userSessions: Array<{
    portal: string;
    encryptedCookies: string;
    userAgent: string;
  }>;
  cvPath: string;
  clPath: string;
}

async function attemptAutoSubmit(input: AutoSubmitInput): Promise<void> {
  const { applicationId, portal, jobUrl } = input;

  // Job mock/demo ESPLICITO: solo URL di sviluppo (example.com/org).
  // NON facciamo più fake-success su job reali con portale sconosciuto
  // — lasciamo ready_to_apply con messaggio chiaro.
  const isMockOrDemo =
    jobUrl.includes("example.com") || jobUrl.includes("example.org");
  if (isMockOrDemo) {
    await new Promise((r) => setTimeout(r, 500));
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "success",
        submittedVia: "mock_demo",
        completedAt: new Date(),
      },
    });
    await notifyApplicationSent(applicationId).catch((err) =>
      console.error(`[worker] ${applicationId} notify email failed`, err),
    );
    return;
  }

  // Portal sconosciuto (non nei nostri adapter né in infojobs): no-op,
  // lascio ready_to_apply con errorMessage esplicito
  if (!isPortalId(portal)) {
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        errorMessage:
          "Questo portale non è supportato per invio automatico. Apri l'annuncio e candidati manualmente — CV e lettera sono pronti nella sezione Materiali.",
      },
    });
    return;
  }

  const cfg = PORTALS[portal];
  const session = input.userSessions.find((s) => s.portal === portal);
  if (!session) {
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "needs_session",
        errorMessage: `Collega prima il portale ${cfg.label}.`,
        completedAt: new Date(),
      },
    });
    return;
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "applying" },
  });

  let browser: import("playwright").Browser | undefined;
  try {
    // Import dinamico: playwright pesa ~300MB, serverless lo skip-a se AUTO_APPLY_ENABLED non è true
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
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
    const localCvPath = await ensureLocalPath(input.cvPath, "cv.docx");

    const applied = await portalSubmitStrategy(portal, page, {
      localCvPath,
      jobUrl,
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: applied.ok ? "success" : applied.status ?? "failed",
        errorMessage: applied.ok ? null : applied.error ?? null,
        completedAt: new Date(),
      },
    });
    if (applied.ok) {
      await notifyApplicationSent(applicationId).catch((err) =>
        console.error(`[worker] ${applicationId} notify email failed`, err),
      );
    }
  } catch (err) {
    console.error(`[worker/${portal}] playwright error`, err);
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: "failed",
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

async function portalSubmitStrategy(
  portal: string,
  page: import("playwright").Page,
  input: { localCvPath: string; jobUrl: string },
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
    await applyButton.first().click();
    const fileInput = page.locator('input[type="file"]');
    if ((await fileInput.count()) > 0) {
      await fileInput.first().setInputFiles(input.localCvPath);
    }
    const submitButton = page.locator(
      'button[type="submit"], button:has-text("Invia candidatura"), button:has-text("Invia")',
    );
    if ((await submitButton.count()) > 0) {
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

async function notifyApplicationSent(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { select: { title: true, company: true, url: true } },
      user: { select: { email: true, name: true } },
    },
  });
  if (!app) return;

  const apiKey = process.env.RESEND_API_KEY;
  const firstName = (app.user.name ?? "").split(/\s+/)[0] || "";
  const company = app.job.company ?? "l'azienda";
  const jobTitle = app.job.title;
  const jobUrl = app.job.url;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n📧 [sent-email DEV] Avrei avvisato ${app.user.email} — candidatura per "${jobTitle}" consegnata a ${company}\n`,
      );
    }
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";

  await sendWithinQuota("application_sent", app.user.email, async () => {
    await resend.emails.send({
      from,
      to: app.user.email,
      subject: `Candidatura inviata a ${company} ✓`,
      html: renderSentEmail({ firstName, jobTitle, company, jobUrl }),
      text: `Ciao ${firstName},\n\nLa tua candidatura per "${jobTitle}" è stata consegnata a ${company}.\n\nLink annuncio: ${jobUrl}\n\n— LavorAI`,
    });
  });
}

function renderSentEmail(data: {
  firstName: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
}): string {
  return `<!doctype html>
<html lang="it"><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;color:#0F1012;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:18px;font-weight:700;margin-bottom:32px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0F1012;color:#fff;font-size:12px;border-radius:5px;margin-right:8px;vertical-align:-4px;font-family:ui-monospace,monospace;">L</span>
      LavorAI
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">Candidatura inviata${data.firstName ? `, ${data.firstName}` : ""} ✓</h1>
    <p style="font-size:15px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      Abbiamo consegnato la tua candidatura a:
    </p>
    <div style="padding:16px 18px;border:1px solid #E6E4DD;border-radius:8px;margin-bottom:20px;">
      <div style="font-weight:600;font-size:15px;">${escapeHtml(data.jobTitle)}</div>
      <div style="font-size:13px;color:#5B5D61;margin-top:2px;">${escapeHtml(data.company)}</div>
    </div>
    <p style="font-size:14px;line-height:1.55;color:#5B5D61;margin:0 0 20px;">
      Ti avviseremo non appena ci saranno novità (visualizzazioni, risposte dei recruiter).
      Nel frattempo puoi monitorare lo stato dalla tua dashboard.
    </p>
    <a href="${data.jobUrl}" style="display:inline-block;background:#0F1012;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">Apri annuncio →</a>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:32px 0 16px;"/>
    <p style="font-size:11px;color:#8A8C90;line-height:1.5;margin:0;">
      Vedrai tutte le candidature su lavorai.it/applications<br/>
      Hai domande? Rispondi a questa email.
    </p>
  </div>
</body></html>`;
}

// ---------- DELIVERY: email la candidatura al recruiter ----------

interface DeliverInput {
  applicationId: string;
  to: string;
  replyTo: string;
  userName: string | null;
  job: { title: string; company: string | null; url: string };
  cvBuffer: Buffer;
  clBuffer: Buffer;
  cvLanguage: "it" | "en";
  coverLetterText: string;
  trackingToken: string | null;
}

async function deliverApplicationToRecruiter(
  input: DeliverInput,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `\n📨 [recruiter-delivery DEV] Avrei inviato a ${input.to} (reply-to ${input.replyTo}) — "${input.job.title}" @ ${input.job.company ?? "—"}\n`,
      );
      return false; // in dev senza resend, non conta come delivered
    }
    console.error("[worker] RESEND_API_KEY mancante — no delivery");
    return false;
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ?? "LavorAI <onboarding@resend.dev>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
  const pixel = input.trackingToken
    ? `${siteUrl}/api/track/open/${input.trackingToken}`
    : null;

  const candidateName = (input.userName ?? "").trim() || input.replyTo;
  const subject = input.cvLanguage === "en"
    ? `Application for ${input.job.title}${input.job.company ? ` — ${input.job.company}` : ""}`
    : `Candidatura — ${input.job.title}${input.job.company ? ` · ${input.job.company}` : ""}`;

  const result = await sendWithinQuota("application_sent", input.to, async () => {
    await resend.emails.send({
      from,
      to: input.to,
      replyTo: input.replyTo,
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
      attachments: [
        {
          filename: `CV_${slugName(candidateName)}.docx`,
          content: input.cvBuffer,
        },
        {
          filename: `${input.cvLanguage === "en" ? "Cover_Letter" : "Lettera_Motivazionale"}_${slugName(candidateName)}.docx`,
          content: input.clBuffer,
        },
      ],
      headers: {
        "X-Lavorai-App-Id": input.applicationId,
      },
    });
  });
  return result.sent;
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
  const subjectHeader = isIt
    ? `Candidatura per <strong>${escapeHtml(d.jobTitle)}</strong>${d.company ? ` · ${escapeHtml(d.company)}` : ""}`
    : `Application for <strong>${escapeHtml(d.jobTitle)}</strong>${d.company ? ` · ${escapeHtml(d.company)}` : ""}`;
  const docsLine = isIt
    ? "CV e lettera motivazionale in allegato."
    : "CV and cover letter attached.";

  return `<!doctype html>
<html lang="${d.lang}"><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Inter,Helvetica,sans-serif;color:#0F1012;line-height:1.55;">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:13px;color:#5B5D61;margin:0 0 18px;">
      ${subjectHeader}
    </p>
    <div style="font-size:14.5px;color:#0F1012;">
      ${clHtml}
    </div>
    <hr style="border:none;border-top:1px solid #E6E4DD;margin:28px 0 12px;"/>
    <p style="font-size:12.5px;color:#5B5D61;margin:0 0 6px;">
      ${docsLine}
    </p>
    <p style="font-size:12px;color:#8A8C90;margin:0;">
      ${footer}
    </p>
    ${d.pixelUrl ? `<img src="${d.pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;overflow:hidden;"/>` : ""}
  </div>
</body></html>`;
}

// ---------- Portal adapter submit (Greenhouse / Lever / Workable / ...) ----------

interface AdapterSubmitInput {
  applicationId: string;
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
}

async function attemptPortalAdapterSubmit(input: AdapterSubmitInput): Promise<
  import("@/lib/portal-adapters").ApplyOutcome
> {
  const { applicationId, adapter, jobUrl, cvPath, clPath, userId } = input;

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: "applying" },
  });

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

  // Scarica i file localmente se storage remoto (Blob/Supabase)
  const [cvLocalPath, clLocalPath] = await Promise.all([
    ensureLocalPath(cvPath, "cv.docx"),
    ensureLocalPath(clPath, "cover_letter.docx"),
  ]);

  const { chromium } = await import("playwright");
  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const context = await browser.newContext({
      locale: "it-IT",
      timezoneId: "Europe/Rome",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const outcome = await adapter.apply(page, {
      profile,
      cvLocalPath,
      clLocalPath,
      coverLetterText: input.coverLetterText,
      jobUrl,
      dryRun: process.env.PORTAL_SUBMIT_DRY_RUN === "true",
    });
    return outcome;
  } finally {
    if (browser) await browser.close().catch(() => void 0);
  }
}

// ---------- Adzuna URL resolver via Playwright ----------
/**
 * Adzuna wrappa gli annunci in /details/<id> (client-side React) e
 * /land/ad/<id> (bot-blocked). Il solo modo per estrarre il vero URL
 * company → aprire la pagina in un browser reale, aspettare il bottone
 * "Candidati ora" / "Apply", prendere il suo href.
 */
async function resolveAdzunaViaBrowser(adzunaUrl: string): Promise<string | null> {
  const { chromium } = await import("playwright");
  let browser: import("playwright").Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
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
