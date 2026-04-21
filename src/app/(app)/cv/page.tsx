import Link from "next/link";
import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type ExtractedProfile } from "@/lib/cv-profile";
import { CvEditor } from "./cv-editor";

export const dynamic = "force-dynamic";

export default async function CVPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cv = await prisma.cVDocument.findFirst({
    where: { userId: session.user.id },
    select: {
      id: true,
      originalFilename: true,
      extractedText: true,
      parsedProfileJson: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let profile: ExtractedProfile | null = null;
  if (cv?.parsedProfileJson) {
    try {
      profile = JSON.parse(cv.parsedProfileJson);
    } catch {
      profile = null;
    }
  }
  // Backfill one-time se CV esiste ma non ha ancora il profilo cachato
  if (cv && !profile) {
    try {
      const { extractProfileAI } = await import("@/lib/cv-profile-ai");
      profile = await extractProfileAI(
        cv.extractedText,
        session.user.email ?? null,
      );
      await prisma.cVDocument
        .update({
          where: { id: cv.id },
          data: { parsedProfileJson: JSON.stringify(profile) },
        })
        .catch(() => void 0);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <AppTopbar title="Il tuo CV" breadcrumb="Profilo" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1100,
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
            Il tuo CV
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}>
            {cv
              ? "Modifica i dati personali e sostituisci il file quando serve — LavorAI adatta il CV a ogni candidatura."
              : "Carica il tuo CV per iniziare. Lo useremo come base per ogni candidatura automatica."}
          </p>
        </div>

        {!cv ? (
          <EmptyCV />
        ) : (
          <CvEditor
            cvFile={{
              filename: cv.originalFilename,
              chars: cv.extractedText.length,
              preview: cv.extractedText.slice(0, 1500),
              uploadedAt: cv.createdAt.toISOString(),
            }}
            profile={
              profile ?? {
                firstName: "",
                lastName: "",
                title: "",
                email: session.user.email ?? "",
                phone: "",
                city: "",
                seniority: null,
                yearsExperience: null,
                englishLevel: null,
              }
            }
          />
        )}
      </div>
    </>
  );
}

function EmptyCV() {
  return (
    <div
      className="ds-card"
      style={{
        padding: "56px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--bg-sunken)",
          border: "1px solid var(--border-ds)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--fg-subtle)",
        }}
      >
        <Icon name="file" size={22} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>Nessun CV caricato</div>
      <div
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        Serve per poter candidarti in automatico — lo analizziamo e lo adattiamo
        al singolo annuncio.
      </div>
      <Link
        href="/onboarding"
        className="ds-btn ds-btn-primary"
        style={{ marginTop: 8 }}
      >
        Carica il CV <Icon name="arrow-right" size={13} />
      </Link>
    </div>
  );
}
