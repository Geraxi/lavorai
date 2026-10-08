import { prisma } from "@/lib/db";

export type PublicStats = {
  users: number;
  applicationsToday: number;
  applicationsTotal: number;
};

// Account interni/test esclusi da ogni metrica pubblica. È una condizione SQL
// (`count`) e non un `findMany` seguito da filtro JavaScript: il costo rimane
// costante anche con migliaia di utenti.
const TEST_ACCOUNT_FILTERS = [
  { email: { endsWith: "@inbox.testmail", mode: "insensitive" as const } },
  { email: { endsWith: "@mailinator", mode: "insensitive" as const } },
  { email: { contains: "@example.", mode: "insensitive" as const } },
  { email: { startsWith: "postdbpush-", mode: "insensitive" as const } },
  { email: { startsWith: "test-", mode: "insensitive" as const } },
  { email: { startsWith: "demo-", mode: "insensitive" as const } },
  { email: { equals: "umbertogeraci0@gmail.com", mode: "insensitive" as const } },
  { email: { equals: "geracigears@gmail.com", mode: "insensitive" as const } },
  { email: { equals: "antonella.lasalandra07@gmail.com", mode: "insensitive" as const } },
  { email: { equals: "chatgpt-helper@gmail.com", mode: "insensitive" as const } },
  { email: { endsWith: "@lavorai.it", mode: "insensitive" as const } },
];

export async function getPublicStats(): Promise<PublicStats> {
  try {
    const [users, applicationsToday, applicationsTotal] = await Promise.all([
      prisma.user.count({ where: { NOT: { OR: TEST_ACCOUNT_FILTERS } } }),
      prisma.application.count({
        where: {
          completedAt: { gte: new Date(Date.now() - 24 * 3600e3) },
          status: { in: ["success", "ready_to_apply", "awaiting_consent"] },
        },
      }),
      prisma.application.count({
        where: { status: { in: ["success", "ready_to_apply", "awaiting_consent"] } },
      }),
    ]);
    return { users, applicationsToday, applicationsTotal };
  } catch {
    // La landing non deve fallire se la connessione DB è temporaneamente giù.
    return { users: 0, applicationsToday: 0, applicationsTotal: 0 };
  }
}
