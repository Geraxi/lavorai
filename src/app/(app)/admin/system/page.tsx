import { redirect } from "next/navigation";

// Salute AI è integrata nella card "Salute AI" di /admin/jobs.
export default function LegacyAdminSystemRedirect() {
  redirect("/admin/jobs");
}
