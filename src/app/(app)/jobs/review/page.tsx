import {reviewedOfferUrls} from '@/lib/assisted-reviewed-offers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { parsePreferenceList } from '@/lib/auto-apply-preferences';
import { assistedOpportunity } from '@/lib/assisted-opportunity';
import { PUBLICATION_FRESH_MS } from '@/lib/job-catalogue-policy';

export const dynamic = 'force-dynamic';
/** Disabled until separately reviewed for release. No writes, files or provider calls. */
export default async function ReviewOpportunities() {
 if (process.env.ASSISTED_OPPORTUNITIES_REVIEW !== 'true') redirect('/jobs');
 const user = await getCurrentUser();
 if (!user) redirect('/login');
 const owner = await prisma.user.findUnique({where:{id:user.id},include:{preferences:true}});
 const prefs = owner?.preferences;
 if (!owner || owner.suspendedAt || !owner.privacyConsentAt || !owner.emailVerified ||
     !prefs || !['manual','hybrid','auto'].includes(prefs.autoApplyMode)) redirect('/settings');
 const now = new Date();
 const jobs = await prisma.job.findMany({where:{source:'recruitee',closedAt:null,
   OR:[{applicationFormCapability:'questions'},{applicationFormCapability:'standard',url:{in:reviewedOfferUrls(process.env.ASSISTED_RECRUITEE_REVIEW_URLS)}}],publicationVerifiedAt:{gte:new Date(+now-PUBLICATION_FRESH_MS),lte:now}},
   orderBy:[{publicationVerifiedAt:'desc'},{id:'asc'}],take:200});
 const matched = jobs.filter(job=>assistedOpportunity(job,{
   ...prefs,roles:parsePreferenceList(prefs.rolesJson)??[],locations:parsePreferenceList(prefs.locationsJson)??[],
   avoidCompanies:owner.avoidCompanies,seniority:owner.seniority},now));
 return <main style={{padding:32,maxWidth:900}}>
   <Link href="/jobs">Torna alle offerte</Link>
   <h1>Opportunità da valutare</h1>
   <p>Queste offerte richiedono risposte e una verifica del modulo. Non sono candidature inviate o pronte all’invio automatico.</p>
   <p>Il punteggio minimo automatico resta invariato. Questa lista permette solo di valutare opportunità pertinenti; non certifica qualifiche, diritto al lavoro o compatibilità tecnica.</p>
   {!matched.length && <p>Nessuna opportunità verificata corrisponde attualmente ai ruoli e alle località indicati.</p>}
   {matched.map(job=><section key={job.id} style={{marginTop:24}}>
     <h2>{job.title}</h2><p>{job.company} · {job.location}</p>
     <p>Da verificare: risposte personali, eventuali allegati e controlli del datore di lavoro. Nessuna risposta viene inventata e nessun consenso viene selezionato automaticamente.</p>
     <Link href={`/jobs/review/${job.id}`}>Prepara risposte e documenti, senza inviare</Link>
   </section>)}
   {jobs.length===200 && <p>Controllo limitato alle prime 200 offerte aggiornate; non è un elenco completo.</p>}
 </main>;
}
