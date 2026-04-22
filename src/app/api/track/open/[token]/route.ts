import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// 1x1 PNG trasparente (base64 decodificato in bytes)
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * GET /api/track/open/[token]
 * Il pixel viene caricato nella mail al recruiter. Appena il client mail
 * lo fetch-a, marchiamo la candidatura come visualizzata (viewedAt + userStatus).
 * Sempre 200 PNG — anche token invalidi, così non rivelano info.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Non bloccare il pixel aspettando la DB — fai update fire-and-forget
  if (token) {
    (async () => {
      try {
        const app = await prisma.application.findUnique({
          where: { trackingToken: token },
          select: { id: true, viewedAt: true, userStatus: true },
        });
        if (!app) return;
        // Idempotente: aggiorna solo se non già visualizzata
        if (!app.viewedAt) {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              viewedAt: new Date(),
              userStatus: app.userStatus ?? "vista",
            },
          });
        }
      } catch (err) {
        console.error("[track/open] update failed", err);
      }
    })();
  }

  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
