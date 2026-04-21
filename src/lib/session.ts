import { auth } from "@/lib/auth";
import { getDemoUser, prisma } from "@/lib/db";

/**
 * Helper universale: ritorna l'utente corrente.
 * - Prova auth() (NextAuth session)
 * - Fallback a demo user in development se auth non è configurata
 *   (es. prima del setup Stripe/Resend)
 * - Null in produzione se non loggato
 */
export async function getCurrentUser() {
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
}

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
