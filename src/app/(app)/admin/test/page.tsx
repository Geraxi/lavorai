import { redirect } from "next/navigation";

// Consolidata in /admin/automation (hub Automazione & Utenti).
export default function LegacyAdminRedirect() {
  redirect("/admin/automation");
}
