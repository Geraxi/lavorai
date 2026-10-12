import { NextResponse } from "next/server";

export function accessUnavailableResponse(pathname: string) {
  const headers = { "Cache-Control": "no-store", "Retry-After": "60" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "access_check_unavailable", message: "Servizio temporaneamente non disponibile. Riprova tra poco." },
      { status: 503, headers },
    );
  }
  return new NextResponse(
    '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Servizio temporaneamente non disponibile | LavorAI</title></head><body><main><h1>Servizio temporaneamente non disponibile</h1><p>Non è stato possibile verificare l’accesso al tuo account. Riprova tra poco.</p><p><a href="/login">Torna al login</a></p></main></body></html>',
    { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
  );
}
