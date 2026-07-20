from collections.abc import Mapping, Sequence

from bilidown.cookies import CookieStore
from bilidown.models import GuestAuth, ResourceKind
from bilidown.resource_resolver import ResourceResolver
from bilidown.yt_logging import EngineLogger


class FakeAdapter:
    def __init__(self, result: object) -> None:
        self.result = result
        self.options: Mapping[str, object] = {}
        self.calls: list[Mapping[str, object]] = []
        self.urls: list[str] = []

    def extract(
        self,
        url: str,
        options: Mapping[str, object],
        *,
        download: bool = False,
    ) -> object:
        assert download is False
        self.options = options
        self.calls.append(options)
        self.urls.append(url)
        return self.result

    def download(
        self,
        _: Sequence[str],
        __: Mapping[str, object],
    ) -> None:
        raise AssertionError("preview must not download")

    def open_bytes(
        self,
        url: str,
        __: Mapping[str, object],
        *,
        limit: int,
    ) -> bytes:
        del limit
        raise AssertionError("preview must not open raw bytes")


def base_options(_: EngineLogger) -> dict[str, object]:
    return {"quiet": True}


class SequencedFakeAdapter(FakeAdapter):
    def __init__(self, results: Sequence[object]) -> None:
        super().__init__(None)
        self.results = list(results)

    def extract(
        self,
        url: str,
        options: Mapping[str, object],
        *,
        download: bool = False,
    ) -> object:
        assert download is False
        self.options = options
        self.calls.append(options)
        self.urls.append(url)
        return self.results[len(self.calls) - 1]


def test_resolves_multipart_video_with_full_metadata_and_cover() -> None:
    adapter = SequencedFakeAdapter(
        [
            {
                "extractor_key": "BiliBili",
                "id": "BV15KNo6PEza",
                "title": "过场动画",
                "entries": [{"_type": "url"}, {"_type": "url"}],
            },
            {
                "extractor_key": "BiliBili",
                "id": "BV15KNo6PEza",
                "title": "过场动画",
                "thumbnail": "http://i0.hdslb.com/bfs/archive/cover.jpg",
                "entries": [
                    {
                        "id": "BV15KNo6PEza_p1",
                        "title": "中文",
                        "uploader": "明日方舟终末地",
                        "duration": 278.4,
                        "playlist_index": 1,
                        "formats": [{"format_id": "80", "height": 1080}],
                    },
                    {
                        "id": "BV15KNo6PEza_p2",
                        "title": "英文",
                        "uploader": "明日方舟终末地",
                        "duration": 260.9,
                        "playlist_index": 2,
                        "formats": [{"format_id": "64", "height": 720}],
                    },
                ],
            },
        ]
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(
        "https://www.bilibili.com/video/BV15KNo6PEza",
        GuestAuth(),
    )

    assert resource.kind == ResourceKind.VIDEO
    assert resource.video is not None
    assert resource.video.uploader == "明日方舟终末地"
    assert resource.video.thumbnail == "https://i0.hdslb.com/bfs/archive/cover.jpg"
    assert [page.title for page in resource.video.pages] == ["中文", "英文"]
    assert [page.duration for page in resource.video.pages] == [278.4, 260.9]
    assert len(adapter.calls) == 2
    assert adapter.calls[0]["extract_flat"] == "in_playlist"
    assert "extract_flat" not in adapter.calls[1]
    assert "playlistend" not in adapter.calls[1]


def test_resolves_single_video_and_drops_untrusted_cover() -> None:
    adapter = SequencedFakeAdapter(
        [
            {
                "extractor_key": "BiliBili",
                "id": "BV1xx411c7mD",
                "title": "单 P 视频",
            },
            {
                "extractor_key": "BiliBili",
                "id": "BV1xx411c7mD",
                "title": "单 P 视频",
                "uploader": "测试 UP 主",
                "duration": 42.5,
                "thumbnail": "https://hdslb.com.evil.example/cover.jpg",
                "formats": [{"format_id": "80", "height": 1080}],
            },
        ]
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(
        "https://www.bilibili.com/video/BV1xx411c7mD",
        GuestAuth(),
    )

    assert resource.video is not None
    assert resource.video.title == "单 P 视频"
    assert resource.video.uploader == "测试 UP 主"
    assert resource.video.duration == 42.5
    assert resource.video.thumbnail is None
    assert len(resource.video.pages) == 1
    assert len(adapter.calls) == 2


def test_expands_bangumi_episode_to_full_season_metadata() -> None:
    adapter = SequencedFakeAdapter(
        [
            {
                "extractor_key": "BiliBiliBangumi",
                "id": "329016",
                "title": "第 1 集",
                "season_id": "4349",
            },
            {
                "extractor_key": "BiliBiliBangumiSeason",
                "id": "4349",
                "title": "中二病也要谈恋爱！恋",
                "entries": [
                    {
                        "id": "329016",
                        "title": "01 复活之…邪王真眼",
                        "duration": 1416.5,
                        "thumbnail": "https://i0.hdslb.com/episode-1.jpg",
                        "webpage_url": (
                            "https://www.bilibili.com/bangumi/play/ep329016"
                        ),
                    },
                    {
                        "id": "329017",
                        "title": "02 海豚之…恋人契约",
                        "duration": 1416.4,
                        "thumbnail": "https://i0.hdslb.com/episode-2.jpg",
                        "webpage_url": (
                            "https://www.bilibili.com/bangumi/play/ep329017"
                        ),
                    },
                ],
            },
        ]
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(
        "https://www.bilibili.com/bangumi/play/ep329016",
        GuestAuth(),
    )

    assert resource.kind == ResourceKind.BANGUMI
    assert resource.title == "中二病也要谈恋爱！恋"
    assert [item.title for item in resource.items] == [
        "01 复活之…邪王真眼",
        "02 海豚之…恋人契约",
    ]
    assert [item.duration for item in resource.items] == [1416.5, 1416.4]
    assert resource.thumbnail == "https://i0.hdslb.com/episode-1.jpg"
    assert adapter.urls[1] == "https://www.bilibili.com/bangumi/play/ss4349"
    assert adapter.calls[1]["playlistend"] == 101
    assert "extract_flat" not in adapter.calls[1]


def test_keeps_episode_url_when_season_id_is_invalid() -> None:
    episode_url = "https://www.bilibili.com/bangumi/play/ep329016"
    adapter = SequencedFakeAdapter(
        [
            {
                "extractor_key": "BiliBiliBangumi",
                "id": "329016",
                "title": "第 1 集",
                "season_id": "not-a-number",
            },
            {
                "extractor_key": "BiliBiliBangumi",
                "id": "329016",
                "title": "第 1 集",
                "duration": 1416.5,
            },
        ]
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(episode_url, GuestAuth())

    assert resource.kind == ResourceKind.BANGUMI
    assert resource.items[0].title == "第 1 集"
    assert adapter.urls == [episode_url, episode_url]


def test_resolves_favorites_as_bounded_preview() -> None:
    full_entries = [
        {
            "id": f"BV00000000{index:02d}",
            "title": f"视频 {index}",
            "duration": float(index),
            "thumbnail": f"https://i0.hdslb.com/cover-{index}.jpg",
            "webpage_url": (
                f"https://www.bilibili.com/video/BV00000000{index:02d}"
            ),
        }
        for index in range(1, 102)
    ]
    adapter = SequencedFakeAdapter(
        [
            {
                "extractor_key": "BilibiliFavoritesList",
                "title": "收藏夹",
                "playlist_count": 150,
                "entries": [{"_type": "url"} for _ in range(101)],
            },
            {
                "extractor_key": "BilibiliFavoritesList",
                "title": "收藏夹",
                "playlist_count": 150,
                "entries": full_entries,
            },
        ]
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(
        "https://www.bilibili.com/medialist/detail/ml1",
        GuestAuth(),
    )

    assert resource.kind == ResourceKind.FAVORITES
    assert len(resource.items) == 100
    assert resource.total_items == 150
    assert resource.truncated is True
    assert resource.items[0].title == "视频 1"
    assert resource.items[99].duration == 100.0
    assert resource.items[0].thumbnail == "https://i0.hdslb.com/cover-1.jpg"
    assert adapter.options["playlistend"] == 101
    assert "extract_flat" not in adapter.options
    assert len(adapter.calls) == 2


def test_marks_interactive_nodes_and_documents_limitation() -> None:
    adapter = FakeAdapter(
        {
            "extractor_key": "BiliBili",
            "title": "互动视频",
            "entries": [
                {
                    "id": "BV1xx411c7mD_123",
                    "title": "分支节点",
                    "url": "https://www.bilibili.com/video/BV1xx411c7mD",
                }
            ],
        }
    )
    resolver = ResourceResolver(CookieStore(), adapter, base_options)  # type: ignore[arg-type]

    resource = resolver.resolve(
        "https://www.bilibili.com/video/BV1xx411c7mD",
        GuestAuth(),
    )

    assert resource.kind == ResourceKind.INTERACTIVE
    assert resource.items[0].branch is True
    assert "interactive_paths" in resource.warnings
    assert len(adapter.calls) == 1
