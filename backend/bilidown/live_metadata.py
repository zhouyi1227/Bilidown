from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from yt_dlp.networking.exceptions import RequestError
from yt_dlp.utils import DownloadError

from .http_headers import bilibili_browser_headers
from .typeguards import as_optional_str
from .yt_adapter import YtDlpAdapter


_MAX_API_RESPONSE_BYTES = 512 * 1024


class _RoomData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    uid: int = Field(gt=0)


class _RoomResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: int
    data: _RoomData | None = None


class _MasterInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    uname: str | None = None


class _MasterData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    info: _MasterInfo | None = None


class _MasterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: int
    data: _MasterData | None = None


def enrich_live_uploader(
    adapter: YtDlpAdapter,
    canonical_url: str,
    info: dict[str, object],
    options: Mapping[str, object],
) -> dict[str, object]:
    if as_optional_str(info.get("uploader")):
        return info
    room_id = _room_id(canonical_url, info)
    if room_id is None:
        return info
    request_options = {
        **options,
        "http_headers": bilibili_browser_headers(
            f"https://live.bilibili.com/{room_id}"
        ),
    }
    try:
        room_payload = adapter.open_bytes(
            "https://api.live.bilibili.com/room/v1/Room/get_info"
            f"?room_id={room_id}",
            request_options,
            limit=_MAX_API_RESPONSE_BYTES + 1,
        )
        if len(room_payload) > _MAX_API_RESPONSE_BYTES:
            return info
        room = _RoomResponse.model_validate_json(room_payload)
        if room.code != 0 or room.data is None:
            return info

        master_payload = adapter.open_bytes(
            "https://api.live.bilibili.com/live_user/v1/Master/info"
            f"?uid={room.data.uid}",
            request_options,
            limit=_MAX_API_RESPONSE_BYTES + 1,
        )
        if len(master_payload) > _MAX_API_RESPONSE_BYTES:
            return info
        master = _MasterResponse.model_validate_json(master_payload)
    except (ValidationError, RequestError, DownloadError, OSError):
        return info
    if master.code != 0 or master.data is None or master.data.info is None:
        return info
    uploader = as_optional_str(master.data.info.uname)
    if uploader is None:
        return info
    enriched = dict(info)
    enriched["uploader"] = uploader[:80]
    return enriched


def _room_id(canonical_url: str, info: dict[str, object]) -> str | None:
    identifier = as_optional_str(info.get("id"))
    if identifier and identifier.isascii() and identifier.isdigit():
        room_id = identifier
    else:
        path = urlsplit(canonical_url).path.strip("/")
        room_id = path if path.isascii() and path.isdigit() else ""
    if not room_id or len(room_id) > 20 or int(room_id) <= 0:
        return None
    return room_id
