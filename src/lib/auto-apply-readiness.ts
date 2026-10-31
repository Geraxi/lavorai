import { applicationsPaused } from "@/lib/application-pause";
import { applicationRolloutConfig, automaticApplicationsBlocked } from "@/lib/application-rollout";
import { prisma } from "@/lib/db";
import { applicationPrerequisiteBlock } from "./application-prerequisites";
import { hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota } from "./billing";

export interface AutoApplyReadiness {
  tone: "ready" | "action" | "paused";
  eyebrow: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
}

/** A concise, user-facing explanation of why applications are or are not moving.
 * `matchingJobs` may be a promise so the dashboard can start these queries in
 * parallel with the globe data instead of waiting for it first. */
export async function getAutoApplyReadiness(userId: string, matchingJobsInput: number | Promise<number>): Promise<AutoApplyReadiness> {
  const rollout = applicationRolloutConfig();
  if (applicationsPaused() || !rollout.enabled) return {
    tone: "paused", eyebrow: "Candidature", title: "Invii in pausa",
    detail: "Gli invii sono temporaneamente sospesi. Le tue preferenze e lo storico sono conservati.",
    cta: "Vedi candidature", href: "/applications",
  };
  if (automaticApplicationsBlocked()) return {
    tone: "action", eyebrow: "Candidature", title: "Solo candidature confermate",
    detail: `L'invio automatico è sospeso. Il servizio accetta soltanto nuove candidature confermate esplicitamente, con un limite complessivo di ${rollout.dailyCap} invii al giorno (UTC). Le tue preferenze restano salvate.`,
    cta: "Vedi le offerte", href: "/jobs",
  };
  const [preferences, cvCount, sent, needsAnswers, waitingForConsent, matchingJobs, user] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId }, select: { autoApplyMode: true, rolesJson: true, locationsJson: true, sourcesJson:true } }),
    prisma.cVDocument.count({ where: { userId } }),
    prisma.application.count({ where: { userId, status: "success" } }),
    prisma.application.count({ where: { userId, status: "needs_answers" } }),
    prisma.application.count({ where: { userId, status: "awaiting_consent" } }),
    matchingJobsInput,
    prisma.user.findUnique({where:{id:userId},select:{email:true,tier:true,subscriptionStatus:true,currentPeriodEnd:true,trialEndsAt:true,trialGraceEndsAt:true,createdAt:true,privacyConsentAt:true,emailVerified:true,suspendedAt:true,pausedUntil:true,onboardedAt:true,seniority:true,englishLevel:true,noticePeriod:true,cvProfile:{select:{id:true}}}}),
  ]);
  if (!user) return {tone:'action',eyebrow:'Candidature',title:'Profilo non disponibile',detail:'Accedi nuovamente per verificare lo stato delle candidature.',cta:'Accedi',href:'/login'};
  const prerequisite=applicationPrerequisiteBlock(user);
  if(prerequisite)return {tone:'action',eyebrow:'Candidature',title:prerequisite.body.issue==='privacy_consent'?'Consenso privacy necessario':'Verifica la tua email',detail:prerequisite.body.message,cta:'Completa il requisito',href:prerequisite.body.redirect};
  if(user.suspendedAt||user.subscriptionStatus==='paused'||(user.pausedUntil&&user.pausedUntil>new Date()))return {tone:'paused',eyebrow:'Candidature',title:'Account in pausa',detail:'Controlla lo stato del tuo account prima di riprendere le candidature.',cta:'Vedi impostazioni',href:'/settings'};
  if(!hasPaidOrTrialApplicationAccess(user)&&!usesFreeWeeklyQuota(user))return {tone:'action',eyebrow:'Candidature',title:'Accesso agli invii non disponibile',detail:'Verifica il piano e la disponibilità della quota.',cta:'Vedi piano',href:'/billing'};
  if(!user.cvProfile||!user.onboardedAt||!user.seniority||!user.englishLevel||!user.noticePeriod)return {tone:'action',eyebrow:'Candidature',title:'Completa il profilo professionale',detail:'Mancano informazioni necessarie per preparare o cercare candidature.',cta:'Completa il profilo',href:'/onboarding'};
  const listHasItems = (value: string | null | undefined) => {
    try { return Array.isArray(JSON.parse(value ?? "[]")) && JSON.parse(value ?? "[]").length > 0; } catch { return false; }
  };
  const hasRoles = listHasItems(preferences?.rolesJson);
  const hasLocations = listHasItems(preferences?.locationsJson);

  if (!cvCount) return { tone: "action", eyebrow: "Auto-apply", title: "In attesa del tuo CV", detail: "Carica un CV, anche una prima bozza: è il documento che LavorAI adatta a ogni candidatura.", cta: "Carica il CV", href: "/onboarding" };
  if (!hasRoles || !hasLocations || !listHasItems(preferences?.sourcesJson)) return { tone: "action", eyebrow: "Auto-apply", title: "Imposta ruoli, località e modalità di lavoro", detail: "Ci servono per cercare offerte compatibili con il tuo profilo.", cta: "Imposta preferenze", href: "/preferences" };
  if (preferences?.autoApplyMode === "off") return { tone: "paused", eyebrow: "Auto-apply", title: "La ricerca automatica è in pausa", detail: "Riattivala dalle Preferenze quando vuoi riprendere a cercare e candidarti.", cta: "Riattiva auto-apply", href: "/preferences" };
  if (needsAnswers > 0) return { tone: "action", eyebrow: "Auto-apply", title: `${needsAnswers} ${needsAnswers === 1 ? "candidatura richiede" : "candidature richiedono"} una risposta`, detail: "Completa le informazioni richieste per farle proseguire.", cta: "Completa le risposte", href: "/questions" };
  if (waitingForConsent > 0) return { tone: "action", eyebrow: "Auto-apply", title: `${waitingForConsent} ${waitingForConsent === 1 ? "candidatura attende" : "candidature attendono"} il tuo consenso`, detail: "Rivedile e conferma quelle che vuoi inviare.", cta: "Rivedi candidature", href: "/applications" };
  if(preferences?.autoApplyMode==='manual')return {tone:'action',eyebrow:'Candidature manuali',title:'Scegli le candidature da inviare',detail:'Gli invii partono solo per le offerte che confermi. Quota, requisiti e compatibilità del portale vengono verificati prima dell’invio.',cta:'Vedi le offerte',href:'/jobs'};
  if(preferences?.autoApplyMode==='hybrid')return {tone:'ready',eyebrow:'Candidature con approvazione',title:'Ricerca con la tua approvazione',detail:'Le offerte trovate richiedono la tua conferma prima dell’invio. Non vengono inviate automaticamente.',cta:'Rivedi candidature',href:'/applications'};
  if(preferences?.autoApplyMode!=='auto')return {tone:'action',eyebrow:'Candidature',title:'Scegli una modalità',detail:'Imposta come vuoi gestire le candidature.',cta:'Vedi preferenze',href:'/preferences'};
  if (matchingJobs === 0) return { tone: "ready", eyebrow: "Auto-apply", title: "Ricerca attiva", detail: "Non ci sono ancora offerte compatibili nel pool. LavorAI continua a cercare per te.", cta: "Vedi preferenze", href: "/preferences" };
  if (sent > 0) return { tone: "ready", eyebrow: "Auto-apply", title: "Auto-apply al lavoro", detail: `Hai già ${sent} ${sent === 1 ? "candidatura inviata" : "candidature inviate"}. Stiamo monitorando ${matchingJobs} offerte compatibili.`, cta: "Vedi candidature", href: "/applications" };
  return { tone: "ready", eyebrow: "Auto-apply", title: "Profilo pronto, ricerca attiva", detail: `Stiamo valutando ${matchingJobs} offerte compatibili con le tue preferenze.`, cta: "Vedi le offerte", href: "/jobs" };
}
