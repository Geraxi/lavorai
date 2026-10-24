import type { IconName } from "@/components/design/icon";

/** One vocabulary for the sidebar, mobile navigation and section switcher. */
export function workspaceNavigation(locale: string) {
  const en = locale === "en";
  const item = (href: string, label: string, icon: IconName) => ({ href, label, icon });
  return {
    work: [
      item("/dashboard", "Dashboard", "dashboard"),
      item("/discover", en ? "Discover" : "Scopri", "sparkles"),
      item("/applications", en ? "Applications" : "Candidature", "briefcase"),
      item("/inbox", "Inbox", "inbox"),
      item("/posta", en ? "Application mailbox" : "Posta candidature", "mail"),
      item("/materiali", en ? "CV by position" : "CV per posizione", "file"),
      item("/questions", en ? "Questions" : "Domande", "check"),
      item("/jobs", en ? "Job board" : "Offerte di lavoro", "inbox"),
      item("/analytics", en ? "Analytics" : "Analisi", "chart"),
      item("/interview", en ? "Interviews" : "Colloqui", "sparkles"),
      item("/founder-coach", "Founder Coach", "target"),
    ],
    profile: [
      item("/preferences", en ? "Preferences" : "Preferenze", "target"),
      item("/cv", en ? "Your CV" : "Il tuo CV", "file"),
      item("/settings", en ? "Settings" : "Impostazioni", "settings"),
      item("/feedback", en ? "Feedback & bugs" : "Feedback e bug", "inbox"),
    ],
  };
}

export function isWorkspaceRouteActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || (!["/dashboard", "/admin"].includes(href) && pathname.startsWith(`${href}/`));
}
