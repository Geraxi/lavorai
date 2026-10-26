'use client';
import {useState} from 'react';
const endpoint='/api/admin/ordinary-validation/owner';
export function OwnerValidationPanel(){
 const [phone,setPhone]=useState(''),[consent,setConsent]=useState(false),[owns,setOwns]=useState(false),[evidence,setEvidence]=useState(''),[state,setState]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function request(action?:Record<string,unknown>){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const response=await fetch(endpoint,action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)}:{cache:'no-store'});
   const result=await response.json();if(!response.ok)throw new Error(result.error??'Request failed');
   setState(result);
  }catch(e){setMessage((e instanceof Error?e.message:'Unknown outcome')+'. Do not retry a submission. Refresh read-only state or close the fixture.');}
  finally{setBusy(false);}
 }
 const recipient=state?.preflight?.recipient?.address;
 const canRun=state?.setup?.state==='verified' && state?.window && state.window.recipient===recipient && !state?.preflight?.blockers?.length;
 return <section className="adm-card" style={{padding:24,display:'grid',gap:16}}>
  <p>Only internal account <strong>email-test-20261025@lavorai.it</strong>. Customer applications and notifications remain paused. Diagnostic real-submit stays off.</p>
  <a href="https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation" target="_blank" rel="noreferrer">Owned offer: LavorAI TEST — Ordinary Validation</a>
  <p>Synthetic profile/CV: <strong>LavorAI Test</strong>; internal account email above; software testing, TypeScript and automated testing. Clearly marked not a real applicant. No employment, education, salary, availability or location claims. Your entered phone is used only for this fixture. No subscription or quota changes.</p>
  <label>Approved phone <input value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="off" disabled={busy}/></label>
  <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> I have read the <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a> and consent to processing this synthetic profile/CV and my contact details. I authorize manual mode and exactly this application. Consent and test records remain for audit; mode returns off after the attempt.</label>
  <button disabled={busy||!consent||!phone.trim()} onClick={()=>void request({action:'prepare',phone,consent:true})}>1. Prepare fixture — no sending</button>
  <button disabled={busy} onClick={()=>void request()}>Refresh status — read only</button>
  <p>Resolved candidate email: <strong>{recipient??'Unknown until preparation'}</strong>. Do not attest an address you cannot access. A generated address or verified badge alone is not proof of receiving.</p>
  <label><input type="checkbox" checked={owns} onChange={e=>setOwns(e.target.checked)}/> I control this exact resolved mailbox and have independently verified receiving.</label>
  <label>Existing receiving evidence (date/source; no passwords or message contents)<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={500}/></label>
  <button disabled={busy||!owns||!recipient||evidence.trim().length<15||state?.setup?.state!=='prepared'} onClick={()=>void request({action:'verify',recipient,evidence,ownsAndReceives:true})}>2. Record recipient verification — no sending</button>
  <p>After verification, the operator configures the approved 15-minute exact-application window. This page never changes deployment variables. If there is any blocker, stop.</p>
  <button disabled={busy||!canRun} onClick={()=>{if(window.confirm('Submit exactly ONE ordinary synthetic application to the displayed owned offer and recipient? No retry after uncertainty.'))void request({action:'run',confirmOneSubmission:true});}}>3. Submit once through ordinary worker</button>
  <button disabled={busy||!state?.setup} onClick={()=>void request({action:'close'})}>Close fixture and set account mode off — no sending</button>
  <p>Closing is irreversible in this flow. After an outcome, the operator also removes the scoped deployment variables. Expiry does not cancel a provider request already accepted. If a request disconnects, do not submit again.</p>
  {message&&<p role="alert">{message}</p>}
  {state&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(state,null,2)}</pre>}
 </section>;
}
