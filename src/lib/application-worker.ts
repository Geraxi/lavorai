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

  // 5. Email con allegati (best-effort; app.status già "ready_to_apply")
  await sendApplicationEmail({
    to: app.user.email,
    userName: app.user.name,
    job: app.job,
    cvBuffer,
    clBuffer,
    atsScore: result.atsScore,
  }).catch((err) => {
    console.error(`[worker] ${applicationId} email delivery failed`, err);
  });

  // 6. Playwright auto-submit (SOLO se feature flag esplicito)
  if (process.env.AUTO_APPLY_ENABLED === "true") {
    await attemptAutoSubmit({
      applicationId,
      portal: app.portal,
      jobUrl: app.job.url,
      userSessions: app.user.portalSessions,
      cvPath,
      clPath,
    });
  }
  // Altrimenti lascia lo stato "ready_to_apply": l'utente ha i file e
  // può cliccare apply sul portale dalla dashboard.
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

  // Job mock/demo: simula successo per demo end-to-end senza browser reale
  const isMockOrDemo =
    jobUrl.includes("example.com") ||
    jobUrl.includes("example.org") ||
    !isPortalId(portal);
  if (isMockOrDemo) {
    await new Promise((r) => setTimeout(r, 1500));
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "success", completedAt: new Date() },
    });
    await notifyApplicationSent(applicationId).catch((err) =>
      console.error(`[worker] ${applicationId} notify email failed`, err),
    );
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

  await resend.emails.send({
    from,
    to: app.user.email,
    subject: `Candidatura inviata a ${company} ✓`,
    html: renderSentEmail({ firstName, jobTitle, company, jobUrl }),
    text: `Ciao ${firstName},\n\nLa tua candidatura per "${jobTitle}" è stata consegnata a ${company}.\n\nLink annuncio: ${jobUrl}\n\n— LavorAI`,
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
