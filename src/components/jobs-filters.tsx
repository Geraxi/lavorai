"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JobsFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [what, setWhat] = useState(params.get("what") ?? "");
  const [where, setWhere] = useState(params.get("where") ?? "");
  const [remote, setRemote] = useState(params.get("remote") === "1");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (what) next.set("what", what);
    if (where) next.set("where", where);
    if (remote) next.set("remote", "1");
    router.push(`/jobs?${next.toString()}`);
  }

  function reset() {
    setWhat("");
    setWhere("");
    setRemote(false);
    router.push("/jobs");
  }

  const hasFilters = what || where || remote;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur md:flex-row md:items-center"
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="Ruolo, azienda, keyword..."
          className="pl-9"
        />
      </div>

      <div className="relative md:w-64">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="Città (es. Milano)"
          className="pl-9"
        />
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 px-2 text-sm">
        <input
          type="checkbox"
          checked={remote}
          onChange={(e) => setRemote(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <span>Solo remoto</span>
      </label>

      <div className="flex gap-2">
        <Button type="submit" className="md:w-auto">
          Cerca
        </Button>
        {hasFilters && (
          <Button type="button" variant="ghost" size="icon" onClick={reset} title="Reset">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
