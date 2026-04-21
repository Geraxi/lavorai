import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { optimizeCV } from "@/lib/claude";
import { CVParseError, parseCV } from "@/lib/cv-parser";
import {
  generateCoverLetterDocx,
  generateOptimizedCVDocx,
} from "@/lib/docx-generator";
import { sendOptimizedCVEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

const FREE_LIMIT = 3;
const FREE_COOKIE = "lavorai_free_count";

const formSchema = z.object({
  jobPosting: z
    .string()
    .min(100, "L'annuncio deve contenere almeno 100 caratteri."),
  email: z.string().email("Email non valida."),
  privacyConsent: z.literal("true", {
    message: "Devi accettare la privacy policy.",
  }),
});

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          error: "validation",
          message:
            "Content-Type non valido. Usa multipart/form-data con CV, annuncio, email e privacyConsent.",
        },
        { status: 400 },
      );
    }

    // --- Validazione input ---
    const cvEntry = formData.get("cv");
    if (!(cvEntry instanceof File) || cvEntry.size === 0) {
      return NextResponse.json(
        { error: "validation", field: "cv", message: "CV mancante." },
        { status: 400 },
      );
    }

    const parsedForm = formSchema.safeParse({
      jobPosting: formData.get("jobPosting"),
      email: formData.get("email"),
      privacyConsent: formData.get("privacyConsent"),
    });

    if (!parsedForm.success) {
      return NextResponse.json(
        {
          error: "validation",
          issues: parsedForm.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    // --- Paywall check (cookie-based, Sprint 2 placeholder) ---
    const freeCountRaw = request.cookies.get(FREE_COOKIE)?.value;
    const freeCount = Number.isNaN(Number(freeCountRaw))
      ? 0
      : Math.max(0, Number(freeCountRaw));

    if (freeCount >= FREE_LIMIT) {
      return NextResponse.json(
        {
          error: "paywall",
          message: "Hai usato le 3 candidature gratuite.",
          paymentLink:
            process.env.STRIPE_PAYMENT_LINK ?? "https://buy.stripe.com/test_XXX",
        },
        { status: 402 },
      );
    }

    // --- Pipeline ---

    // 1. Parse CV → testo
    let cvText: string;
    try {
      cvText = await parseCV(cvEntry);
    } catch (err) {
      if (err instanceof CVParseError) {
        return NextResponse.json(
          { error: "parse_failed", message: err.message },
          { status: 422 },
        );
      }
      throw err;
    }

    // 2. Claude → CV ottimizzato + cover letter
    const { data: formData2 } = parsedForm;
    const result = await optimizeCV({
      cvText,
      jobPosting: formData2.jobPosting,
    });

    // 3. Genera DOCX
    const [cvBuffer, coverLetterBuffer] = await Promise.all([
      generateOptimizedCVDocx(result.optimizedCV),
      generateCoverLetterDocx(result.coverLetter),
    ]);

    // 4. Email
    const firstName = result.optimizedCV.fullName.split(/\s+/)[0] ?? "";
    await sendOptimizedCVEmail({
      to: formData2.email,
      firstName,
      cvBuffer,
      coverLetterBuffer,
      atsScore: result.atsScore,
      suggestions: result.suggestions,
      jobTitle: extractJobTitle(formData2.jobPosting),
    });

    // 5. Incrementa cookie
    const newCount = freeCount + 1;
    const response = NextResponse.json({
      ok: true,
      atsScore: result.atsScore,
      suggestions: result.suggestions,
      freeRemaining: Math.max(0, FREE_LIMIT - newCount),
    });
    response.cookies.set(FREE_COOKIE, String(newCount), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[api/optimize] errore interno", err);
    const message =
      err instanceof Error
        ? err.message
        : "Errore interno. Riprova tra qualche minuto.";
    return NextResponse.json(
      { error: "internal", message },
      { status: 500 },
    );
  }
}

/**
 * Estrae un "titolo" dall'annuncio: prima riga non vuota, troncata a 80
 * caratteri. Euristica volutamente semplice — Sprint 2 è placeholder.
 */
function extractJobTitle(jobPosting: string): string {
  const firstLine = jobPosting
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "posizione selezionata";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}
