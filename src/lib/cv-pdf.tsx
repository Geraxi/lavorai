import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  Image,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { CVProfile } from "@/lib/cv-profile-types";

/**
 * Canva-inspired two-column CV template — fits strictly into ONE A4 page.
 *
 * Layout:
 *   ┌───────────────┬──────────────────────────────┐
 *   │  SIDEBAR 35%  │  MAIN 65%                    │
 *   │               │                              │
 *   │  • Photo      │  Name (large)                │
 *   │  • Contatti   │  Title                       │
 *   │  • Skills     │  ──────                      │
 *   │  • Lingue     │  Profilo                     │
 *   │  • Link       │  Esperienza                  │
 *   │               │  Istruzione                  │
 *   └───────────────┴──────────────────────────────┘
 *
 * Hard 1-page: no wrap on Page, wrap=false on section blocks.
 * Font: Helvetica (built-in). Accent color: LavorAI green #22c55e.
 */

type Lang = "it" | "en";

const L = {
  it: {
    profile: "PROFILO",
    experience: "ESPERIENZA",
    education: "ISTRUZIONE",
    skills: "COMPETENZE",
    languages: "LINGUE",
    links: "LINK",
    contact: "CONTATTI",
    present: "Presente",
  },
  en: {
    profile: "SUMMARY",
    experience: "EXPERIENCE",
    education: "EDUCATION",
    skills: "SKILLS",
    languages: "LANGUAGES",
    links: "LINKS",
    contact: "CONTACT",
    present: "Present",
  },
} as const;

const ACCENT = "#16a34a";
const ACCENT_SOFT = "#e7f7ec";
const SIDEBAR_BG = "#f3f5f2";
const FG = "#1a1a1a";
const FG_MUTED = "#4a4a4a";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.2,
    color: FG,
    lineHeight: 1.35,
    flexDirection: "row",
  },
  // ---------- Sidebar (left) ----------
  sidebar: {
    width: "35%",
    backgroundColor: SIDEBAR_BG,
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 20,
    paddingRight: 18,
  },
  photoWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  photo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    objectFit: "cover",
    border: `2pt solid ${ACCENT}`,
  },
  photoPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#ddd",
  },
  sidebarTitle: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: ACCENT,
    marginTop: 14,
    marginBottom: 6,
  },
  contactRow: {
    fontSize: 8.5,
    color: FG_MUTED,
    marginBottom: 3,
  },
  skillPill: {
    fontSize: 8.5,
    color: FG,
    backgroundColor: ACCENT_SOFT,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  skillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
    marginBottom: 3,
  },
  link: {
    fontSize: 8.5,
    color: ACCENT,
    textDecoration: "none",
    marginBottom: 2,
  },
  // ---------- Main (right) ----------
  main: {
    width: "65%",
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 28,
    paddingRight: 28,
  },
  name: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.2,
    color: FG,
  },
  title: {
    fontSize: 11,
    color: ACCENT,
    fontWeight: 700,
    marginTop: 3,
    letterSpacing: 0.4,
  },
  accentBar: {
    height: 2,
    backgroundColor: ACCENT,
    marginTop: 12,
    marginBottom: 14,
    width: 44,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: ACCENT,
    marginTop: 10,
    marginBottom: 6,
  },
  summary: {
    fontSize: 9.2,
    color: FG_MUTED,
    marginBottom: 4,
  },
  expRow: { marginTop: 8 },
  expHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  expRole: { fontSize: 10, fontWeight: 700, color: FG },
  expDates: { fontSize: 8.5, color: FG_MUTED },
  expCompany: { fontSize: 9, color: FG_MUTED, marginTop: 1, fontStyle: "italic" },
  expDesc: { fontSize: 9, marginTop: 3, color: FG },
  bullet: { fontSize: 8.8, marginTop: 1, paddingLeft: 8, color: FG },
});

function joinContact(parts: Array<string | undefined | null>): string[] {
  return parts.filter((p): p is string => !!p && p.trim().length > 0);
}

function formatRange(start: string, end: string, lang: Lang): string {
  const e = end.trim() === "" ? L[lang].present : end.trim();
  if (!start && e === L[lang].present) return "";
  if (!start) return e;
  return `${start} — ${e}`;
}

/**
 * Stima grossolana di "quanto contenuto sta davvero su 1 pagina".
 * Ritorna una versione sintetizzata se il contenuto rischia l'overflow.
 */
function fitToOnePage(profile: CVProfile): CVProfile {
  // Max bullet visibili per experience se ci sono più di 3 esperienze
  const maxBulletsPerExp = profile.experiences.length > 3 ? 3 : 5;
  const experiences = profile.experiences.slice(0, 6).map((e) => ({
    ...e,
    bullets: (e.bullets ?? []).slice(0, maxBulletsPerExp),
    description: e.description && e.description.length > 240
      ? e.description.slice(0, 237) + "…"
      : e.description,
  }));
  const education = profile.education.slice(0, 3).map((e) => ({
    ...e,
    notes: e.notes && e.notes.length > 140 ? e.notes.slice(0, 137) + "…" : e.notes,
  }));
  const skills = profile.skills.slice(0, 18);
  const languages = profile.languages.slice(0, 5);
  const links = profile.links.slice(0, 4);
  const summary =
    profile.summary && profile.summary.length > 420
      ? profile.summary.slice(0, 417) + "…"
      : profile.summary;

  return {
    ...profile,
    summary,
    experiences,
    education,
    skills,
    languages,
    links,
  };
}

function CVDocument({
  profile,
  lang,
  photoDataUri,
}: {
  profile: CVProfile;
  lang: Lang;
  photoDataUri: string | null;
}) {
  const t = L[lang];
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || " ";
  const contacts = joinContact([profile.email, profile.phone, profile.city]);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>
        {/* SIDEBAR */}
        <View style={styles.sidebar}>
          {photoDataUri ? (
            <View style={styles.photoWrap}>
              <Image src={photoDataUri} style={styles.photo} />
            </View>
          ) : null}

          {contacts.length > 0 ? (
            <>
              <Text style={styles.sidebarTitle}>{t.contact}</Text>
              {contacts.map((c, i) => (
                <Text key={i} style={styles.contactRow}>
                  {c}
                </Text>
              ))}
            </>
          ) : null}

          {profile.skills.length > 0 ? (
            <>
              <Text style={styles.sidebarTitle}>{t.skills}</Text>
              <View style={styles.skillRow}>
                {profile.skills.map((s, i) => (
                  <Text key={i} style={styles.skillPill}>
                    {s.name}
                  </Text>
                ))}
              </View>
            </>
          ) : null}

          {profile.languages.length > 0 ? (
            <>
              <Text style={styles.sidebarTitle}>{t.languages}</Text>
              {profile.languages.map((lng, i) => (
                <View key={i} style={styles.langRow}>
                  <Text>{lng.name || " "}</Text>
                  <Text style={{ color: FG_MUTED }}>{lng.level || ""}</Text>
                </View>
              ))}
            </>
          ) : null}

          {profile.links.length > 0 ? (
            <>
              <Text style={styles.sidebarTitle}>{t.links}</Text>
              {profile.links.map((l, i) => (
                <Link key={i} src={l.url} style={styles.link}>
                  {l.label || l.url}
                </Link>
              ))}
            </>
          ) : null}
        </View>

        {/* MAIN */}
        <View style={styles.main}>
          <Text style={styles.name}>{fullName}</Text>
          {profile.title ? <Text style={styles.title}>{profile.title.toUpperCase()}</Text> : null}
          <View style={styles.accentBar} />

          {profile.summary ? (
            <>
              <Text style={styles.sectionTitle}>{t.profile}</Text>
              <Text style={styles.summary}>{profile.summary}</Text>
            </>
          ) : null}

          {profile.experiences.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>{t.experience}</Text>
              {profile.experiences.map((e, i) => (
                <View key={i} style={styles.expRow} wrap={false}>
                  <View style={styles.expHead}>
                    <Text style={styles.expRole}>{e.role || " "}</Text>
                    <Text style={styles.expDates}>
                      {formatRange(e.startDate, e.endDate, lang)}
                    </Text>
                  </View>
                  {e.company || e.location ? (
                    <Text style={styles.expCompany}>
                      {[e.company, e.location].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {e.description ? (
                    <Text style={styles.expDesc}>{e.description}</Text>
                  ) : null}
                  {e.bullets && e.bullets.length > 0 ? (
                    <View style={{ marginTop: 2 }}>
                      {e.bullets.map((b, j) => (
                        <Text key={j} style={styles.bullet}>
                          • {b}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}

          {profile.education.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>{t.education}</Text>
              {profile.education.map((e, i) => (
                <View key={i} style={styles.expRow} wrap={false}>
                  <View style={styles.expHead}>
                    <Text style={styles.expRole}>{e.degree || " "}</Text>
                    <Text style={styles.expDates}>
                      {formatRange(e.startDate, e.endDate, lang)}
                    </Text>
                  </View>
                  {e.school || e.location ? (
                    <Text style={styles.expCompany}>
                      {[e.school, e.location].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {e.notes ? (
                    <Text style={styles.expDesc}>{e.notes}</Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export async function renderCVPdf(
  profile: CVProfile,
  lang: Lang,
  photoBuffer?: Buffer | null,
  photoMime?: string,
): Promise<Buffer> {
  const trimmed = fitToOnePage(profile);
  let photoDataUri: string | null = null;
  if (photoBuffer && photoBuffer.length > 0) {
    const mime = photoMime ?? "image/jpeg";
    photoDataUri = `data:${mime};base64,${photoBuffer.toString("base64")}`;
  }
  return await renderToBuffer(
    <CVDocument profile={trimmed} lang={lang} photoDataUri={photoDataUri} />,
  );
}
