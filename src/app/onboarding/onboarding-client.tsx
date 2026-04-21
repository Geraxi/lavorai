"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/design/icon";
import { LOCATION_PREFS, ROLE_PREFERENCES } from "@/lib/ui-applications";

type StepDef = {
  key: "cv" | "profile" | "details" | "prefs" | "confirm";
  label: string;
  icon: IconName;
};

type Seniority = "junior" | "mid" | "senior" | "lead" | "principal";
type EnglishLevel = "none" | "a2" | "b1" | "b2" | "c1" | "c2";
type Notice = "immediate" | "1m" | "2m" | "3m_plus";

interface Details {
  seniority: Seniority | null;
  yearsExperience: number;
  englishLevel: EnglishLevel;
  italianNative: boolean;
  euAuthorized: boolean;
  noticePeriod: Notice | null;
  avoidCompanies: string;
}

const STEPS: StepDef[] = [
  { key: "cv", label: "CV", icon: "file" },
  { key: "profile", label: "Profilo", icon: "user" },
  { key: "details", label: "Esperienza", icon: "star" },
  { key: "prefs", label: "Preferenze", icon: "target" },
  { key: "confirm", label: "Conferma", icon: "check" },
];

type RolePref = (typeof ROLE_PREFERENCES)[number];
type LocationPref = (typeof LOCATION_PREFS)[number];

interface InitialCvState {
  filename: string;
  chars: number;
  preview: string;
}

interface ProfileState {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  city: string;
  seniority: Seniority | null;
  yearsExperience: number | null;
  englishLevel: EnglishLevel | null;
}

interface InitialState {
  cv: InitialCvState | null;
  profile: ProfileState | null;
}

export default function OnboardingClient({
  initial,
}: {
  initial: InitialState;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cvInfo, setCvInfo] = useState<InitialCvState | null>(initial.cv);
  const [profile, setProfile] = useState<ProfileState | null>(initial.profile);
  const [roles, setRoles] = useState<RolePref[]>(ROLE_PREFERENCES);
  const [locations, setLocations] = useState<LocationPref[]>(LOCATION_PREFS);
  const [salary, setSalary] = useState(45);
  const [modeSel, setModeSel] = useState({
    remoto: true,
    ibrido: true,
    sede: false,
  });
  const [details, setDetails] = useState<Details>({
    seniority: initial.profile?.seniority ?? null,
    yearsExperience:
      initial.profile?.yearsExperience != null
        ? initial.profile.yearsExperience
        : 3,
    englishLevel: initial.profile?.englishLevel ?? "b2",
    italianNative: true,
    euAuthorized: true,
    noticePeriod: null,
    avoidCompanies: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("cv", file);
    try {
      const res = await fetch("/api/onboarding/cv", {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? "Errore caricamento CV");
        return;
      }
      setCvInfo({
        filename: file.name,
        chars: body.chars,
        preview: body.preview ?? "",
      });
      toast.success("CV caricato!");
    } finally {
      setUploading(false);
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    try {
      await fetch("/api/onboarding/details", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seniority: details.seniority,
          yearsExperience: details.yearsExperience,
          englishLevel: details.englishLevel,
          italianNative: details.italianNative,
          euAuthorized: details.euAuthorized,
          noticePeriod: details.noticePeriod,
          avoidCompanies: details.avoidCompanies.trim() || null,
        }),
      });
    } catch (err) {
      console.error("saveDetails failed", err);
    } finally {
      setSavingDetails(false);
    }
  }

  const next = async () => {
    // Quando esci dallo step "details" (indice 2), salva
    if (STEPS[step]?.key === "details") {
      await saveDetails();
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));
  const finish = async () => {
    // Marca il welcome come già visto: l'onboarding sostituisce il tour
    await fetch("/api/onboarding/welcome-seen", { method: "POST" }).catch(
      () => null,
    );
    router.push("/dashboard");
  };

  const canContinueStep0 = cvInfo !== null;

  return (
    <div className="ob-root">
      {/* ===== Mobile / tablet: progress bar orizzontale in alto ===== */}
      <div className="ob-mobile-bar">
        <div className="ob-mobile-brand">
          <span
            className="mono inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "var(--fg)",
              color: "var(--bg)",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            L
          </span>
          LavorAI
        </div>
        <div className="ob-mobile-progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="ob-mobile-dot"
              data-done={i < step ? "true" : "false"}
              data-current={i === step ? "true" : "false"}
            />
          ))}
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--fg-muted)", marginLeft: 6 }}
          >
            {step + 1}/{STEPS.length} · {STEPS[step].label}
          </div>
        </div>
      </div>

      {/* ===== Desktop: Rail sinistro con stepper verticale ===== */}
      <aside className="ob-rail">
        <div className="flex items-center gap-2.5" style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>
          <span
            className="mono inline-flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "var(--fg)",
              color: "var(--bg)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "-0.04em",
            }}
          >
            L
          </span>
          LavorAI
        </div>

        <div className="ob-stepper">
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <div
                key={s.key}
                className="ob-step"
                data-done={done ? "true" : "false"}
                data-current={current ? "true" : "false"}
                onClick={() => {
                  if (done) setStep(i);
                }}
              >
                <div className="ob-step-dot">
                  {done ? (
                    <Icon name="check" size={13} />
                  ) : (
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="ob-step-label">
                  <div className="ob-step-index">Step {i + 1}</div>
                  <div className="ob-step-name">{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "auto", fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
          Bastano 2 minuti. Poi LavorAI candida in automatico per te.
        </div>
      </aside>

      {/* ===== Main content ===== */}
      <main className="ob-main">
        <div style={{ flex: 1, maxWidth: 560, width: "100%" }}>
          {step === 0 && (
            <StepCvUpload
              cvInfo={cvInfo}
              file={file}
              setFile={setFile}
              uploading={uploading}
              onUpload={onUpload}
            />
          )}
          {step === 1 && <StepProfile profile={profile} />}
          {step === 2 && (
            <StepDetails details={details} setDetails={setDetails} />
          )}
          {step === 3 && (
            <StepPreferences
              roles={roles}
              setRoles={setRoles}
              locations={locations}
              setLocations={setLocations}
              salary={salary}
              setSalary={setSalary}
              modeSel={modeSel}
              setModeSel={setModeSel}
            />
          )}
          {step === 4 && (
            <StepConfirm
              salary={salary}
              rolesSelected={roles.filter((r) => r.selected).length}
              locationsSummary={locations
                .filter((l) => l.selected)
                .map((l) => l.city)
                .join(" · ")}
              details={details}
            />
          )}
        </div>

        {/* Nav */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 40,
            maxWidth: 520,
            width: "100%",
          }}
        >
          <button
            type="button"
            className="ds-btn ds-btn-ghost"
            style={{ visibility: step === 0 ? "hidden" : "visible" }}
            onClick={prev}
          >
            ← Indietro
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={step === STEPS.length - 1 ? finish : next}
            disabled={step === 0 && !canContinueStep0}
            style={{
              opacity: step === 0 && !canContinueStep0 ? 0.5 : 1,
              cursor: step === 0 && !canContinueStep0 ? "not-allowed" : "pointer",
            }}
          >
            {step === STEPS.length - 1 ? "Attiva auto-apply" : "Continua"}{" "}
            <Icon name="arrow-right" size={13} />
          </button>
        </div>
      </main>

      {/* ===== Right: CV preview reale ===== */}
      <aside className="ob-preview">
        <RealCvPreview cvInfo={cvInfo} profile={profile} />

        <div
          style={{
            position: "absolute",
            top: 24,
            right: 28,
            display: "flex",
            gap: 6,
          }}
        >
          {cvInfo && (
            <>
              <span className="ds-chip">
                <span className="ds-dot ds-dot-green" /> CV analizzato
              </span>
              <span className="ds-chip ds-chip-blue">ATS-friendly</span>
            </>
          )}
        </div>
        <div
          className="mono"
          style={{
            position: "absolute",
            bottom: 32,
            left: 40,
            right: 40,
            fontSize: 11.5,
            color: "var(--fg-muted)",
          }}
        >
          Anteprima · verrà adattato automaticamente al JD di ogni candidatura
        </div>
      </aside>

    </div>
  );
}

function StepCvUpload({
  cvInfo,
  file,
  setFile,
  uploading,
  onUpload,
}: {
  cvInfo: { filename: string; chars: number } | null;
  file: File | null;
  setFile: (f: File | null) => void;
  uploading: boolean;
  onUpload: (e: FormEvent<HTMLFormElement>) => void;
}) {
  // Se il CV è già stato adottato server-side, mostriamo uno stato "ready"
  if (cvInfo) {
    return (
      <>
        <h1 style={stepTitle}>
          CV già pronto ✨
        </h1>
        <p style={stepLead}>
          Abbiamo caricato il CV che hai inviato prima del login.
          Controlla che sia giusto e procedi.
        </p>
        <div
          className="ds-card"
          style={{
            padding: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "var(--primary-weak)",
              color: "var(--primary-ds)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="file" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              {cvInfo.filename}
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
              {cvInfo.chars.toLocaleString("it-IT")} caratteri estratti
            </div>
          </div>
          <span
            className="ds-chip"
            style={{
              background: "var(--primary-weak)",
              color: "var(--primary-ds)",
              borderColor: "transparent",
            }}
          >
            <Icon name="check" size={11} />
            Analizzato
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 14 }}>
          Vuoi usare un CV diverso? Potrai sostituirlo dalle impostazioni in qualsiasi momento.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={stepTitle}>Inizia caricando il tuo CV</h1>
      <p style={stepLead}>
        Lo analizziamo e lo usiamo come base per ogni candidatura — adattato al
        singolo annuncio.
      </p>

      <form onSubmit={onUpload}>
        <label
          htmlFor="cv-input"
          className={`ds-upload-zone premium${file ? " has-file" : ""}`}
          style={{ padding: "44px 28px" }}
        >
          {!file ? (
            <>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--border-ds)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  transition: "transform 0.3s",
                }}
              >
                <Icon name="upload" size={22} />
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 4,
                  letterSpacing: "-0.01em",
                }}
              >
                Trascina qui il tuo CV
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
                oppure clicca per selezionare · PDF o DOCX · max 10 MB
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "var(--bg-elev)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name="check"
                  size={18}
                  style={{ color: "var(--primary-ds)" }}
                />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{file.name}</div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--fg-muted)" }}
                >
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>
          )}
          <input
            id="cv-input"
            type="file"
            accept=".pdf,.docx"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {file && (
          <button
            type="submit"
            className="ds-btn ds-btn-primary"
            style={{ marginTop: 14, width: "100%" }}
            disabled={uploading}
          >
            {uploading ? "Analisi in corso..." : "Analizza CV"}
          </button>
        )}
      </form>
    </>
  );
}

const stepTitle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  margin: "0 0 10px",
  lineHeight: 1.15,
};

const stepLead: React.CSSProperties = {
  fontSize: 14.5,
  color: "var(--fg-muted)",
  margin: "0 0 32px",
  lineHeight: 1.55,
};

function RealCvPreview({
  cvInfo,
  profile,
}: {
  cvInfo: InitialCvState | null;
  profile: ProfileState | null;
}) {
  if (!cvInfo) {
    return (
      <div
        className="ds-cv-preview"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 280,
          color: "#5B5D61",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📄</div>
        <div>Carica il CV per vedere l&apos;anteprima</div>
      </div>
    );
  }

  const name =
    profile && (profile.firstName || profile.lastName)
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : cvInfo.filename.replace(/\.[^.]+$/, "");

  const subtitleParts = [profile?.title, profile?.city, profile?.email].filter(
    (p): p is string => Boolean(p && p.length > 0),
  );

  return (
    <div className="ds-cv-preview">
      <h1 style={{ margin: "0 0 2px", fontSize: 18, letterSpacing: "-0.02em" }}>
        {name}
      </h1>
      {subtitleParts.length > 0 && (
        <div style={{ fontSize: 11, color: "#5B5D61", marginBottom: 14 }}>
          {subtitleParts.join(" · ")}
        </div>
      )}
      <CvHeading>Estratto dal tuo CV</CvHeading>
      <div
        style={{
          fontSize: 11,
          lineHeight: 1.55,
          color: "#0F1012",
          whiteSpace: "pre-wrap",
          maxHeight: 380,
          overflow: "hidden",
          position: "relative",
          maskImage:
            "linear-gradient(to bottom, black calc(100% - 40px), transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - 40px), transparent)",
        }}
      >
        {cvInfo.preview}
      </div>
      <div
        className="mono"
        style={{
          marginTop: 10,
          fontSize: 10.5,
          color: "#8A8C90",
          letterSpacing: "0.04em",
        }}
      >
        {cvInfo.chars.toLocaleString("it-IT")} caratteri · {cvInfo.filename}
      </div>
    </div>
  );
}

function CvHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#5B5D61",
        margin: "14px 0 6px",
        borderBottom: "1px solid #E6E4DD",
        paddingBottom: 4,
      }}
    >
      {children}
    </h2>
  );
}

function StepProfile({ profile }: { profile: ProfileState | null }) {
  return (
    <>
      <h1 style={stepTitle}>Conferma i tuoi dati</h1>
      <p style={stepLead}>
        {profile
          ? "Abbiamo estratto queste informazioni dal tuo CV. Verifica e correggi dove serve — le useremo in ogni candidatura."
          : "Inserisci i tuoi dati — li useremo in ogni candidatura."}
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="ds-label">Nome</label>
            <input
              className="ds-input"
              defaultValue={profile?.firstName ?? ""}
              placeholder="Mario"
            />
          </div>
          <div>
            <label className="ds-label">Cognome</label>
            <input
              className="ds-input"
              defaultValue={profile?.lastName ?? ""}
              placeholder="Rossi"
            />
          </div>
        </div>
        <div>
          <label className="ds-label">Titolo professionale</label>
          <input
            className="ds-input"
            defaultValue={profile?.title ?? ""}
            placeholder="es. Senior Product Designer"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="ds-label">Email</label>
            <input
              className="ds-input"
              defaultValue={profile?.email ?? ""}
              placeholder="mario.rossi@esempio.it"
            />
          </div>
          <div>
            <label className="ds-label">Telefono</label>
            <input
              className="ds-input"
              defaultValue={profile?.phone ?? ""}
              placeholder="+39 ..."
            />
          </div>
        </div>
        <div>
          <label className="ds-label">Città</label>
          <input
            className="ds-input"
            defaultValue={profile?.city ?? ""}
            placeholder="Milano"
          />
        </div>
      </div>
    </>
  );
}

function StepDetails({
  details,
  setDetails,
}: {
  details: Details;
  setDetails: React.Dispatch<React.SetStateAction<Details>>;
}) {
  const seniorityOpts: { k: Seniority; l: string }[] = [
    { k: "junior", l: "Junior" },
    { k: "mid", l: "Mid" },
    { k: "senior", l: "Senior" },
    { k: "lead", l: "Lead" },
    { k: "principal", l: "Principal" },
  ];
  const englishOpts: { k: EnglishLevel; l: string }[] = [
    { k: "none", l: "—" },
    { k: "a2", l: "A2" },
    { k: "b1", l: "B1" },
    { k: "b2", l: "B2" },
    { k: "c1", l: "C1" },
    { k: "c2", l: "C2" },
  ];
  const noticeOpts: { k: Notice; l: string }[] = [
    { k: "immediate", l: "Subito" },
    { k: "1m", l: "1 mese" },
    { k: "2m", l: "2 mesi" },
    { k: "3m_plus", l: "3+ mesi" },
  ];

  return (
    <>
      <h1 style={stepTitle}>Qualche dettaglio</h1>
      <p style={stepLead}>
        Più preciso è il tuo profilo, più mirate saranno le candidature
        automatiche. Bastano 30 secondi.
      </p>
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <label className="ds-label">Seniority</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {seniorityOpts.map((o) => (
              <Pill
                key={o.k}
                selected={details.seniority === o.k}
                onClick={() =>
                  setDetails((d) => ({
                    ...d,
                    seniority: d.seniority === o.k ? null : o.k,
                  }))
                }
              >
                {o.l}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <label className="ds-label">
            Anni di esperienza ·{" "}
            <span className="mono" style={{ color: "var(--fg)" }}>
              {details.yearsExperience}
              {details.yearsExperience >= 20 ? "+" : ""}
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            value={details.yearsExperience}
            onChange={(e) =>
              setDetails((d) => ({
                ...d,
                yearsExperience: Number(e.target.value),
              }))
            }
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label className="ds-label">Inglese</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {englishOpts.map((o) => (
              <Pill
                key={o.k}
                selected={details.englishLevel === o.k}
                onClick={() =>
                  setDetails((d) => ({ ...d, englishLevel: o.k }))
                }
              >
                {o.l}
              </Pill>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ToggleCard
            checked={details.italianNative}
            onChange={(v) => setDetails((d) => ({ ...d, italianNative: v }))}
            title="Italiano madrelingua"
            body="Alcuni annunci lo richiedono esplicitamente."
          />
          <ToggleCard
            checked={details.euAuthorized}
            onChange={(v) => setDetails((d) => ({ ...d, euAuthorized: v }))}
            title="Autorizzato a lavorare in UE"
            body="Evita annunci che richiedono sponsor."
          />
        </div>

        <div>
          <label className="ds-label">Preavviso</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {noticeOpts.map((o) => (
              <Pill
                key={o.k}
                selected={details.noticePeriod === o.k}
                onClick={() =>
                  setDetails((d) => ({
                    ...d,
                    noticePeriod: d.noticePeriod === o.k ? null : o.k,
                  }))
                }
              >
                {o.l}
              </Pill>
            ))}
          </div>
        </div>

        <div>
          <label className="ds-label">
            Aziende da evitare{" "}
            <span style={{ color: "var(--fg-subtle)", fontWeight: 400 }}>
              · opzionale
            </span>
          </label>
          <input
            className="ds-input"
            placeholder="es. Accenture, Deloitte, Capgemini"
            value={details.avoidCompanies}
            onChange={(e) =>
              setDetails((d) => ({ ...d, avoidCompanies: e.target.value }))
            }
          />
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 6 }}>
            Separa con virgola. Non candideremo a queste aziende.
          </div>
        </div>
      </div>
    </>
  );
}

function Pill({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${selected ? "var(--fg)" : "var(--border-strong)"}`,
        background: selected ? "var(--fg)" : "var(--bg-elev)",
        color: selected ? "var(--bg)" : "var(--fg)",
        fontSize: 12.5,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {children}
    </button>
  );
}

function ToggleCard({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`ds-pref-card${checked ? " selected" : ""}`}
      style={{
        textAlign: "left",
        cursor: "pointer",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 3,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            border: `1.5px solid ${checked ? "var(--fg)" : "var(--border-strong)"}`,
            background: checked ? "var(--fg)" : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bg)",
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          {checked ? "✓" : ""}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.4 }}>
        {body}
      </div>
    </button>
  );
}

function StepPreferences({
  roles,
  setRoles,
  locations,
  setLocations,
  salary,
  setSalary,
  modeSel,
  setModeSel,
}: {
  roles: RolePref[];
  setRoles: React.Dispatch<React.SetStateAction<RolePref[]>>;
  locations: LocationPref[];
  setLocations: React.Dispatch<React.SetStateAction<LocationPref[]>>;
  salary: number;
  setSalary: (v: number) => void;
  modeSel: { remoto: boolean; ibrido: boolean; sede: boolean };
  setModeSel: React.Dispatch<React.SetStateAction<{ remoto: boolean; ibrido: boolean; sede: boolean }>>;
}) {
  return (
    <>
      <h1 style={stepTitle}>Cosa stai cercando?</h1>
      <p style={stepLead}>
        LavorAI applicherà solo ad annunci che corrispondono a questi criteri.
        Puoi modificarli quando vuoi.
      </p>
      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <label className="ds-label">
            Ruoli · {roles.filter((r) => r.selected).length} selezionati
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {roles.map((r, i) => (
              <div
                key={r.title}
                className={`ds-pref-card${r.selected ? " selected" : ""}`}
                onClick={() =>
                  setRoles((rs) =>
                    rs.map((x, j) =>
                      j === i ? { ...x, selected: !x.selected } : x,
                    ),
                  )
                }
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                >
                  {r.count.toLocaleString("it")} annunci
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="ds-label">Sedi</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {locations.map((l, i) => (
              <div
                key={l.city}
                className={`ds-pref-card${l.selected ? " selected" : ""}`}
                onClick={() =>
                  setLocations((ls) =>
                    ls.map((x, j) =>
                      j === i ? { ...x, selected: !x.selected } : x,
                    ),
                  )
                }
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{l.city}</div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                >
                  {l.count.toLocaleString("it")} annunci
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="ds-label">
            RAL minima ·{" "}
            <span className="mono" style={{ color: "var(--fg)" }}>
              €{salary}k
            </span>
          </label>
          <input
            type="range"
            min="25"
            max="120"
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label className="ds-label">Modalità di lavoro</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { k: "remoto" as const, l: "Remoto" },
              { k: "ibrido" as const, l: "Ibrido" },
              { k: "sede" as const, l: "In sede" },
            ].map((m) => (
              <div
                key={m.k}
                className={`ds-pref-card${modeSel[m.k] ? " selected" : ""}`}
                style={{ flex: 1 }}
                onClick={() =>
                  setModeSel((s) => ({ ...s, [m.k]: !s[m.k] }))
                }
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function StepConfirm({
  salary,
  rolesSelected,
  locationsSummary,
  details,
}: {
  salary: number;
  rolesSelected: number;
  locationsSummary: string;
  details: Details;
}) {
  const seniorityLabel: Record<Seniority, string> = {
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    principal: "Principal",
  };
  const noticeLabel: Record<Notice, string> = {
    immediate: "Subito",
    "1m": "1 mese",
    "2m": "2 mesi",
    "3m_plus": "3+ mesi",
  };

  return (
    <>
      <h1 style={stepTitle}>Tutto pronto 🎯</h1>
      <p style={stepLead}>
        LavorAI inizierà ad applicare automaticamente. Riceverai notifiche solo
        quando un recruiter risponde.
      </p>
      <div
        className="ds-card"
        style={{ padding: 18, background: "var(--bg-sunken)" }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <ConfirmRow label="Candidature stimate / settimana" value="~60–80" />
          <ConfirmRow
            label="Ruoli monitorati"
            value={`${rolesSelected} titoli`}
          />
          <ConfirmRow label="Sedi" value={locationsSummary || "—"} />
          <ConfirmRow label="RAL minima" value={`€${salary}k`} />
          <ConfirmRow
            label="Seniority"
            value={details.seniority ? seniorityLabel[details.seniority] : "Non specificata"}
          />
          <ConfirmRow
            label="Inglese"
            value={details.englishLevel === "none" ? "—" : details.englishLevel.toUpperCase()}
          />
          <ConfirmRow
            label="Preavviso"
            value={details.noticePeriod ? noticeLabel[details.noticePeriod] : "—"}
          />
          {details.avoidCompanies && (
            <ConfirmRow
              label="Aziende escluse"
              value={details.avoidCompanies
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .length + " aziende"}
            />
          )}
          <ConfirmRow
            label="Fonti"
            value="LinkedIn · Indeed · WTTJ · +12"
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 2px",
          fontSize: 12,
          color: "var(--fg-muted)",
        }}
      >
        <Icon
          name="check"
          size={14}
          style={{ color: "var(--primary-ds)" }}
        />
        Puoi mettere in pausa o modificare tutto dalla dashboard.
      </div>
    </>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
      <span style={{ color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
