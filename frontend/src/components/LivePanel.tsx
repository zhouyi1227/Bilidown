import { useTranslation } from "react-i18next";

import type { LiveJobView } from "../api";

interface LivePanelProps {
  jobs: LiveJobView[];
  outputDir: string;
  qualityHeight: number;
  busy: boolean;
  onOutputDirChange: (value: string) => void;
  onQualityHeightChange: (value: number) => void;
  onStart: () => void;
  onStop: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}

export function LivePanel({
  jobs,
  outputDir,
  qualityHeight,
  busy,
  onOutputDirChange,
  onQualityHeightChange,
  onStart,
  onStop,
  onCancel,
}: LivePanelProps) {
  const { t } = useTranslation();
  return (
    <section className="panel live-panel" aria-labelledby="live-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("live.eyebrow")}</p>
          <h2 id="live-heading">{t("live.title")}</h2>
        </div>
        <span className="status-dot warning">{t("live.independent")}</span>
      </div>
      <p className="live-description">{t("live.description")}</p>
      <div className="live-controls">
        <label className="field">
          <span>{t("download.maximumQuality")}</span>
          <select
            value={qualityHeight}
            onChange={(event) => onQualityHeightChange(Number(event.target.value))}
          >
            {[2160, 1440, 1080, 720, 480, 360].map((height) => (
              <option value={height} key={height}>{height}P</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("download.outputDirectory")}</span>
          <input
            value={outputDir}
            onChange={(event) => onOutputDirChange(event.target.value)}
          />
        </label>
        <button type="button" onClick={onStart} disabled={busy}>
          {busy ? t("live.starting") : t("live.start")}
        </button>
      </div>
      {jobs.length > 0 && (
        <div className="live-job-list">
          {jobs.map((job) => (
            <article className="live-job" key={job.id}>
              <div>
                <strong>{t(`live.status.${job.status}`)}</strong>
                <p>{job.request.credential}</p>
                {job.error_message && <p className="live-error">{job.error_message}</p>}
                {job.result_paths.length > 0 && (
                  <p className="result-path">{job.result_paths.join("\n")}</p>
                )}
              </div>
              {(job.status === "recording" || job.status === "stopping") && (
                <div className="job-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => onStop(job.id)}
                    disabled={job.status === "stopping"}
                  >
                    {t("live.stopAndSave")}
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => onCancel(job.id)}
                  >
                    {t("live.cancelAndDelete")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
