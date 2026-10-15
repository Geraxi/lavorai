import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { onboardingAccessBlock } from "@/lib/onboarding-access";
import { freePlanBlock } from "@/lib/free-plan";
import { optimizeCV } from "@/lib/claude";
import { applyLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const access = onboardingAccessBlock(user);
  if (access) return NextResponse.json(access, { status: access.status });
  const quota = await freePlanBlock(user);
  if (quota) return NextResponse.json(quota, { status: 402 });
  const parsed = z.object({ jobId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });
  if (!(await applyLimiter.limit(`preview:${user.id}`)).success) return NextResponse.json({ message: "Troppe anteprime. Riprova tra poco." }, { status: 429 });
  const { jobId } = parsed.data;
  const [job, cv, cached] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.cVDocument.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.applicationPreview.findFirst({ where: { userId: user.id, jobId, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) } }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!job || job.closedAt) return NextResponse.json({ message: "Annuncio non disponibile." }, { status: 404 });
  if (!cv?.extractedText) return NextResponse.json({ error: "missing_cv", message: "Carica prima il CV." }, { status: 409 });
  try {
    const result = cached ? JSON.parse(cached.resultJson) : await optimizeCV({ cvText: cv.extractedText,
      jobPosting: `${job.title}\n${job.company ?? ""}\n\n${job.description}` });
    const preview = cached ?? await prisma.applicationPreview.create({ data: { userId: user.id, jobId, resultJson: JSON.stringify(result) } });
    return NextResponse.json({ previewId: preview.id, jobTitle: job.title, company: job.company, cv: result.optimizedCV, coverLetter: result.coverLetter }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[application-preview]", error);
    return NextResponse.json({ message: "Anteprima non disponibile. Riprova tra poco." }, { status: 502 });
  }
}
