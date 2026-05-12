import type { Browser, Page } from "playwright";
import type { CVProfile } from "@/lib/cv-profile-types";
import type { ApplicationAnswers } from "@/lib/application-answers";

/**
 * Portal Adapter: plug-in che sa come compilare il form di candidatura
 * di uno specifico ATS (Greenhouse, Lever, Workable, InfoJobs, ecc.).
 *
 * Contratto: non richiede credenziali. Gli ATS espongono form PUBBLICI
 * di candidatura — compileremo solo nome/email/telefono + upload CV,
 * come un umano in incognito.
 *
 * Mai LinkedIn/Indeed da qui: quelli hanno anti-bot aggressivo + ToS che
 * vieta automazione; li evitiamo esplicitamente.
 */

export interface ApplyInput {
  profile: CVProfile;
  /** Email dell'account utente — fallback quando profile.email è vuoto.
   *  Sempre presente. Garantisce che il form ATS abbia un'email valida
   *  altrimenti la conferma del recruiter non arriva mai. */
  userEmail: string;
  /** Telefono fallback (account/preferences) se profile.phone vuoto. */
  userPhone?: string;
  /** Path locale del CV (assicurato via ensureLocalPath nel worker) */
  cvLocalPath: string;
  /** Path locale della cover letter (opzionale per alcuni ATS) */
  clLocalPath: string;
  /** Testo della cover letter (per textarea dove non si carica file) */
  coverLetterText: string;
  /** URL completo del job */
  jobUrl: string;
  /** "dryRun" → non preme submit, solo verifica che il form si compili */
  dryRun: boolean;
  /** Risposte standard pre-compilate dall'utente (work auth, salary,
   *  notice period, LinkedIn, EEO, ecc). L'adapter le inietta nei
   *  campi custom che riconosce via fuzzy-match label. */
  answers?: ApplicationAnswers;
}

export type ApplyOutcome =
  | { ok: true; status: "submitted"; confirmation?: string }
  | {
      ok: false;
      status:
        | "form_not_found"
        | "missing_field"
        | "captcha"
        | "validation_failed"
        | "unknown_error";
      error: string;
    };

export interface PortalAdapter {
  /** Identificatore macchina (es. "greenhouse") */
  id: string;
  /** Nome leggibile */
  label: string;
  /** true se questo adapter gestisce l'URL passato */
  matches(url: string): boolean;
  /** Esegue la candidatura. Il worker gestisce il browser / ensureLocalPath. */
  apply(page: Page, input: ApplyInput): Promise<ApplyOutcome>;
}

export type BrowserFactory = () => Promise<Browser>;
