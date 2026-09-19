import { prisma } from "@/lib/db";

/**
 * Controlla se l'utente ha un account Google collegato con gmail.readonly.
 * Ritorna true se esiste un Account record per provider=google con uno scope
 * che include gmail.readonly, false altrimenti.
 */
export async function hasGmailConnected(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
    select: {
      scope: true,
      access_token: true,
    },
  });

  if (!account || !account.access_token) return false;

  // Lo scope potrebbe essere null o non includere gmail.readonly se l'account
  // Google è stato collegato prima dell'aggiunta di questo scope.
  const scope = account.scope ?? "";
  return scope.includes("gmail.readonly");
}

/**
 * Recupera l'access_token Google per un utente, se Gmail è collegato.
 * Ritorna null se non c'è account o non ha gmail.readonly.
 *
 * NOTA: gli access_token Google scadono (expires_at). In produzione dovresti
 * implementare un refresh automatico con refresh_token prima di usare questo
 * token per chiamare le API Gmail. Per ora ritorniamo il token raw.
 */
export async function getGmailAccessToken(
  userId: string,
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
    select: {
      access_token: true,
      scope: true,
      expires_at: true,
      refresh_token: true,
    },
  });

  if (!account || !account.access_token) return null;

  const scope = account.scope ?? "";
  if (!scope.includes("gmail.readonly")) return null;

  // TODO: se expires_at è passato, usa refresh_token per rinnovare.
  // Per ora ritorniamo il token così com'è (best-effort).
  return account.access_token;
}
