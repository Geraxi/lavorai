import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { Panel, TierChip, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

const DT = (d: Date | null | undefined) =>
  d ? d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
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

  // Resolve referrers in one pass.
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
      <PageTitle title={`Utenti recenti (${users.length})`} sub="Clicca una riga per espandere i dettagli completi" />
      <Panel title="Lista">
        <div style={{ display: "grid", gap: 6 }}>
          {users.map((u) => {
            const test = isTestAccount(u.email);
            const roles = safeJsonArray(u.preferences?.rolesJson);
            const locs = safeJsonArray(u.preferences?.locationsJson);
            const hasCv = u._count.cvDocuments > 0;
            return (
              <details
                key={u.id}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border-ds)",
                  borderRadius: 10,
                  opacity: test ? 0.55 : 1,
                }}
              >
                <summary
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.6fr) 70px 50px 60px 110px 110px",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    listStyle: "none",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <strong style={{ fontWeight: 600 }}>{u.email}</strong>
                    {u.name && <span style={{ color: "var(--fg-subtle)" }}> · {u.name}</span>}
                    {test && (
                      <span
                        style={{
                          marginLeft: 6,
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
                  </span>
                  <TierChip tier={u.tier} />
                  <span style={{ color: u.emailVerified ? "var(--fg)" : "var(--fg-subtle)" }}>
                    {u.emailVerified ? "verif." : "no"}
                  </span>
                  <span style={{ color: "var(--fg-muted)" }}>{u._count.applications} app</span>
                  <span style={{ color: "var(--fg-muted)" }}>{u.createdAt.toLocaleDateString("it-IT")}</span>
                  <span style={{ color: "var(--fg-muted)" }}>
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("it-IT") : "mai"}
                  </span>
                </summary>

                <div
                  style={{
                    padding: "12px 14px 14px",
                    borderTop: "1px solid var(--border-ds)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                    fontSize: 12,
                    color: "var(--fg-muted)",
                  }}
                >
                  <DetailGroup title="Account">
                    <KV k="ID" v={<code style={{ fontSize: 11 }}>{u.id}</code>} />
                    <KV k="Nome" v={u.name ?? "—"} />
                    <KV k="Email verificata" v={u.emailVerified ? DT(u.emailVerified) : "no"} />
                    <KV k="Registrato" v={DT(u.createdAt)} />
                    <KV k="Ultimo login" v={DT(u.lastLoginAt)} />
                  </DetailGroup>

                  <DetailGroup title="Onboarding">
                    <KV k="CV caricato" v={hasCv ? `sì (${u._count.cvDocuments})` : "no"} />
                    <KV
                      k="Preferenze"
                      v={
                        u.preferences
                          ? `sì · aggiornato ${DT(u.preferences.updatedAt)}`
                          : "non compilate"
                      }
                    />
                    {u.preferences && (
                      <>
                        <KV
                          k="Auto-apply"
                          v={`${u.preferences.autoApplyOn ? "ON" : "OFF"} · ${u.preferences.autoApplyMode} · cap ${u.preferences.dailyCap}/g`}
                        />
                        <KV k="Match min" v={String(u.preferences.matchMin)} />
                        <KV k="Ruoli" v={roles.length ? roles.join(", ") : "—"} />
                        <KV k="Località" v={locs.length ? locs.join(", ") : "—"} />
                      </>
                    )}
                  </DetailGroup>

                  <DetailGroup title="Referral">
                    <KV k="Codice" v={u.referralCode ?? "non generato"} />
                    <KV
                      k="Arrivato da"
                      v={u.referredById ? referrerByIdMap.get(u.referredById) ?? u.referredById : "—"}
                    />
                  </DetailGroup>

                  <DetailGroup title={`Ultime ${u.applications.length} candidature`}>
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
              </details>
            );
          })}
        </div>
      </Panel>
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
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 3 }}>{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ color: "var(--fg-subtle)", minWidth: 90, fontSize: 11 }}>{k}</span>
      <span style={{ color: "var(--fg)", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}
