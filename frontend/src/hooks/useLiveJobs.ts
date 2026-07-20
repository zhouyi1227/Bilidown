import { useCallback, useEffect, useState } from "react";

import type {
  ApiClient,
  AuthConfig,
  LiveJobView,
  ResolvedResource,
} from "../api";
import i18n from "../i18n";

export function useLiveJobs(
  api: ApiClient,
  onError: (message: string) => void,
) {
  const [jobs, setJobs] = useState<LiveJobView[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const active = jobs.some(
      (job) => job.status === "recording" || job.status === "stopping",
    );
    if (!active) return;
    const timer = window.setInterval(() => {
      void api.listLiveJobs().then(setJobs).catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [api, jobs]);

  const start = useCallback(
    async (
      resource: ResolvedResource,
      qualityHeight: number,
      auth: AuthConfig,
      outputDir: string,
    ) => {
      if (resource.kind !== "live") return;
      setCreating(true);
      try {
        const job = await api.createLiveJob({
          credential: resource.canonical_url,
          quality_height: qualityHeight,
          auth,
          output_dir: outputDir,
        });
        setJobs((current) => [
          job,
          ...current.filter((item) => item.id !== job.id),
        ]);
      } catch (error) {
        onError(
          error instanceof Error ? error.message : i18n.t("errors.createLive"),
        );
      } finally {
        setCreating(false);
      }
    },
    [api, onError],
  );

  const stop = useCallback(
    async (jobId: string) => {
      try {
        const job = await api.stopLiveJob(jobId);
        setJobs((current) =>
          current.map((item) => (item.id === job.id ? job : item)),
        );
      } catch (error) {
        onError(
          error instanceof Error ? error.message : i18n.t("errors.stopLive"),
        );
      }
    },
    [api, onError],
  );

  const cancel = useCallback(
    async (jobId: string) => {
      try {
        const job = await api.cancelLiveJob(jobId);
        setJobs((current) =>
          current.map((item) => (item.id === job.id ? job : item)),
        );
      } catch (error) {
        onError(
          error instanceof Error ? error.message : i18n.t("errors.cancelLive"),
        );
      }
    },
    [api, onError],
  );

  return {
    cancel,
    creating,
    jobs,
    setJobs,
    start,
    stop,
  };
}
