import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /r/[token]?ref=portfolio|linkedin|github|email
 *
 * Short-URL tracking link incluso nella cover letter (più varianti).
 * Quando il recruiter clicca QUALSIASI variante:
 *  - Logghiamo `viewedAt` + `userStatus="vista"` sulla Application
 *  - Redirect alla destinazione corretta in base a `ref`
 *
 * Multi-superficie: più link → più chance di un click → più segnali.
 * Es. cover letter contiene "Portfolio: .../r/X?ref=portfolio",
 * "LinkedIn: .../r/X?ref=linkedin", "Email: .../r/X?ref=email", ecc.
 *
 * Sempre redirect 302 — anche token/ref invalidi vanno su lavorai.it
 * così non si rivelano info al click.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ref = req.nextUrl.searchParams.get("ref") ?? "portfolio";
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
              email: true,
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

        destination = resolveDestination(app, ref);
      }
    } catch (err) {
      console.error("[/r/token] lookup failed", err);
    }
  }

  redirect(destination);
}

interface AppLookup {
  user: {
    email: string;
    cvProfile: { linksJson: string } | null;
  };
}

/**
 * Risolve la destinazione per il redirect in base a `ref`:
 *  - portfolio → primo link che matcha portfolio/behance/dribbble/personal
 *  - linkedin  → primo URL che contiene linkedin.com
 *  - github    → primo URL che contiene github.com
 *  - email     → mailto: dell'utente
 *  - fallback  → lavorai.it
 */
function resolveDestination(app: AppLookup, ref: string): string {
  if (ref === "email" && app.user.email) {
    return `mailto:${app.user.email}`;
  }

  try {
    const linksRaw = app.user.cvProfile?.linksJson ?? "[]";
    const links = JSON.parse(linksRaw) as Array<{
      label?: string;
      url?: string;
    }>;
    if (!Array.isArray(links)) return "https://lavorai.it";

    const find = (re: RegExp) =>
      links.find(
        (l) => re.test(l.url ?? "") || re.test(l.label ?? ""),
      )?.url;

    let url: string | undefined;
    if (ref === "linkedin") url = find(/linkedin\.com/i);
    else if (ref === "github") url = find(/github\.com/i);
    else if (ref === "portfolio") {
      url =
        find(/behance|dribbble|portfolio|personal|website/i) ??
        find(/^https?:\/\/(?!.*(linkedin|github|twitter|facebook))/i);
    }

    if (url && /^https?:\/\//.test(url)) return url;
  } catch {
    /* malformed json → fallback */
  }
  return "https://lavorai.it";
}
