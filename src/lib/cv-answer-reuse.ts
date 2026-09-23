import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { suggestAnswerFromCv } from "@/lib/cv-question-suggestions";

/** Reuse direct CV facts without changing user answers or submitting applications. */
export async function reuseCvAnswers(userId: string, yearsExperience?: number | null): Promise<number> {
  const [row, questions] = await Promise.all([
    prisma.cVProfile.findUnique({ where: { userId } }),
    prisma.userAnswer.findMany({ where: { userId, OR: [{ answer: null }, { answer: "" }, { source: "cv" }] } }),
  ]);
  if (!row) return 0;
  const profile = rowToProfile(row);
  let saved = 0;
  for (const q of questions) {
    let options: string[] | undefined;
    try { const value: unknown = JSON.parse(q.optionsJson ?? "null"); if (Array.isArray(value)) options = value.filter((v): v is string => typeof v === "string"); } catch { /* unknown options stay unanswered */ }
    const answer = suggestAnswerFromCv(q.label, q.kind, options, profile, yearsExperience);
    if (answer === q.answer || (!answer && q.source !== "cv")) continue;
    // Conditional update protects edits made while the profile was being read.
    const result = await prisma.userAnswer.updateMany({
      where: { id: q.id, userId, answer: q.answer, source: q.source },
      data: { answer, source: answer ? "cv" : "pending", answeredAt: answer ? new Date() : null },
    });
    saved += result.count;
  }
  return saved;
}
