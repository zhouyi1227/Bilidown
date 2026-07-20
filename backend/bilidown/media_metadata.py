from __future__ import annotations

import re
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from .errors import EngineError
from .files import sanitize_filename
from .input_parser import NormalizedCredential
from .models import CreateJobRequest, QualityOption, ResolvedVideo, VideoPage
from .typeguards import (
    as_float,
    as_int,
    as_mapping,
    as_mappings,
    as_optional_str,
    as_str,
)


CodecFamily = Literal["H.264", "HEVC", "AV1", "Other"]
_BVID_SEARCH_RE = re.compile(r"BV[0-9A-Za-z]{10}", re.IGNORECASE)


def codec_is_h264(codec: str | None) -> bool:
    return (codec or "").lower().startswith(("avc1", "h264"))


def codec_is_aac(codec: str | None) -> bool:
    return (codec or "").lower().startswith(("mp4a", "aac"))


def codec_family(codec: str | None) -> CodecFamily:
    value = (codec or "").lower()
    if value.startswith(("avc1", "h264")):
        return "H.264"
    if value.startswith(("hvc1", "hev1", "hevc", "h265")):
        return "HEVC"
    if value.startswith(("av01", "av1")):
        return "AV1"
    return "Other"


def is_sdr(dynamic_range: str | None) -> bool:
    return (dynamic_range or "SDR").upper() in {"SDR", "SDR10"}


def extract_bvid(info: dict[str, object], fallback: str) -> str:
    candidates = (
        info.get("id"),
        info.get("display_id"),
        info.get("webpage_url"),
        fallback,
    )
    for candidate in candidates:
        match = _BVID_SEARCH_RE.search(as_str(candidate))
        if match:
            return f"BV{match.group(0)[2:]}"
    return fallback


def normalize_cover_url(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    trusted_host = (
        host == "hdslb.com"
        or host.endswith(".hdslb.com")
        or host == "bilibili.com"
        or host.endswith(".bilibili.com")
    )
    try:
        port = parsed.port
    except ValueError as exc:
        raise EngineError("unsafe_cover_url", "封面地址不受信任") from exc
    default_port = 80 if parsed.scheme == "http" else 443
    if (
        parsed.scheme not in {"http", "https"}
        or not trusted_host
        or parsed.username is not None
        or parsed.password is not None
        or (port is not None and port != default_port)
    ):
        raise EngineError("unsafe_cover_url", "封面地址不受信任")
    return urlunsplit(("https", host, parsed.path, parsed.query, ""))


def safe_cover_preview_url(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return normalize_cover_url(value)
    except EngineError:
        return None


def media_stem(
    resolved: ResolvedVideo,
    page: VideoPage,
    request: CreateJobRequest,
) -> str:
    stem = f"{resolved.title} [{resolved.bvid}]"
    if len(resolved.pages) > 1 and len(request.page_indices) > 1:
        stem += f" - P{page.index:02d} {page.title}"
    return sanitize_filename(stem)


def _audio_priority(item: dict[str, object]) -> tuple[bool, bool, float]:
    codec = as_str(item.get("acodec")).lower()
    bitrate = as_float(item.get("abr")) or as_float(item.get("tbr")) or 0.0
    return (
        codec.startswith(("flac", "alac")),
        codec.startswith(("ec-3", "eac3", "ac-3")),
        bitrate,
    )


def quality_options(formats: list[dict[str, object]]) -> list[QualityOption]:
    audio_formats = [
        item
        for item in formats
        if item.get("vcodec") in {None, "none"}
        and item.get("acodec") not in {None, "none"}
    ]
    best_source_audio = max(audio_formats, key=_audio_priority, default=None)
    aac_formats = [
        item for item in audio_formats if codec_is_aac(as_optional_str(item.get("acodec")))
    ]
    best_aac = max(aac_formats, key=_audio_priority, default=None)

    options: list[QualityOption] = []
    for video in formats:
        if video.get("vcodec") in {None, "none"}:
            continue
        format_id = as_str(video.get("format_id")).strip()
        height = as_int(video.get("height"))
        if not format_id or height is None or height <= 0:
            continue
        video_codec = as_optional_str(video.get("vcodec"))
        combined_audio = (
            as_optional_str(video.get("acodec"))
            if video.get("acodec") not in {None, "none"}
            else None
        )
        dynamic_range = as_str(video.get("dynamic_range"), default="SDR").upper()
        preferred = (
            codec_is_h264(video_codec)
            and is_sdr(dynamic_range)
            and (combined_audio is not None or best_aac is not None)
        )
        selected_audio = best_aac if preferred else best_source_audio
        audio_codec = combined_audio
        if audio_codec is None and selected_audio is not None:
            audio_codec = as_optional_str(selected_audio.get("acodec"))
        fps = as_float(video.get("fps"))
        bitrate = as_float(video.get("tbr")) or as_float(video.get("vbr"))
        quality_code = as_int(video.get("quality"))
        format_name = (
            as_optional_str(video.get("format"))
            or as_optional_str(video.get("format_note"))
            or f"{height}P"
        )
        family = codec_family(video_codec)
        label_parts = [format_name, family]
        if fps is not None and fps > 30:
            label_parts.append(f"{int(fps)}fps")
        if bitrate is not None:
            label_parts.append(f"{bitrate / 1000:.1f} Mbps")
        if not is_sdr(dynamic_range):
            label_parts.append("Dolby Vision" if dynamic_range == "DV" else dynamic_range)
        options.append(
            QualityOption(
                id=format_id,
                label=" · ".join(label_parts),
                height=height,
                width=as_int(video.get("width")),
                fps=fps,
                quality_code=quality_code,
                format_name=format_name,
                bitrate_kbps=bitrate,
                dynamic_range=dynamic_range,
                codec_family=family,
                video_codec=video_codec or "unknown",
                audio_codec=audio_codec,
                container=as_str(video.get("ext"), default="mp4"),
                compatibility="preferred" if preferred else "fallback",
            )
        )
    options.sort(
        key=lambda item: (
            item.height,
            item.quality_code or 0,
            item.fps or 0,
            item.compatibility == "preferred",
            item.bitrate_kbps or 0,
        ),
        reverse=True,
    )
    return options


def resolved_video_from_info(
    raw_info: object,
    normalized: NormalizedCredential,
) -> ResolvedVideo:
    info = as_mapping(raw_info)
    if info is None:
        raise EngineError("invalid_metadata", "Bilibili 返回了无法识别的媒体信息")
    entries = as_mappings(info.get("entries"))
    if not entries:
        entries = [info]
    root = entries[0]
    bvid = extract_bvid(root, normalized.video_id)
    aid = as_int(root.get("aid")) or as_int(info.get("aid"))

    pages: list[VideoPage] = []
    for position, entry in enumerate(entries, start=1):
        index = as_int(entry.get("playlist_index")) or position
        if index <= 0:
            index = position
        pages.append(
            VideoPage(
                index=index,
                cid=as_int(entry.get("cid")),
                title=(
                    as_optional_str(entry.get("title"))
                    or as_optional_str(entry.get("fulltitle"))
                    or f"P{index}"
                ),
                duration=as_float(entry.get("duration")),
                qualities=quality_options(as_mappings(entry.get("formats"))),
            )
        )

    selected_page = normalized.selected_page
    if selected_page > len(pages):
        selected_page = 1
    return ResolvedVideo(
        canonical_url=normalized.canonical_url,
        bvid=bvid,
        aid=aid,
        title=(
            as_optional_str(info.get("title"))
            or as_optional_str(root.get("title"))
            or bvid
        ),
        uploader=(
            as_optional_str(info.get("uploader"))
            or as_optional_str(root.get("uploader"))
        ),
        thumbnail=safe_cover_preview_url(
            info.get("thumbnail") or root.get("thumbnail")
        ),
        duration=as_float(info.get("duration")) or as_float(root.get("duration")),
        selected_page=selected_page,
        pages=pages,
    )
