"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FilePenLine, Globe2, Sparkles } from "lucide-react";

type Article = { slug: string; title: string; keyword: string; category: string; status: string; generatedAt: string; publishedAt: string | null };

export function AdminEditorialStudio({ articles, nextTopic }: { articles: Article[]; nextTopic: { keyword: string; category: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = async (action: "generate" | "publish" | "unpublish", slug?: string) => {
    setBusy(`${action}:${slug ?? "next"}`); setNotice(null);
    try {
      const res = await fetch("/api/admin/editorial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, slug }) });
      const raw = await res.text();
      let data: { message?: string } = {};
      try {
        data = raw ? JSON.parse(raw) as { message?: string } : {};
      } catch {
        // A proxy error page should still result in a useful in-product message.
      }
      if (!res.ok) throw new Error(data.message ?? "Operazione non riuscita.");
      setNotice(action === "generate" ? "Bozza creata: rileggila prima di pubblicare." : action === "publish" ? "Guida pubblicata e pronta per l'indicizzazione." : "Guida rimessa in revisione.");
      router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Operazione non riuscita."); }
    finally { setBusy(null); }
  };
  return <section className="adm-card" aria-labelledby="editorial-title">
    <div className="adm-card-head"><div><div id="editorial-title" className="adm-card-title">Motore editoriale</div><div className="adm-card-sub">Due bozze SEO a settimana. L&apos;AI prepara; tu pubblichi solo dopo revisione.</div></div><a className="adm-link" href="/guide" target="_blank">Apri Guide ↗</a></div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 0 12px", borderBottom: "1px solid var(--border-ds)" }}>
      <div><div style={{ fontSize: 12, fontWeight: 700 }}>{nextTopic ? `Prossima: ${nextTopic.keyword}` : "Calendario completato"}</div><div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 3 }}>{nextTopic ? `${nextTopic.category} · domanda reale, non variante keyword.` : "Aggiungi nuovi brief solo se hanno un'utilità distinta."}</div></div>
      {nextTopic && <button className="adm-btn primary" disabled={busy !== null} onClick={() => act("generate")}><Sparkles size={13} />{busy === "generate:next" ? "Creo…" : "Crea bozza"}</button>}
    </div>
    <div style={{ display: "grid", gap: 0 }}>
      {articles.length === 0 ? <p style={{ fontSize: 12, color: "var(--fg-subtle)", margin: "14px 0 0" }}>Nessuna bozza ancora. La prima uscirà dal cron di lunedì o giovedì, oppure puoi crearla ora.</p> : articles.map((article) => {
        const published = article.status === "published";
        const loading = busy === `${published ? "unpublish" : "publish"}:${article.slug}`;
        return <div key={article.slug} className="adm-tr" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 12 }}>
          <div className="adm-ellipsis"><div style={{ fontWeight: 650 }}>{article.title}</div><div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>{article.category} · {article.keyword}</div></div>
          <span className={`adm-pill ${published ? "good" : "warn"}`}><span className="dot" />{published ? "Pubblicata" : "Da rivedere"}</span>
          <button className="adm-btn sm" disabled={busy !== null} onClick={() => act(published ? "unpublish" : "publish", article.slug)}>{published ? <FilePenLine size={11} /> : <Globe2 size={11} />}{loading ? "Attendi…" : published ? "Rivedi" : "Pubblica"}</button>
        </div>;
      })}
    </div>
    {notice && <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: notice.includes("non riuscita") ? "var(--red-ds)" : "hsl(var(--primary))" }}><Check size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />{notice}</p>}
  </section>;
}
