import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { CVProfile } from "@/lib/cv-profile-types";

/**
 * ATS-friendly one-column CV template.
 * - No tables, no graphics, no columns: pure linear text blocks
 * - Standard section headers so parsers recognize them
 * - Helvetica (built-in) so we don't ship font files
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
    present: "Presente",
  },
  en: {
    profile: "SUMMARY",
    experience: "EXPERIENCE",
    education: "EDUCATION",
    skills: "SKILLS",
    languages: "LANGUAGES",
    links: "LINKS",
    present: "Present",
  },
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingLeft: 42,
    paddingRight: 42,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111",
    lineHeight: 1.4,
  },
  name: { fontSize: 18, fontWeight: 700 },
  headline: { fontSize: 11, color: "#444", marginTop: 2 },
  contactRow: { fontSize: 9.5, color: "#444", marginTop: 6 },
  divider: {
    borderBottomWidth: 0.6,
    borderBottomColor: "#999",
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 4,
  },
  sectionBody: { marginBottom: 2 },
  expRow: { marginTop: 6 },
  expHead: { flexDirection: "row", justifyContent: "space-between" },
  expRole: { fontSize: 10.5, fontWeight: 700 },
  expDates: { fontSize: 9.5, color: "#666" },
  expCompany: { fontSize: 10, color: "#333", marginTop: 1 },
  expDesc: { fontSize: 9.5, marginTop: 3 },
  bullet: { fontSize: 9.5, marginTop: 2, paddingLeft: 10 },
  kv: { flexDirection: "row", fontSize: 9.5, marginTop: 2 },
  kvKey: { width: 130, color: "#333" },
  kvValue: { flex: 1 },
  inlineSkills: { fontSize: 9.5 },
  link: { color: "#0a66c2", textDecoration: "none" },
});

function joinContact(parts: Array<string | undefined | null>): string {
  return parts.filter((p) => !!p && p.trim().length > 0).join("  ·  ");
}

function formatRange(start: string, end: string, lang: Lang): string {
  const e = end.trim() === "" ? L[lang].present : end.trim();
  if (!start && e === L[lang].present) return "";
  if (!start) return e;
  return `${start} — ${e}`;
}

function CVDocument({ profile, lang }: { profile: CVProfile; lang: Lang }) {
  const t = L[lang];
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") || " ";
  const contact = joinContact([
    profile.email,
    profile.phone,
    profile.city,
  ]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.name}>{fullName}</Text>
        {profile.title ? (
          <Text style={styles.headline}>{profile.title}</Text>
        ) : null}
        {contact ? <Text style={styles.contactRow}>{contact}</Text> : null}
        {profile.links && profile.links.length > 0 ? (
          <View style={{ marginTop: 2 }}>
            {profile.links.map((l, i) => (
              <Text key={i} style={{ fontSize: 9.5, color: "#0a66c2" }}>
                <Link src={l.url} style={styles.link}>
                  {l.label || l.url}
                </Link>
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.divider} />

        {/* Summary */}
        {profile.summary ? (
          <View>
            <Text style={styles.sectionTitle}>{t.profile}</Text>
            <Text style={styles.sectionBody}>{profile.summary}</Text>
          </View>
        ) : null}

        {/* Experience */}
        {profile.experiences.length > 0 ? (
          <View>
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
          </View>
        ) : null}

        {/* Education */}
        {profile.education.length > 0 ? (
          <View>
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
          </View>
        ) : null}

        {/* Skills (flat, comma-separated for ATS) */}
        {profile.skills.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>{t.skills}</Text>
            <Text style={styles.inlineSkills}>
              {profile.skills.map((s) => s.name).join(", ")}
            </Text>
          </View>
        ) : null}

        {/* Languages */}
        {profile.languages.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>{t.languages}</Text>
            {profile.languages.map((lng, i) => (
              <View key={i} style={styles.kv}>
                <Text style={styles.kvKey}>{lng.name || " "}</Text>
                <Text style={styles.kvValue}>{lng.level || ""}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderCVPdf(
  profile: CVProfile,
  lang: Lang,
): Promise<Buffer> {
  return await renderToBuffer(<CVDocument profile={profile} lang={lang} />);
}
