import { useEffect, useState } from "react";

import type { JobView, LiveJobView } from "../api";
import {
  isDesktopApp,
  listenForIdleWarning,
  markDesktopActivity,
  setDesktopActiveJobs,
} from "../desktop";

const ACTIVITY_THROTTLE_MS = 20_000;

export function useDesktopLifecycle(
  jobs: JobView[],
  liveJobs: LiveJobView[],
): number | null {
  const [warningMinutes, setWarningMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let lastSent = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastSent < ACTIVITY_THROTTLE_MS) return;
      lastSent = now;
      setWarningMinutes(null);
      void markDesktopActivity();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    const unlistenPromise = listenForIdleWarning((warning) => setWarningMinutes(warning.minutes));
    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const active =
      jobs.some((job) => job.status === "queued" || job.status === "running")
      || liveJobs.some(
        (job) => job.status === "recording" || job.status === "stopping",
      );
    void setDesktopActiveJobs(active);
  }, [jobs, liveJobs]);

  return warningMinutes;
}
