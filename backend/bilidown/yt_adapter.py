# pyright: reportAny=false, reportExplicitAny=false, reportUnknownArgumentType=false
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportArgumentType=false

from __future__ import annotations

from collections.abc import Mapping, Sequence
from contextlib import AbstractContextManager
from typing import cast

import yt_dlp


class YtDlpAdapter:
    """Contain yt-dlp's intentionally dynamic API behind an object boundary."""

    def extract(
        self,
        url: str,
        options: Mapping[str, object],
        *,
        download: bool = False,
    ) -> object:
        with yt_dlp.YoutubeDL(dict(options)) as ydl:
            raw = ydl.extract_info(url, download=download)
            return cast(object, ydl.sanitize_info(raw))

    def download(self, urls: Sequence[str], options: Mapping[str, object]) -> None:
        with yt_dlp.YoutubeDL(dict(options)) as ydl:
            ydl.download(list(urls))

    def open_bytes(
        self,
        url: str,
        options: Mapping[str, object],
        *,
        limit: int,
    ) -> bytes:
        with yt_dlp.YoutubeDL(dict(options)) as ydl:
            response: AbstractContextManager[object] = ydl.urlopen(url)
            with response as opened:
                reader = getattr(opened, "read")
                return cast(bytes, reader(limit))


DEFAULT_YT_ADAPTER = YtDlpAdapter()
