/**
 * Cosa mostrare per ogni provider in Impostazioni (puro, testato).
 * Un provider senza credenziali OAuth sul server non mostra MAI un pulsante attivo:
 * Outlook → "Presto disponibile", Gmail → "Non disponibile". Durante il caricamento
 * nessun link (evita click su un provider non configurato).
 */
export type ConnectAction = "loading" | "disconnect" | "connect" | "reconnect" | "soon" | "unavailable";

export function connectAction(
  provider: "gmail" | "outlook",
  data: { connections: { provider: string; status: string }[]; configured: { gmail: boolean; outlook: boolean } } | undefined,
): ConnectAction {
  if (!data) return "loading";
  const c = data.connections.find((x) => x.provider === provider);
  if (c?.status === "active") return "disconnect";
  if (!data.configured[provider]) return provider === "outlook" ? "soon" : "unavailable";
  return c ? "reconnect" : "connect";
}
