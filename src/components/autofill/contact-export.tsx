"use client";
import { useState } from 'react';
type Experience={role:string;company:string;location:string;startDate:string;endDate:string;description:string;bullets:string[]};
type DocumentChoice={id:string;originalFilename:string;createdAt:string};
export function ContactExport({name,email,phone,experiences,documents}:{name:string;email:string;phone:string;experiences:Experience[];documents:DocumentChoice[]}) {
 const [reviewed,setReviewed]=useState(false);
 const [documentId,setDocumentId]=useState('');
 const selected=documents.find(d=>d.id===documentId);
 function download(){
  if(!reviewed||!selected)return;
  const data={version:2,purpose:'lavorai-contact-autofill',name,email,phone,experiences,cvFilename:selected.originalFilename};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='lavorai-contact-autofill.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section>
  <dl><dt>Nome</dt><dd>{name||'Mancante'}</dd><dt>Email</dt><dd>{email||'Mancante'}</dd><dt>Telefono</dt><dd>{phone||'Non indicato'}</dd></dl>
  <h2>Esperienze salvate</h2><p>Questi dati non vengono riscritti o completati. Nell’estensione puoi consultarli e copiarli manualmente; nessuna domanda del datore di lavoro riceve risposte automatiche.</p>
  {experiences.map((e,i)=><pre key={i} style={{whiteSpace:'pre-wrap'}}>{[e.role,e.company,e.location,`${e.startDate} — ${e.endDate}`,e.description,...e.bullets].filter(Boolean).join('\n')}</pre>)}
  <label>CV da utilizzare <select value={documentId} onChange={e=>{setDocumentId(e.target.value);setReviewed(false);}}><option value="">Seleziona un documento</option>{documents.map(d=><option key={d.id} value={d.id}>{d.originalFilename} — {d.createdAt.slice(0,10)}</option>)}</select></label>
  {selected?<p><a href={`/api/autofill/cv/${encodeURIComponent(selected.id)}`}>Scarica e controlla {selected.originalFilename}</a>. Poi allegalo personalmente nel modulo del datore di lavoro.</p>:<p>Seleziona e controlla il documento prima di esportare. Non viene generato o modificato alcun CV.</p>}
  <p>Il file JSON contiene contatti, esperienze e nome del CV selezionato, non il contenuto del documento, credenziali o consensi. Conservalo sul tuo dispositivo ed eliminalo quando non serve più.</p>
  <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Ho verificato i dati e il CV selezionato e voglio esportarli per l’autocompilazione.</label>
  <p><button disabled={!reviewed||!name||!email||!selected} onClick={download}>Scarica dati per l’estensione</button></p>
 </section>;
}
