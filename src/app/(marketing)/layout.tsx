/**
 * Marketing route group layout.
 * Applica data-theme="dark" ai landing pages per mantenere la vibe
 * premium dark con aurora/gradient costruita prima.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="dark" className="min-h-screen bg-background text-foreground font-sans">
      {children}
    </div>
  );
}
