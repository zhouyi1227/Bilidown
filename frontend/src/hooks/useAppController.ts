import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ApiClient, readSessionToken } from "../api";
import type {
  AppStatus,
  AuthConfig,
  AuthStatus,
  AutoAuthResult,
  CreateJobRequest,
  JobView,
  QualityOption,
  ResolvedVideo,
} from "../api";

const sessionToken = readSessionToken();
const api = new ApiClient(sessionToken);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function updateJobList(jobs: JobView[], updated: JobView): JobView[] {
  const index = jobs.findIndex((job) => job.id === updated.id);
  if (index === -1) return [updated, ...jobs];
  return jobs.map((job) => (job.id === updated.id ? updated : job));
}

export function useAppController() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [auth, setAuth] = useState<AuthConfig>({ kind: "guest" });
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecking, setAuthChecking] = useState(Boolean(sessionToken));
  const [authInitializing, setAuthInitializing] = useState(Boolean(sessionToken));
  const [autoSelected, setAutoSelected] = useState(false);
  const [authCheckError, setAuthCheckError] = useState<string | null>(null);
  const [authCheckNonce, setAuthCheckNonce] = useState(0);
  const [credential, setCredential] = useState("");
  const [video, setVideo] = useState<ResolvedVideo | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [qualityId, setQualityId] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<"compatible_mp4" | "source_auto">("compatible_mp4");
  const [audioFormat, setAudioFormat] = useState<"best_source" | "m4a" | "mp3">("m4a");
  const [outputDir, setOutputDir] = useState("");
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [resolving, setResolving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchedJobs = useRef(new Set<string>());
  const skipNextAuthCheck = useRef(true);

  const watchJob = useCallback((job: JobView) => {
    if (TERMINAL_STATUSES.has(job.status) || watchedJobs.current.has(job.id)) return;
    watchedJobs.current.add(job.id);
    void api
      .streamJob(job.id, (updated) => setJobs((current) => updateJobList(current, updated)))
      .catch((streamError: unknown) => {
        setError(streamError instanceof Error ? streamError.message : "任务进度连接中断");
      })
      .finally(() => watchedJobs.current.delete(job.id));
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    const controller = new AbortController();
    Promise.all([
      api.getStatus(),
      api.listJobs(),
      api.autoSelectAuth().catch((): AutoAuthResult => ({
        auth: { kind: "guest" },
        status: { state: "guest", username: null, vip_active: false, vip_label: null },
      })),
    ])
      .then(([nextStatus, nextJobs, autoAuth]) => {
        if (controller.signal.aborted) return;
        setStatus(nextStatus);
        setOutputDir(nextStatus.default_output_dir);
        setJobs(nextJobs);
        nextJobs.forEach(watchJob);
        setAuth(autoAuth.auth);
        setAuthStatus(autoAuth.status);
        setAutoSelected(autoAuth.auth.kind === "browser" && autoAuth.status.state === "active");
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "应用初始化失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setAuthInitializing(false);
          setAuthChecking(false);
        }
      });
    return () => controller.abort();
  }, [watchJob]);

  useEffect(() => {
    if (!sessionToken || authInitializing) return;
    if (skipNextAuthCheck.current) {
      skipNextAuthCheck.current = false;
      return;
    }
    let cancelled = false;
    setAuthChecking(true);
    setAuthCheckError(null);
    const timer = window.setTimeout(
      () => {
        void api
          .checkAuth(auth)
          .then((nextStatus) => {
            if (!cancelled) setAuthStatus(nextStatus);
          })
          .catch((checkError: unknown) => {
            if (!cancelled) {
              setAuthStatus(null);
              setAuthCheckError(checkError instanceof Error ? checkError.message : "登录状态检查失败");
            }
          })
          .finally(() => {
            if (!cancelled) setAuthChecking(false);
          });
      },
      auth.kind === "browser" && auth.profile ? 450 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [auth, authCheckNonce, authInitializing]);

  const commonQualities = useMemo<QualityOption[]>(() => {
    if (!video || selectedPages.size === 0) return [];
    const pages = video.pages.filter((page) => selectedPages.has(page.index));
    const commonIds = new Set(pages[0]?.qualities.map((quality) => quality.id) ?? []);
    for (const page of pages.slice(1)) {
      const ids = new Set(page.qualities.map((quality) => quality.id));
      for (const id of commonIds) if (!ids.has(id)) commonIds.delete(id);
    }
    return (pages[0]?.qualities ?? []).filter(
      (quality) => commonIds.has(quality.id) && (videoMode === "source_auto" || quality.compatibility === "preferred"),
    );
  }, [selectedPages, video, videoMode]);

  useEffect(() => {
    if (!commonQualities.some((quality) => quality.id === qualityId)) {
      setQualityId(commonQualities[0]?.id ?? null);
    }
  }, [commonQualities, qualityId]);

  function handleAuthChange(nextAuth: AuthConfig) {
    if (
      auth.kind === "cookie_session" &&
      (nextAuth.kind !== "cookie_session" || nextAuth.session_id !== auth.session_id)
    ) {
      void api.deleteCookieSession(auth.session_id).catch(() => undefined);
    }
    setAutoSelected(false);
    setAuth(nextAuth);
  }

  async function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResolving(true);
    setError(null);
    try {
      const resolved = await api.resolve(credential, auth);
      setVideo(resolved);
      setCredential(resolved.canonical_url);
      setSelectedPages(new Set([resolved.selected_page]));
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "视频解析失败");
    } finally {
      setResolving(false);
    }
  }

  async function handleCreate(kind: "cover" | "audio" | "video") {
    if (!video || !status) return;
    setCreating(true);
    setError(null);
    const selectedQuality = commonQualities.find((quality) => quality.id === qualityId);
    const request: CreateJobRequest = {
      credential: video.canonical_url,
      media_kind: kind,
      page_indices: kind === "cover" ? [] : [...selectedPages].sort((a, b) => a - b),
      ...(kind === "video" && selectedQuality ? { quality_height: selectedQuality.height } : {}),
      ...(kind === "video" && qualityId ? { quality_id: qualityId } : {}),
      video_mode: videoMode,
      audio_format: audioFormat,
      auth,
      output_dir: outputDir,
    };
    try {
      const job = await api.createJob(request);
      setJobs((current) => updateJobList(current, job));
      watchJob(job);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "无法创建下载任务");
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel(jobId: string) {
    try {
      const job = await api.cancelJob(jobId);
      setJobs((current) => updateJobList(current, job));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "取消任务失败");
    }
  }

  async function handleRetry(jobId: string) {
    try {
      const job = await api.retryJob(jobId);
      setJobs((current) => updateJobList(current, job));
      watchJob(job);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重试任务失败");
    }
  }

  async function handleQuit() {
    const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
    if (
      activeJobs.length > 0
      && !window.confirm(`仍有 ${activeJobs.length} 个任务未完成。退出会取消任务并清理临时文件，是否继续？`)
    ) {
      return;
    }
    setShuttingDown(true);
    try {
      await api.quit();
    } catch (quitError) {
      setShuttingDown(false);
      setError(quitError instanceof Error ? quitError.message : "无法退出 Bilidown");
    }
  }

  async function handleOpenOutput() {
    try {
      await api.openOutput(outputDir);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "无法打开目录");
    }
  }

  return {
    api,
    audioFormat,
    auth,
    authCheckError,
    authChecking,
    authInitializing,
    authStatus,
    autoSelected,
    commonQualities,
    creating,
    credential,
    error,
    handleAuthChange,
    handleCancel,
    handleCreate,
    handleOpenOutput,
    handleQuit,
    handleResolve,
    handleRetry,
    hasSession: Boolean(sessionToken),
    jobs,
    outputDir,
    qualityId,
    resolving,
    selectedPages,
    setAudioFormat,
    setAuthCheckNonce,
    setCredential,
    setOutputDir,
    setQualityId,
    setSelectedPages,
    setVideoMode,
    shuttingDown,
    status,
    video,
    videoMode,
  };
}
