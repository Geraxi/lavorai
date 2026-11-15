/** Prepared files and their saved text/metadata are one unit. Never fabricate
 * an optimization result just to reuse the file buffers on a retry. */
export type PreparedDocumentMetadata = {
  coverLetterText: string;
  atsScore: number | null;
  suggestionsJson: string | null;
};

type PreparedApplication = {
  cvDocxPath: string | null;
  coverLetterPath: string | null;
  coverLetterText: string | null;
  atsScore: number | null;
  suggestionsJson: string | null;
  cvLanguage: string | null;
};

export async function loadReusableApplicationDocuments(
  app: PreparedApplication,
  opts: { allowReuse: boolean; jobLanguage: string; readFile: (path: string) => Promise<Buffer> },
): Promise<{
  cvPath: string;
  clPath: string;
  cvBuffer: Buffer;
  clBuffer: Buffer;
  metadata: PreparedDocumentMetadata;
} | null> {
  if (!opts.allowReuse || !app.cvDocxPath?.trim() || !app.coverLetterPath?.trim()
    || !app.coverLetterText?.trim() || /^\(reused\)$/i.test(app.coverLetterText.trim())
    || app.cvLanguage !== opts.jobLanguage) return null;

  try {
    const [cvBuffer, clBuffer] = await Promise.all([
      opts.readFile(app.cvDocxPath), opts.readFile(app.coverLetterPath),
    ]);
    if (!cvBuffer.length || !clBuffer.length) return null;
    return {
      cvPath: app.cvDocxPath,
      clPath: app.coverLetterPath,
      cvBuffer,
      clBuffer,
      metadata: {
        // Preserve the actual stored values, including whitespace and nullable
        // metadata. Missing text or the historical placeholder needs regeneration.
        coverLetterText: app.coverLetterText,
        atsScore: app.atsScore,
        suggestionsJson: app.suggestionsJson,
      },
    };
  } catch {
    return null;
  }
}
