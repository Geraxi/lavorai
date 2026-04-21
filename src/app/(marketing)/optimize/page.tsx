"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { Check, Loader2, Mail, Sparkles, Upload } from "lucide-react";

type Status = "idle" | "loading" | "sent";

const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB

export default function OptimizePage() {
  const [consenso, setConsenso] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [sentEmail, setSentEmail] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consenso) {
      toast.error("Devi accettare la privacy policy per continuare.");
      return;
    }
    if (!file) {
      toast.error("Carica il tuo CV per iniziare.");
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      toast.error("Il CV supera i 10 MB.");
      return;
    }

    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    if (!email) return;

    setStatus("loading");

    try {
      // 1. Server-side staging: salva CV + consenso keyed by email.
      // Funziona cross-device (a differenza di localStorage).
      const stageFd = new FormData();
      stageFd.set("cv", file);
      stageFd.set("email", email);
      stageFd.set("privacyConsent", "true");

      const stageRes = await fetch("/api/optimize/stage", {
        method: "POST",
        body: stageFd,
      });

      if (!stageRes.ok) {
        const body = await stageRes.json().catch(() => ({}));
        toast.error(
          body?.message ?? "Impossibile caricare il CV. Riprova tra poco.",
        );
        setStatus("idle");
        return;
      }

      // 2. Magic link via NextAuth
      const res = await signIn("email", {
        email,
        callbackUrl: "/onboarding",
        redirect: false,
      });

      if (res?.error) {
        toast.error("Non siamo riusciti a inviare il magic link. Riprova.");
        setStatus("idle");
        return;
      }

      setSentEmail(email);
      setStatus("sent");
    } catch (err) {
      console.error(err);
      toast.error("Errore di rete. Riprova.");
      setStatus("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Logo size="md" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">← Torna alla home</Link>
          </Button>
        </div>
      </header>

      <main className="container flex flex-1 items-start justify-center py-12 md:py-20">
        {status === "sent" ? (
          <SentCard email={sentEmail} />
        ) : (
          <FormCard
            onSubmit={onSubmit}
            consenso={consenso}
            setConsenso={setConsenso}
            loading={status === "loading"}
            file={file}
            setFile={setFile}
          />
        )}
      </main>
    </div>
  );
}

// ---------- FORM CARD ----------

function FormCard({
  onSubmit,
  consenso,
  setConsenso,
  loading,
  file,
  setFile,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  consenso: boolean;
  setConsenso: (v: boolean) => void;
  loading: boolean;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  return (
    <Card className="w-full max-w-[600px] border-border/60 bg-card">
      <CardContent className="p-6 md:p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Inizia gratis — 3 candidature incluse
          </h1>
          <p className="text-sm text-muted-foreground">
            Carica il CV e inserisci l&apos;email. Ti invieremo un magic link:
            dopo il login LavorAI si candida in automatico agli annunci che
            fanno per te.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cv">Il tuo CV attuale</Label>
            <label
              htmlFor="cv"
              className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border/70 bg-background/40 p-4 text-sm transition-colors hover:border-primary/50 hover:bg-background/60"
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
                <Upload className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <div className="truncate font-medium text-foreground">
                      {file.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · click per
                      cambiare
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-medium text-foreground">
                      Carica PDF o DOCX
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Non scansionato, max 10 MB
                    </div>
                  </>
                )}
              </div>
            </label>
            <Input
              id="cv"
              name="cv"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
              disabled={loading}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">La tua email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              disabled={loading}
              placeholder="mario.rossi@esempio.it"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              Ricevi un magic link — niente password da ricordare.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-background/60 p-3 text-sm">
            <input
              type="checkbox"
              checked={consenso}
              onChange={(e) => setConsenso(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-muted-foreground">
              Ho letto la{" "}
              <Link
                href="/privacy"
                className="text-foreground underline-offset-4 hover:underline"
              >
                privacy policy
              </Link>{" "}
              e autorizzo il trattamento dei dati.
            </span>
          </label>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                Invio magic link...
              </>
            ) : (
              <>
                <Sparkles />
                Inizia gratis
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          3 candidature gratis, poi €19/mese. Nessuna carta richiesta per
          iniziare.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------- SENT CARD ----------

function SentCard({ email }: { email: string }) {
  return (
    <Card className="w-full max-w-[560px] border-border/60 bg-card">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Controlla la tua email
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Abbiamo inviato un magic link a{" "}
            <span className="text-foreground">{email}</span>. Clicca il link
            per accedere — il tuo CV verrà caricato automaticamente.
          </p>
        </div>

        <ul className="mx-auto mt-8 max-w-sm space-y-3 text-sm">
          {[
            "Apri l'email da LavorAI",
            "Clicca il magic link",
            "Completa le preferenze e attiva auto-apply",
          ].map((f) => (
            <li key={f} className="flex items-start gap-3">
              <Check className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Non vedi l&apos;email? Controlla spam o riprova con un altro
          indirizzo.
        </p>
      </CardContent>
    </Card>
  );
}

