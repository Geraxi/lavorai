"use client";

import { motion, useReducedMotion } from "motion/react";

const roles = [
  { role: "Product Designer", company: "Bending Spoons", location: "Milano, Italia", score: "92%", mark: "B", x: "8%", y: "22%", delay: .05 },
  { role: "AI Engineer", company: "Revolut", location: "Londra, UK", score: "94%", mark: "R", x: "33%", y: "4%", delay: .17 },
  { role: "Data Analyst", company: "Scalapay", location: "Milano, Italia", score: "88%", mark: "S", x: "69%", y: "31%", delay: .26 },
  { role: "UX Designer", company: "Notion", location: "Remoto, Europa", score: "89%", mark: "N", x: "70%", y: "61%", delay: .35 },
  { role: "Software Engineer", company: "Twelve", location: "Roma, Italia", score: "87%", mark: "✳", x: "52%", y: "82%", delay: .44 },
];

const heroRoles = [
  { role: "AI Engineer", company: "Revolut", location: "Londra, UK", score: "94%", mark: "R", x: "43%", y: "14%", delay: .05 },
  { role: "Product Designer", company: "Bending Spoons", location: "Milano, Italia", score: "92%", mark: "B", x: "73%", y: "23%", delay: .13 },
  { role: "Marketing Specialist", company: "Mokka Studios", location: "Milano, Italia", score: "86%", mark: "✳", x: "38%", y: "45%", delay: .21 },
  { role: "Data Analyst", company: "Scalapay", location: "Milano, Italia", score: "88%", mark: "S", x: "77%", y: "42%", delay: .29 },
  { role: "Product Manager", company: "Google", location: "Barcellona, Spagna", score: "91%", mark: "G", x: "39%", y: "65%", delay: .37 },
  { role: "UX Designer", company: "Notion", location: "Remoto, Europa", score: "89%", mark: "N", x: "78%", y: "63%", delay: .45 },
  { role: "Software Engineer", company: "Twelve", location: "Roma, Italia", score: "87%", mark: "✳", x: "61%", y: "79%", delay: .53 },
];

export function JobNetworkScene({ compact = false, showGlobe = true, hero = false }: { compact?: boolean; showGlobe?: boolean; hero?: boolean }) {
  const reduced = useReducedMotion();
  const items = hero ? heroRoles : roles;
  return <div className={`job-network-scene ${compact ? "is-compact" : ""} ${hero ? "is-hero" : ""}`} aria-hidden>
    {showGlobe && <motion.img src={hero ? "/lavorai-connected-globe.png" : "/lavorai-network-globe.png"} alt="" className="job-network-globe" initial={reduced ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .9, ease: [0.22, 1, 0.36, 1] }} />}
    <div className="job-network-aura" />
    {!compact && items.map((job) => <motion.div key={job.role} className="job-network-card" style={{ left: job.x, top: job.y }} initial={reduced ? false : { opacity: 0, y: 14, scale: .96 }} animate={reduced ? undefined : { opacity: 1, y: [0, -4, 0], scale: 1 }} transition={{ opacity: { duration: .45, delay: job.delay }, scale: { duration: .45, delay: job.delay }, y: { duration: 4.5 + job.delay * 2, delay: job.delay, repeat: Infinity, ease: "easeInOut" } }}>
      <span className="job-network-mark">{job.mark}</span><span className="job-network-copy"><strong>{job.role}</strong><small>{job.company}</small><small>{job.location}</small></span><b>{job.score}<em> match</em></b>
    </motion.div>)}
    {!compact && !hero && <div className="job-network-threads">{roles.slice(0, 4).map((job) => <span key={job.role} style={{ left: `calc(${job.x} + 12%)`, top: `calc(${job.y} + 10%)` }} />)}</div>}
  </div>;
}
