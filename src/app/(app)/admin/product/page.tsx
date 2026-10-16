import { loadActivationEvidence } from "@/lib/activation-evidence";
import { ActivationEvidence } from "@/components/activation-evidence";
import { adminPeriod, loadAdminGrowthMetrics } from "@/lib/admin-growth-metrics";
import { DataNotice, GrowthHeader } from "../_growth-ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { loadAdminPreferenceReport } from "@/lib/admin-preference-report";
import { AdminPreferenceKpis } from "./_preference-kpis";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Product", robots: { index: false } };
export default async function ProductPage({ searchParams }: { searchParams?: Promise<{ range?: string; from?: string; to?: string; includeTest?: string }> }) {
 const viewer = await getCurrentUser();
 if (!isAdmin(viewer?.email)) notFound();
 const query = (await searchParams) ?? {};
 const includeTest = query.includeTest === "1";
 const [m, preferences, activation] = await Promise.all([loadAdminGrowthMetrics(adminPeriod(query)), loadAdminPreferenceReport(includeTest), loadActivationEvidence(viewer?.email, adminPeriod(query)).catch(() => null)]);
 const preferenceQuery = new URLSearchParams();
 for (const [key, value] of Object.entries(query)) if (value !== undefined) preferenceQuery.set(key, value);
 if (includeTest) preferenceQuery.delete("includeTest"); else preferenceQuery.set("includeTest", "1");
 const preferenceToggleHref = `/admin/product?${preferenceQuery.toString()}#preferenze`;
 return <div className="adm-page"><GrowthHeader title="Product" sub="Attivazione, utilizzo e affidabilità dell&apos;esperienza." active="/admin/product" query={query} />
  <ActivationEvidence metrics={activation} />
  <section className="adm-card"><div className="adm-card-head"><div className="adm-card-title">Candidature create nel periodo · stati operativi</div></div>{m.appByStatus.map(([status, n]) => <div className="adm-tr" key={status} style={{gridTemplateColumns:"1fr auto"}}><span>{status}</span><b>{n}</b></div>)}</section>
  <DataNotice>CV tailoring per candidatura, ritorni ripetuti, job view e ricerca sono i prossimi eventi di prodotto: questa pagina non mostra proxy al loro posto.</DataNotice>
  <AdminPreferenceKpis metrics={preferences} includeTest={includeTest} actions={<Link href={preferenceToggleHref} className="adm-btn">{includeTest ? "Preferenze: solo reali" : "Preferenze: includi test"}</Link>} />
 </div>;
}
