import type { FormEventHandler } from "react";
import { useTranslation } from "react-i18next";

import type { AppStatus } from "../api";
import type { SupportedLanguage } from "../i18n";

interface AppHeaderProps {
  status: AppStatus | null;
  onQuit: () => void;
}

export function AppHeader({ status, onQuit }: AppHeaderProps) {
  const { i18n, t } = useTranslation();
  return (
    <header className="app-header">
      <div className="brand-mark">B</div>
      <div>
        <p className="eyebrow">LOCAL MEDIA TOOL</p>
        <h1>Bilidown</h1>
      </div>
      <div className="header-actions">
        <div className="header-status">
          <span>{t("header.localOnly")}</span>
          {status && <span>v{status.app_version} · yt-dlp {status.yt_dlp_version}</span>}
        </div>
        <label className="language-picker">
          <span className="sr-only">{t("header.language")}</span>
          <select
            value={i18n.resolvedLanguage}
            onChange={(event) => void i18n.changeLanguage(event.target.value as SupportedLanguage)}
            aria-label={t("header.language")}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <button type="button" className="secondary-button app-quit" onClick={onQuit}>
          {t("header.quit")}
        </button>
      </div>
    </header>
  );
}

export function AppHero() {
  const { t } = useTranslation();
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">BILIBILI UGC DOWNLOADER</p>
        <h2>
          <span className="hero-line">{t("hero.line1")}</span>
          <span className="hero-line hero-line-accent">{t("hero.line2")}</span>
        </h2>
        <p>{t("hero.description")}</p>
      </div>
      <div className="hero-number">01—03</div>
    </section>
  );
}

interface ResolverPanelProps {
  credential: string;
  error: string | null;
  resolving: boolean;
  onCredentialChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ResolverPanel({
  credential,
  error,
  resolving,
  onCredentialChange,
  onSubmit,
}: ResolverPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="panel resolver-panel" aria-labelledby="resolver-heading">
      <p className="eyebrow">{t("resolver.eyebrow")}</p>
      <h2 id="resolver-heading">{t("resolver.title")}</h2>
      <form className="resolver-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="credential">{t("resolver.label")}</label>
        <input
          id="credential"
          value={credential}
          onChange={(event) => onCredentialChange(event.target.value)}
          placeholder={t("resolver.placeholder")}
          disabled={resolving}
          required
        />
        <button type="submit" disabled={resolving}>{resolving ? t("resolver.resolving") : t("resolver.submit")}</button>
      </form>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}

export function AppFooter({ status }: { status: AppStatus | null }) {
  const { t } = useTranslation();
  return (
    <footer>
      <p>{t("footer.legal")}</p>
      {status && <p>FFmpeg {status.ffmpeg_version ?? t("footer.missing")}</p>}
    </footer>
  );
}
