/**
 * Gmail job-mail heuristics and application matching.
 */
import { prisma } from "@/lib/db";

/**
 * Check if message is likely recruiter/job-related mail.
 * Heuristics: known ATS domains, keywords apply/interview/application.
 */
export function isLikelyJobMail(from: string, subject: string, bodyText: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = bodyText.toLowerCase();
  const combinedText = `${subjectLower} ${bodyLower}`;

  // Obvious marketing / platform noise — reject early unless subject has application signals
  const noiseDomains = [
    "jobalerts-noreply@linkedin",
    "linkedin.com",
    "mail.ideabrowser.com",
    "polymarket.com",
    "fundingoptions",
    "tide.co",
    "github.com",
    "notifications.github.com",
    "vercel.com",
  ];
  const strongAppSignal =
    /application|candidatura|colloquio|interview invitation|thank you for applying|we received your application|abbiamo ricevuto/i.test(
      subjectLower,
    );
  if (/trouble viewing this email\?|view (?:it|this email) in your browser/i.test(bodyText) && !strongAppSignal) {
    return false;
  }
  if (noiseDomains.some((d) => fromLower.includes(d)) && !strongAppSignal) {
    return false;
  }
  // LinkedIn job alerts are never recruiter mail
  if (fromLower.includes("jobalerts-noreply@linkedin") || fromLower.includes("jobalerts")) {
    return false;
  }

  // Known ATS/recruiting domains — strong positive signal
  const atsDomains = [
    "greenhouse.io",
    "lever.co",
    "workable.com",
    "ashbyhq.com",
    "smartrecruiters.com",
    "recruitee.com",
    "personio",
    "teamtailor",
    "bamboohr",
    "workday.com",
    "oracle.com",
    "icims.com",
    "taleo.net",
    "jobvite.com",
    "bullhorn",
    "jazz.co",
    "breezy.hr",
    "pinpointhq.com",
    "join.com",
    "recruitcrm",
    "zoho.com/recruit",
  ];

  if (atsDomains.some((d) => fromLower.includes(d))) return true;

  // Recruiter/HR email patterns
  const recruiterPatterns = [
    "recruiting@",
    "talent@",
    "hr@",
    "careers@",
    "jobs@",
    "recruitment@",
    "hiring@",
  ];
  if (recruiterPatterns.some((p) => fromLower.includes(p))) return true;

  // Strong job keywords (bare "opportunity" / "next steps" alone are NOT enough)
  const strongKeywords = [
    "thank you for applying",
    "we received your application",
    "we've received your application",
    "application received",
    "interview invitation",
    "schedule an interview",
    "phone screen",
    "schedule a call",
    "candidatura",
    "colloquio",
    "abbiamo ricevuto la tua candidatura",
    "grazie per la candidatura",
  ];
  if (strongKeywords.some((kw) => combinedText.includes(kw))) return true;

  // Weaker keywords need at least two distinct signals
  const weakKeywords = [
    "application",
    "interview",
    "position",
    "candidacy",
    "applicant",
    "job opening",
    "apply for",
  ];
  const weakHits = weakKeywords.filter((kw) => combinedText.includes(kw));
  return weakHits.length >= 2;
}

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "linkedin.com",
  "facebookmail.com",
  "github.com",
  "vercel.com",
]);

const ATS_PLATFORM_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "smartrecruiters.com",
  "recruitee.com",
  "personio.de",
  "personio.com",
  "teamtailor.com",
  "bamboohr.com",
  "workday.com",
  "icims.com",
  "taleo.net",
  "jobvite.com",
  "breezy.hr",
  "pinpointhq.com",
  "join.com",
  "myworkdayjobs.com",
];

function significantTitleTokens(title: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "senior", "junior", "lead", "intern",
    "stage", "tirocinio", "a", "an", "di", "del", "della", "dei", "delle",
    "in", "on", "at", "to", "of", "or", "e", "il", "la", "lo", "gli", "le",
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w));
}

export async function matchToApplication(
  userId: string,
  from: string,
  subject: string,
  bodyText: string,
): Promise<string | null> {
  const emailMatch = from.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1] : from;
  const domain = (email.split("@")[1] || "").toLowerCase();
  const domainIsGeneric = GENERIC_EMAIL_DOMAINS.has(domain);
  const domainIsAts = ATS_PLATFORM_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
  const combined = `${subject} ${bodyText}`.toLowerCase();
  const domainSlug = domain.replace(/[^a-z0-9]/g, "");

  const applications = await prisma.application.findMany({
    where: {
      userId,
      OR: [{ status: "success" }, { replyCount: { gt: 0 } }],
    },
    orderBy: { completedAt: "desc" },
    take: 100,
    select: {
      id: true,
      replyCount: true,
      job: { select: { company: true, title: true, url: true } },
    },
  });

  type Scored = { id: string; score: number };
  const scored: Scored[] = [];

  for (const app of applications) {
    const companyLower = (app.job.company || "").toLowerCase().trim();
    if (!companyLower || companyLower.length < 4) continue;

    const companySlug = companyLower.replace(/[^a-z0-9]/g, "");
    if (companySlug.length < 4) continue;

    let score = 0;

    if (!domainIsGeneric && !domainIsAts && domainSlug) {
      if (domainSlug === companySlug || domainSlug.includes(companySlug) || companySlug.includes(domainSlug)) {
        score = Math.max(score, 100);
      }
    }

    if (combined.includes(companyLower) || (companySlug.length >= 4 && combined.includes(companySlug))) {
      score = Math.max(score, 70);
    }

    const tokens = significantTitleTokens(app.job.title || "");
    const hits = tokens.filter((t) => combined.includes(t));
    if (hits.length >= 2) {
      score = Math.max(score, 40 + Math.min(hits.length, 5) * 5);
    }

    if (score > 0) {
      if (app.replyCount > 0) score += 5;
      scored.push({ id: app.id, score });
    }
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}
