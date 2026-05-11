import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { Education, Experience, OptimizedCVData } from "@/types/cv";

/** Colore section heading — slate-800 */
const HEADING_COLOR = "1F2937";
const MUTED_COLOR = "6B7280";
const FONT = "Calibri";

const BODY_SIZE = 22; // docx usa half-points → 22 = 11pt
const NAME_SIZE = 44; // 22pt
const HEADING_SIZE = 28; // 14pt
const SMALL_SIZE = 20; // 10pt

const PRIVACY_CLAUSE =
  "Autorizzo il trattamento dei dati personali ai sensi del Reg. UE 2016/679 e del D. Lgs. 196/2003 aggiornato dal D. Lgs. 101/2018.";

// ---------- CV ----------

export async function generateOptimizedCVDocx(
  data: OptimizedCVData,
): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Header: nome
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: data.fullName,
          bold: true,
          size: NAME_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  // Riga contatti
  const contactParts: string[] = [
    data.email,
    data.phone,
    data.location,
    data.linkedinUrl ?? "",
  ].filter(Boolean);
  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: contactParts.join("  ·  "),
          color: MUTED_COLOR,
          size: SMALL_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  // Separator
  children.push(horizontalRule());

  // Profilo
  children.push(sectionHeading("Profilo"));
  children.push(bodyParagraph(data.summary));

  // Esperienza
  if (data.experiences.length > 0) {
    children.push(sectionHeading("Esperienza Professionale"));
    for (const exp of data.experiences) {
      children.push(...experienceBlock(exp));
    }
  }

  // Formazione
  if (data.education.length > 0) {
    children.push(sectionHeading("Formazione"));
    for (const edu of data.education) {
      children.push(...educationBlock(edu));
    }
  }

  // Competenze
  children.push(sectionHeading("Competenze"));
  if (data.skills.technical.length > 0) {
    children.push(subHeading("Tecniche"));
    children.push(bodyParagraph(data.skills.technical.join(" · ")));
  }
  if (data.skills.soft.length > 0) {
    children.push(subHeading("Soft skill"));
    children.push(bodyParagraph(data.skills.soft.join(" · ")));
  }
  if (data.skills.tools.length > 0) {
    children.push(subHeading("Strumenti"));
    children.push(bodyParagraph(data.skills.tools.join(" · ")));
  }

  // Lingue
  if (data.languages.length > 0) {
    children.push(sectionHeading("Lingue"));
    for (const lang of data.languages) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `${lang.language} — ${lang.level}`,
              size: BODY_SIZE,
              font: FONT,
            }),
          ],
        }),
      );
    }
  }

  // Privacy footer
  children.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: PRIVACY_CLAUSE,
          italics: true,
          size: SMALL_SIZE,
          color: MUTED_COLOR,
          font: FONT,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "LavorAI",
    title: `CV — ${data.fullName}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  return bufferFromDoc(doc);
}

// ---------- Cover Letter ----------

export interface CoverLetterTrackingLinks {
  /** URL portfolio/Behance/Dribbble/website. null se utente non l'ha. */
  hasPortfolio?: boolean;
  /** URL LinkedIn. null se utente non l'ha. */
  hasLinkedin?: boolean;
  /** URL GitHub. null se utente non l'ha. */
  hasGithub?: boolean;
}

export async function generateCoverLetterDocx(
  text: string,
  recipientName?: string,
  /**
   * Token tracking dell'Application. Quando passato, viene aggiunto un
   * blocco "Get in touch" alla fine della cover letter con più link
   * cliccabili (portfolio, LinkedIn, GitHub, email) tutti routati via
   * /r/<token>?ref=... Ogni click dal recruiter dentro l'ATS logga
   * `viewedAt`. Più link = più chance di click = più view tracciate.
   */
  trackingToken?: string,
  /** "it" | "en" — locale per le label */
  locale: "it" | "en" = "it",
  /** Quali link tracciati includere — basato su cvProfile.linksJson */
  trackingLinks?: CoverLetterTrackingLinks,
): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  if (recipientName) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Alla cortese attenzione di ${recipientName}`,
            size: BODY_SIZE,
            font: FONT,
          }),
        ],
      }),
    );
  }

  // Dividi il testo in paragrafi basandosi su doppie newline (comuni nei
  // testi AI) oppure su singole se non ce ne sono.
  const chunks = text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  const finalChunks = chunks.length > 0 ? chunks : [text];

  for (const chunk of finalChunks) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 160 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: chunk,
            size: BODY_SIZE,
            font: FONT,
          }),
        ],
      }),
    );
  }

  // "Get in touch" footer block — multi-link tracciato.
  // Più link cliccabili (portfolio, LinkedIn, GitHub, email) tutti
  // routati via lavorai.it/r/<token>?ref=...  Ogni click dal recruiter
  // dentro l'ATS logga viewedAt. Più link = più chance di click =
  // più view tracciate (verified, no falsi positivi).
  if (trackingToken) {
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it"
    ).replace(/\/$/, "");
    const shortHost = siteUrl.replace(/^https?:\/\//, "");
    const labels =
      locale === "en"
        ? {
            heading: "Get in touch",
            portfolio: "Portfolio",
            linkedin: "LinkedIn",
            github: "GitHub",
            email: "Email me",
          }
        : {
            heading: "Per contattarmi",
            portfolio: "Portfolio",
            linkedin: "LinkedIn",
            github: "GitHub",
            email: "Scrivimi",
          };

    const entries: Array<{ label: string; ref: string }> = [];
    if (trackingLinks?.hasPortfolio)
      entries.push({ label: labels.portfolio, ref: "portfolio" });
    if (trackingLinks?.hasLinkedin)
      entries.push({ label: labels.linkedin, ref: "linkedin" });
    if (trackingLinks?.hasGithub)
      entries.push({ label: labels.github, ref: "github" });
    entries.push({ label: labels.email, ref: "email" }); // sempre

    // Fallback: se l'utente non ha alcun link, almeno la riga "Portfolio"
    // base lavora come destinazione fallback al sito.
    if (entries.length === 1) {
      entries.unshift({ label: labels.portfolio, ref: "portfolio" });
    }

    // Heading riga
    paragraphs.push(
      new Paragraph({
        spacing: { before: 360, after: 80 },
        children: [
          new TextRun({
            text: labels.heading,
            size: SMALL_SIZE,
            color: HEADING_COLOR,
            font: FONT,
            bold: true,
          }),
        ],
      }),
    );

    // Una riga per ogni link tracciato
    for (const e of entries) {
      const url = `${siteUrl}/r/${trackingToken}?ref=${e.ref}`;
      const shortUrl = `${shortHost}/r/${trackingToken}?ref=${e.ref}`;
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${e.label}: `,
              size: SMALL_SIZE,
              color: MUTED_COLOR,
              font: FONT,
            }),
            new ExternalHyperlink({
              link: url,
              children: [
                new TextRun({
                  text: shortUrl,
                  size: SMALL_SIZE,
                  color: "1A56DB",
                  font: FONT,
                  style: "Hyperlink",
                }),
              ],
            }),
          ],
        }),
      );
    }
  }

  paragraphs.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: PRIVACY_CLAUSE,
          italics: true,
          size: SMALL_SIZE,
          color: MUTED_COLOR,
          font: FONT,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "LavorAI",
    title: "Lettera motivazionale",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return bufferFromDoc(doc);
}

// ---------- Helpers ----------

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: HEADING_SIZE,
        color: HEADING_COLOR,
        font: FONT,
      }),
    ],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: BODY_SIZE,
        font: FONT,
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        size: BODY_SIZE,
        font: FONT,
      }),
    ],
  });
}

function experienceBlock(exp: Experience): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [
        new TextRun({
          text: exp.role,
          bold: true,
          size: BODY_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  const metaParts = [
    exp.company,
    exp.location,
    `${exp.startDate} — ${exp.endDate}`,
  ].filter(Boolean);

  paragraphs.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: metaParts.join("  ·  "),
          color: MUTED_COLOR,
          size: SMALL_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  for (const bullet of exp.bullets) {
    paragraphs.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 40 },
        children: [
          new TextRun({ text: bullet, size: BODY_SIZE, font: FONT }),
        ],
      }),
    );
  }

  return paragraphs;
}

function educationBlock(edu: Education): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [
        new TextRun({
          text: edu.degree,
          bold: true,
          size: BODY_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  const metaParts = [
    edu.institution,
    edu.location,
    `${edu.startDate} — ${edu.endDate}`,
  ].filter(Boolean);

  paragraphs.push(
    new Paragraph({
      spacing: { after: edu.notes ? 40 : 120 },
      children: [
        new TextRun({
          text: metaParts.join("  ·  "),
          color: MUTED_COLOR,
          size: SMALL_SIZE,
          font: FONT,
        }),
      ],
    }),
  );

  if (edu.notes) {
    paragraphs.push(bodyParagraph(edu.notes));
  }

  return paragraphs;
}

function horizontalRule(): Paragraph {
  return new Paragraph({
    border: {
      bottom: {
        color: "E5E7EB",
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    spacing: { after: 120 },
  });
}

async function bufferFromDoc(doc: Document): Promise<Buffer> {
  // Packer.toBuffer ritorna Buffer (Node). Cast esplicito per il type-check.
  const out = await Packer.toBuffer(doc);
  return out as Buffer;
}
