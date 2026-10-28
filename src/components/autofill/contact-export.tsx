"use client";
import { useState } from 'react';
export function ContactExport({name,email,phone}:{name:string;email:string;phone:string}) {
 const [reviewed,setReviewed]=useState(false);
 function download(){if(!reviewed)return;const data={version:1,purpose:'lavorai-contact-autofill',name,email,phone};const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lavorai-contact-autofill.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section><dl><dt>Nome</dt><dd>{name||'Mancante'}</dd><dt>Email</dt><dd>{email||'Mancante'}</dd><dt>Telefono</dt><dd>{phone||'Non indicato'}</dd></dl><p>Il file contiene solo questi dati salvati. Non include CV, credenziali, consensi o risposte alle domande. Conservalo sul tuo dispositivo ed eliminalo quando non serve più.</p><label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> Ho verificato i dati e voglio scaricarli per l’autocompilazione.</label><p><button disabled={!reviewed||!name||!email} onClick={download}>Scarica dati di contatto</button></p></section>;
}
