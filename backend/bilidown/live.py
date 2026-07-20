from __future__ import annotations

import asyncio
import contextlib
import copy
import shutil
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from yt_dlp.cookies import CookieLoadError
from yt_dlp.utils import DownloadCancelled, DownloadError

from .cookies import CookieStore, InvalidCookieFile
from .errors import EngineError, map_engine_error
from .files import ensure_output_directory, move_without_overwrite
from .input_parser import InvalidCredential, normalize_resource_url
from .models import (
    CreateLiveJobRequest,
    LiveJobStatus,
    LiveJobView,
)
from .typeguards import as_mapping, as_str
from .yt_adapter import YtDlpAdapter
from .yt_logging import EngineLogger


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class _LiveRecord:
    id: str
    request: CreateLiveJobRequest
    status: LiveJobStatus = LiveJobStatus.RECORDING
    result_paths: list[str] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    stop_event: threading.Event = field(default_factory=threading.Event)
    keep_partial: bool = False
    task: asyncio.Task[None] | None = None

    def view(self) -> LiveJobView:
        return LiveJobView(
            id=self.id,
            status=self.status,
            request=copy.deepcopy(self.request),
            result_paths=list(self.result_paths),
            error_code=self.error_code,
            error_message=self.error_message,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class LiveRecorder:
    def __init__(
        self,
        cookie_store: CookieStore,
        adapter: YtDlpAdapter,
        base_options: Callable[[EngineLogger], dict[str, object]],
    ) -> None:
        self._cookie_store = cookie_store
        self._adapter = adapter
        self._base_options = base_options

    def record(
        self,
        job_id: str,
        request: CreateLiveJobRequest,
        stop_event: threading.Event,
        should_keep: Callable[[], bool],
    ) -> list[str]:
        output_dir = ensure_output_directory(request.output_dir)
        temp_root = output_dir / ".bilidown-live"
        task_dir = temp_root / job_id
        task_dir.mkdir(parents=True, exist_ok=False)
        logger = EngineLogger()

        def hook(raw_update: object) -> None:
            update = as_mapping(raw_update)
            if stop_event.is_set():
                raise DownloadCancelled("live recording stopped")
            if update and as_str(update.get("status")) == "error":
                raise DownloadError("live recording failed")

        options: dict[str, object] = {
            **self._base_options(logger),
            "noplaylist": True,
            "format": (
                f"best[height<={request.quality_height}]/"
                "bestvideo+bestaudio/best"
            ),
            "hls_use_mpegts": True,
            "paths": {"home": str(task_dir), "temp": str(task_dir)},
            "outtmpl": {
                "default": str(task_dir / "%(title).150B [%(id)s].%(ext)s")
            },
            "progress_hooks": [hook],
            "overwrites": False,
        }
        try:
            stopped = False
            try:
                with self._cookie_store.yt_dlp_options(
                    request.auth
                ) as cookie_options:
                    self._adapter.download(
                        [request.credential],
                        {**options, **cookie_options},
                    )
            except DownloadCancelled:
                stopped = True
                if not should_keep():
                    raise
            except CookieLoadError as exc:
                raise EngineError(
                    "cookie_decryption_failed",
                    "无法读取浏览器 Cookie，请使用应用内一键登录或 cookies.txt",
                ) from exc
            except DownloadError as exc:
                raise map_engine_error(logger.last_error or str(exc)) from exc
            artifacts = _finalize_live_artifacts(task_dir, stopped=stopped)
            if not artifacts:
                raise EngineError(
                    "no_output",
                    "直播录制未产生可保存的媒体文件",
                )
            return [
                str(move_without_overwrite(path, output_dir))
                for path in artifacts
            ]
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)
            with contextlib.suppress(OSError):
                temp_root.rmdir()


def _finalize_live_artifacts(task_dir: Path, *, stopped: bool) -> list[Path]:
    artifacts: list[Path] = []
    for path in task_dir.rglob("*"):
        if not path.is_file() or path.suffix == ".ytdl":
            continue
        if path.suffix == ".part":
            if not stopped:
                continue
            target = path.with_suffix(".ts")
            path.replace(target)
            artifacts.append(target)
        else:
            artifacts.append(path)
    return artifacts


class LiveJobManager:
    def __init__(self, recorder: LiveRecorder) -> None:
        self._recorder = recorder
        self._jobs: dict[str, _LiveRecord] = {}

    async def stop_all(self) -> None:
        active = [
            record
            for record in self._jobs.values()
            if record.status
            in {LiveJobStatus.RECORDING, LiveJobStatus.STOPPING}
        ]
        for record in active:
            record.keep_partial = False
            record.stop_event.set()
        tasks = [record.task for record in active if record.task is not None]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def submit(self, request: CreateLiveJobRequest) -> LiveJobView:
        canonical_url = await normalize_resource_url(request.credential)
        if (urlsplit(canonical_url).hostname or "").lower() != "live.bilibili.com":
            raise InvalidCredential("直播录制仅支持 live.bilibili.com 房间链接")
        request = request.model_copy(update={"credential": canonical_url})
        record = _LiveRecord(id=uuid.uuid4().hex, request=request)
        self._jobs[record.id] = record
        record.task = asyncio.create_task(
            self._run(record),
            name=f"bilidown-live-{record.id}",
        )
        return record.view()

    def list(self) -> list[LiveJobView]:
        return [record.view() for record in reversed(self._jobs.values())]

    def get(self, job_id: str) -> LiveJobView:
        return self._require(job_id).view()

    def stop(self, job_id: str, *, keep: bool) -> LiveJobView:
        record = self._require(job_id)
        if record.status not in {
            LiveJobStatus.RECORDING,
            LiveJobStatus.STOPPING,
        }:
            return record.view()
        record.keep_partial = keep
        record.status = (
            LiveJobStatus.STOPPING if keep else LiveJobStatus.CANCELLED
        )
        record.updated_at = _now()
        record.stop_event.set()
        return record.view()

    def _require(self, job_id: str) -> _LiveRecord:
        record = self._jobs.get(job_id)
        if record is None:
            raise KeyError(job_id)
        return record

    async def _run(self, record: _LiveRecord) -> None:
        try:
            paths = await asyncio.to_thread(
                self._recorder.record,
                record.id,
                record.request,
                record.stop_event,
                lambda: record.keep_partial,
            )
        except DownloadCancelled:
            record.status = LiveJobStatus.CANCELLED
        except InvalidCookieFile as exc:
            record.status = LiveJobStatus.FAILED
            record.error_code = "invalid_cookie"
            record.error_message = str(exc)
        except EngineError as exc:
            record.status = LiveJobStatus.FAILED
            record.error_code = exc.code
            record.error_message = exc.message
        except Exception:
            record.status = LiveJobStatus.FAILED
            record.error_code = "internal_error"
            record.error_message = "直播录制失败，请重试"
        else:
            record.result_paths = paths
            record.status = LiveJobStatus.COMPLETED
        finally:
            record.updated_at = _now()
