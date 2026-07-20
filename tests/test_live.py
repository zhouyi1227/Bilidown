import threading
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import cast

import pytest
from yt_dlp.utils import DownloadCancelled

from bilidown.cookies import CookieStore
from bilidown.engine import DownloaderEngine
from bilidown.live import LiveRecorder
from bilidown.models import CreateLiveJobRequest, GuestAuth


class LiveAdapter:
    def extract(
        self,
        _: str,
        __: Mapping[str, object],
        *,
        download: bool = False,
    ) -> object:
        del download
        raise AssertionError("recording does not pre-extract")

    def download(
        self,
        _: Sequence[str],
        options: Mapping[str, object],
    ) -> None:
        paths = cast(dict[str, str], options["paths"])
        target = Path(paths["home"], "recording.mp4.part")
        target.write_bytes(b"mpeg-ts")
        hooks = cast(list[object], options["progress_hooks"])
        hook = hooks[0]
        assert callable(hook)
        hook({"status": "downloading"})

    def open_bytes(
        self,
        _: str,
        __: Mapping[str, object],
        *,
        limit: int,
    ) -> bytes:
        del limit
        raise AssertionError("recording does not open raw bytes")


def live_request(tmp_path: Path) -> CreateLiveJobRequest:
    return CreateLiveJobRequest(
        credential="https://live.bilibili.com/123",
        quality_height=1080,
        auth=GuestAuth(),
        output_dir=str(tmp_path),
    )


def test_stop_live_recording_keeps_playable_mpegts_partial(
    tmp_path: Path,
) -> None:
    stop_event = threading.Event()
    stop_event.set()
    recorder = LiveRecorder(
        CookieStore(),
        LiveAdapter(),  # type: ignore[arg-type]
        DownloaderEngine.base_options,
    )

    paths = recorder.record(
        "live-keep",
        live_request(tmp_path),
        stop_event,
        lambda: True,
    )

    assert len(paths) == 1
    assert paths[0].endswith(".ts")
    assert Path(paths[0]).read_bytes() == b"mpeg-ts"


def test_cancel_live_recording_deletes_partial(tmp_path: Path) -> None:
    stop_event = threading.Event()
    stop_event.set()
    recorder = LiveRecorder(
        CookieStore(),
        LiveAdapter(),  # type: ignore[arg-type]
        DownloaderEngine.base_options,
    )

    with pytest.raises(DownloadCancelled):
        recorder.record(
            "live-cancel",
            live_request(tmp_path),
            stop_event,
            lambda: False,
        )

    assert list(tmp_path.glob("*.part")) == []
    assert not (tmp_path / ".bilidown-live").exists()
