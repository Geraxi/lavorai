import type { Metadata } from "next";

// La pagina è un client component: il titolo del tab vive qui.
export const metadata: Metadata = { title: "Candidature · LavorAI" };

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
