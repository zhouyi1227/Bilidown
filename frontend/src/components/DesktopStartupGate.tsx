import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  getBackendConnection,
  isDesktopApp,
  quitDesktopApp,
  reloadDesktopApp,
  retryBackend,
} from "../desktop";

interface DesktopStartupGateProps {
  children: ReactNode;
}

type StartupState = "starting" | "ready" | "failed";

export function DesktopStartupGate({ children }: DesktopStartupGateProps) {
  const { t } = useTranslation();
  const desktop = isDesktopApp();
  const [state, setState] = useState<StartupState>(desktop ? "starting" : "ready");

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void getBackendConnection("")
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  async function handleRetry() {
    setState("starting");
    try {
      await retryBackend();
      await getBackendConnection("");
      reloadDesktopApp();
    } catch {
      setState("failed");
    }
  }

  if (state === "starting") {
    return (
      <main className="fatal-state" role="status">
        <h1>{t("app.backendStartingTitle")}</h1>
        <p>{t("app.backendStartingText")}</p>
      </main>
    );
  }

  if (state === "failed") {
    return (
      <main className="fatal-state" role="alert">
        <h1>{t("app.backendFailedTitle")}</h1>
        <p>{t("app.backendFailedText")}</p>
        <div className="fatal-actions">
          <button type="button" className="secondary-button" onClick={() => void handleRetry()}>
            {t("app.backendRetry")}
          </button>
          <button type="button" className="danger-button" onClick={() => void quitDesktopApp()}>
            {t("app.backendQuit")}
          </button>
        </div>
      </main>
    );
  }

  return children;
}
