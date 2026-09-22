import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MaterialiView, type MaterialItem } from "./materiali-view";
import "./materiali.css";

export const metadata: Metadata = {
  title: "CV per posizione · LavorAI",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const materialWhere = (userId: string) => ({
  userId,
  OR: [
    { cvDocxPath: { not: null } },
    { cvPdfPath: { not: null } },
    { coverLetterPath: { not: null } },
  ],
});

export default async function MaterialiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const where = materialWhere(user.id);
  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        status: true,
        submittedVia: true,
        cvDocxPath: true,
        cvPdfPath: true,
        coverLetterPath: true,
        coverLetterText: true,
        cvLanguage: true,
        atsScore: true,
        lastReplyAt: true,
        lastReplyKind: true,
        job: { select: { title: true, company: true, location: true, url: true } },
      },
    }),
    prisma.application.count({ where }),
  ]);

  const items: MaterialItem[] = rows.map((row) => ({
    id: row.id,
    title: row.job.title,
    company: row.job.company ?? "Azienda",
    location: row.job.location,
    jobUrl: row.job.url,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    status: row.status,
    submittedVia: row.submittedVia,
    hasPdf: Boolean(row.cvPdfPath),
    hasDocx: Boolean(row.cvDocxPath),
    hasLetter: Boolean(row.coverLetterPath),
    letterText: row.coverLetterText,
    language: row.cvLanguage,
    match: row.atsScore,
    lastReplyAt: row.lastReplyAt?.toISOString() ?? null,
    lastReplyKind: row.lastReplyKind,
  }));

  return <MaterialiView items={items} total={total} />;
}
