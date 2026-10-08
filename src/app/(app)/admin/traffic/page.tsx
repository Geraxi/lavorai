import { parseRange } from "@/components/admin-range";
import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";


export default async function AdminTrafficPage({ searchParams }: { searchParams?: Promise<{ range?: string | string[] }> }) {
  const sp = (await searchParams) ?? {};
  const rawRange = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = parseRange(rawRange, 7);
  // Il loader non deve mai far cadere la pagina con un 500: se i dati
  // (PageView/landing) mancano o sono malformati mostriamo un messaggio.
  try {
    return await AdminTraffic({ days: range });
  } catch (err) {
    console.error("[admin/traffic] render failed", err);
    return (
      <div className="adm-page">
        <div className="adm-card">
          <div className="adm-card-title">Traffico sito</div>
          <div className="adm-card-sub">Dati di traffico non disponibili al momento. Riprova più tardi.</div>
        </div>
      </div>
    );
  }
}
