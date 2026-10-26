'use client';
import {useState} from 'react';
export function MainValidationPanel(){
 const [state,setState]=useState<any>(null),[busy,setBusy]=useState(false),[current,setCurrent]=useState(false),[owns,setOwns]=useState(false),[evidence,setEvidence]=useState(''),[error,setError]=useState('');
 async function request(body?:Record<string,unknown>){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/admin/ordinary-validation/main-owner',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error);setState(data);}catch(e){setError((e instanceof Error?e.message:'Unknown outcome')+'. Do not repeat a submission; refresh read-only state.');}finally{setBusy(false);}}
 const recipient=state?.preflight?.recipient?.address;
 const ready=state?.setup?.state==='verified'&&state?.window&&state.window.recipient===recipient&&!state?.preflight?.blockers?.length;
 return <section className="adm-card" style={{padding:24,display:'grid',gap:16}}>
 <p>Only umbertogeraci0@gmail.com, using your existing real profile and latest CV. Personal documents, preferences, plan and quota are not reset or replaced. The normal worker may generate a tailored CV from those facts. Customers and notifications remain paused.</p>
 <a href="https://produzioneweb.recruitee.com/o/lavorai-test-ordinary-validation" target="_blank" rel="noreferrer">Owned ProduzioneWeb test posting — not a real vacancy</a>
 <button disabled={busy} onClick={()=>void request()}>Read current status — no changes</button>
 <p>Selected document: <strong>{state?.source?.filename??'Read status first'}</strong></p>
 <label><input type="checkbox" checked={current} onChange={e=>setCurrent(e.target.checked)}/> This is my current real CV. I reviewed its contents and authorize this profile/CV and ordinary contact details for this one owned test posting. If it contains additional sensitive information requiring separate consent, stop here.</label>
 <button disabled={busy||!current||!state?.source||!!state?.setup||!!state?.preflight?.blockers?.length} onClick={()=>void request({action:'prepare',cvId:state.source.id,cvHash:state.source.hash,confirmCurrentRealCV:true})}>Prepare one application — no sending</button>
 <p>Actual candidate email: <strong>{recipient??'Resolved after preparation'}</strong>. A generated address alone does not prove receiving.</p>
 <label><input type="checkbox" checked={owns} onChange={e=>setOwns(e.target.checked)}/> I control this exact mailbox and independently verified receiving.</label>
 <label>Existing receiving evidence (date/source, no passwords or message contents)<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={500}/></label>
 <button disabled={busy||!owns||!recipient||evidence.trim().length<15||state?.setup?.state!=='prepared'} onClick={()=>void request({action:'verify',recipient,evidence,ownsAndReceives:true})}>Record mailbox verification — no sending</button>
 <p>After verification the operator enables only this application for 15 minutes. No general queue is opened.</p>
 <button disabled={busy||!ready} onClick={()=>{if(window.confirm('Send exactly ONE ordinary application with your real CV/profile to the owned test offer and displayed mailbox? Do not retry after uncertainty.'))void request({action:'run',confirmOneSubmission:true});}}>Submit once</button>
 <button disabled={busy||!state?.setup||state.setup.state==='closed'} onClick={()=>void request({action:'close'})}>Close this test only — preserve my settings</button>
 <p>Every completed or failed invocation closes the test. If the connection drops, refresh status and close; never submit again. The operator removes the temporary window. Closing does not cancel an already accepted provider request.</p>
 {error&&<p role="alert">{error}</p>}{state&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(state,null,2)}</pre>}
 </section>;
}
