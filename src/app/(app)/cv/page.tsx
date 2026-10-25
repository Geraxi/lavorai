import { CVUpload } from "@/components/cv-upload";
import { redirect } from "next/navigation";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CVBuilder } from "./cv-builder";
import { extractFullProfile } from "@/lib/cv-profile-ai-full";
import {
  EMPTY_PROFILE,
  profileToRow,
  rowToProfile,
} from "@/lib/cv-profile-types";

export const dynamic = "force-dynamic";

export default async function CVPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [cv, profileRow] = await Promise.all([
    prisma.cVDocument.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalFilename: true, extractedText: true, createdAt: true },
    }),
    prisma.cVProfile.findUnique({ where: { userId: session.user.id } }),
  ]);

  // Seed one-shot se abbiamo CV ma non abbiamo ancora il profilo
  let profile = profileRow ? rowToProfile(profileRow) : { ...EMPTY_PROFILE };
  const isEmpty =
    !profile.firstName &&
    !profile.lastName &&
    profile.experiences.length === 0 &&
    profile.education.length === 0 &&
    profile.skills.length === 0;

  if (cv && isEmpty) {
    try {
      const seeded = await extractFullProfile(cv.extractedText, session.user.id);
      // prefill email dalla session se vuota
      if (!seeded.email && session.user.email) seeded.email = session.user.email;
      await prisma.cVProfile.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, ...profileToRow(seeded) },
        update: profileToRow(seeded),
      });
      profile = seeded;
    } catch {
      // ignora — l'utente può compilare a mano
    }
  }

  return (
    <>
      <AppTopbar title="Il tuo CV" breadcrumb="Profilo" />
      <div
        className="profile-workspace cv-workspace"
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1100,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {!cv && isEmpty ? <EmptyCV /> : <CVBuilder initial={profile} />}
      </div>
    </>
  );
}

function EmptyCV() {
  return (
    <div
      className="pm-card cv-empty"
      style={{
        padding: "48px 28px",
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
        Carica il curriculum per preparare il tuo profilo e i documenti per
        ogni posizione. Il caricamento non invia candidature.
      </div>
      <CVUpload />
    </div>
  );
}
