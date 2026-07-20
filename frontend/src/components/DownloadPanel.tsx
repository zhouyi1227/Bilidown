import { useTranslation } from "react-i18next";

import type { AppStatus, QualityOption } from "../api";

interface DownloadPanelProps {
  status: AppStatus;
  outputDir: string;
  onOutputDirChange: (value: string) => void;
  qualities: QualityOption[];
  qualityId: string | null;
  onQualityIdChange: (value: string) => void;
  videoMode: "compatible_mp4" | "source_auto";
  onVideoModeChange: (value: "compatible_mp4" | "source_auto") => void;
  audioFormat: "best_source" | "m4a" | "mp3";
  onAudioFormatChange: (value: "best_source" | "m4a" | "mp3") => void;
  selectedPageCount: number;
  busy: boolean;
  onCreate: (kind: "cover" | "audio" | "video") => void;
  onOpenOutput: () => void;
}

export function DownloadPanel({
  status,
  outputDir,
  onOutputDirChange,
  qualities,
  qualityId,
  onQualityIdChange,
  videoMode,
  onVideoModeChange,
  audioFormat,
  onAudioFormatChange,
  selectedPageCount,
  busy,
  onCreate,
  onOpenOutput,
}: DownloadPanelProps) {
  const { t } = useTranslation();
  const selectedQuality = qualities.find((item) => item.id === qualityId);
  return (
    <section className="panel download-panel" aria-labelledby="download-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("download.eyebrow")}</p>
          <h2 id="download-heading">{t("download.title")}</h2>
        </div>
        <span className={status.ffmpeg_available ? "status-dot good" : "status-dot warning"}>
          {status.ffmpeg_available ? t("download.ffmpegReady") : t("download.ffmpegMissing")}
        </span>
      </div>

      <div className="download-grid">
        <article className="download-card accent-cover">
          <span className="card-index">01</span>
          <h3>{t("download.cover")}</h3>
          <p>{t("download.coverDescription")}</p>
          <button type="button" onClick={() => onCreate("cover")} disabled={busy}>{t("download.downloadCover")}</button>
        </article>

        <article className="download-card accent-audio">
          <span className="card-index">02</span>
          <h3>{t("download.audio")}</h3>
          <label className="field">
            <span>{t("download.outputFormat")}</span>
            <select value={audioFormat} onChange={(event) => onAudioFormatChange(event.target.value as "best_source" | "m4a" | "mp3")}>
              <option value="m4a">{t("download.audioM4a")}</option>
              <option value="best_source">{t("download.audioBest")}</option>
              <option value="mp3">{t("download.audioMp3")}</option>
            </select>
          </label>
          <button type="button" onClick={() => onCreate("audio")} disabled={busy || !status.ffmpeg_available || selectedPageCount === 0}>
            {t("download.downloadAudio", { count: selectedPageCount })}
          </button>
        </article>

        <article className="download-card accent-video">
          <span className="card-index">03</span>
          <h3>{t("download.video")}</h3>
          <label className="field">
            <span>{t("download.outputMode")}</span>
            <select
              value={videoMode}
              onChange={(event) => onVideoModeChange(event.target.value as "compatible_mp4" | "source_auto")}
            >
              <option value="compatible_mp4">{t("download.compatible")}</option>
              <option value="source_auto">{t("download.source")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("download.commonFormat")}</span>
            <select
              value={qualityId ?? ""}
              onChange={(event) => onQualityIdChange(event.target.value)}
              disabled={qualities.length === 0}
            >
              {qualities.length === 0 && <option value="">{t("download.noFormat")}</option>}
              {qualities.map((quality) => (
                <option value={quality.id} key={quality.id}>{quality.label}</option>
              ))}
            </select>
          </label>
          <p className="codec-note">
            {selectedQuality
              ? `${videoMode === "compatible_mp4" ? "MP4" : "MP4 / MKV"} · ${selectedQuality.video_codec} + ${selectedQuality.audio_codec ?? t("download.bestSourceAudio")}`
              : t("download.selectPageFirst")}
          </p>
          <button type="button" onClick={() => onCreate("video")} disabled={busy || !status.ffmpeg_available || selectedPageCount === 0 || qualityId === null}>
            {t("download.downloadVideo", { count: selectedPageCount })}
          </button>
        </article>
      </div>

      <div className="output-row">
        <label className="field output-field">
          <span>{t("download.outputDirectory")}</span>
          <input value={outputDir} onChange={(event) => onOutputDirChange(event.target.value)} />
        </label>
        <button type="button" className="secondary-button" onClick={onOpenOutput}>{t("download.openDirectory")}</button>
      </div>
    </section>
  );
}
