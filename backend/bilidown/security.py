from __future__ import annotations

import hmac
from collections.abc import Iterable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


class LocalSecurityMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: ASGIApp,
        *,
        token: str,
        expected_origins: Iterable[str],
    ) -> None:
        super().__init__(app)
        self.token = token
        self.expected_origins = frozenset(origin.rstrip("/") for origin in expected_origins)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if request.method == "OPTIONS":
                if origin not in self.expected_origins:
                    return JSONResponse({"detail": "请求来源不受信任"}, status_code=403)
                response = Response(status_code=204)
                self._add_cors_headers(response, origin)
                return response

            supplied = request.headers.get("x-bilidown-token", "")
            if not hmac.compare_digest(supplied, self.token):
                return JSONResponse({"detail": "无效的本地会话令牌"}, status_code=401)

            referer = request.headers.get("referer")
            origin_valid = origin in self.expected_origins
            referer_valid = bool(referer) and any(
                referer.startswith(f"{expected}/") for expected in self.expected_origins
            )
            if not origin_valid and not referer_valid:
                return JSONResponse({"detail": "请求来源不受信任"}, status_code=403)

        response = await call_next(request)
        origin = request.headers.get("origin")
        if origin in self.expected_origins:
            self._add_cors_headers(response, origin)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' data: blob: https://*.hdslb.com https://*.bilibili.com; "
            "connect-src 'self'; font-src 'self'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        )
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        return response

    @staticmethod
    def _add_cors_headers(response: Response, origin: str) -> None:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = (
            "Content-Type, X-Bilidown-Token"
        )
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        response.headers["Vary"] = "Origin"
