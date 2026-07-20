from __future__ import annotations

import shutil
import threading
from collections.abc import Callable
from pathlib import Path

from yt_dlp.cookies import CookieLoadError
from yt_dlp.utils import DownloadCancelled, DownloadError

from .cookies import CookieStore, InvalidCookieFile
from .danmaku import convert_xml_to_ass
from .download_options import apply_media_format_options
from .download_result import DownloadOutcome
from .errors import EngineError, map_engine_error
from .files import move_without_overwrite
from .models import CreateJobRequest, JobItemResult, MediaKind
from .progress import ProgressCallback, ProgressUpdate
from .typeguards import as_float, as_mapping, as_str
from .yt_adapter import YtDlpAdapter
from .yt_logging import EngineLogger


BaseOptionsFactory = Callable[[EngineLogger], dict[str, object]]


class ResourceDownloadService:
    def __init__(
        self,
        cookie_store: CookieStore,
        adapter: YtDlpAdapter,
        base_options: BaseOptionsFactory,
    ) -> None:
        self._cookie_store = cookie_store
        self._adapter = adapter
        self._base_options = base_options

    def download(
        self,
        source_url: str,
        task_dir: Path,
        output_dir: Path,
        request: CreateJobRequest,
        cancel_event: threading.Event,
        progress: ProgressCallback,
    ) -> DownloadOutcome:
        targets = (
            [(source_url, index) for index in request.item_indices]
            if request.item_indices
            else [(url, None) for url in request.item_urls]
        )
        moved_paths: list[str] = []
        results: list[JobItemResult] = []
        for position, (url, playlist_index) in enumerate(targets, start=1):
            if cancel_event.is_set():
                raise DownloadCancelled("cancelled")
            result = self._download_one(
                source_url,
                url,
                playlist_index,
                position,
                task_dir,
                output_dir,
                request,
                cancel_event,
                progress,
            )
            results.append(result)
            moved_paths.extend(result.result_paths)
            progress(
                ProgressUpdate(
                    phase="downloading",
                    current_page=position,
                    percent=position / len(targets) * 100,
                )
            )
        if not moved_paths:
            first_error = next(
                (item for item in results if item.error_message),
                None,
            )
            raise EngineError(
                (
                    first_error.error_code
                    if first_error and first_error.error_code
                    else "no_output"
                ),
                (
                    first_error.error_message
                    if first_error and first_error.error_message
                    else "所有条目均下载失败"
                ),
            )
        progress(ProgressUpdate(phase="completed", percent=100.0))
        return DownloadOutcome(paths=moved_paths, item_results=results)

    def _download_one(
        self,
        source_url: str,
        url: str,
        playlist_index: int | None,
        position: int,
        task_dir: Path,
        output_dir: Path,
        request: CreateJobRequest,
        cancel_event: threading.Event,
        progress: ProgressCallback,
    ) -> JobItemResult:
        item_dir = task_dir / f"item-{position:03d}"
        item_dir.mkdir()
        label = (
            f"{source_url}#item-{playlist_index}"
            if playlist_index is not None
            else url
        )
        try:
            self._run_ytdlp(
                url,
                playlist_index,
                item_dir,
                request,
                cancel_event,
                progress,
                position,
            )
            artifacts = self._collect_artifacts(item_dir, request.media_kind)
            if not artifacts:
                raise EngineError(
                    "no_output",
                    "该条目下载完成但未找到输出文件",
                )
            moved = [
                move_without_overwrite(path, output_dir)
                for path in artifacts
            ]
            return JobItemResult(
                url=label,
                status="completed",
                result_paths=[str(path) for path in moved],
            )
        except DownloadCancelled:
            raise
        except InvalidCookieFile:
            raise
        except EngineError as exc:
            return JobItemResult(
                url=label,
                status="failed",
                error_code=exc.code,
                error_message=exc.message,
            )
        except (CookieLoadError, DownloadError, OSError, ValueError) as exc:
            mapped = map_engine_error(str(exc))
            return JobItemResult(
                url=label,
                status="failed",
                error_code=mapped.code,
                error_message=mapped.message,
            )
        finally:
            shutil.rmtree(item_dir, ignore_errors=True)

    @staticmethod
    def _collect_artifacts(
        item_dir: Path,
        media_kind: MediaKind,
    ) -> list[Path]:
        artifacts = [
            path
            for path in item_dir.rglob("*")
            if path.is_file() and path.suffix not in {".part", ".ytdl"}
        ]
        if media_kind != MediaKind.DANMAKU_ASS:
            return artifacts
        for xml_path in [
            path for path in artifacts if path.suffix.lower() == ".xml"
        ]:
            convert_xml_to_ass(xml_path, xml_path.with_suffix(".ass"))
            xml_path.unlink()
        return [
            path
            for path in item_dir.rglob("*")
            if path.is_file()
            and path.suffix not in {".part", ".ytdl", ".xml"}
        ]

    def _run_ytdlp(
        self,
        url: str,
        playlist_index: int | None,
        task_dir: Path,
        request: CreateJobRequest,
        cancel_event: threading.Event,
        progress: ProgressCallback,
        current_item: int,
    ) -> None:
        logger = EngineLogger()

        def hook(raw_update: object) -> None:
            if cancel_event.is_set():
                raise DownloadCancelled("cancelled")
            update = as_mapping(raw_update)
            if update is None:
                return
            total = as_float(update.get("total_bytes")) or as_float(
                update.get("total_bytes_estimate")
            )
            downloaded = as_float(update.get("downloaded_bytes"))
            percent = (
                min(100.0, max(0.0, downloaded / total * 100))
                if total and downloaded is not None
                else None
            )
            value = ProgressUpdate(
                phase=(
                    "postprocessing"
                    if as_str(update.get("status")) == "finished"
                    else "downloading"
                ),
                current_page=current_item,
            )
            if percent is not None:
                value["percent"] = percent
            progress(value)

        options: dict[str, object] = {
            **self._base_options(logger),
            "noplaylist": playlist_index is None,
            "paths": {"home": str(task_dir), "temp": str(task_dir)},
            "outtmpl": {
                "default": str(
                    task_dir
                    / "%(playlist_index)03d - %(title).150B [%(id)s].%(ext)s"
                )
            },
            "progress_hooks": [hook],
            "overwrites": False,
        }
        if playlist_index is not None:
            options["playlist_items"] = str(playlist_index)
        _apply_resource_options(options, request)
        try:
            with self._cookie_store.yt_dlp_options(request.auth) as cookie_options:
                self._adapter.download([url], {**options, **cookie_options})
        except DownloadCancelled:
            raise
        except CookieLoadError as exc:
            raise EngineError(
                "cookie_decryption_failed",
                "无法读取浏览器 Cookie，请使用应用内扫码登录或 cookies.txt",
            ) from exc
        except DownloadError as exc:
            raise map_engine_error(logger.last_error or str(exc)) from exc


def _apply_resource_options(
    options: dict[str, object],
    request: CreateJobRequest,
) -> None:
    if request.media_kind == MediaKind.COVER:
        options.update(
            {
                "skip_download": True,
                "writethumbnail": True,
                "write_all_thumbnails": False,
            }
        )
        return
    if request.media_kind == MediaKind.SUBTITLES:
        options.update(
            {
                "skip_download": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": ["all", "-danmaku"],
                "subtitlesformat": "srt/best",
            }
        )
        return
    if request.media_kind in {
        MediaKind.DANMAKU_XML,
        MediaKind.DANMAKU_ASS,
    }:
        options.update(
            {
                "skip_download": True,
                "writesubtitles": True,
                "subtitleslangs": ["danmaku"],
                "subtitlesformat": "best",
            }
        )
        return
    apply_media_format_options(options, request)
