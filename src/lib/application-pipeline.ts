import type { DeliveryView } from "./application-delivery-view";

export type PipelineLane = "attention" | "recorded" | "conversation" | "outcome";
export interface PipelineEvidence {
  userStatus?: string | null;
  lastReplyKind?: string | null;
  delivery?: DeliveryView;
}

/** Presentation only. A pixel, raw success or technical failure cannot promote
 * an application to a human outcome. Explicit user declarations stay distinct. */
export function pipelineLane(application: PipelineEvidence): PipelineLane {
  if (["offerta", "rifiutata"].includes(application.userStatus ?? "")) return "outcome";
  if (application.userStatus === "colloquio") return "conversation";
  if (["risposta", "colloquio", "rifiutata"].includes(application.lastReplyKind ?? "")) return "conversation";
  if (["confirmed", "delivered", "manual"].includes(application.delivery?.phase ?? "")) return "recorded";
  return "attention";
}
