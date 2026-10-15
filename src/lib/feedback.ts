import { z } from "zod";

export const REPORT_CATEGORIES = ["feedback", "bug"] as const;
export const REPORT_STATUSES = ["new", "in_review", "resolved", "closed"] as const;
// Deliberately fixed choices: no URL, referrer, query, document ID or session capture.
export const REPORT_PAGES = ["dashboard", "discover", "applications", "inbox", "materiali", "questions", "preferences", "settings", "billing", "onboarding", "other"] as const;
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const reportSchema = z.object({
  category: z.enum(REPORT_CATEGORIES),
  subject: text(3, 120).refine(value => !/[\r\n\t]/.test(value)),
  description: text(10, 4000),
  pageContext: z.enum(REPORT_PAGES).nullable().optional(),
  locale: z.enum(["it", "en"]),
}).strict();
export const reportStatusSchema = z.object({ status: z.enum(REPORT_STATUSES) }).strict();
export type ReportInput = z.infer<typeof reportSchema>;
export type ReportStatus = typeof REPORT_STATUSES[number];
export type ReportItem = ReportInput & {
  id: string; status: ReportStatus; createdAt: string; updatedAt: string;
  user?: { email: string; name: string | null };
};

export const reportCopy = (locale: string) => locale === "en" ? {
  title: "Feedback & bugs", heading: "Help shape a better LavorAI", intro: "Share an idea or tell us what went wrong. Your report goes directly to the platform admins.",
  category: "Report type", feedback: "Share feedback", bug: "Report a bug", feedbackHint: "An idea, a suggestion, something you liked.", bugHint: "Something isn't working as expected.",
  subject: "Subject", subjectHint: "A short summary (3–120 characters)", description: "Description", descriptionHint: "For a bug, include the steps, what you expected and what happened (10–4,000 characters).",
  context: "Related section (optional)", noContext: "No section included", contextHint: "Only the section you select is included. No URL or diagnostics are collected automatically.",
  privacy: "Don't include passwords, payment details, CVs or other sensitive information.", visibility: "Visible only to you and platform admins. No email is sent.", submit: "Send report", sending: "Sending…", success: "Report sent. Thank you — admins can now review it.",
  history: "Your reports", empty: "Your reports and their review status will appear here.", loading: "Loading reports…", loadError: "Reports couldn't be loaded. Try again.", retry: "Try again", previous: "Previous", next: "Next", page: "Page", details: "Report details", back: "Back to reports", adminTitle: "User reports", adminIntro: "Review feedback, investigate bugs and keep triage status up to date.", all: "All", status: "Status", save: "Save status", saving: "Saving…", saved: "Status updated.", reporter: "Reported by", language: "Report language", updated: "Updated", none: "No reports match these filters.",
  statuses: { new: "New", in_review: "In review", resolved: "Resolved", closed: "Closed" },
  pages: { dashboard: "Dashboard", discover: "Discover", applications: "Applications", inbox: "Inbox", materiali: "CV by position", questions: "Questions", preferences: "Preferences", settings: "Account", billing: "Billing", onboarding: "Getting started", other: "Other" },
  errors: { invalid_report: "Check the report type, subject (3–120 characters) and description (10–4,000 characters).", invalid_json: "The request couldn't be read. Try again.", too_large: "The report is too long. Shorten the text and try again.", rate_limited: "You've reached the report limit (5 per hour, 20 per day). Please try later.", unauthorized: "Your session has expired. Sign in again before sending.", forbidden: "You don't have access to this action. Sign in with an authorized account.", payment_method_required: "Complete your card verification to access this section.", trial_expired: "Your account is paused. Manage your plan to access this section.", unavailable: "We couldn't complete this request. Your draft is still here; try again.", invalid_status: "Choose a valid status.", not_found: "This report is no longer available." },
} : {
  title: "Feedback e bug", heading: "Aiutaci a migliorare LavorAI", intro: "Condividi un'idea o raccontaci cosa non funziona. La segnalazione arriva direttamente agli amministratori della piattaforma.",
  category: "Tipo di segnalazione", feedback: "Lascia un feedback", bug: "Segnala un bug", feedbackHint: "Un'idea, un consiglio, qualcosa che ti è piaciuto.", bugHint: "Qualcosa non funziona come previsto.",
  subject: "Oggetto", subjectHint: "Un breve riepilogo (3–120 caratteri)", description: "Descrizione", descriptionHint: "Per un bug, indica i passaggi, cosa ti aspettavi e cosa è successo (10–4.000 caratteri).",
  context: "Sezione interessata (facoltativa)", noContext: "Nessuna sezione inclusa", contextHint: "Includiamo solo la sezione che scegli. Nessun URL o dato diagnostico viene raccolto automaticamente.",
  privacy: "Non inserire password, dati di pagamento, CV o altre informazioni sensibili.", visibility: "Visibile solo a te e agli amministratori. Non viene inviata alcuna email.", submit: "Invia segnalazione", sending: "Invio…", success: "Segnalazione inviata. Grazie: gli amministratori possono ora esaminarla.",
  history: "Le tue segnalazioni", empty: "Qui troverai le tue segnalazioni e il loro stato di revisione.", loading: "Caricamento segnalazioni…", loadError: "Impossibile caricare le segnalazioni. Riprova.", retry: "Riprova", previous: "Precedente", next: "Successiva", page: "Pagina", details: "Dettagli segnalazione", back: "Torna alle segnalazioni", adminTitle: "Segnalazioni utenti", adminIntro: "Leggi i feedback, verifica i bug e aggiorna lo stato delle segnalazioni.", all: "Tutti", status: "Stato", save: "Salva stato", saving: "Salvataggio…", saved: "Stato aggiornato.", reporter: "Inviata da", language: "Lingua della segnalazione", updated: "Aggiornata", none: "Nessuna segnalazione corrisponde ai filtri.",
  statuses: { new: "Nuova", in_review: "In esame", resolved: "Risolta", closed: "Chiusa" },
  pages: { dashboard: "Dashboard", discover: "Scopri", applications: "Candidature", inbox: "Inbox", materiali: "CV per posizione", questions: "Domande", preferences: "Preferenze", settings: "Account", billing: "Abbonamento", onboarding: "Primi passi", other: "Altro" },
  errors: { invalid_report: "Controlla tipo, oggetto (3–120 caratteri) e descrizione (10–4.000 caratteri).", invalid_json: "Impossibile leggere la richiesta. Riprova.", too_large: "La segnalazione è troppo lunga. Accorcia il testo e riprova.", rate_limited: "Hai raggiunto il limite di segnalazioni (5 all'ora, 20 al giorno). Riprova più tardi.", unauthorized: "La sessione è scaduta. Accedi di nuovo prima di inviare.", forbidden: "Non hai accesso a questa azione. Accedi con un account autorizzato.", payment_method_required: "Completa la verifica della carta per accedere a questa sezione.", trial_expired: "Il tuo account è in pausa. Gestisci il piano per accedere a questa sezione.", unavailable: "Impossibile completare la richiesta. La bozza è ancora qui: riprova.", invalid_status: "Scegli uno stato valido.", not_found: "Questa segnalazione non è più disponibile." },
};
export function reportError(code: string, locale: string) {
  const errors = reportCopy(locale).errors;
  return errors[code as keyof typeof errors] ?? errors.unavailable;
}
