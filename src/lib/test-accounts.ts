import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";

/** IDs of internal/test accounts, decided by the single isTestAccount() rule.
 * Use as `userId: { notIn: ids }` in metric queries that cannot filter by email in SQL. */
export async function testAccountUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  return users.filter((u) => isTestAccount(u.email)).map((u) => u.id);
}
