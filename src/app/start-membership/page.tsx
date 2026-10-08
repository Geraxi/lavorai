import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { isApplicationAccessPaused, requiresPaymentMethodBeforeApp, trialEnd } from "@/lib/billing";
import { StartMembershipActions } from "./start-membership-actions";

export const metadata = {
  title: "Attiva la prova Pro | LavorAI",
  robots: { index: false, follow: false },
};

export default async function StartMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string; canceled?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user.email)) redirect("/dashboard");
  if (isApplicationAccessPaused(user)) redirect("/trial-expired");
  if (!requiresPaymentMethodBeforeApp(user)) redirect("/dashboard");

  const endsAt = trialEnd(user);
  const date = endsAt?.toLocaleDateString("it-IT", { day: "numeric", month: "long" }) ?? "tra 7 giorni";

  return (
    <main className="min-h-screen overflow-hidden bg-[#030712] px-5 py-7 text-white sm:px-8 sm:py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(16,185,129,.18),transparent_28%),radial-gradient(circle_at_20%_90%,rgba(14,116,144,.16),transparent_26%)]" />
      <section className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <div className="max-w-xl">
          <a href="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight" aria-label="Torna alla homepage LavorAI">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-400 text-sm font-black text-slate-950">L</span>
            Lavor<span className="text-emerald-400">AI</span>
          </a>
          <p className="mt-16 text-xs font-bold uppercase tracking-[.22em] text-emerald-300">Prima di iniziare</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-.045em] sm:text-6xl">
            Attiva la tua prova.<br />
            <span className="text-emerald-400">Nessun addebito oggi.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">
            Aggiungi un metodo di pagamento per entrare in LavorAI. Userai Pro fino al {date}; il primo addebito avverrà solo alla fine della prova, salvo disdetta.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-0 border-y border-white/10 text-sm text-slate-300">
            <div className="py-4 pr-4"><span className="block font-mono text-xs text-emerald-300">01 · OGGI</span><span className="mt-1 block">Metodo sicuro</span></div>
            <div className="border-l border-white/10 py-4 pl-4"><span className="block font-mono text-xs text-emerald-300">02 · PROVA</span><span className="mt-1 block">7 giorni di Pro</span></div>
            <div className="border-l border-white/10 py-4 pl-4"><span className="block font-mono text-xs text-emerald-300">03 · POI</span><span className="mt-1 block">€19,99/mese</span></div>
          </div>
        </div>
        <div className="rounded-[28px] border border-white/12 bg-slate-950/70 p-5 shadow-2xl shadow-emerald-950/40 backdrop-blur sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-300">Accesso protetto</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Scegli come continuare</h2>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">7 giorni gratis</span>
          </div>
          <StartMembershipActions confirming={params.subscribed === "1"} canceled={params.canceled === "1"} />
          <p className="mt-5 text-center text-xs leading-5 text-slate-400">Il pagamento viene gestito da Stripe. Apple Pay e Google Pay compaiono quando sono disponibili sul tuo dispositivo.</p>
        </div>
      </section>
    </main>
  );
}
