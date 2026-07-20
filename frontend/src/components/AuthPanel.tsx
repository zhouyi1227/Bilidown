import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApiClient, AuthConfig, AuthStatus, QrLoginStart } from "../api";

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
  const [qrLogin, setQrLogin] = useState<QrLoginStart | null>(null);
  const [qrState, setQrState] = useState<"pending" | "scanned" | "expired">("pending");

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

  async function handleStartQrLogin() {
    setMessage(null);
    try {
      const started = await api.startQrLogin();
      setQrLogin(started);
      setQrState("pending");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("auth.qrStartError"));
    }
  }

  useEffect(() => {
    if (qrLogin === null) return undefined;
    const qrKey = qrLogin.qr_key;
    let disposed = false;
    let timer: number | undefined;

    async function poll(): Promise<void> {
      try {
        const result = await api.pollQrLogin(qrKey);
        if (disposed) return;
        if (result.state === "confirmed") {
          if (result.session_id === null) {
            setMessage(t("auth.qrPollError"));
            setQrLogin(null);
            return;
          }
          onChange({ kind: "cookie_session", session_id: result.session_id });
          setMessage(t("auth.loaded", { count: result.cookie_count }));
          setQrLogin(null);
          return;
        }
        setQrState(result.state);
        if (result.state !== "expired") timer = window.setTimeout(() => void poll(), 2_000);
      } catch (error) {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : t("auth.qrPollError"));
          setQrLogin(null);
        }
      }
    }

    timer = window.setTimeout(() => void poll(), 2_000);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [api, onChange, qrLogin?.qr_key, t]);

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
        <button
          type="button"
          className="file-button"
          onClick={() => void handleStartQrLogin()}
          disabled={disabled || uploading}
        >
          {t("auth.oneClick")}
        </button>
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
      {qrLogin && (
        <section className="qr-login-card" aria-live="polite">
          <img className="qr-login-image" src={qrLogin.image_data_uri} alt={t("auth.qrAlt")} />
          <div>
            <p>{t("auth.qrPrompt")}</p>
            <strong>{t(`auth.qr${qrState.charAt(0).toUpperCase()}${qrState.slice(1)}`)}</strong>
            <div className="qr-login-actions">
              <button type="button" className="secondary-button" onClick={() => void handleStartQrLogin()}>
                {t("auth.qrRefresh")}
              </button>
              <button type="button" className="text-button" onClick={() => setQrLogin(null)}>
                {t("auth.qrCancel")}
              </button>
            </div>
          </div>
        </section>
      )}
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
