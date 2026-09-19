/**
 * Draft follow-up email templates per candidature ghosted.
 * 
 * L'UTENTE decide se mandare (via mailto: link o copia-incolla).
 * MAI auto-inviamo a nome dell'utente — sarebbe disonesto impersonare
 * l'utente in una comunicazione follow-up che potrebbe danneggiare.
 */

export interface FollowUpDraft {
  subject: string;
  body: string;
  toAddress: string | null;
  jobTitle: string;
  company: string | null;
}

export function generateFollowUpDraft(data: {
  userFirstName: string;
  jobTitle: string;
  company: string | null;
  recruiterEmail: string | null;
  submittedAt: Date;
  daysSince: number;
  lang?: "it" | "en";
}): FollowUpDraft {
  const lang = data.lang ?? "it";
  const isIT = lang === "it";
  
  const company = data.company ?? (isIT ? "la vostra azienda" : "your company");
  const daysText = isIT
    ? data.daysSince === 7 ? "una settimana" : `${data.daysSince} giorni`
    : data.daysSince === 7 ? "a week" : `${data.daysSince} days`;

  const subject = isIT
    ? `Sollecito candidatura — ${data.jobTitle}`
    : `Follow-up on application — ${data.jobTitle}`;

  const body = isIT
    ? `Gentile team di ${company},\n\n` +
      `Vi avevo inviato la mia candidatura per la posizione di ${data.jobTitle} circa ${daysText} fa.\n\n` +
      `Sono ancora molto interessato/a a questa opportunità e vorrei sapere se avete avuto modo di ` +
      `esaminare il mio profilo. Sono disponibile per un colloquio conoscitivo nei prossimi giorni.\n\n` +
      `Resto in attesa di un vostro riscontro.\n\n` +
      `Cordiali saluti,\n${data.userFirstName}`
    : `Dear ${company} team,\n\n` +
      `I submitted my application for the ${data.jobTitle} position about ${daysText} ago.\n\n` +
      `I remain very interested in this opportunity and would like to know if you have had a chance ` +
      `to review my profile. I am available for an interview in the coming days.\n\n` +
      `Looking forward to hearing from you.\n\n` +
      `Best regards,\n${data.userFirstName}`;

  return {
    subject,
    body,
    toAddress: data.recruiterEmail,
    jobTitle: data.jobTitle,
    company: data.company,
  };
}

export function getMailtoLink(draft: FollowUpDraft): string {
  if (!draft.toAddress) return "";
  const params = new URLSearchParams({
    subject: draft.subject,
    body: draft.body,
  });
  return `mailto:${encodeURIComponent(draft.toAddress)}?${params.toString()}`;
}
