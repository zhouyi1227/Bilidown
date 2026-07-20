import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface BackendConnection {
  base_url: string;
  token: string;
}

export interface BackendStartupStatus {
  state: "starting" | "ready" | "failed" | "stopping";
  error_code: string | null;
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

export function getBackendStatus(): Promise<BackendStartupStatus> {
  return invoke<BackendStartupStatus>("backend_status");
}

export function retryBackend(): Promise<BackendStartupStatus> {
  return invoke<BackendStartupStatus>("retry_backend");
}

export function reloadDesktopApp(): void {
  window.location.reload();
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
