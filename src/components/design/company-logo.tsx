/**
 * Logo azienda deterministico — colore derivato dall'iniziale,
 * testo = prime 1-2 lettere. Usato in tabelle/card applicazioni.
 */

const PALETTE = [
  "#EF3E42", "#FE5FA3", "#1B3C89", "#0A0A0A", "#7E3FF2",
  "#1F6BFF", "#F7235C", "#FFB400", "#FF2954", "#DD0000",
  "#FF3A9E", "#0E4C92", "#FF5A00", "#00D084", "#5D2EFA",
];

export function companyColor(name: string): string {
  if (!name) return PALETTE[0];
  let sum = 0;
  for (let i = 0; i < Math.min(name.length, 6); i++) {
    sum = (sum + name.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[sum];
}

function companyInitials(name: string): string {
  if (!name) return "—";
  const trimmed = name.trim();
  return trimmed.length > 2 ? trimmed.slice(0, 2) : trimmed.slice(0, 1);
}

export function CompanyLogo({
  company,
  color,
  size = 28,
}: {
  company: string;
  color?: string;
  size?: number;
}) {
  const c = color ?? companyColor(company);
  return (
    <div
      className="flex flex-none items-center justify-center rounded-md font-semibold text-white"
      style={{
        background: c,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.42),
        letterSpacing: "-0.02em",
        borderRadius: 6,
      }}
    >
      {companyInitials(company)}
    </div>
  );
}
