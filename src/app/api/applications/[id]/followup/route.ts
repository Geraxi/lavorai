import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/applications/:id/followup
 * Genera un mailto: link con follow-up draft per candidature senza risposta.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const app = await prisma.application.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      job: {
        select: {
          title: true,
          company: true,
          recruiterEmail: true,
        },
      },
      submittedAt: true,
    },
  });

  if (!app || app.userId !== user.id) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const company = app.job.company ?? "l'azienda";
  const role = app.job.title;
  const recruiterEmail = app.job.recruiterEmail ?? "";

  const daysSince = app.submittedAt
    ? Math.floor((Date.now() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 7;

  const subject = `Candidatura ${role} - follow-up`;
  const body = `Buongiorno,

Ho inviato la mia candidatura per il ruolo di ${role} circa ${daysSince} giorni fa e volevo cortesemente verificare lo stato del processo di selezione.

Resto a disposizione per qualsiasi chiarimento e per un colloquio.

Cordiali saluti,
${user.name ?? ""}`;

  const mailto = `mailto:${encodeURIComponent(recruiterEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return NextResponse.json({
    mailto,
    recruiterEmail,
    hasRecruiterEmail: Boolean(recruiterEmail),
  });
}
