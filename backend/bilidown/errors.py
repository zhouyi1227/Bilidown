from __future__ import annotations

from .redaction import redact_message


class EngineError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def map_engine_error(message: str) -> EngineError:
    safe = redact_message(message)
    lowered = safe.lower()
    if "login" in lowered or "登录" in lowered or "sessdata" in lowered:
        return EngineError("login_required", "该内容需要有效的 Bilibili 登录态")
    if "vip" in lowered or "会员" in lowered:
        return EngineError("membership_required", "所选清晰度需要账户具备相应会员权限")
    if "geo" in lowered or "region" in lowered or "区域" in lowered:
        return EngineError("region_restricted", "该内容受地区限制")
    if "412" in lowered or "429" in lowered or "rate" in lowered:
        return EngineError("rate_limited", "Bilibili 暂时限制了请求，请稍后重试")
    if "cookie" in lowered and ("decrypt" in lowered or "解密" in lowered):
        return EngineError("cookie_decryption_failed", "无法读取浏览器 Cookie，请改用 cookies.txt")
    if "ffmpeg" in lowered:
        return EngineError("ffmpeg_missing", "需要 ffmpeg 才能完成该媒体任务")
    if "unsupported url" in lowered:
        return EngineError("unsupported_video", "该链接不是当前支持的 Bilibili 资源")
    return EngineError("download_failed", safe or "下载失败")
