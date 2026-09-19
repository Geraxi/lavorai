import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { generateFollowUpDraft, getMailtoLink } from "@/lib/no-reply-followup";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const app = await prisma.application.findUnique({
    where: { id, userId: user.id },
    include: { job: true },
  });

  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!app.submittedAt) {
    return NextResponse.json(
      { error: "Application not confirmed submitted" },
      { status: 400 }
    );
  }

  const daysSince = Math.floor(
    (Date.now() - app.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const firstName = (user.name ?? "").split(/\s+/)[0] || "Utente";
  const draft = generateFollowUpDraft({
    userFirstName: firstName,
    jobTitle: app.job.title,
    company: app.job.company,
    recruiterEmail: app.job.recruiterEmail,
    submittedAt: app.submittedAt,
    daysSince,
    lang: user.locale === "en" ? "en" : "it",
  });

  return NextResponse.json({
    ...draft,
    mailtoLink: getMailtoLink(draft),
  });
}
