import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Icon } from "@/components/design/icon";

export const metadata: Metadata = {
  title: "CV per posizione · LavorAI",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * /materiali — vista dedicata dove l'utente vede TUTTI i CV tailored
 * generati per ogni singola candidatura + la lettera motivazionale
 * specifica. Colma la lacuna dell'ex-flusso in cui i tailored materials
 * erano visibili solo cliccando riga per riga in /applications.
 */
export default async function MaterialiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apps = await prisma.application.findMany({
    where: {
      userId: user.id,
      OR: [
        { cvDocxPath: { not: null } },
        { cvPdfPath: { not: null } },
        { coverLetterPath: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      status: true,
      cvDocxPath: true,
      cvPdfPath: true,
      coverLetterPath: true,
      coverLetterText: true,
      cvLanguage: true,
      atsScore: true,
      job: {
        select: {
          title: true,
          company: true,
          location: true,
          url: true,
        },
      },
    },
  });

  return (
    <>
      <div style={{ padding: "24px 28px 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
          CV per posizione
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--fg-muted)", margin: "6px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
          Ogni candidatura ha un CV riscritto su misura per quel ruolo e una
          lettera motivazionale scritta apposta per quell&apos;azienda. Qui li
          trovi tutti — scaricali, condividili, riusali quando vuoi.
        </p>
      </div>

      <div style={{ padding: "24px 28px" }}>
        {apps.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              border: "1px dashed var(--border-ds)",
              borderRadius: 12,
              color: "var(--fg-muted)",
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 10 }}>📄</div>
            Non ci sono ancora CV tailored. Quando LavorAI processa una
            candidatura, il CV riscritto per quella posizione appare qui.
            <div style={{ marginTop: 16 }}>
              <Link
                href="/discover"
                className="ds-btn ds-btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name="sparkles" size={13} /> Trova annunci
              </Link>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {apps.map((a) => (
              <MaterialCard key={a.id} app={a} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

type AppRow = {
  id: string;
  createdAt: Date;
  status: string;
  cvDocxPath: string | null;
  cvPdfPath: string | null;
  coverLetterPath: string | null;
  coverLetterText: string | null;
  cvLanguage: string | null;
  atsScore: number | null;
  job: {
    title: string;
    company: string | null;
    location: string | null;
    url: string;
  };
};

function MaterialCard({ app }: { app: AppRow }) {
  const hasCvPdf = !!app.cvPdfPath;
  const hasCvDocx = !!app.cvDocxPath;
  const hasCover = !!app.coverLetterPath;
  const dateStr = new Date(app.createdAt).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });

  return (
    <div
      style={{
        border: "1px solid var(--border-ds)",
        borderRadius: 12,
        padding: 16,
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.35,
            marginBottom: 4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {app.job.title}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
          {app.job.company ?? "—"}
          {app.job.location ? ` · ${app.job.location}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{dateStr}</span>
          {app.cvLanguage && (
            <span style={{ textTransform: "uppercase" }}>· {app.cvLanguage}</span>
          )}
          {typeof app.atsScore === "number" && (
            <span>· match {app.atsScore}%</span>
          )}
        </div>
      </div>

      {/* Cover letter preview */}
      {app.coverLetterText && (
        <div
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            lineHeight: 1.55,
            padding: 10,
            background: "var(--bg-sunken)",
            borderRadius: 8,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            fontFamily: '"Charter", "Georgia", serif',
          }}
        >
          {app.coverLetterText}
        </div>
      )}

      {/* Downloads */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {hasCvPdf && (
          <a
            href={`/api/applications/${app.id}/document?kind=pdf`}
            download
            className="ds-btn ds-btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
            title="Scarica CV PDF ottimizzato"
          >
            <Icon name="download" size={11} /> CV PDF
          </a>
        )}
        {hasCvDocx && (
          <a
            href={`/api/applications/${app.id}/document?kind=cv`}
            download
            className="ds-btn ds-btn-sm ds-btn-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
            title="Scarica CV DOCX ottimizzato"
          >
            <Icon name="download" size={11} /> CV DOCX
          </a>
        )}
        {hasCover && (
          <a
            href={`/api/applications/${app.id}/document?kind=cover`}
            download
            className="ds-btn ds-btn-sm ds-btn-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}
            title="Scarica lettera motivazionale"
          >
            <Icon name="download" size={11} /> Lettera
          </a>
        )}
      </div>

      {/* Job link */}
      {app.job.url && (
        <a
          href={app.job.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11.5,
            color: "var(--fg-muted)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon name="external" size={10} /> Vedi annuncio
        </a>
      )}
    </div>
  );
}
