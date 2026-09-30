import { adminPeriod, loadAdminGrowthMetrics } from "@/lib/admin-growth-metrics";
import { DataNotice, GrowthHeader } from "../_growth-ui";
import { Kpi } from "../_ui";
import { FileText, Send, ShieldCheck, UserRoundCheck } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Product", robots: { index: false } };
export default async function ProductPage({ searchParams }: { searchParams?: Promise<{ range?: string; from?: string; to?: string }> }) {
 const query = (await searchParams) ?? {}; const m = await loadAdminGrowthMetrics(adminPeriod(query)); const totalApps = m.applications.length;
 return <div className="adm-page"><GrowthHeader title="Product" sub="Attivazione, utilizzo e affidabilità dell&apos;esperienza." active="/admin/product" query={query} />
  <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12}}><Kpi label="CV caricati" value={m.cvUploaded} sub={`su ${m.currentUsers.length} nuovi utenti`} icon={<FileText size={15}/>}/><Kpi label="Setup completati" value={m.onboarded} sub="nel cohort del periodo" icon={<UserRoundCheck size={15}/>}/><Kpi label="Candidature create" value={totalApps} sub={`${m.delivered} inviate`} icon={<Send size={15}/>}/><Kpi label="Conferme rilevate" value={m.confirmed} sub="DETECTED_* su invii del periodo" tone="good" icon={<ShieldCheck size={15}/>}/></div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Utilizzo candidature</div><div className="adm-card-sub">Stati reali delle candidature create nel periodo.</div></div></div>{m.appByStatus.length ? m.appByStatus.map(([status,n])=><div className="adm-tr" key={status} style={{gridTemplateColumns:"1fr auto"}}><span>{status}</span><b className="adm-num">{n}</b></div>):<Empty/>}</section>
  <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Bucket di attivazione</div><div className="adm-card-sub">Cohort iscritti nel periodo.</div></div></div><Row label="Verifica email" value={m.verified} total={m.currentUsers.length}/><Row label="CV disponibile" value={m.cvUploaded} total={m.currentUsers.length}/><Row label="Onboarding" value={m.onboarded} total={m.currentUsers.length}/><Row label="Prima candidatura" value={m.firstApplication} total={m.currentUsers.length}/></section></div>
  <DataNotice>CV tailoring per candidatura, ritorni ripetuti, job view e ricerca sono i prossimi eventi di prodotto: questa pagina non mostra proxy al loro posto.</DataNotice>
 </div>;
}
function Row({label,value,total}:{label:string;value:number;total:number}){return <div className="adm-tr" style={{gridTemplateColumns:"minmax(0,1fr) 1fr 42px"}}><span>{label}</span><span style={{height:6,background:"var(--bg-sunken)",borderRadius:99,overflow:"hidden"}}><span style={{display:"block",height:"100%",width:`${total?value/total*100:0}%`,background:"hsl(var(--primary))"}}/></span><b className="adm-num" style={{textAlign:"right"}}>{value}</b></div>}; function Empty(){return <div style={{padding:"14px 0",color:"var(--fg-subtle)",fontSize:12}}>Nessuna candidatura nel periodo.</div>}
