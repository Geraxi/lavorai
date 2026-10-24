import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { getCurrentUser } from "@/lib/session";
import { TIERS, effectiveTier, trialState } from "@/lib/billing";
import { SubscriptionManager } from "@/components/subscription-manager";
import {
  SubscriptionActions,
  GdprExportButton,
  DeleteAccountButton,
} from "@/components/settings-actions";
import { ChangePasswordForm } from "@/components/change-password-form";
import { prisma } from "@/lib/db";
import { ReferralCard } from "@/components/referral-card";
import { Suspense } from "react";
import { PostCheckoutRefresh } from "@/components/post-checkout-refresh";
import { PrivacyConsentForm } from "@/components/privacy-consent-form";
import { CookieSettingsLink } from "@/components/cookie-settings-link";
import { MailboxConnect } from "@/components/mailbox-connect";
import { MailboxPrivacyCard } from "@/components/mailbox-privacy";
import { mailboxNotifyMode } from "@/lib/application-mailbox";

export const metadata: Metadata = { title: "Impostazioni" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ mailbox?: string }> }) {
  const mailboxNotice = (await searchParams)?.mailbox ?? null;
  const user = await getCurrentUser();
  if (!user) return null;

  const tier = effectiveTier(user);
  const cfg = TIERS[tier];
  const trial = trialState(user);
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, privacyConsentAt: true, preferences: { select: { mailboxNotifyMode: true } } },
  });
  const hasPassword = Boolean(me?.passwordHash);

  return (
    <>
      <Suspense fallback={null}>
        <PostCheckoutRefresh />
      </Suspense>
      <AppTopbar title="Impostazioni" breadcrumb="Profilo" />
      <div
        className="profile-workspace settings-workspace"
        style={{
          padding: "24px 32px 80px",
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="profile-heading mb-6">
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

        <div className="profile-scroll flex flex-col" style={{ gap: 16 }}>
          <SectionCard id="account">
            <SectionHead
              icon={<Icon name="user" size={14} />}
              title="Account"
              actions={<ThemeToggle compact={false} />}
            />
            <SectionBody>
              <div className="profile-grid">
                <div>
                  <label className="ds-label" htmlFor="account-email">Email</label>
                  <input
                    className="ds-input"
                    id="account-email"
                    defaultValue={user.email}
                    readOnly
                  />
                </div>
                <div>
                  <label className="ds-label" htmlFor="account-name">Nome</label>
                  <input
                    className="ds-input"
                    id="account-name"
                    readOnly
                    aria-describedby="account-name-note"
                    defaultValue={user.name ?? ""}
                    placeholder="Il tuo nome"
                  />
                  <p id="account-name-note" className="workspace-muted" style={{ marginTop: 6 }}>Nome associato all’account.</p>
                </div>
              </div>
            </SectionBody>
          </SectionCard>

          <SectionCard id="mailbox">
            <SectionHead icon={<Icon name="send" size={14} />} title="Casella per inviare le candidature" />
            <SectionBody>
              <MailboxConnect notice={mailboxNotice} />
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<Icon name="settings" size={14} />}
              title="Password"
            />
            <SectionBody>
              <ChangePasswordForm hasPassword={hasPassword} />
            </SectionBody>
          </SectionCard>

          <SectionCard id="billing">
            <SectionHead
              icon={<Icon name="zap" size={14} />}
              title="Piano"
              actions={
                <span className="ds-chip">
                  {trial.status === "active" ? "Pro · prova" : cfg.name}
                </span>
              }
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
                    {trial.status === "active" && trial.endsAt
                      ? `Prova gratuita attiva fino al ${trial.endsAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}: fino a 5 candidature al giorno, CV e lettera su misura. Verifica stato e condizioni dell’abbonamento nella sezione pagamento.`
                      : trial.status === "ended"
                        ? "La prova Pro è terminata: vedi offerte e risposte, ma nessuna candidatura viene inviata. Con Pro riparti da dove ti eri fermato."
                        : cfg.tagline}
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
                {user.stripeSubscriptionId ? (
                  <SubscriptionManager planName={cfg.name} />
                ) : (
                  <SubscriptionActions
                    tier={trial.status === "active" ? "free" : tier}
                    hasStripe={false}
                  />
                )}
              </div>
            </SectionBody>
          </SectionCard>

          <ReferralCard />

          <SectionCard id="privacy-consent">
            <SectionHead icon={<Icon name="eye" size={14} />} title={user.locale === "en" ? "Privacy consent" : "Consenso privacy"} />
            <SectionBody><PrivacyConsentForm recorded={Boolean(me?.privacyConsentAt)} locale={user.locale} /></SectionBody>
          </SectionCard>

          <SectionCard id="application-mailbox-privacy">
            <SectionHead icon={<Icon name="mail" size={14} />} title={user.locale === "en" ? "Application mailbox" : "Posta candidature"} />
            <SectionBody>
              <MailboxPrivacyCard
                locale={user.locale ?? "it"}
                mailboxNotifyMode={mailboxNotifyMode(me?.preferences?.mailboxNotifyMode)}
              />
            </SectionBody>
          </SectionCard>

          <SectionCard id="cookie-settings">
            <SectionHead icon={<Icon name="settings" size={14} />} title={user.locale === "en" ? "Cookies & advertising" : "Cookie e pubblicità"} />
            <SectionBody>
              <div className="flex items-center justify-between gap-4">
                <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: 0 }}>
                  {user.locale === "en"
                    ? "Choose separately whether to allow analytics and advertising tools (Meta Pixel, Google). You can withdraw at any time."
                    : "Scegli separatamente se consentire strumenti di analisi e pubblicità (Meta Pixel, Google). Puoi revocare il consenso in qualsiasi momento."}
                </p>
                <CookieSettingsLink className="ds-btn ds-btn-sm" style={{ whiteSpace: "nowrap" }} />
              </div>
            </SectionBody>
          </SectionCard>

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
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        marginTop: 2,
                      }}
                    >
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
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        marginTop: 2,
                      }}
                    >
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
