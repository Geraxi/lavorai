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
  /** Risposte riutilizzabili già date dall'utente a domande di form
   *  precedenti (da UserAnswer). label→answer, match per label normalizzata. */
  storedAnswers?: Array<{ label: string; answer: string; kind?: string }>;
  /** Application ID — opzionale, usato solo per naming canary asset
   *  (es. screenshot Blob filename). Non strettamente necessario per
   *  l'apply normale. */
  applicationId?: string;
}

/**
 * Canary debug payload: ritornato dall'adapter quando CANARY_DEBUG=1.
 * Il worker lo serializza su Application.canaryLog per ispezione.
 * Risponde alla domanda: "il submit è davvero andato in porto?".
 */
export interface CanaryLog {
  /** Filename effettivo del CV attaccato all'input file (read da
   *  input.files[0].name). null = CV NON attaccato → submission rotta. */
  resumeAttachedFilename: string | null;
  /** URL screenshot del form right-before-submit, su Vercel Blob.
   *  null se Blob non disponibile o upload fallito. */
  preSubmitScreenshotUrl: string | null;
  /** URL screenshot post-submit (dopo response HTTP). */
  postSubmitScreenshotUrl: string | null;
  /** Tutti i campi form osservati: name/label/type/value/required. */
  fields: Array<{
    name: string;
    label: string;
    type: string;
    valueLength: number;
    required: boolean;
  }>;
  /** HTTP response status della POST di submission (null se nessuna POST). */
  submitHttpStatus: number | null;
  /** Body excerpt (primi 800 char) della response. */
  submitHttpBody: string | null;
  /** URL prima del submit. */
  urlBeforeSubmit: string;
  /** URL dopo il submit. */
  urlAfterSubmit: string;
  /** Body innerText post-submit (primi 800 char) — per spotting "thank
   *  you" / error banner / nothing. */
  bodyTextAfterSubmit: string;
  /** Timestamp ISO del capture. */
  capturedAt: string;
}

export type ApplyOutcome =
  | {
      ok: true;
      status: "submitted";
      confirmation?: string;
      canary?: CanaryLog;
    }
  | {
      ok: false;
      status:
        | "form_not_found"
        | "missing_field"
        | "captcha"
        | "validation_failed"
        | "unknown_error";
      error: string;
      canary?: CanaryLog;
    }
  | {
      // Form trovato e compilato per quanto possibile, ma restano campi
      // OBBLIGATORI che non sappiamo rispondere dai dati del candidato.
      // Chiediamo all'utente prima di inviare (niente submit incompleto).
      ok: false;
      status: "needs_user_input";
      error: string;
      pendingQuestions: PendingQuestion[];
      canary?: CanaryLog;
    };

/** Domanda obbligatoria di un form che richiede input dell'utente. */
export interface PendingQuestion {
  /** Testo della domanda così come appare nel form. */
  label: string;
  /** "text" | "textarea" | "select" | "react-select" | "checkbox" */
  kind: string;
  /** Opzioni disponibili (per select/react-select). */
  options?: string[];
}

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
