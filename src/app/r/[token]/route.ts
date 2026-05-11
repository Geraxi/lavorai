import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /r/[token]
 *
 * Short-URL tracking link incluso nella cover letter generata da Claude
 * (es. "Portfolio: lavorai.it/r/abc123"). Quando il recruiter clicca:
 *  - Logghiamo `viewedAt` + `userStatus="vista"` sulla Application
 *  - Redirect al portfolio dell'utente (o LinkedIn, o lavorai.it come fallback)
 *
 * Funziona ANCHE per submit via portal ATS (Greenhouse, Lever, Ashby):
 * il file PDF/DOCX della cover letter sta dentro l'ATS del recruiter,
 * il link è cliccabile da lì. È il segnale più forte di "ha aperto la
 * candidatura" per portal submissions, dove il pixel email non si può
 * mettere.
 *
 * Sempre redirect 302 — anche token invalidi vanno su lavorai.it così
 * non si rivelano info al click (privacy + difesa anti-scraper).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let destination = "https://lavorai.it";

  if (token) {
    try {
      const app = await prisma.application.findUnique({
        where: { trackingToken: token },
        select: {
          id: true,
          viewedAt: true,
          userStatus: true,
          user: {
            select: {
              cvProfile: { select: { linksJson: true } },
            },
          },
        },
      });

      if (app) {
        // Logga la view solo al primo click — idempotente
        if (!app.viewedAt) {
          await prisma.application
            .update({
              where: { id: app.id },
              data: {
                viewedAt: new Date(),
                userStatus: app.userStatus ?? "vista",
              },
            })
            .catch((err) => {
              console.error("[/r/token] update failed", err);
            });
        }

        // Risolvi destinazione: preferenze in ordine
        //  1. Portfolio link dal CV profile
        //  2. LinkedIn link dal CV profile
        //  3. Fallback su lavorai.it
        try {
          const linksRaw = app.user?.cvProfile?.linksJson ?? "[]";
          const links = JSON.parse(linksRaw) as Array<{
            label?: string;
            url?: string;
          }>;
          if (Array.isArray(links)) {
            const portfolio = links.find((l) =>
              /portfolio|behance|dribbble|github|personal|website/i.test(
                l.label ?? "",
              ),
            );
            const linkedin = links.find((l) =>
              /linkedin/i.test(l.url ?? ""),
            );
            const chosen = portfolio ?? linkedin ?? null;
            if (chosen?.url && /^https?:\/\//.test(chosen.url)) {
              destination = chosen.url;
            }
          }
        } catch {
          // malformed json → fallback
        }
      }
    } catch (err) {
      console.error("[/r/token] lookup failed", err);
    }
  }

  redirect(destination);
}
