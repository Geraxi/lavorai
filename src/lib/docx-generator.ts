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

export async function generateCoverLetterDocx(
  text: string,
  recipientName?: string,
  /**
   * Token tracking dell'Application. Quando passato, viene aggiunto un
   * link breve "Portfolio: lavorai.it/r/<token>" alla fine della cover
   * letter. Il click dal recruiter (dentro l'ATS) logga `viewedAt` e
   * redirige al portfolio dell'utente. Unico modo di tracciare le views
   * per portal submissions dove il pixel email non si può mettere.
   */
  trackingToken?: string,
  /** "it" | "en" — locale per la label "Portfolio" */
  locale: "it" | "en" = "it",
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

  // Tracking link sopra la privacy clause. Cliccabile direttamente dal
  // PDF/DOCX dentro l'ATS del recruiter → unica vera fonte di "viewed"
  // signal per portal submissions.
  if (trackingToken) {
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it"
    ).replace(/\/$/, "");
    const label = locale === "en" ? "Portfolio:" : "Portfolio:";
    paragraphs.push(
      new Paragraph({
        spacing: { before: 320 },
        children: [
          new TextRun({
            text: `${label} `,
            size: SMALL_SIZE,
            color: MUTED_COLOR,
            font: FONT,
          }),
          new ExternalHyperlink({
            link: `${siteUrl}/r/${trackingToken}`,
            children: [
              new TextRun({
                text: `${siteUrl.replace(/^https?:\/\//, "")}/r/${trackingToken}`,
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
