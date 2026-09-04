import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { PageTitle, KpiTrendCard, TierChip, StatusPill, compactNumber } from "../_ui";
import {
  Users,
  UserCheck,
  Activity,
  UserPlus,
  Search,
  ChevronDown,
  MoreHorizontal,
  Copy,
  Mail,
  RotateCcw,
  Ban,
  Trash2,
  Download,
} from "lucide-react";

export const metadata: Metadata = { title: "Admin · Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;

interface PageProps {
  searchParams?: Promise<{ includeTest?: string; sel?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const includeTest = sp.includeTest === "1";

  const raw = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      name: true,
      tier: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      referralCode: true,
      referredById: true,
      signupReferrer: true,
      signupUtmSource: true,
      signupLandingPath: true,
      preferences: {
        select: {
          autoApplyMode: true,
          autoApplyOn: true,
          dailyCap: true,
          matchMin: true,
          rolesJson: true,
          locationsJson: true,
          updatedAt: true,
        },
      },
      _count: { select: { applications: true, cvDocuments: true } },
    },
  });
  const users = includeTest ? raw : raw.filter((u) => !isTestAccount(u.email));

  const now = Date.now();
  const since7d = new Date(now - 24 * 7 * 3600_000);
  const since14d = new Date(now - 24 * DAYS * 3600_000);
  const activeSince = new Date(now - 24 * 30 * 3600_000);

  const totalReal = users.length;
  const verified = users.filter((u) => !!u.emailVerified).length;
  const active = users.filter((u) => u.lastLoginAt && u.lastLoginAt >= activeSince).length;
  const new7d = users.filter((u) => u.createdAt >= since7d).length;

  // Serie sparkline: nuovi utenti per giorno negli ultimi 14g
  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const bucketDates = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const newUsersSeries = bucketDates(users.filter((u) => u.createdAt >= since14d).map((u) => u.createdAt));

  // Utente selezionato per pannello destro (default: primo)
  const selectedId = sp.sel ?? users[0]?.id ?? null;
  const selected = users.find((u) => u.id === selectedId) ?? users[0] ?? null;

  return (
    <>
      <PageTitle
        title={`Utenti reali (${totalReal})`}
        sub="Gestisci gli utenti reali della piattaforma. Sono esclusi automaticamente test e account interni."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href={includeTest ? "/admin/users" : "/admin/users?includeTest=1"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 10,
                background: "var(--bg-elev)",
                border: "1px solid var(--border-ds)",
                fontSize: 12,
                color: "var(--fg-muted)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {includeTest ? "Solo reali" : "Includi test"}
            </Link>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                background: "hsl(var(--primary))",
                color: "#0a0a0a",
                border: "none",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <UserPlus size={14} strokeWidth={2.5} />
              Aggiungi utente
            </button>
          </div>
        }
      />

      {/* Row 1 · 4 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTrendCard label="Utenti totali" value={compactNumber(totalReal)} sub={`+${new7d} nuovi negli ultimi 7 giorni`} series={newUsersSeries} color="hsl(var(--primary))" icon={<Users size={16} />} />
        <KpiTrendCard label="Account verificati" value={compactNumber(verified)} sub={totalReal > 0 ? `${Math.round((verified / totalReal) * 100)}% del totale` : "—"} series={newUsersSeries.map((v) => v * 0.85)} color="hsl(var(--primary))" icon={<UserCheck size={16} />} />
        <KpiTrendCard label="Utenti attivi (30g)" value={compactNumber(active)} sub={totalReal > 0 ? `${Math.round((active / totalReal) * 100)}% del totale` : "—"} series={newUsersSeries.map((v) => v * 0.7)} color="#60a5fa" icon={<Activity size={16} />} />
        <KpiTrendCard label="Nuovi utenti (7g)" value={compactNumber(new7d)} sub="Ultimi 7 giorni" series={newUsersSeries.slice(-7)} color="#a78bfa" icon={<UserPlus size={16} />} />
      </div>

      {/* Table + right panel */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 12, alignItems: "flex-start" }} className="admin-users-grid">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          {/* Filters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 130px 130px 130px", gap: 8, marginBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-subtle)" }} />
              <input
                type="search"
                placeholder="Cerca utenti, email o codice…"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 30px",
                  borderRadius: 8,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-ds)",
                  color: "var(--fg)",
                  fontSize: 12.5,
                }}
              />
            </div>
            {["Tutti gli stati", "Tutti i piani", "Tutti i ruoli", "Tutti sorgenti"].map((l) => (
              <button
                key={l}
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-ds)",
                  color: "var(--fg-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {l}
                <ChevronDown size={12} />
              </button>
            ))}
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "22px 1.5fr 100px 60px 90px 70px 70px 100px 90px 24px", gap: 10, fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 8, borderBottom: "1px solid var(--border-ds)" }}>
            <input type="checkbox" style={{ width: 13, height: 13 }} />
            <div>Utente</div>
            <div>Stato</div>
            <div>Piano</div>
            <div>Onboarding</div>
            <div style={{ textAlign: "center" }}>Auto-apply</div>
            <div style={{ textAlign: "right" }}>Cand.</div>
            <div>Ultimo</div>
            <div>Sorgente</div>
            <div />
          </div>

          {/* Rows */}
          {users.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--fg-subtle)", fontSize: 12 }}>Nessun utente</div>
          ) : (
            users.slice(0, 10).map((u) => {
              const isSel = u.id === selected?.id;
              const onboardingSteps = onboardingProgress(u);
              return (
                <Link
                  key={u.id}
                  href={`/admin/users?sel=${u.id}${includeTest ? "&includeTest=1" : ""}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px 1.5fr 100px 60px 90px 70px 70px 100px 90px 24px",
                    gap: 10,
                    alignItems: "center",
                    padding: "12px 4px",
                    borderBottom: "1px solid var(--border-ds)",
                    textDecoration: "none",
                    color: "inherit",
                    background: isSel ? "hsl(var(--primary)/0.06)" : "transparent",
                    borderRadius: isSel ? 8 : 0,
                    marginLeft: isSel ? -4 : 0,
                    marginRight: isSel ? -4 : 0,
                    paddingLeft: isSel ? 8 : 4,
                    paddingRight: isSel ? 8 : 4,
                  }}
                >
                  <input type="checkbox" style={{ width: 13, height: 13 }} onClick={(e) => e.stopPropagation()} />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Avatar email={u.email} name={u.name} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name ?? "—"}</div>
                    </div>
                  </div>
                  <div>
                    <StatusPill label={u.emailVerified ? "verificata" : "in attesa"} tone={u.emailVerified ? "good" : "warn"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    <TierChip tier={u.tier} />
                  </div>
                  <div>
                    <OnboardingBar step={onboardingSteps} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <ToggleBadge on={u.preferences?.autoApplyOn ?? false} />
                  </div>
                  <div style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 12.5 }}>{u._count.applications}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>{fmtDate(u.lastLoginAt)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortSource(u.signupReferrer, u.signupUtmSource)}</div>
                  <button type="button" aria-label="Menu" style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 2 }}><MoreHorizontal size={13} /></button>
                </Link>
              );
            })
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, fontSize: 11.5, color: "var(--fg-subtle)" }}>
            <span>Mostra {Math.min(10, users.length)} di {users.length} utenti</span>
            <div style={{ display: "flex", gap: 4 }}>
              <PagerBtn label="‹" />
              <PagerBtn label="1" active />
              <PagerBtn label="›" />
            </div>
          </div>
        </div>

        {/* Right panel */}
        {selected ? (
          <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)", position: "sticky", top: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Avatar email={selected.email} name={selected.name} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "var(--fg)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.email}</div>
                <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 1 }}>{selected.name ?? "—"}</div>
                <div style={{ marginTop: 6 }}>
                  <StatusPill label={selected.emailVerified ? "verificata" : "in attesa"} tone={selected.emailVerified ? "good" : "warn"} />
                </div>
              </div>
              <button type="button" style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 2 }} aria-label="Chiudi">×</button>
            </div>

            <div style={{ display: "flex", gap: 4, marginTop: 14, borderBottom: "1px solid var(--border-ds)", paddingBottom: 6 }}>
              {["Panoramica", `Cand. (${selected._count.applications})`, "Log", "Note"].map((t, i) => (
                <button key={t} type="button" style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: i === 0 ? "hsl(var(--primary)/0.12)" : "transparent", color: i === 0 ? "hsl(var(--primary))" : "var(--fg-muted)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{t}</button>
              ))}
            </div>

            <PanelSection title="Informazioni account" action="Modifica">
              <PanelKV k="ID" v={<><code style={{ fontSize: 10, color: "var(--fg-muted)" }}>{selected.id.slice(0, 16)}…</code> <Copy size={9} style={{ verticalAlign: "middle", color: "var(--fg-subtle)" }} /></>} />
              <PanelKV k="Email" v={selected.email} />
              <PanelKV k="Registrato" v={fmtDate(selected.createdAt)} />
              <PanelKV k="Verificato" v={fmtDate(selected.emailVerified)} />
              <PanelKV k="Ultimo accesso" v={fmtDate(selected.lastLoginAt)} />
              <PanelKV k="Piano" v={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><TierChip tier={selected.tier} /><button type="button" style={{ background: "transparent", border: "1px solid var(--border-ds)", color: "var(--fg-muted)", fontSize: 10.5, padding: "2px 8px", borderRadius: 6, cursor: "pointer" }}>Cambia</button></span>} />
              <PanelKV k="Sorgente" v={shortSource(selected.signupReferrer, selected.signupUtmSource) || "—"} />
              <PanelKV k="Codice referral" v={selected.referralCode ?? "—"} />
              <PanelKV k="Arrivato da" v={selected.referredById ?? "—"} />
            </PanelSection>

            <PanelSection title="Stato e attività" action="Modifica">
              <PanelKV k="Onboarding" v={<OnboardingBar step={onboardingProgress(selected)} inline />} />
              <PanelKV k="Preferenze CV" v={selected.preferences ? "Sì" : "No"} />
              <PanelKV k="Auto-apply" v={selected.preferences ? `${selected.preferences.autoApplyOn ? "ON" : "OFF"} · ${selected.preferences.autoApplyMode} · cap ${selected.preferences.dailyCap}/g` : "—"} />
              <PanelKV k="Match min" v={selected.preferences ? `${selected.preferences.matchMin}%` : "—"} />
              <PanelKV k="Ruoli" v={selected.preferences ? clip(safeArr(selected.preferences.rolesJson).join(", "), 40) : "—"} />
              <PanelKV k="Località" v={selected.preferences ? clip(safeArr(selected.preferences.locationsJson).join(", "), 40) : "—"} />
            </PanelSection>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
              <ActionBtn icon={<Mail size={12} />} label="Invia email" />
              <ActionBtn icon={<RotateCcw size={12} />} label="Reset crediti" />
              <ActionBtn icon={<Ban size={12} />} label="Sospendi" tone="warn" />
              <ActionBtn icon={<Trash2 size={12} />} label="Elimina" tone="bad" />
            </div>
            <div style={{ marginTop: 10 }}>
              <ActionBtn icon={<Download size={12} />} label="Esporta" full />
            </div>
          </div>
        ) : null}
      </div>

      <style>{`@media (max-width: 1100px) { .admin-users-grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

function Avatar({ email, name, size = 30 }: { email: string; name?: string | null; size?: number }) {
  const initials = (name?.split(" ").map((s) => s[0]).join("").slice(0, 2) || email.slice(0, 2)).toUpperCase();
  const colors = ["hsl(var(--primary))", "#60a5fa", "#a78bfa", "#fbbf24", "#f472b6", "#22d3ee"];
  const h = Array.from(email).reduce((s, c) => s + c.charCodeAt(0), 0);
  const c = colors[h % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: `color-mix(in srgb, ${c} 20%, transparent)`, color: c, display: "grid", placeItems: "center", fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function OnboardingBar({ step, inline }: { step: number; inline?: boolean }) {
  const max = 4;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, ...(inline ? { flex: 1 } : {}) }}>
      <div style={{ flex: 1, height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${(step / max) * 100}%`, height: "100%", background: "linear-gradient(90deg, hsl(var(--primary)), color-mix(in srgb, hsl(var(--primary)) 60%, transparent))" }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>{step}/{max}</span>
    </div>
  );
}

function ToggleBadge({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        borderRadius: 999,
        background: on ? "hsl(var(--primary)/0.15)" : "var(--bg-sunken)",
        color: on ? "hsl(var(--primary))" : "var(--fg-subtle)",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 999, background: on ? "hsl(var(--primary))" : "var(--fg-subtle)" }} />
      {on ? "ON" : "OFF"}
    </span>
  );
}

function PagerBtn({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        padding: "3px 9px",
        borderRadius: 6,
        background: active ? "var(--bg-sunken)" : "transparent",
        border: `1px solid ${active ? "var(--border-ds)" : "transparent"}`,
        color: "var(--fg-muted)",
        fontSize: 11.5,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function PanelSection({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-ds)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--fg)" }}>{title}</div>
        {action && <button type="button" style={{ background: "transparent", border: "1px solid var(--border-ds)", color: "var(--fg-muted)", fontSize: 10.5, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>{action}</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{children}</div>
    </div>
  );
}

function PanelKV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, fontSize: 11.5, alignItems: "center" }}>
      <span style={{ color: "var(--fg-subtle)" }}>{k}</span>
      <span style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

function ActionBtn({ icon, label, tone, full }: { icon: React.ReactNode; label: string; tone?: "warn" | "bad"; full?: boolean }) {
  const color = tone === "bad" ? "#f87171" : tone === "warn" ? "#fbbf24" : "var(--fg-muted)";
  return (
    <button
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: "7px 10px",
        borderRadius: 8,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-ds)",
        color,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        width: full ? "100%" : "auto",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function safeArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}
function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function shortSource(referrer: string | null | undefined, utm: string | null | undefined): string {
  const s = (utm || referrer || "").trim();
  if (!s) return "—";
  try {
    const u = new URL(s);
    return u.hostname.replace("www.", "");
  } catch {
    return clip(s, 22);
  }
}
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function onboardingProgress(u: {
  emailVerified: Date | null;
  preferences: { rolesJson: string | null; autoApplyOn: boolean } | null;
  _count: { cvDocuments: number };
}): number {
  let n = 0;
  if (u.emailVerified) n++;
  if (u._count.cvDocuments > 0) n++;
  if (u.preferences) n++;
  if (u.preferences?.autoApplyOn) n++;
  return n;
}
