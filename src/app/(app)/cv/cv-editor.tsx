"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import type { ExtractedProfile } from "@/lib/cv-profile";

export function CvEditor({
  cvFile,
  profile,
}: {
  cvFile: {
    filename: string;
    chars: number;
    preview: string;
    uploadedAt: string;
  };
  profile: ExtractedProfile;
}) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [title, setTitle] = useState(profile.title);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [city, setCity] = useState(profile.city);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const uploadedDate = new Date(cvFile.uploadedAt).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function save() {
    setSaving(true);
    try {
      // Per ora salviamo solo i dati anagrafici sul User record + parsedProfile aggiornato
      const res = await fetch("/api/cv/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          title,
          email,
          phone,
          city,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      toast.success("Modifiche salvate");
      setDirty(false);
    } catch {
      toast.error("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      {/* Left: anagrafica editor */}
      <div className="ds-card" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Dati personali</div>
            <div
              style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}
            >
              Estratti dal CV. Correggi se qualcosa non è giusto.
            </div>
          </div>
          {dirty && (
            <button
              type="button"
              className="ds-btn ds-btn-primary ds-btn-sm"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Salvo..." : "Salva modifiche"}
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Nome">
              <input
                className="ds-input"
                value={firstName}
                onChange={(e) => update(setFirstName)(e.target.value)}
                placeholder="Mario"
              />
            </Field>
            <Field label="Cognome">
              <input
                className="ds-input"
                value={lastName}
                onChange={(e) => update(setLastName)(e.target.value)}
                placeholder="Rossi"
              />
            </Field>
          </div>
          <Field label="Titolo professionale">
            <input
              className="ds-input"
              value={title}
              onChange={(e) => update(setTitle)(e.target.value)}
              placeholder="es. Senior Product Designer"
            />
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Email">
              <input
                className="ds-input"
                type="email"
                value={email}
                onChange={(e) => update(setEmail)(e.target.value)}
              />
            </Field>
            <Field label="Telefono">
              <input
                className="ds-input"
                value={phone}
                onChange={(e) => update(setPhone)(e.target.value)}
                placeholder="+39 ..."
              />
            </Field>
          </div>
          <Field label="Città">
            <input
              className="ds-input"
              value={city}
              onChange={(e) => update(setCity)(e.target.value)}
              placeholder="Milano"
            />
          </Field>
        </div>

        {/* Info dati auto-estratti dal CV */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid var(--border-ds)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Profilo estratto
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            <InfoTile
              label="Anni di esperienza"
              value={
                profile.yearsExperience != null
                  ? `${profile.yearsExperience}`
                  : "—"
              }
            />
            <InfoTile
              label="Seniority"
              value={profile.seniority ?? "Da definire"}
              mono={!profile.seniority}
            />
            <InfoTile
              label="Inglese"
              value={
                profile.englishLevel && profile.englishLevel !== "none"
                  ? profile.englishLevel.toUpperCase()
                  : "—"
              }
            />
          </div>
          <div
            style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 10 }}
          >
            Modificabile da{" "}
            <Link
              href="/preferences"
              style={{ color: "var(--fg)", textDecoration: "underline" }}
            >
              Preferenze
            </Link>
            .
          </div>
        </div>
      </div>

      {/* Right: CV file card + preview */}
      <div className="flex flex-col" style={{ gap: 16 }}>
        <div className="ds-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--primary-weak)",
                color: "var(--primary-ds)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="file" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={cvFile.filename}
              >
                {cvFile.filename}
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--fg-muted)" }}
              >
                {cvFile.chars.toLocaleString("it-IT")} caratteri · caricato{" "}
                {uploadedDate}
              </div>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="ds-btn ds-btn-sm"
            style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
          >
            <Icon name="upload" size={13} /> Sostituisci CV
          </Link>
        </div>

        <div className="ds-card" style={{ padding: 18, overflow: "hidden" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 10,
            }}
          >
            Anteprima testo
          </div>
          <div
            style={{
              fontSize: 11.5,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              color: "var(--fg-muted)",
              maxHeight: 360,
              overflow: "hidden",
              position: "relative",
              maskImage:
                "linear-gradient(to bottom, black calc(100% - 40px), transparent)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black calc(100% - 40px), transparent)",
            }}
          >
            {cvFile.preview}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="ds-label">{label}</label>
      {children}
    </div>
  );
}

function InfoTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid var(--border-ds)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-sunken)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? "mono" : undefined}
        style={{
          fontSize: 13,
          fontWeight: 500,
          textTransform: mono ? "none" : "capitalize",
          color: mono ? "var(--fg-subtle)" : "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
