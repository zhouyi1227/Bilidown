import { useTranslation } from "react-i18next";

import type { ResolvedVideo } from "../api";

interface VideoPreviewProps {
  video: ResolvedVideo;
  selectedPages: Set<number>;
  onSelectedPagesChange: (pages: Set<number>) => void;
}

function formatDuration(seconds: number | null, unknownLabel: string): string {
  if (!seconds) return unknownLabel;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return [hours, minutes, remaining]
    .filter((_, index) => hours > 0 || index > 0)
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function VideoPreview({ video, selectedPages, onSelectedPagesChange }: VideoPreviewProps) {
  const { t } = useTranslation();
  function togglePage(index: number) {
    const next = new Set(selectedPages);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectedPagesChange(next);
  }

  const allSelected = selectedPages.size === video.pages.length;

  return (
    <section className="panel video-preview" aria-labelledby="video-heading">
      <div className="cover-frame">
        {video.thumbnail ? <img src={video.thumbnail} alt={t("video.coverAlt", { title: video.title })} /> : <div className="cover-placeholder">NO COVER</div>}
      </div>
      <div className="video-details">
        <p className="eyebrow">{t("video.resolved")} · {video.bvid}</p>
        <h2 id="video-heading">{video.title}</h2>
        <p className="video-meta">{video.uploader ?? t("video.unknownUploader")} · {formatDuration(video.duration, t("video.unknownDuration"))} · {video.pages.length} P</p>

        <div className="page-toolbar">
          <h3>{t("video.selectPages")}</h3>
          <button
            type="button"
            className="text-button"
            onClick={() => onSelectedPagesChange(allSelected ? new Set() : new Set(video.pages.map((page) => page.index)))}
          >
            {allSelected ? t("video.clearAll") : t("video.selectAll")}
          </button>
        </div>
        <div className="page-list">
          {video.pages.map((page) => (
            <label className="page-option" key={page.index}>
              <input type="checkbox" checked={selectedPages.has(page.index)} onChange={() => togglePage(page.index)} />
              <span className="page-number">P{String(page.index).padStart(2, "0")}</span>
              <span className="page-title">{page.title}</span>
              <span className="page-duration">{formatDuration(page.duration, t("video.unknownDuration"))}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
