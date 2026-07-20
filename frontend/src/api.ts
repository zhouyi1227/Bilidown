import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./generated/api-schema";

type Schemas = components["schemas"];

export type AuthConfig =
  | Schemas["GuestAuth-Input"]
  | Schemas["BrowserAuth-Input"]
  | Schemas["CookieSessionAuth-Input"];
export type AuthStatus = Schemas["AuthStatus"];
export type AutoAuthResult = Schemas["AutoAuthResult"];
export type QualityOption = Schemas["QualityOption"];
export type VideoPage = Schemas["VideoPage"];
export type ResolvedVideo = Schemas["ResolvedVideo"];
export type AppStatus = Schemas["AppStatus"];
export type JobStatus = Schemas["JobStatus"];
export type CreateJobRequest = Schemas["CreateJobRequest-Input"];
export type JobView = Schemas["JobView"];
export type CookieSessionResult = Schemas["CookieSessionResult"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractError(payload: unknown, fallback: string): string {
  if (!isRecord(payload) || !("detail" in payload)) return fallback;
  const detail = payload.detail;
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail)) {
    const first = detail.find(
      (item): item is Record<string, unknown> => isRecord(item) && typeof item.msg === "string",
    );
    if (first && typeof first.msg === "string") return first.msg;
  }
  return fallback;
}

function requireData<T>(
  data: T | undefined,
  error: unknown,
  response: Response,
): T {
  if (data !== undefined) return data;
  throw new Error(extractError(error, `请求失败 (${response.status})`));
}

function requireSuccess(error: unknown, response: Response): void {
  if (response.ok) return;
  throw new Error(extractError(error, `请求失败 (${response.status})`));
}

const JOB_STATUSES = new Set<JobStatus>([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

function parseJobView(value: unknown): JobView {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.status !== "string"
    || !JOB_STATUSES.has(value.status as JobStatus)
    || !isRecord(value.request)
    || !isRecord(value.progress)
    || !Array.isArray(value.result_paths)
    || typeof value.created_at !== "string"
    || typeof value.updated_at !== "string"
  ) {
    throw new Error("任务进度响应格式无效");
  }
  return value as JobView;
}

export class ApiClient {
  private readonly client: ReturnType<typeof createClient<paths>>;

  constructor(private readonly token: string) {
    this.client = createClient<paths>();
    const tokenMiddleware: Middleware = {
      onRequest: ({ request }) => {
        request.headers.set("X-Bilidown-Token", token);
        return request;
      },
    };
    this.client.use(tokenMiddleware);
  }

  async getStatus(): Promise<AppStatus> {
    const { data, error, response } = await this.client.GET("/api/status");
    return requireData(data, error, response);
  }

  async resolve(credential: string, auth: AuthConfig): Promise<ResolvedVideo> {
    const { data, error, response } = await this.client.POST("/api/resolve", {
      body: { credential, auth },
    });
    return requireData(data, error, response);
  }

  async checkAuth(auth: AuthConfig): Promise<AuthStatus> {
    const { data, error, response } = await this.client.POST("/api/auth/status", {
      body: { auth },
    });
    return requireData(data, error, response);
  }

  async autoSelectAuth(): Promise<AutoAuthResult> {
    const { data, error, response } = await this.client.POST("/api/auth/auto");
    return requireData(data, error, response);
  }

  async uploadCookies(file: File): Promise<CookieSessionResult> {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/auth/cookie-sessions", {
      method: "POST",
      headers: { "X-Bilidown-Token": this.token },
      body,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(extractError(payload, `请求失败 (${response.status})`));
    }
    if (
      !isRecord(payload)
      || typeof payload.session_id !== "string"
      || typeof payload.cookie_count !== "number"
    ) {
      throw new Error("Cookie 会话响应格式无效");
    }
    return {
      session_id: payload.session_id,
      cookie_count: payload.cookie_count,
    };
  }

  async deleteCookieSession(sessionId: string): Promise<void> {
    const { error, response } = await this.client.DELETE(
      "/api/auth/cookie-sessions/{session_id}",
      { params: { path: { session_id: sessionId } } },
    );
    requireSuccess(error, response);
  }

  async listJobs(): Promise<JobView[]> {
    const { data, error, response } = await this.client.GET("/api/jobs");
    return requireData(data, error, response);
  }

  async createJob(request: CreateJobRequest): Promise<JobView> {
    const { data, error, response } = await this.client.POST("/api/jobs", {
      body: request,
    });
    return requireData(data, error, response);
  }

  async cancelJob(jobId: string): Promise<JobView> {
    const { data, error, response } = await this.client.POST(
      "/api/jobs/{job_id}/cancel",
      { params: { path: { job_id: jobId } } },
    );
    return requireData(data, error, response);
  }

  async retryJob(jobId: string): Promise<JobView> {
    const { data, error, response } = await this.client.POST(
      "/api/jobs/{job_id}/retry",
      { params: { path: { job_id: jobId } } },
    );
    return requireData(data, error, response);
  }

  async openOutput(path: string): Promise<void> {
    const { error, response } = await this.client.POST("/api/open-output", {
      body: { path },
    });
    requireSuccess(error, response);
  }

  async quit(): Promise<void> {
    const { error, response } = await this.client.POST("/api/quit");
    requireSuccess(error, response);
  }

  async streamJob(jobId: string, onUpdate: (job: JobView) => void): Promise<void> {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/events`, {
      headers: { "X-Bilidown-Token": this.token },
    });
    if (!response.ok || !response.body) throw new Error("无法订阅任务进度");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";
      for (const message of messages) {
        const data = message
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6);
        if (data) onUpdate(parseJobView(JSON.parse(data) as unknown));
      }
      if (done) return;
    }
  }
}

export function readSessionToken(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    sessionStorage.setItem("bilidown-token", fromUrl);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return fromUrl;
  }
  return sessionStorage.getItem("bilidown-token") ?? "";
}
