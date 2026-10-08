/** Plain-text presentation for inbound email, including older stored messages. */
export function formatInboxEmailText(value: string): string {
  return value
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (match, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (match, entity: string) => ({
      nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
    }[entity.toLowerCase()] ?? match))
    .replace(/https?:\/\/[^\s<>]+/gi, (url) => url.length > 180 ? "[link lungo omesso]" : url)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
