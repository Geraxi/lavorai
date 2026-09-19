import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/gmail/connect
 *
 * Inizia il flusso OAuth Google per linkare Gmail all'account esistente.
 * Questo endpoint è un proxy che reindirizza a /api/auth/signin/google
 * con un callbackUrl specifico per ritornare a /inbox dopo il link.
 *
 * Requisiti:
 *  - L'utente DEVE essere già autenticato (session attiva).
 *  - Se non è loggato, ritorniamo 401.
 *  - Se già loggato, NextAuth + allowDangerousEmailAccountLinking
 *    linkerà l'account Google invece di crearne uno nuovo (se l'email coincide).
 */
export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Non autenticato. Accedi prima di collegare Gmail." },
      { status: 401 },
    );
  }

  // Costruiamo il callbackUrl per ritornare a /inbox con un parametro che
  // segnala il completamento del link.
  const callbackUrl = new URL("/inbox", req.url);
  callbackUrl.searchParams.set("gmail", "linked");

  // Reindirizza a NextAuth Google sign-in. NextAuth rileverà che l'utente
  // è già loggato e, grazie a allowDangerousEmailAccountLinking, farà il
  // link invece di creare un nuovo utente (se l'email Google === user.email).
  const signinUrl = new URL("/api/auth/signin/google", req.url);
  signinUrl.searchParams.set("callbackUrl", callbackUrl.toString());

  return NextResponse.redirect(signinUrl);
}
