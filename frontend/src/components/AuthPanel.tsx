import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApiClient, AuthConfig, AuthStatus } from "../api";
import {
  closeBilibiliLogin,
  collectBilibiliCookies,
  isDesktopApp,
  openBilibiliLogin,
} from "../desktop";

interface AuthPanelProps {
  api: ApiClient;
  auth: AuthConfig;
  authStatus: AuthStatus | null;
  checking: boolean;
  checkError: string | null;
  autoSelected: boolean;
  onRefresh: () => void;
  onChange: (auth: AuthConfig) => void;
  disabled?: boolean;
}

export function AuthPanel({
  api,
  auth,
  authStatus,
  checking,
  checkError,
  autoSelected,
  onRefresh,
  onChange,
  disabled = false,
}: AuthPanelProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginWindowOpen, setLoginWindowOpen] = useState(false);

  async function handleCookieFile(file: File | undefined): Promise<boolean> {
    if (!file) return false;
    setUploading(true);
    setMessage(null);
    try {
      const session = await api.uploadCookies(file);
      onChange({ kind: "cookie_session", session_id: session.session_id });
      setMessage(t("auth.loaded", { count: session.cookie_count }));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("auth.fileError"));
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenLogin() {
    setMessage(null);
    try {
      await openBilibiliLogin();
      setLoginWindowOpen(true);
      setMessage(t("auth.loginPrompt"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("auth.loginOpenError"));
    }
  }

  async function handleImportLogin() {
    setUploading(true);
    setMessage(null);
    try {
      const imported = await collectBilibiliCookies();
      const file = new File([imported.content], "tauri-login-cookies.txt", {
        type: "text/plain",
      });
      const importedSuccessfully = await handleCookieFile(file);
      if (importedSuccessfully) setLoginWindowOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("auth.importError"));
      setUploading(false);
    }
  }

  async function handleCancelLogin() {
    try {
      await closeBilibiliLogin();
      setLoginWindowOpen(false);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("auth.loginCloseError"));
    }
  }

  const sourceLabel = auth.kind === "guest"
      ? t("auth.guest")
      : auth.kind === "browser"
      ? auth.browser.charAt(0).toUpperCase() + auth.browser.slice(1)
      : "cookies.txt";
  const statusTone = checking
    ? "checking"
    : checkError
      ? "error"
      : authStatus?.state === "active"
        ? "active"
        : authStatus?.state === "inactive"
          ? "inactive"
          : "guest";
  const statusText = checking
    ? t("auth.checking")
    : checkError
      ? checkError
      : authStatus?.state === "active"
        ? `${authStatus.username ?? t("auth.activeUser")} · ${authStatus.vip_active ? authStatus.vip_label ?? t("auth.vip") : t("auth.regular")}`
        : authStatus?.state === "inactive"
          ? t("auth.inactive")
          : t("auth.guestStatus");

  return (
    <section className="panel auth-panel" aria-labelledby="auth-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("auth.eyebrow")}</p>
          <h2 id="auth-heading">{t("auth.title")}</h2>
        </div>
        <span className="privacy-badge">{t("auth.private")}</span>
      </div>

      <div className="segmented" role="group" aria-label={t("auth.sourceGroup")}>
        <button
          type="button"
          className={auth.kind === "guest" ? "active" : ""}
          onClick={() => onChange({ kind: "guest" })}
          disabled={disabled}
        >
          {t("auth.guest")}
        </button>
        {(["chrome", "edge", "firefox"] as const).map((browser) => (
          <button
            type="button"
            className={auth.kind === "browser" && auth.browser === browser ? "active" : ""}
            onClick={() => onChange({ kind: "browser", browser })}
            disabled={disabled}
            key={browser}
          >
            {browser.charAt(0).toUpperCase() + browser.slice(1)}
          </button>
        ))}
      </div>

      {auth.kind === "browser" && (
        <label className="field compact-field">
          <span>{t("auth.profile")}</span>
          <input
            value={auth.profile ?? ""}
            onChange={(event) =>
              onChange(
                event.target.value
                  ? { kind: "browser", browser: auth.browser, profile: event.target.value }
                  : { kind: "browser", browser: auth.browser },
              )
            }
            placeholder={t("auth.profilePlaceholder")}
            disabled={disabled}
          />
        </label>
      )}

      <div className="cookie-row">
        {isDesktopApp() && (
          <>
            <button
              type="button"
              className="file-button"
              onClick={() => void handleOpenLogin()}
              disabled={disabled || uploading}
            >
              {t("auth.oneClick")}
            </button>
            {loginWindowOpen && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleImportLogin()}
                  disabled={disabled || uploading}
                >
                  {uploading ? t("auth.importing") : t("auth.import")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void handleCancelLogin()}
                  disabled={disabled || uploading}
                >
                  {t("auth.cancelLogin")}
                </button>
              </>
            )}
          </>
        )}
        <label className="file-button">
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => void handleCookieFile(event.target.files?.[0])}
            disabled={disabled || uploading}
          />
          {uploading ? t("auth.loading") : t("auth.loadFile")}
        </label>
        <span>
          {auth.kind === "cookie_session"
            ? t("auth.sessionEnabled")
            : t("auth.browserWarning")}
        </span>
      </div>
      {message && <p className="inline-message" role="status">{message}</p>}
      <div className={`auth-status-card ${statusTone}`} aria-live="polite">
        <span className="auth-status-indicator" aria-hidden="true" />
        <div>
          <strong>{sourceLabel}{autoSelected ? ` · ${t("auth.auto")}` : ""}</strong>
          <p>{statusText}</p>
        </div>
        <button
          type="button"
          className="secondary-button auth-refresh"
          onClick={onRefresh}
          disabled={disabled || checking}
        >
          {t("auth.refresh")}
        </button>
      </div>
    </section>
  );
}
