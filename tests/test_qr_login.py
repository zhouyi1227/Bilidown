from collections.abc import Mapping

import pytest

from bilidown.cookies import CookieStore, InvalidCookieFile
from bilidown.qr_login import BilibiliQrLogin, QrLoginError


def test_start_returns_local_svg_data_uri() -> None:
    login = BilibiliQrLogin(
        lambda _url, _params: {
            "code": 0,
            "data": {
                "qrcode_key": "a" * 32,
                "url": "https://account.bilibili.com/h5/account-h5/auth/scan-web?qrcode_key=abc",
            },
        }
    )

    result = login.start()

    assert result.qr_key == "a" * 32
    assert result.image_data_uri.startswith("data:image/svg+xml;base64,")


@pytest.mark.parametrize(
    ("code", "state"),
    [(86090, "pending"), (86101, "scanned"), (86038, "expired")],
)
def test_poll_maps_incomplete_login_states(code: int, state: str) -> None:
    login = BilibiliQrLogin(
        lambda _url, _params: {"code": 0, "data": {"code": code}}
    )

    result = login.poll("a" * 32, CookieStore())

    assert result.state == state
    assert result.session_id is None
    assert result.cookie_count == 0


def test_poll_creates_filtered_memory_session_after_confirmation() -> None:
    def request_json(url: str, params: Mapping[str, str] | None) -> dict[str, object]:
        assert url.endswith("/poll")
        assert params == {"qrcode_key": "a" * 32}
        return {
            "code": 0,
            "data": {
                "code": 0,
                "url": (
                    "https://passport.bilibili.com/account?SESSDATA=secret&"
                    "bili_jct=csrf&DedeUserID=42&untrusted=value"
                ),
            },
        }

    cookies = CookieStore()
    result = BilibiliQrLogin(request_json).poll("a" * 32, cookies)

    assert result.state == "confirmed"
    assert result.session_id is not None
    assert result.cookie_count == 3
    content = cookies.get(result.session_id).content
    assert "SESSDATA\tsecret" in content
    assert "bili_jct\tcsrf" in content
    assert "DedeUserID\t42" in content
    assert "untrusted" not in content


def test_poll_rejects_confirmation_without_bilibili_session() -> None:
    login = BilibiliQrLogin(
        lambda _url, _params: {
            "code": 0,
            "data": {
                "code": 0,
                "url": "https://passport.bilibili.com/account?bili_jct=csrf",
            },
        }
    )

    with pytest.raises(InvalidCookieFile, match="SESSDATA"):
        login.poll("a" * 32, CookieStore())


def test_poll_rejects_unknown_bilibili_status() -> None:
    login = BilibiliQrLogin(
        lambda _url, _params: {"code": 0, "data": {"code": 12345}}
    )

    with pytest.raises(QrLoginError, match="status"):
        login.poll("a" * 32, CookieStore())
