'use client';
import {useState} from 'react';
export default function CustomerRolloutPage(){
 const [result,setResult]=useState<Record<string,unknown>|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function request(stop=false){
  if(busy)return;
  const batchId=result?.batchId as string|undefined;
  if(stop&&(!batchId||!window.confirm('Stop this rollout permanently? Accepted applications cannot be recalled.')))return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/customer-rollout',stop?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop',batchId:batchId})}:{cache:'no-store'});
   const body=await response.json();if(!response.ok)throw Error(body.error??'Request failed');
   if(stop){const status=await fetch('/api/admin/customer-rollout',{cache:'no-store'});if(!status.ok)throw Error('Stopped; refresh status to verify');setResult(await status.json());}else setResult(body);
  }catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-xl font-semibold">Customer rollout status</h1><p>This page cannot activate sending. Stop prevents further submissions at their next safety check; an already accepted application cannot be recalled.</p><button disabled={busy} onClick={()=>request()} className="rounded border px-4 py-2">Read current status</button>{' '}<button disabled={busy||!result?.batchId||result?.stopped===true} onClick={()=>request(true)} className="rounded border px-4 py-2">Stop this batch</button>{error&&<p role="alert">{error}</p>}{result&&<pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result,null,2)}</pre>}</main>;
}
