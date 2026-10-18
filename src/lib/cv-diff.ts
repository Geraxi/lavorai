/**
 * Diff riga-per-riga tra il CV originale e il CV su misura, per la
 * schermata di revisione prima dell'approvazione.
 *
 * Pure function (LCS su righe normalizzate), nessuna dipendenza: gira sia
 * lato server (API cv-preview?compare=1) sia nei test.
 */

export type CvDiffOp = "same" | "added" | "removed";

export interface CvDiffLine {
  op: CvDiffOp;
  text: string;
}

export interface CvDiffSummary {
  added: number;
  removed: number;
  same: number;
}

const MAX_LINES = 600;

function toLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES);
}

function key(line: string): string {
  return line
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[•·\-–—*▪●]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function diffCvText(original: string, tailored: string): { lines: CvDiffLine[]; summary: CvDiffSummary } {
  const a = toLines(original);
  const b = toLines(tailored);
  const ka = a.map(key);
  const kb = b.map(key);
  const n = a.length;
  const m = b.length;
  // LCS table (n+1)*(m+1), Uint16 basta con MAX_LINES=600.
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = ka[i] === kb[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const lines: CvDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      lines.push({ op: "same", text: b[j] });
      i++; j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      lines.push({ op: "removed", text: a[i] });
      i++;
    } else {
      lines.push({ op: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) lines.push({ op: "removed", text: a[i++] });
  while (j < m) lines.push({ op: "added", text: b[j++] });
  const summary = lines.reduce<CvDiffSummary>((acc, line) => {
    acc[line.op] += 1;
    return acc;
  }, { added: 0, removed: 0, same: 0 });
  return { lines, summary };
}
