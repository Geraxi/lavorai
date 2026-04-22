import type { Browser, Page } from "playwright";
import type { CVProfile } from "@/lib/cv-profile-types";

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
}

export type ApplyOutcome =
  | { ok: true; status: "submitted"; confirmation?: string }
  | { ok: false; status: "form_not_found" | "missing_field" | "captcha" | "unknown_error"; error: string };

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
