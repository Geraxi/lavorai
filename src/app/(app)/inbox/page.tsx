import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";

export const metadata: Metadata = { title: "Messaggi" };

/** Mock threads — production wire-up quando avremo integrazione email recruiter */
const THREADS = [
  {
    id: "t1",
    company: "Nexi",
    role: "Product Designer — Pagamenti",
    snippet:
      "Ciao Giulia, grazie per la candidatura. Ci piacerebbe fissare un colloquio...",
    time: "2 ore fa",
    unread: true,
  },
  {
    id: "t2",
    company: "Everli",
    role: "Lead Product Designer",
    snippet: "Offerta formale in allegato. Rispondi entro 3 giorni lavorativi.",
    time: "ieri",
    unread: true,
  },
  {
    id: "t3",
    company: "Scalapay",
    role: "Senior UX Designer",
    snippet: "Hai fatto la nostra video-challenge? Puoi inviarla entro...",
    time: "2 giorni fa",
    unread: false,
  },
  {
    id: "t4",
    company: "Casavo",
    role: "Product Designer II",
    snippet: "Abbiamo visto il tuo profilo e volevamo approfondire...",
    time: "3 giorni fa",
    unread: false,
  },
];

export default function InboxPage() {
  return (
    <>
      <AppTopbar title="Messaggi" breadcrumb="Lavoro" />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        <div className="mb-6">
          <h1
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
          >
            Messaggi
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            Conversazioni con i recruiter — rispondi manualmente o con assistenza AI.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
          <SectionCard>
            <SectionHead
              icon={<Icon name="inbox" size={14} />}
              title={
                <>
                  Tutte le conversazioni
                  <span className="ds-chip">{THREADS.length}</span>
                </>
              }
            />
            <SectionBody flush>
              {THREADS.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    padding: "14px 16px",
                    borderBottom:
                      i === THREADS.length - 1
                        ? "none"
                        : "1px solid var(--border-ds)",
                    cursor: "pointer",
                    background: i === 0 ? "var(--bg-sunken)" : "transparent",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <CompanyLogo
                      company={t.company}
                      color={companyColor(t.company)}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div style={{ fontSize: 13, fontWeight: t.unread ? 600 : 500 }}>
                          {t.company}
                        </div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 10.5,
                            color: "var(--fg-subtle)",
                          }}
                        >
                          {t.time}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--fg-muted)",
                          marginTop: 1,
                        }}
                      >
                        {t.role}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--fg-muted)",
                          marginTop: 6,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.snippet}
                      </div>
                      {t.unread && (
                        <span
                          className="ds-dot ds-dot-green"
                          style={{ marginTop: 6 }}
                          aria-label="non letto"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </SectionBody>
          </SectionCard>

          <SectionCard>
            <SectionHead
              icon={<CompanyLogo company="Nexi" color={companyColor("Nexi")} size={26} />}
              title={
                <>
                  <span>Nexi · Product Designer — Pagamenti</span>
                </>
              }
              actions={
                <button className="ds-btn ds-btn-sm ds-btn-ghost" type="button">
                  <Icon name="external" size={12} />
                </button>
              }
            />
            <SectionBody className="flex flex-col" style={{ gap: 16 }}>
              <Message
                from="Marco — Nexi Talent"
                time="oggi · 09:12"
                text="Ciao Giulia, grazie per la candidatura per Product Designer — Pagamenti. Il tuo profilo ci interessa molto. Saresti disponibile per un primo colloquio video con il team di design questa settimana?"
              />
              <Message
                from="Tu"
                time="oggi · 10:02"
                text="Ciao Marco, grazie mille. Sono disponibile giovedì dalle 14:00 o venerdì mattina. Fammi sapere quale funziona meglio per il tuo team."
                mine
              />
              <Message
                from="Marco — Nexi Talent"
                time="oggi · 11:40"
                text="Perfetto, giovedì 14:30 allora. Ti mando invito Google Meet. A dopo!"
              />

              <div
                style={{
                  marginTop: "auto",
                  padding: 12,
                  border: "1px solid var(--border-ds)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg-sunken)",
                }}
              >
                <textarea
                  className="ds-textarea"
                  rows={3}
                  placeholder="Scrivi la tua risposta..."
                  style={{
                    background: "var(--bg-elev)",
                    resize: "vertical",
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm ds-btn-ghost"
                  >
                    <Icon name="sparkles" size={12} /> Suggerisci con AI
                  </button>
                  <button
                    type="button"
                    className="ds-btn ds-btn-sm ds-btn-primary"
                  >
                    <Icon name="send" size={12} /> Invia
                  </button>
                </div>
              </div>
            </SectionBody>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Message({
  from,
  time,
  text,
  mine,
}: {
  from: string;
  time: string;
  text: string;
  mine?: boolean;
}) {
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border-ds)",
        borderRadius: "var(--radius)",
        background: mine ? "var(--primary-weak)" : "var(--bg-elev)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{from}</div>
        <div
          className="mono"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          {time}
        </div>
      </div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: mine ? "var(--primary-ds)" : "var(--fg)",
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}
