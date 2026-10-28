import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { ExperienceSchema } from '@/lib/cv-profile-types';
import { ContactExport } from '@/components/autofill/contact-export';
export const dynamic='force-dynamic';
export const metadata={title:'Autocompilazione · LavorAI',robots:{index:false,follow:false}};
export default async function AutofillPage(){
 const user=await getCurrentUser();if(!user)redirect('/login');
 const [profile,documents]=await Promise.all([
  prisma.cVProfile.findUnique({where:{userId:user.id},select:{firstName:true,lastName:true,email:true,phone:true,experiencesJson:true}}),
  prisma.cVDocument.findMany({where:{userId:user.id},select:{id:true,originalFilename:true,createdAt:true},orderBy:{createdAt:'desc'},take:30}),
 ]);
 let experiences:ReturnType<typeof ExperienceSchema.parse>[]=[];
 if(profile){try{const parsed=ExperienceSchema.array().max(30).safeParse(JSON.parse(profile.experiencesJson));if(parsed.success)experiences=parsed.data;}catch{/* Invalid stored history stays unavailable; never invent it. */}}
 return <main style={{maxWidth:680,margin:'32px auto',padding:24}}><h1>Autocompilazione con revisione</h1><p>Pilota per estensione Chrome/Edge, da installare separatamente con il tuo consenso. Non è attivo automaticamente e non invia candidature. Supporta il modulo Optics11 Senior Customer Experience Designer e i moduli di prova ProduzioneWeb autorizzati. Il comportamento sul sito live non è ancora verificato con dati reali.</p>{profile?<ContactExport name={`${profile.firstName} ${profile.lastName}`.trim()} email={profile.email} phone={profile.phone} experiences={experiences} documents={documents.map(d=>({...d,createdAt:d.createdAt.toISOString()}))}/>:<p>Completa prima il tuo profilo CV. Nessun dato viene inventato.</p>}<p>Apri il modulo supportato, carica il file nell’estensione, verifica destinatario e dati e scegli Compila. Seleziona personalmente il CV nel modulo del datore di lavoro. Domande, esperienza, consensi e invio restano manuali.</p><p>La pagina del datore di lavoro può ricevere i dati appena vengono inseriti, anche prima dell’invio finale. Usa l’estensione solo quando intendi condividerli.</p></main>;
}
