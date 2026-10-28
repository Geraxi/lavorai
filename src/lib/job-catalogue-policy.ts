import type { Prisma } from '@prisma/client';
import { providerPolicy, providerOfferAllowed } from './application-provider-policy';
export const OWNED_TEST_PREFIX = 'https://produzioneweb.recruitee.com/o/lavorai-test-';
export const PUBLICATION_FRESH_MS = 24 * 60 * 60_000;
/** Apply in SQL before take/count. Unknown legacy publication is not evidence. */
export function catalogueWhere(now = new Date()): Prisma.JobWhereInput {
 const policy = providerPolicy();
 if (!policy.restricted) return {source:{not:'ats_test'},closedAt:null};
 if (!policy.valid) return {id:{in:[]}};
 return {source:'recruitee',closedAt:null,NOT:{url:{startsWith:OWNED_TEST_PREFIX,mode:'insensitive'}},applicationFormCapability:'standard',publicationVerifiedAt:{gte:new Date(+now-PUBLICATION_FRESH_MS),lte:now}};
}
export function catalogueJobVisible(job:{source:string;url:string;closedAt:Date|null;publicationVerifiedAt?:Date|null;applicationFormCapability?:string|null},now=new Date()) {
 if (job.source==='ats_test'||job.closedAt) return false;
 if (!providerPolicy().restricted) return true;
 return !job.url.toLowerCase().startsWith(OWNED_TEST_PREFIX)&&providerOfferAllowed(job.url)&&job.source==='recruitee'&&job.applicationFormCapability==='standard'&&!!job.publicationVerifiedAt&&+job.publicationVerifiedAt<=+now&&+job.publicationVerifiedAt>=+now-PUBLICATION_FRESH_MS;
}
export const CATALOGUE_NOTICE = 'Disponibilità verificata durante l’ultimo aggiornamento. Requisiti, domande obbligatorie e idoneità personale possono richiedere il tuo intervento prima dell’invio.';
