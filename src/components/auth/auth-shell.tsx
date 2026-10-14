"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, ArrowUpRight, FileText, Send, Check } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import "./auth.css";

/** Shared presentation only: authentication remains in the route components. */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  return (
    <main className="auth-shell">
      <aside className="auth-scene">
        <Link href="/" className="auth-wordmark" aria-label="LavorAI">Lavor<span>AI</span></Link>
        <div className="auth-scene-copy">
          <h2>{t("sceneHeadingFirst")}<br />{t("sceneHeadingSecond")}</h2>
          <p>{t("sceneSubtitleFirst")}<br />{t("sceneSubtitleSecond")}</p>
        </div>
        <div className="auth-scene-cards" aria-hidden="true">
          <div><FileText size={26} /><span>{t("sceneCvReady")}</span><Check size={15} className="auth-scene-check" /></div>
          <div><Send size={26} /><span>{t("sceneApplicationReady")}</span><Check size={15} className="auth-scene-check" /></div>
        </div>
      </aside>
      <section className="auth-panel">
        <header className="auth-header">
          <Link href="/" className="auth-wordmark auth-mobile-brand" aria-label="LavorAI">Lavor<span>AI</span></Link>
          <Link href="/" className="auth-back">{t("backToSite")} <ArrowUpRight size={14} aria-hidden /></Link>
        </header>
        <div className="auth-content">{children}</div>
        <footer className="auth-footer">
          <Link href="/privacy">{t("footerPrivacy")}</Link><span aria-hidden>·</span><Link href="/termini">{t("footerTerms")}</Link>
          <LanguageSwitcher />
        </footer>
      </section>
    </main>
  );
}

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("auth");
  return <div className="auth-password">
    <input {...props} type={visible ? "text" : "password"} className="auth-input" />
    <button type="button" aria-label={t(visible ? "hidePassword" : "showPassword")} aria-controls={props.id} aria-pressed={visible} onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
    </button>
  </div>;
}
