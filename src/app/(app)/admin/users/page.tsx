import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { Panel, Td, Th, TierChip, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Utenti", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      email: true,
      name: true,
      tier: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { applications: true } },
    },
  });

  return (
    <>
      <PageTitle title={`Utenti recenti (${recentUsers.length})`} />
      <Panel title="Lista">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-subtle)", borderBottom: "1px solid var(--border-ds)" }}>
                <Th>Email</Th>
                <Th>Tier</Th>
                <Th>Verif.</Th>
                <Th>Candid.</Th>
                <Th>Registrato</Th>
                <Th>Ultimo login</Th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => {
                const test = isTestAccount(u.email);
                return (
                  <tr key={u.email} style={{ borderBottom: "1px solid var(--border-ds)", opacity: test ? 0.5 : 1 }}>
                    <Td>
                      {u.email}
                      {test && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "var(--bg-sunken)", color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          test/interno
                        </span>
                      )}
                    </Td>
                    <Td><TierChip tier={u.tier} /></Td>
                    <Td>{u.emailVerified ? "✅" : "❌"}</Td>
                    <Td>{u._count.applications}</Td>
                    <Td>{u.createdAt.toLocaleDateString("it-IT")}</Td>
                    <Td>{u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("it-IT") : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
