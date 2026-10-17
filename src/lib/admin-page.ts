import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

/**
 * Server-side admin gate for every /admin page.
 *
 * The admin layout check is NOT enough on its own: Next renders a layout and
 * its page concurrently, so a page that fetches data without its own check
 * still streams that data into the 404 response's RSC payload. Call this at
 * the very top of each admin page, before any data access.
 */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) notFound();
  return user;
}
