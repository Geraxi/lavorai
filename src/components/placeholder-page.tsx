import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
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
      <main className="container flex flex-1 items-center justify-center py-20">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {description ?? "Pagina in aggiornamento."}
          </p>
          <Button asChild className="mt-8">
            <Link href="/">Torna alla home</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
