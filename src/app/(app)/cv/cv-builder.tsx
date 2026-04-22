"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import type {
  CVProfile,
  Education,
  Experience,
  Language,
  Link as CvLink,
  Skill,
} from "@/lib/cv-profile-types";

type TabKey = "personal" | "summary" | "experience" | "education" | "skills" | "languages" | "links";

const TABS: { key: TabKey; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { key: "personal", label: "Personali", icon: "user" },
  { key: "summary", label: "Profilo", icon: "sparkles" },
  { key: "experience", label: "Esperienza", icon: "briefcase" },
  { key: "education", label: "Istruzione", icon: "file" },
  { key: "skills", label: "Competenze", icon: "target" },
  { key: "languages", label: "Lingue", icon: "globe" },
  { key: "links", label: "Link", icon: "external" },
];

function emptyExp(): Experience {
  return { role: "", company: "", location: "", startDate: "", endDate: "", description: "", bullets: [] };
}
function emptyEdu(): Education {
  return { degree: "", school: "", location: "", startDate: "", endDate: "", notes: "" };
}

export function CVBuilder({ initial }: { initial: CVProfile }) {
  const [profile, setProfile] = useState<CVProfile>(initial);
  const [tab, setTab] = useState<TabKey>("personal");
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [downloadingLang, setDownloadingLang] = useState<"it" | "en" | null>(null);

  function update<T extends keyof CVProfile>(key: T, value: CVProfile[T]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }

  function save() {
    // Optimistic: chiudi subito lo stato dirty + feedback immediato, rollback se errore
    setDirty(false);
    const savingToast = toast.loading("Salvataggio...");
    startTransition(async () => {
      try {
        const res = await fetch("/api/cv-profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body?.message ?? "Errore salvataggio", { id: savingToast });
          setDirty(true);
          return;
        }
        toast.success("Profilo CV salvato", { id: savingToast });
      } catch {
        toast.error("Errore di rete", { id: savingToast });
        setDirty(true);
      }
    });
  }

  async function downloadPdf(lang: "it" | "en") {
    if (dirty) {
      toast.info("Salva prima le modifiche.");
      return;
    }
    setDownloadingLang(lang);
    try {
      const res = await fetch(`/api/cv-profile/pdf?lang=${lang}`);
      if (!res.ok) {
        toast.error("Errore generazione PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CV_${profile.firstName}_${profile.lastName}_${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingLang(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}>
            CV Builder
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4, maxWidth: 560 }}>
            Questo è il tuo profilo reale. LavorAI lo adatta al singolo annuncio —
            senza mai inventare esperienze o skill che non hai.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => downloadPdf("it")}
            disabled={downloadingLang !== null || dirty}
            className="ds-btn ds-btn-ghost"
            style={{ fontSize: 13 }}
          >
            {downloadingLang === "it" ? (
              <><Icon name="refresh" size={13} /> PDF (IT)…</>
            ) : (
              <><Icon name="download" size={13} /> PDF (IT)</>
            )}
          </button>
          <button
            type="button"
            onClick={() => downloadPdf("en")}
            disabled={downloadingLang !== null || dirty}
            className="ds-btn ds-btn-ghost"
            style={{ fontSize: 13 }}
          >
            {downloadingLang === "en" ? (
              <><Icon name="refresh" size={13} /> PDF (EN)…</>
            ) : (
              <><Icon name="download" size={13} /> PDF (EN)</>
            )}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending || !dirty}
            className="ds-btn ds-btn-accent"
            style={{ fontSize: 13 }}
          >
            {isPending ? (<><Icon name="refresh" size={13} /> Salvo...</>) : dirty ? (<><Icon name="check" size={13} /> Salva</>) : (<><Icon name="check" size={13} /> Salvato</>)}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="mb-5 flex gap-1 flex-wrap"
        style={{
          padding: 4,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          borderRadius: 8,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="ds-btn ds-btn-sm"
            style={{
              flex: "0 0 auto",
              fontSize: 12.5,
              background: tab === t.key ? "var(--bg)" : "transparent",
              border: tab === t.key ? "1px solid var(--border-ds)" : "1px solid transparent",
              color: tab === t.key ? "var(--fg)" : "var(--fg-muted)",
            }}
          >
            <Icon name={t.icon} size={12} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "personal" && <PersonalSection profile={profile} update={update} />}
      {tab === "summary" && <SummarySection profile={profile} update={update} />}
      {tab === "experience" && (
        <ListSection
          title="Esperienza lavorativa"
          items={profile.experiences}
          render={(exp, i) => (
            <ExperienceRow
              key={i}
              value={exp}
              onChange={(v) => {
                const next = [...profile.experiences];
                next[i] = v;
                update("experiences", next);
              }}
              onRemove={() => {
                const next = profile.experiences.filter((_, j) => j !== i);
                update("experiences", next);
              }}
            />
          )}
          onAdd={() => update("experiences", [emptyExp(), ...profile.experiences])}
          emptyLabel="Aggiungi la prima esperienza"
        />
      )}
      {tab === "education" && (
        <ListSection
          title="Istruzione"
          items={profile.education}
          render={(ed, i) => (
            <EducationRow
              key={i}
              value={ed}
              onChange={(v) => {
                const next = [...profile.education];
                next[i] = v;
                update("education", next);
              }}
              onRemove={() => {
                const next = profile.education.filter((_, j) => j !== i);
                update("education", next);
              }}
            />
          )}
          onAdd={() => update("education", [emptyEdu(), ...profile.education])}
          emptyLabel="Aggiungi un titolo di studio"
        />
      )}
      {tab === "skills" && <SkillsSection profile={profile} update={update} />}
      {tab === "languages" && <LanguagesSection profile={profile} update={update} />}
      {tab === "links" && <LinksSection profile={profile} update={update} />}
    </>
  );
}

// ---------- Personal ----------

function PersonalSection({
  profile,
  update,
}: {
  profile: CVProfile;
  update: <T extends keyof CVProfile>(k: T, v: CVProfile[T]) => void;
}) {
  return (
    <SectionCard>
      <SectionHead icon={<Icon name="user" size={14} />} title="Informazioni personali" />
      <SectionBody>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <PhotoUploader />
          <div style={{ flex: 1, minWidth: 240, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nome" value={profile.firstName} onChange={(v) => update("firstName", v)} />
            <Field label="Cognome" value={profile.lastName} onChange={(v) => update("lastName", v)} />
            <Field label="Email" value={profile.email} onChange={(v) => update("email", v)} type="email" />
            <Field label="Telefono" value={profile.phone} onChange={(v) => update("phone", v)} />
            <Field label="Città" value={profile.city} onChange={(v) => update("city", v)} />
            <Field
              label="Titolo professionale"
              value={profile.title}
              onChange={(v) => update("title", v)}
              placeholder="es. Senior Product Designer"
            />
          </div>
        </div>
      </SectionBody>
    </SectionCard>
  );
}

function PhotoUploader() {
  const [photoUrl, setPhotoUrl] = useState<string>(
    `/api/cv-profile/photo?t=${Date.now()}`,
  );
  const [hasPhoto, setHasPhoto] = useState(true);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/cv-profile/photo", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.message ?? "Upload fallito");
        return;
      }
      setPhotoUrl(`/api/cv-profile/photo?t=${Date.now()}`);
      setHasPhoto(true);
      toast.success("Foto aggiornata");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    setLoading(true);
    try {
      await fetch("/api/cv-profile/photo", { method: "DELETE" });
      setHasPhoto(false);
      toast.success("Foto rimossa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: 110,
          height: 110,
          borderRadius: "50%",
          border: "1px dashed var(--border-ds)",
          background: "var(--bg-elev)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {hasPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt="Foto profilo"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setHasPhoto(false)}
          />
        ) : (
          <Icon name="user" size={32} style={{ color: "var(--fg-subtle)" }} />
        )}
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 11,
            }}
          >
            …
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        hidden
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="ds-btn ds-btn-sm ds-btn-ghost"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          style={{ fontSize: 11.5 }}
        >
          {hasPhoto ? "Cambia" : "Carica foto"}
        </button>
        {hasPhoto && (
          <button
            type="button"
            className="ds-btn ds-btn-sm ds-btn-ghost"
            onClick={onRemove}
            disabled={loading}
            style={{ fontSize: 11.5 }}
          >
            Rimuovi
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Summary ----------

function SummarySection({
  profile,
  update,
}: {
  profile: CVProfile;
  update: <T extends keyof CVProfile>(k: T, v: CVProfile[T]) => void;
}) {
  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="sparkles" size={14} />}
        title="Sommario del profilo"
      />
      <SectionBody>
        <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 10 }}>
          2–4 frasi che riassumono chi sei. LavorAI lo riscrive per ogni annuncio.
        </p>
        <textarea
          value={profile.summary}
          onChange={(e) => update("summary", e.target.value)}
          className="ds-input"
          rows={5}
          style={{ width: "100%", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5, padding: 10 }}
          placeholder="Sono un ingegnere con 5 anni di esperienza in..."
        />
        <div style={{ textAlign: "right", fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>
          {profile.summary.length} / 1200
        </div>
      </SectionBody>
    </SectionCard>
  );
}

// ---------- List wrapper ----------

function ListSection<T>({
  title,
  items,
  render,
  onAdd,
  emptyLabel,
}: {
  title: string;
  items: T[];
  render: (item: T, i: number) => React.ReactNode;
  onAdd: () => void;
  emptyLabel: string;
}) {
  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="briefcase" size={14} />}
        title={`${title} (${items.length})`}
        actions={
          <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={onAdd}>
            <Icon name="plus" size={11} /> Aggiungi
          </button>
        }
      />
      <SectionBody>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--fg-muted)" }}>
            <div style={{ fontSize: 13, marginBottom: 10 }}>{emptyLabel}</div>
            <button type="button" className="ds-btn ds-btn-primary" onClick={onAdd}>
              <Icon name="plus" size={12} /> Aggiungi
            </button>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 14 }}>
            {items.map((it, i) => render(it, i))}
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}

// ---------- Experience row ----------

function ExperienceRow({
  value,
  onChange,
  onRemove,
}: {
  value: Experience;
  onChange: (v: Experience) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof Experience>(k: K, v: Experience[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div
      style={{
        border: "1px solid var(--border-ds)",
        borderRadius: 8,
        padding: 14,
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Ruolo" value={value.role} onChange={(v) => set("role", v)} />
        <Field label="Azienda" value={value.company} onChange={(v) => set("company", v)} />
        <Field label="Luogo" value={value.location} onChange={(v) => set("location", v)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Da" value={value.startDate} onChange={(v) => set("startDate", v)} placeholder="MM/YYYY" />
          <Field label="A" value={value.endDate} onChange={(v) => set("endDate", v)} placeholder="MM/YYYY o vuoto" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="ds-label">Descrizione</label>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          className="ds-input"
          rows={2}
          style={{ width: "100%", fontSize: 13, padding: 8 }}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="ds-label">Bullet (achievements)</label>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {value.bullets.map((b, j) => (
            <div key={j} className="flex items-center gap-1.5">
              <input
                className="ds-input"
                style={{ flex: 1, fontSize: 13, padding: "6px 10px" }}
                value={b}
                onChange={(e) => {
                  const next = [...value.bullets];
                  next[j] = e.target.value;
                  set("bullets", next);
                }}
              />
              <button
                type="button"
                className="ds-btn ds-btn-sm ds-btn-ghost"
                onClick={() => {
                  const next = value.bullets.filter((_, k) => k !== j);
                  set("bullets", next);
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ds-btn ds-btn-sm ds-btn-ghost"
            style={{ alignSelf: "flex-start", fontSize: 12 }}
            onClick={() => set("bullets", [...value.bullets, ""])}
          >
            <Icon name="plus" size={11} /> Aggiungi bullet
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={onRemove}>
          <Icon name="x" size={12} /> Rimuovi esperienza
        </button>
      </div>
    </div>
  );
}

// ---------- Education row ----------

function EducationRow({
  value,
  onChange,
  onRemove,
}: {
  value: Education;
  onChange: (v: Education) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof Education>(k: K, v: Education[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div
      style={{
        border: "1px solid var(--border-ds)",
        borderRadius: 8,
        padding: 14,
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Titolo" value={value.degree} onChange={(v) => set("degree", v)} />
        <Field label="Scuola" value={value.school} onChange={(v) => set("school", v)} />
        <Field label="Luogo" value={value.location} onChange={(v) => set("location", v)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Da" value={value.startDate} onChange={(v) => set("startDate", v)} placeholder="MM/YYYY" />
          <Field label="A" value={value.endDate} onChange={(v) => set("endDate", v)} placeholder="MM/YYYY" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="ds-label">Note</label>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="ds-input"
          rows={2}
          style={{ width: "100%", fontSize: 13, padding: 8 }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={onRemove}>
          <Icon name="x" size={12} /> Rimuovi
        </button>
      </div>
    </div>
  );
}

// ---------- Skills ----------

function SkillsSection({
  profile,
  update,
}: {
  profile: CVProfile;
  update: <T extends keyof CVProfile>(k: T, v: CVProfile[T]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (profile.skills.some((s) => s.name.toLowerCase() === v.toLowerCase())) {
      setInput("");
      return;
    }
    update("skills", [...profile.skills, { name: v } satisfies Skill]);
    setInput("");
  };
  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="target" size={14} />}
        title={`Competenze (${profile.skills.length})`}
      />
      <SectionBody>
        <div className="flex flex-wrap items-center gap-1.5">
          {profile.skills.map((s, i) => (
            <span key={i} className="ds-chip" style={{ padding: "5px 10px" }}>
              {s.name}
              <button
                type="button"
                onClick={() =>
                  update(
                    "skills",
                    profile.skills.filter((_, j) => j !== i),
                  )
                }
                style={{ background: "none", border: 0, padding: 0, marginLeft: 4, cursor: "pointer", color: "inherit" }}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
          <input
            className="ds-input"
            placeholder="+ Aggiungi competenza"
            style={{ width: 220, fontSize: 12, padding: "6px 10px" }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
      </SectionBody>
    </SectionCard>
  );
}

// ---------- Languages ----------

function LanguagesSection({
  profile,
  update,
}: {
  profile: CVProfile;
  update: <T extends keyof CVProfile>(k: T, v: CVProfile[T]) => void;
}) {
  const add = () =>
    update("languages", [{ name: "", level: "" } satisfies Language, ...profile.languages]);
  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="globe" size={14} />}
        title={`Lingue (${profile.languages.length})`}
        actions={
          <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={add}>
            <Icon name="plus" size={11} /> Aggiungi
          </button>
        }
      />
      <SectionBody>
        {profile.languages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--fg-muted)", fontSize: 13 }}>
            Nessuna lingua — aggiungi la tua lingua madre e le altre che parli.
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {profile.languages.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="ds-input"
                  placeholder="Lingua"
                  style={{ flex: 1, fontSize: 13, padding: "6px 10px" }}
                  value={l.name}
                  onChange={(e) => {
                    const next = [...profile.languages];
                    next[i] = { ...l, name: e.target.value };
                    update("languages", next);
                  }}
                />
                <input
                  className="ds-input"
                  placeholder="Livello (C1, Madrelingua...)"
                  style={{ flex: 1, fontSize: 13, padding: "6px 10px" }}
                  value={l.level}
                  onChange={(e) => {
                    const next = [...profile.languages];
                    next[i] = { ...l, level: e.target.value };
                    update("languages", next);
                  }}
                />
                <button
                  type="button"
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  onClick={() =>
                    update("languages", profile.languages.filter((_, j) => j !== i))
                  }
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}

// ---------- Links ----------

function LinksSection({
  profile,
  update,
}: {
  profile: CVProfile;
  update: <T extends keyof CVProfile>(k: T, v: CVProfile[T]) => void;
}) {
  const add = () =>
    update("links", [{ label: "", url: "" } satisfies CvLink, ...profile.links]);
  return (
    <SectionCard>
      <SectionHead
        icon={<Icon name="external" size={14} />}
        title={`Link (${profile.links.length})`}
        actions={
          <button type="button" className="ds-btn ds-btn-sm ds-btn-ghost" onClick={add}>
            <Icon name="plus" size={11} /> Aggiungi
          </button>
        }
      />
      <SectionBody>
        {profile.links.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "var(--fg-muted)", fontSize: 13 }}>
            Nessun link — LinkedIn, GitHub, portfolio…
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {profile.links.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="ds-input"
                  placeholder="Etichetta (LinkedIn)"
                  style={{ width: 160, fontSize: 13, padding: "6px 10px" }}
                  value={l.label}
                  onChange={(e) => {
                    const next = [...profile.links];
                    next[i] = { ...l, label: e.target.value };
                    update("links", next);
                  }}
                />
                <input
                  className="ds-input"
                  placeholder="URL"
                  style={{ flex: 1, fontSize: 13, padding: "6px 10px" }}
                  value={l.url}
                  onChange={(e) => {
                    const next = [...profile.links];
                    next[i] = { ...l, url: e.target.value };
                    update("links", next);
                  }}
                />
                <button
                  type="button"
                  className="ds-btn ds-btn-sm ds-btn-ghost"
                  onClick={() =>
                    update("links", profile.links.filter((_, j) => j !== i))
                  }
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionBody>
    </SectionCard>
  );
}

// ---------- Field ----------

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="ds-label">{label}</label>
      <input
        className="ds-input"
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", fontSize: 13, padding: "7px 10px" }}
      />
    </div>
  );
}
