"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { DrawerApp } from "./design/detail-drawer";
import { applicationLabel, deliveryCopy } from "@/lib/application-presentation";
import { pipelineLane, type PipelineLane } from "@/lib/application-pipeline";
import type { ApplicationPagination } from "@/lib/application-pagination";
import { ApplicationPager } from "./application-pager";

export type BoardApplication = DrawerApp & { userStatus?: string | null; lastReplyKind?: string | null; backendStatus?: string };

export function ApplicationBoard({ applications, onOpen, pages, busy, onPage }: {
  applications: BoardApplication[]; onOpen: (app: BoardApplication) => void;
  pages: Record<PipelineLane, ApplicationPagination>; busy?: boolean;
  onPage: (lane: PipelineLane, page: number) => void;
}) {
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = applications.find(a => a.id === selectedId) ?? applications[0] ?? null;
  const selectedDelivery = deliveryCopy(selected?.delivery, en ? "en" : "it");
  const lanes: Array<[PipelineLane, string]> = [
    ["attention", tr("Da completare / verificare", "Needs attention")],
    ["recorded", tr("Invio registrato", "Submission recorded")],
    ["conversation", tr("Risposte e colloqui", "Replies & interviews")],
    ["outcome", tr("Esiti dichiarati", "Reported outcomes")],
  ];
  const boardRef = useRef<HTMLDivElement>(null);
  const previousPages = useRef(pages);
  useEffect(() => {
    for (const lane of Object.keys(pages) as PipelineLane[]) {
      if (previousPages.current[lane].page !== pages[lane].page) {
        const list = boardRef.current?.querySelector(`[data-lane="${lane}"] .pipeline-lane-list`);
        if (list) list.scrollTop = 0;
      }
    }
    previousPages.current = pages;
  }, [pages]);
  return <div className="pipeline-layout" ref={boardRef} aria-busy={busy}>
    <div className="pipeline-board" aria-label={tr("Pipeline candidature", "Application pipeline")}>
      {lanes.map(([lane, label]) => {
        const rows = applications.filter(a => pipelineLane(a) === lane);
        return <section key={lane} data-lane={lane} className="pipeline-lane" aria-label={label}>
          <h2>{label}<span className="workspace-chip">{pages[lane].total}</span></h2>
          <div className="pipeline-lane-list" tabIndex={0} aria-label={label}>{rows.length === 0 && <p className="workspace-muted">{tr("Nessuna candidatura", "No applications")}</p>}
          {rows.map(a => <button key={a.id} type="button" className="pipeline-card" aria-pressed={selected?.id === a.id} onClick={() => setSelectedId(a.id)}>
            <strong>{a.role}</strong><small>{a.company} · {a.location}</small>
            <span className="workspace-chip">{a.match == null ? tr("Score non disponibile", "Score unavailable") : `${a.match}% · ${tr("score AI", "AI score")}`}</span>
            <small style={{ marginTop: 8 }}>{deliveryCopy(a.delivery, en ? "en" : "it")?.label}</small>
            {a.userStatus && <small>{tr("Stato dichiarato", "Reported status")}: {applicationLabel(a.userStatus, en ? "en" : "it")}</small>}
            {!a.userStatus && a.lastReplyKind && <small>{tr("Messaggio classificato", "Message classified")}: {applicationLabel(a.lastReplyKind, en ? "en" : "it")}</small>}
            <small>{a.applied}</small>
          </button>)}</div>
          <ApplicationPager pagination={pages[lane]} label={label} busy={busy} onPage={page => onPage(lane, page)} />
        </section>;
      })}
    </div>
    <aside className="workspace-panel pipeline-detail" aria-label={tr("Dettaglio rapido candidatura", "Application quick details")}>
      <div className="workspace-eyebrow">{tr("Dettaglio candidatura", "Application details")}</div>
      {!selected ? <p className="workspace-empty">{tr("Seleziona una candidatura per vedere documenti e prove di invio.", "Select an application to see documents and submission evidence.")}</p> : <>
        <h3>{selected.company}</h3><p className="workspace-muted">{selected.role}</p><hr />
        <h2>{tr("Stato dell'invio", "Submission status")}</h2>
        <span className="workspace-chip">{selectedDelivery?.label ?? tr("Non disponibile", "Unavailable")}</span>
        <p className="workspace-muted" style={{ marginTop: 10 }}>{selectedDelivery?.detail}</p>
        <hr /><h2>{tr("Lettera di presentazione", "Cover letter")}</h2>
        <p className="workspace-muted" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.coverLetterText ? selected.coverLetterText.slice(0, 260) + (selected.coverLetterText.length > 260 ? "…" : "") : tr("Nessuna lettera generata per questa candidatura.", "No cover letter generated for this application.")}</p>
        <button type="button" className="ds-btn ds-btn-primary" onClick={() => onOpen(selected)}>{tr("Apri tutti i dettagli", "Open full details")}</button>
        {selected.backendStatus === "needs_answers" && <a href="/questions" className="ds-btn">{tr("Completa le risposte", "Complete answers")}</a>}
        <hr /><p className="workspace-muted">{tr("Le aperture email non confermano la lettura del recruiter. Le categorie dei messaggi sono stime; gli esiti sono dichiarati da te.", "Email opens do not confirm recruiter readership. Message labels are estimates; outcomes are reported by you.")}</p>
      </>}
    </aside>
  </div>;
}
