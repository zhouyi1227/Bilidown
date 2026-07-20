from __future__ import annotations

from .models import AudioFormat, CreateJobRequest, MediaKind, VideoMode


def apply_media_format_options(
    options: dict[str, object],
    request: CreateJobRequest,
) -> None:
    if request.media_kind == MediaKind.VIDEO:
        if request.quality_id:
            if request.video_mode == VideoMode.SOURCE_AUTO:
                options["format"] = (
                    f"{request.quality_id}+ba[acodec^=flac]/"
                    f"{request.quality_id}+ba[acodec^=ec-3]/"
                    f"{request.quality_id}+ba/{request.quality_id}"
                )
                options["merge_output_format"] = "mp4/mkv"
            else:
                options["format"] = (
                    f"{request.quality_id}+ba[acodec^=mp4a]/"
                    f"{request.quality_id}+ba[ext=m4a]/{request.quality_id}"
                )
                options["merge_output_format"] = "mp4"
            return
        height = request.quality_height
        options["format"] = (
            f"bv*[height<={height}][vcodec^=avc1]+ba[acodec^=mp4a]/"
            f"bv*[height<={height}]+ba/b[height<={height}]/best"
        )
        options["merge_output_format"] = "mp4"
        return

    if request.audio_format == AudioFormat.BEST_SOURCE:
        options["format"] = (
            "ba[acodec^=flac]/ba[acodec^=ec-3]/ba/bestaudio/best"
        )
    elif request.audio_format == AudioFormat.MP3:
        options["format"] = (
            "ba[acodec^=flac]/ba[acodec^=ec-3]/ba/bestaudio/best"
        )
        options["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": None,
            }
        ]
        options["postprocessor_args"] = {
            "FFmpegExtractAudio+ffmpeg_o": ["-q:a", "2"]
        }
    else:
        options["format"] = "ba[acodec^=mp4a]/ba/bestaudio/best"
