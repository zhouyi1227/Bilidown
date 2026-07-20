from collections.abc import Mapping, Sequence

from bilidown.live_metadata import enrich_live_uploader


class FakeAdapter:
    def __init__(self, payloads: Sequence[bytes | Exception]) -> None:
        self.payloads = list(payloads)
        self.urls: list[str] = []
        self.options: list[Mapping[str, object]] = []

    def open_bytes(
        self,
        url: str,
        options: Mapping[str, object],
        *,
        limit: int,
    ) -> bytes:
        assert limit == 512 * 1024 + 1
        self.urls.append(url)
        self.options.append(options)
        payload = self.payloads[len(self.urls) - 1]
        if isinstance(payload, Exception):
            raise payload
        return payload


def test_enriches_live_uploader_with_browser_headers() -> None:
    adapter = FakeAdapter(
        [
            b'{"code":0,"data":{"uid":35240827}}',
            '{"code":0,"data":{"info":{"uname":"死灵凌音"}}}'.encode(),
        ]
    )

    result = enrich_live_uploader(  # type: ignore[arg-type]
        adapter,
        "https://live.bilibili.com/22459407?session_id=secret",
        {"id": "22459407", "title": "直播标题"},
        {"quiet": True},
    )

    assert result["uploader"] == "死灵凌音"
    assert adapter.urls == [
        (
            "https://api.live.bilibili.com/room/v1/Room/get_info"
            "?room_id=22459407"
        ),
        (
            "https://api.live.bilibili.com/live_user/v1/Master/info"
            "?uid=35240827"
        ),
    ]
    headers = adapter.options[0]["http_headers"]
    assert isinstance(headers, dict)
    assert headers["Referer"] == "https://live.bilibili.com/22459407"
    assert "session_id" not in headers["Referer"]
    assert "Chrome/150.0.0.0" in headers["User-Agent"]


def test_live_uploader_failure_keeps_original_metadata() -> None:
    original = {"id": "22459407", "title": "直播标题"}
    adapter = FakeAdapter([OSError("network unavailable")])

    result = enrich_live_uploader(  # type: ignore[arg-type]
        adapter,
        "https://live.bilibili.com/22459407",
        original,
        {},
    )

    assert result is original
    assert "uploader" not in result


def test_live_uploader_rejects_invalid_room_response() -> None:
    original = {"id": "22459407", "title": "直播标题"}
    adapter = FakeAdapter([b'{"code":0,"data":{"uid":0}}'])

    result = enrich_live_uploader(  # type: ignore[arg-type]
        adapter,
        "https://live.bilibili.com/22459407",
        original,
        {},
    )

    assert result is original
