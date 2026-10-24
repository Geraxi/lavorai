import { prisma } from "@/lib/db";
import { isReusableProfileQuestion, normalizeQuestionLabel } from "@/lib/application-question-answers";

/** Persist answers to common profile-like questions so the next application can reuse them before pausing. */
export async function persistReusableStandardAnswers(
  userId: string,
  answers: Array<{ label: string; kind: string; answer: string; options?: string[] }>,
): Promise<number> {
  let saved = 0;
  for (const item of answers) {
    if (!item.answer.trim() || !isReusableProfileQuestion(item)) continue;
    const labelKey = normalizeQuestionLabel(item.label);
    if (!labelKey) continue;
    await prisma.userAnswer.upsert({
      where: { userId_labelKey: { userId, labelKey } },
      create: {
        userId,
        labelKey,
        label: item.label.trim(),
        kind: item.kind,
        answer: item.answer,
        source: "user",
        answeredAt: new Date(),
        optionsJson: item.options?.length ? JSON.stringify(item.options) : null,
      },
      update: {
        answer: item.answer,
        source: "user",
        answeredAt: new Date(),
        kind: item.kind,
        optionsJson: item.options?.length ? JSON.stringify(item.options) : null,
      },
    });
    saved++;
  }
  return saved;
}
