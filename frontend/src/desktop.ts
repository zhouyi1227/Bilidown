import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface BackendConnection {
  base_url: string;
  token: string;
}

export interface CookieImport {
  content: string;
  cookie_count: number;
}

export interface IdleWarning {
  minutes: number;
}

export function isDesktopApp(): boolean {
  return isTauri();
}

export function getBackendConnection(browserToken: string): Promise<BackendConnection> {
  if (!isDesktopApp()) {
    return Promise.resolve({ base_url: "", token: browserToken });
  }
  return invoke<BackendConnection>("backend_connection");
}

export function openBilibiliLogin(): Promise<void> {
  return invoke("open_bilibili_login");
}

export function collectBilibiliCookies(): Promise<CookieImport> {
  return invoke<CookieImport>("collect_bilibili_cookies");
}

export function closeBilibiliLogin(): Promise<void> {
  return invoke("close_bilibili_login");
}

export function markDesktopActivity(): Promise<void> {
  if (!isDesktopApp()) return Promise.resolve();
  return invoke("mark_activity");
}

export function setDesktopActiveJobs(active: boolean): Promise<void> {
  if (!isDesktopApp()) return Promise.resolve();
  return invoke("set_active_jobs", { active });
}

export function quitDesktopApp(): Promise<void> {
  return invoke("quit_app");
}

export function listenForIdleWarning(
  handler: (warning: IdleWarning) => void,
): Promise<UnlistenFn> {
  return listen<IdleWarning>("idle-exit-warning", (event) => handler(event.payload));
}
