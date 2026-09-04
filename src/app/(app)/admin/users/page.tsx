import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { PageTitle, KpiTrendCard, TierChip, compactNumber } from "../_ui";
import { Users, CheckCircle2, Activity, UserPlus, Search, ChevronDown, MoreVertical, Copy, Mail, RotateCcw, Ban, Trash2, Download, X } from "lucide-react";

export const metadata: Metadata = { title: "Admin · Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;
const H = 3600_000;
const PAGE = 10;

interface PageProps {
  searchParams?: Promise<{ includeTest?: string; sel?: string; p?: string }>;
}

/**
 * /admin/users — viewport-fisso: header · 4 KPI · [tabella | pannello dettaglio].
 * Selezione via ?sel=<id>, paginazione via ?p=<n> (server-side, niente JS).
 */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const includeTest = sp.includeTest === "1";
  const page = Math.max(1, Number(sp.p ?? 1) || 1);
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);

  const raw = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, email: true, name: true, tier: true, emailVerified: true, createdAt: true, lastLoginAt: true,
      referralCode: true, referredById: true, signupReferrer: true, signupUtmSource: true,
      preferences: { select: { autoApplyMode: true, autoApplyOn: true, dailyCap: true, matchMin: true, rolesJson: true, locationsJson: true } },
      _count: { select: { applications: true, cvDocuments: true } },
    },
  });
  const users = includeTest ? raw : raw.filter((u) => !isTestAccount(u.email));

  const total = users.length;
  const verified = users.filter((u) => !!u.emailVerified).length;
  const active = users.filter((u) => u.lastLoginAt && u.lastLoginAt >= since(24 * 30)).length;
  const new7 = users.filter((u) => u.createdAt >= since(24 * 7)).length;
  const prev7 = users.filter((u) => u.createdAt >= since(24 * 14) && u.createdAt < since(24 * 7)).length;

  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const bucket = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const newSeries = bucket(users.map((u) => u.createdAt));
  const cumSeries = newSeries.map((_, i) => total - newSeries.slice(i + 1).reduce((s, v) => s + v, 0));
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const pageUsers = users.slice((page - 1) * PAGE, page * PAGE);
  const selected = users.find((u) => u.id === sp.sel) ?? pageUsers[0] ?? null;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (includeTest) p.set("includeTest", "1");
    if (page > 1) p.set("p", String(page));
    for (const [k, v] of Object.entries(extra)) v == null ? p.delete(k) : p.set(k, v);
    const s = p.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };

  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
      <PageTitle
        title={`Utenti reali (${total})`}
        sub="Gestisci gli utenti reali della piattaforma. Sono esclusi automaticamente test e account interni."
        actions={
          <>
            <Link href={qs({ includeTest: includeTest ? undefined : "1", p: undefined })} className="adm-btn">{includeTest ? "Solo reali" : "Includi test"}</Link>
            <button type="button" className="adm-btn primary"><UserPlus size={14} strokeWidth={2.5} />Aggiungi utente</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Utenti totali" value={total.toLocaleString("it-IT")} sub={`+${new7} nuovi negli ultimi 7 giorni`} delta={dPct(new7, prev7)} series={cumSeries} color="hsl(var(--primary))" icon={<Users size={15} />} />
        <KpiTrendCard label="Account verificati" value={verified.toLocaleString("it-IT")} sub={`${total - verified} in attesa di verifica`} deltaLabel={total > 0 ? `${((verified / total) * 100).toFixed(1)}%` : undefined} series={cumSeries.map((v) => v * (verified / Math.max(1, total)))} color="hsl(var(--primary))" icon={<CheckCircle2 size={15} />} />
        <KpiTrendCard label="Utenti attivi" value={active.toLocaleString("it-IT")} sub="login negli ultimi 30 giorni" deltaLabel={total > 0 ? `${Math.round((active / total) * 100)}%` : undefined} series={cumSeries.map((v) => v * (active / Math.max(1, total)))} color="#60a5fa" icon={<Activity size={15} />} />
        <KpiTrendCard label="Nuovi utenti" value={new7.toLocaleString("it-IT")} sub="negli ultimi 7 giorni" series={newSeries.slice(-7)} color="#22d3ee" icon={<UserPlus size={15} />} sparkKind="bars" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 12, minHeight: 0 }}>
        {/* Tabella */}
        <div className="adm-card" style={{ padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 150px)", gap: 8, marginBottom: 12, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }} />
              <input type="search" placeholder="Cerca utenti, email o codice…" style={{ width: "100%", padding: "8px 12px 8px 30px", borderRadius: 8, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", color: "var(--fg)", fontSize: 12.5, outline: "none" }} />
            </div>
            {["Tutti gli stati", "Tutti i piani", "Tutti i ruoli", "Tutti i sorgenti"].map((l) => (
              <span key={l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", color: "var(--fg-muted)", fontSize: 12 }}>{l}<ChevronDown size={12} /></span>
            ))}
          </div>

          <div className="adm-th" style={{ gridTemplateColumns: "20px minmax(240px,2.6fr) 100px 58px 84px 70px 74px 96px 80px 20px" }}>
            <Box /><div>Utente</div><div>Stato</div><div>Piano</div><div>Onboarding</div><div>Auto-apply</div><div>Candidature</div><div>Ultimo accesso</div><div>Sorgente</div><div />
          </div>

          <div className="adm-card-body scroll">
            {pageUsers.length === 0 && <div style={{ padding: 20, fontSize: 12, color: "var(--fg-subtle)" }}>Nessun utente</div>}
            {pageUsers.map((u) => {
              const sel = u.id === selected?.id;
              const step = onboarding(u);
              return (
                <Link key={u.id} href={qs({ sel: u.id })} className="adm-tr" style={{ gridTemplateColumns: "20px minmax(240px,2.6fr) 100px 58px 84px 70px 74px 96px 80px 20px", padding: "9px 6px", textDecoration: "none", color: "inherit", background: sel ? "hsl(var(--primary)/0.07)" : "transparent", borderRadius: 8, margin: "0 -6px" }}>
                  <Box />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar email={u.email} name={u.name} />
                    <div style={{ minWidth: 0 }}>
                      <div className="adm-ellipsis" style={{ color: "var(--fg)", fontWeight: 500 }}>{u.email}</div>
                      <div className="adm-ellipsis" style={{ color: "var(--fg-subtle)", fontSize: 11 }}>{u.name ?? "—"}</div>
                    </div>
                  </div>
                  <span className={`adm-pill ${u.emailVerified ? "good" : "warn"}`} style={{ padding: "3px 9px", fontSize: 10.5, justifySelf: "start" }}><span className="dot" />{u.emailVerified ? "Verificata" : "In attesa"}</span>
                  <div><TierChip tier={u.tier} /></div>
                  <Onboarding step={step} />
                  <Toggle on={u.preferences?.autoApplyOn ?? false} />
                  <div className="adm-num" style={{ color: "var(--fg)", fontWeight: 600, textAlign: "center" }}>{u._count.applications}</div>
                  <div className="adm-num" style={{ color: "var(--fg-muted)", fontSize: 11.5, lineHeight: 1.3 }}>{fmt2(u.lastLoginAt)}</div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-muted)", fontSize: 11.5 }}>{source(u.signupReferrer, u.signupUtmSource)}</div>
                  <MoreVertical size={14} style={{ color: "var(--fg-subtle)" }} />
                </Link>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, fontSize: 11.5, color: "var(--fg-subtle)", flexShrink: 0 }}>
            <span>Mostra {pageUsers.length} di {total} utenti</span>
            <div style={{ display: "flex", gap: 4 }}>
              <Link href={qs({ p: page > 2 ? String(page - 1) : undefined })} className="adm-btn sm" aria-disabled={page === 1}>‹</Link>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                <Link key={i} href={qs({ p: i === 0 ? undefined : String(i + 1) })} className="adm-btn sm" style={{ background: page === i + 1 ? "var(--bg-sunken)" : "transparent", borderColor: page === i + 1 ? "var(--border-ds)" : "transparent" }}>{i + 1}</Link>
              ))}
              <Link href={qs({ p: page < totalPages ? String(page + 1) : String(page) })} className="adm-btn sm">›</Link>
            </div>
          </div>
        </div>

        {/* Pannello dettaglio */}
        {selected && (
          <div className="adm-card">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexShrink: 0 }}>
              <Avatar email={selected.email} name={selected.name} size={46} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="adm-ellipsis" style={{ fontSize: 13.5, color: "var(--fg)", fontWeight: 700 }}>{selected.email}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{selected.name ?? "—"}</div>
                <span className={`adm-pill ${selected.emailVerified ? "good" : "warn"}`} style={{ marginTop: 5, padding: "3px 9px", fontSize: 10.5 }}><span className="dot" />{selected.emailVerified ? "Verificata" : "In attesa"}</span>
              </div>
              <button type="button" className="adm-btn sm"><Download size={11} />Esporta</button>
              <X size={14} style={{ color: "var(--fg-subtle)" }} />
            </div>

            <div style={{ display: "flex", gap: 2, marginTop: 12, borderBottom: "1px solid var(--border-ds)", flexShrink: 0 }}>
              {["Panoramica", `Candidature (${selected._count.applications})`, "Log", "Note"].map((t, i) => (
                <span key={t} style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: i === 0 ? "var(--fg)" : "var(--fg-muted)", borderBottom: i === 0 ? "2px solid hsl(var(--primary))" : "2px solid transparent", marginBottom: -1 }}>{t}</span>
              ))}
            </div>

            <div className="adm-card-body scroll" style={{ gap: 0 }}>
              <PSection title="Informazioni account">
                <KV k="ID" v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><code style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>{selected.id}</code><Copy size={10} style={{ color: "var(--fg-subtle)" }} /></span>} />
                <KV k="Email" v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{selected.email}<Copy size={10} style={{ color: "var(--fg-subtle)" }} /></span>} />
                <KV k="Registrato" v={fmt2(selected.createdAt)} />
                <KV k="Verificato" v={fmt2(selected.emailVerified)} />
                <KV k="Ultimo accesso" v={fmt2(selected.lastLoginAt)} />
                <KV k="Piano" v={<span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><TierChip tier={selected.tier} /><span className="adm-btn sm">Cambia</span></span>} />
                <KV k="Sorgente" v={source(selected.signupReferrer, selected.signupUtmSource)} />
                <KV k="Codice referral" v={selected.referralCode ?? "—"} />
                <KV k="Arrivato da" v={selected.referredById ?? "—"} />
              </PSection>
              <PSection title="Stato e attività">
                <KV k="Onboarding" v={<Onboarding step={onboarding(selected)} wide />} />
                <KV k="Preferenze CV" v={selected.preferences ? "Sì" : "No"} />
                <KV k="Auto-apply" v={selected.preferences ? `${selected.preferences.autoApplyOn ? "ON" : "OFF"} · ${selected.preferences.autoApplyMode} · cap ${selected.preferences.dailyCap}/g` : "—"} />
                <KV k="Match min" v={selected.preferences ? `${selected.preferences.matchMin}%` : "—"} />
                <KV k="Ruoli" v={selected.preferences ? arr(selected.preferences.rolesJson).slice(0, 3).join(", ") || "—" : "—"} />
                <KV k="Località" v={selected.preferences ? arr(selected.preferences.locationsJson).slice(0, 3).join(", ") || "—" : "—"} />
              </PSection>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, paddingTop: 10, flexShrink: 0 }}>
              <button type="button" className="adm-btn sm" style={{ justifyContent: "center" }}><Mail size={11} />Invia email</button>
              <button type="button" className="adm-btn sm" style={{ justifyContent: "center" }}><RotateCcw size={11} />Reset crediti</button>
              <button type="button" className="adm-btn sm" style={{ justifyContent: "center", color: "#fbbf24" }}><Ban size={11} />Sospendi</button>
              <button type="button" className="adm-btn sm" style={{ justifyContent: "center", color: "#f87171" }}><Trash2 size={11} />Elimina</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Box() {
  return <span style={{ width: 13, height: 13, borderRadius: 3, border: "1px solid var(--border-ds)", background: "var(--bg-sunken)", display: "inline-block" }} />;
}
function Avatar({ email, name, size = 30 }: { email: string; name?: string | null; size?: number }) {
  const ini = (name?.split(/\s+/).map((s) => s[0]).join("").slice(0, 2) || email.slice(0, 2)).toUpperCase();
  const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];
  const h = Array.from(email).reduce((s, c) => s + c.charCodeAt(0), 0);
  const c = colors[h % colors.length];
  return <div style={{ width: size, height: size, borderRadius: 999, background: `color-mix(in srgb, ${c} 28%, transparent)`, color: "#fff", display: "grid", placeItems: "center", fontSize: size * 0.34, fontWeight: 700, flexShrink: 0 }}>{ini}</div>;
}
function Onboarding({ step, wide }: { step: number; wide?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: wide ? "100%" : undefined }}>
      <div style={{ flex: 1, height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden", minWidth: 40 }}>
        <div style={{ width: `${(step / 4) * 100}%`, height: "100%", background: "hsl(var(--primary))" }} />
      </div>
      <span className="adm-num" style={{ fontSize: 11, color: "var(--fg-muted)" }}>{step}/4</span>
    </div>
  );
}
function Toggle({ on }: { on: boolean }) {
  return <span className={`adm-pill ${on ? "good" : "neutral"}`} style={{ padding: "3px 9px", fontSize: 10.5, justifySelf: "start" }}><span className="dot" />{on ? "ON" : "OFF"}</span>;
}
function PSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--fg)" }}>{title}</div>
        <span className="adm-btn sm">Modifica</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, fontSize: 11.5, alignItems: "center" }}>
      <span style={{ color: "var(--fg-subtle)" }}>{k}</span>
      <span className="adm-ellipsis" style={{ color: "var(--fg)" }}>{v}</span>
    </div>
  );
}
function arr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function source(ref: string | null | undefined, utm: string | null | undefined): string {
  const s = (utm || ref || "").trim();
  if (!s) return "—";
  try {
    return new URL(s).hostname.replace(/^www\./, "");
  } catch {
    return s.length > 18 ? s.slice(0, 17) + "…" : s;
  }
}
function fmt2(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}
function onboarding(u: { emailVerified: Date | null; preferences: { autoApplyOn: boolean } | null; _count: { cvDocuments: number } }): number {
  return (u.emailVerified ? 1 : 0) + (u._count.cvDocuments > 0 ? 1 : 0) + (u.preferences ? 1 : 0) + (u.preferences?.autoApplyOn ? 1 : 0);
}
