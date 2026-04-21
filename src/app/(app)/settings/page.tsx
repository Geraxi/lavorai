import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { getCurrentUser } from "@/lib/session";
import { TIERS, normalizeTier } from "@/lib/billing";
import {
  SubscriptionActions,
  GdprExportButton,
  DeleteAccountButton,
} from "@/components/settings-actions";
import { prisma } from "@/lib/db";
import { ThemeToggle } from "@/components/design/theme-toggle";

export const metadata: Metadata = { title: "Impostazioni" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const tier = normalizeTier(user.tier);
  const cfg = TIERS[tier];
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const hasPassword = Boolean(me?.passwordHash);

  return (
    <>
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
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            Account, piano, preferenze.
          </p>
        </div>

        <div className="flex flex-col" style={{ gap: 16 }}>
          {/* Account */}
          <SectionCard>
            <SectionHead icon={<Icon name="user" size={14} />} title="Account" />
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
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--fg-muted)",
                      marginTop: 6,
                    }}
                  >
                    L&apos;email è l&apos;identificatore del tuo account — non
                    modificabile.
                  </p>
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

          {/* Subscription */}
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

              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: "var(--radius)",
                  background: "var(--bg-sunken)",
                  fontSize: 12.5,
                }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    marginBottom: 8,
                    color: "var(--fg)",
                  }}
                >
                  Cosa include il tuo piano
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  {cfg.features.map((f) => (
                    <li key={f} style={{ color: "var(--fg-muted)" }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </SectionBody>
          </SectionCard>

          {/* Appearance */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="sun" size={14} />}
              title="Aspetto"
              actions={<ThemeToggle />}
            />
            <SectionBody>
              <p style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                Tema chiaro (default) o scuro. La scelta è salvata nel browser.
              </p>
            </SectionBody>
          </SectionCard>

          {/* Notifications */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="bell" size={14} />}
              title="Notifiche"
            />
            <SectionBody>
              <div className="flex flex-col" style={{ gap: 10, fontSize: 13 }}>
                <ToggleRow
                  label="Recruiter risponde"
                  desc="Email quando un recruiter apre o risponde alla tua candidatura"
                  on
                />
                <ToggleRow
                  label="Nuovi annunci compatibili"
                  desc="Digest settimanale dei job che matchano >85%"
                  on
                />
                <ToggleRow
                  label="Report mensile"
                  desc="Analytics e insight sulle tue candidature"
                  on={false}
                />
              </div>
            </SectionBody>
          </SectionCard>

          {/* Danger zone */}
          <SectionCard>
            <SectionHead
              icon={<Icon name="download" size={14} />}
              title="I tuoi dati (GDPR)"
            />
            <SectionBody>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div style={{ fontWeight: 500 }}>Esporta i tuoi dati</div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      marginTop: 4,
                    }}
                  >
                    Scarica un file JSON con tutte le informazioni che abbiamo
                    su di te (profilo, CV, candidature, preferenze).
                  </p>
                </div>
                <GdprExportButton />
              </div>
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<Icon name="x" size={14} />}
              title="Zona pericolosa"
            />
            <SectionBody>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div style={{ fontWeight: 500 }}>Cancella account</div>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--fg-muted)",
                      marginTop: 4,
                    }}
                  >
                    Rimuove tutti i dati (CV, candidature, sessioni portali).
                    Irreversibile.
                  </p>
                </div>
                <DeleteAccountButton hasPassword={hasPassword} />
              </div>
            </SectionBody>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  desc,
  on,
}: {
  label: string;
  desc: string;
  on: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        <p
          style={{
            fontSize: 11.5,
            color: "var(--fg-muted)",
            marginTop: 2,
          }}
        >
          {desc}
        </p>
      </div>
      <button
        type="button"
        className={`ds-toggle${on ? " on" : ""}`}
        aria-label={label}
      />
    </div>
  );
}
