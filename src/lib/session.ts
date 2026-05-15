import { cache } from "react";
import { auth } from "@/lib/auth";
import { getDemoUser, prisma } from "@/lib/db";

/**
 * Helper universale: ritorna l'utente corrente.
 *
 * Wrapped in React.cache() per memoizzare la chiamata DENTRO la stessa
 * request: layout + page + altri server component che lo chiamano vanno
 * al DB UNA SOLA VOLTA. Prima erano 2-4 query User per nav.
 *
 * Combinato col fix in auth.ts (JWT caching dei campi tier/email/name),
 * un page render tipico ora fa 1 query User invece di 2-4.
 */
export const getCurrentUser = cache(async () => {
  try {
    const session = await auth();
    if (session?.user?.id) {
      return prisma.user.findUnique({ where: { id: session.user.id } });
    }
  } catch {
    // auth() può fallire se env manca in dev — fallback sotto
  }

  if (process.env.NODE_ENV !== "production") {
    return getDemoUser();
  }
  return null;
});

/**
 * Come getCurrentUser ma ritorna sempre un user (lancia se null).
 * Usare in server components di pagine protette che hanno middleware davanti.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Utente non autenticato");
  }
  return user;
}
