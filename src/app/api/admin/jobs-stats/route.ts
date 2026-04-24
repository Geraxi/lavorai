import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Admin: stats su Job DB — breakdown per fonte e location.
 *
 *   curl -s "https://lavorai.it/api/admin/jobs-stats" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [total, bySource, italyJobs, milanJobs, romeJobs, remoteJobs, sampleItaly] =
    await Promise.all([
      prisma.job.count(),
      prisma.job.groupBy({
        by: ["source"],
        _count: { _all: true },
      }),
      prisma.job.count({
        where: {
          OR: [
            { location: { contains: "Italy", mode: "insensitive" } },
            { location: { contains: "Italia", mode: "insensitive" } },
            { location: { contains: "Milan", mode: "insensitive" } },
            { location: { contains: "Rome", mode: "insensitive" } },
            { location: { contains: "Roma", mode: "insensitive" } },
            { location: { contains: "Torino", mode: "insensitive" } },
            { location: { contains: "Napoli", mode: "insensitive" } },
            { location: { contains: "Bologna", mode: "insensitive" } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          OR: [
            { location: { contains: "Milan", mode: "insensitive" } },
            { location: { contains: "Milano", mode: "insensitive" } },
          ],
        },
      }),
      prisma.job.count({
        where: {
          OR: [
            { location: { contains: "Rome", mode: "insensitive" } },
            { location: { contains: "Roma", mode: "insensitive" } },
          ],
        },
      }),
      prisma.job.count({
        where: { remote: true },
      }),
      prisma.job.findMany({
        where: {
          OR: [
            { location: { contains: "Italy", mode: "insensitive" } },
            { location: { contains: "Italia", mode: "insensitive" } },
            { location: { contains: "Milan", mode: "insensitive" } },
          ],
        },
        select: {
          title: true,
          company: true,
          location: true,
          source: true,
          url: true,
        },
        take: 15,
        orderBy: { postedAt: "desc" },
      }),
    ]);

  return NextResponse.json({
    total,
    bySource: bySource.map((s) => ({
      source: s.source,
      count: s._count._all,
    })),
    italyRelated: italyJobs,
    milan: milanJobs,
    rome: romeJobs,
    remote: remoteJobs,
    sampleItaly,
  });
}
