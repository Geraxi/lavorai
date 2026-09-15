import type { Metadata } from "next";

// Le pagine di accesso non rispondono a una ricerca informativa: lasciare che
// Google le indicizzi disperde segnali e propone una schermata di login a chi
// sta ancora valutando il prodotto.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
