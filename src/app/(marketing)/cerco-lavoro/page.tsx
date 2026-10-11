import { redirect } from "next/navigation";

/**
 * "Cerco lavoro" e "trova lavoro" descrivono lo stesso intento. Manteniamo
 * una sola destinazione canonica, /lavoro, per non dividere segnali SEO e link
 * equity tra due pagine quasi identiche.
 */
export default function CercoLavoroRedirect() {
  redirect("/lavoro");
}
