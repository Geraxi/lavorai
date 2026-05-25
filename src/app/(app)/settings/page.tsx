import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { getCurrentUser } from "@/lib/session";
import { TIERS, effectiveTier } from "@/lib/billing";
import {
  SubscriptionActions,
  GdprExportButton,
  DeleteAccountButton,
} from "@/components/settings-actions";
import { prisma } from "@/lib/db";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { Suspense } from "react";
import { PostCheckoutRefresh } from "@/components/post-checkout-refresh";

export const metadata: Metadata = { title: "Impostazioni" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const tier = effectiveTier(user);
  const cfg = TIERS[tier];
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const hasPassword = Boolean(me?.passwordHash);

  return (
    <>
      {/* Post-checkout: forza refresh tier dopo redirect Stripe
          (?subscribed=1), gestendo la latenza del webhook. */}
      <Suspense fallback={null}>
        <PostCheckoutRefresh />
      </Suspense>
      <AppTopbar title="Impostazioni" breadcrumb="Profilo" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-6">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            Impostazioni
          </h1>
        </div>

        <div className="flex flex-col" style={{ gap: 16 }}>
          {/* Account (con tema) */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="user" size={14} />}
              title="Account"
              actions={<ThemeToggle />}
            />
            <SectionBody>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <label className="ds-label">Email</label>
                  <input
                    className="ds-input"
                    defaultValue={user.email}
                    readOnly
                  />
                </div>
                <div>
                  <label className="ds-label">Nome</label>
                  <input
                    className="ds-input"
                    defaultValue={user.name ?? ""}
                    placeholder="Il tuo nome"
                  />
                </div>
              </div>
            </SectionBody>
          </SectionCard>

          {/* Piano */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="zap" size={14} />}
              title="Piano"
              actions={<span className="ds-chip ds-chip-green">{cfg.name}</span>}
            />
            <SectionBody>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {cfg.name} · {cfg.priceDisplay}
                    {cfg.priceSuffix}
                  </div>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                      marginTop: 4,
                    }}
                  >
                    {cfg.tagline}
                  </p>
                  {user.subscriptionStatus &&
                    user.subscriptionStatus !== "active" && (
                      <p
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: "var(--amber)",
                        }}
                      >
                        Stato: {user.subscriptionStatus}
                        {user.currentPeriodEnd &&
                          ` · rinnovo/scadenza ${new Date(user.currentPeriodEnd).toLocaleDateString("it-IT")}`}
                      </p>
                    )}
                </div>
                <SubscriptionActions
                  tier={tier}
                  hasStripe={!!user.stripeSubscriptionId}
                />
              </div>
            </SectionBody>
          </SectionCard>

          {/* Dati & account */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="download" size={14} />}
              title="Dati & account"
            />
            <SectionBody>
              <div className="flex flex-col" style={{ gap: 14 }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                      Esporta i tuoi dati (GDPR)
                    </div>
                    <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                      JSON con profilo, CV, candidature e preferenze.
                    </p>
                  </div>
                  <GdprExportButton />
                </div>
                <div
                  style={{
                    borderTop: "1px solid var(--border-ds)",
                    paddingTop: 14,
                  }}
                  className="flex items-center justify-between gap-4"
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>
                      Cancella account
                    </div>
                    <p style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                      Rimuove tutti i dati. Irreversibile.
                    </p>
                  </div>
                  <DeleteAccountButton hasPassword={hasPassword} />
                </div>
              </div>
            </SectionBody>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

