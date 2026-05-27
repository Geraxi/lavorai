import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { Panel, TierChip, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const DT = (d: Date | null | undefined) =>
  d ? d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

interface PageProps {
  searchParams?: Promise<{ includeTest?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const includeTest = sp.includeTest === "1";

  // Pull more than needed; filter test/internal server-side so they don't
  // appear at all unless explicitly requested.
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
      applications: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          createdAt: true,
          status: true,
          job: { select: { title: true, company: true } },
        },
      },
    },
  });

  const users = includeTest ? raw : raw.filter((u) => !isTestAccount(u.email));

  const referrerIds = users.map((u) => u.referredById).filter((x): x is string => !!x);
  const referrers = referrerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: referrerIds } },
        select: { id: true, email: true },
      })
    : [];
  const referrerByIdMap = new Map(referrers.map((r) => [r.id, r.email]));

  return (
    <>
      <PageTitle
        title={`Utenti reali (${users.length})`}
        sub={
          includeTest
            ? "Visualizzazione completa, inclusi test/interni"
            : "Esclusi automaticamente test e account interni"
        }
      />

      <div style={{ marginBottom: 14, fontSize: 12 }}>
        <a
          href={includeTest ? "/admin/users" : "/admin/users?includeTest=1"}
          style={{ color: "var(--fg-muted)", textDecoration: "underline" }}
        >
          {includeTest ? "← solo utenti reali" : "mostra anche test/interni"}
        </a>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {users.length === 0 && (
          <Panel title="Nessun utente">
            <div style={{ color: "var(--fg-muted)", fontSize: 13 }}>
              {includeTest ? "Database vuoto." : "Nessun utente reale ancora."}
            </div>
          </Panel>
        )}

        {users.map((u) => {
          const roles = safeJsonArray(u.preferences?.rolesJson);
          const locs = safeJsonArray(u.preferences?.locationsJson);
          const hasCv = u._count.cvDocuments > 0;
          const test = isTestAccount(u.email);

          return (
            <div
              key={u.id}
              style={{
                background: "var(--bg-elev)",
                border: "1px solid var(--border-ds)",
                borderRadius: 12,
                padding: "14px 16px",
                opacity: test ? 0.6 : 1,
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--border-ds)",
                }}
              >
                <strong style={{ fontSize: 14 }}>{u.email}</strong>
                {u.name && <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>· {u.name}</span>}
                <TierChip tier={u.tier} />
                <span
                  style={{
                    fontSize: 10.5,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: u.emailVerified ? "rgba(34,197,94,0.12)" : "rgba(220,38,38,0.12)",
                    color: u.emailVerified ? "#86efac" : "#fca5a5",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {u.emailVerified ? "email verificata" : "non verificato"}
                </span>
                {test && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: "var(--bg-sunken)",
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    test
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--fg-subtle)" }}>
                  {u._count.applications} candidature
                </span>
              </div>

              {/* Detail grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                  fontSize: 12,
                }}
              >
                <DetailGroup title="Account">
                  <KV k="ID" v={<code style={{ fontSize: 10.5 }}>{u.id}</code>} />
                  <KV k="Registrato" v={DT(u.createdAt)} />
                  <KV k="Verificato" v={u.emailVerified ? DT(u.emailVerified) : "—"} />
                  <KV k="Ultimo login" v={DT(u.lastLoginAt)} />
                </DetailGroup>

                <DetailGroup title="Onboarding">
                  <KV k="CV" v={hasCv ? `sì (${u._count.cvDocuments})` : "non caricato"} />
                  <KV
                    k="Preferenze"
                    v={
                      u.preferences
                        ? `compilate · ${DT(u.preferences.updatedAt)}`
                        : "non compilate"
                    }
                  />
                  {u.preferences && (
                    <>
                      <KV
                        k="Auto-apply"
                        v={`${u.preferences.autoApplyOn ? "ON" : "OFF"} · ${u.preferences.autoApplyMode} · cap ${u.preferences.dailyCap}/g`}
                      />
                      <KV k="Match min" v={`${u.preferences.matchMin}%`} />
                      <KV k="Ruoli" v={roles.length ? roles.join(", ") : "—"} />
                      <KV k="Località" v={locs.length ? locs.join(", ") : "—"} />
                    </>
                  )}
                </DetailGroup>

                <DetailGroup title="Referral">
                  <KV k="Codice" v={u.referralCode ?? "non generato"} />
                  <KV
                    k="Arrivato da"
                    v={u.referredById ? (referrerByIdMap.get(u.referredById) ?? u.referredById) : "—"}
                  />
                </DetailGroup>

                <DetailGroup title={`Ultime candidature (${u.applications.length})`}>
                  {u.applications.length === 0 ? (
                    <div style={{ color: "var(--fg-subtle)" }}>nessuna</div>
                  ) : (
                    u.applications.map((a, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <div style={{ color: "var(--fg)" }}>
                          {a.job?.title ?? "—"}{" "}
                          <span style={{ color: "var(--fg-subtle)" }}>· {a.job?.company ?? "—"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                          {DT(a.createdAt)} · {a.status}
                        </div>
                      </div>
                    ))
                  )}
                </DetailGroup>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 4 }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ color: "var(--fg-subtle)", minWidth: 88, fontSize: 11 }}>{k}</span>
      <span style={{ color: "var(--fg)", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}
