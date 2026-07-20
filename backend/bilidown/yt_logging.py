from __future__ import annotations

from .redaction import redact_message


class EngineLogger:
    def __init__(self) -> None:
        self.last_error: str | None = None

    def debug(self, message: str) -> None:
        del message

    def info(self, message: str) -> None:
        del message

    def warning(self, message: str) -> None:
        del message

    def error(self, message: str) -> None:
        self.last_error = redact_message(message)
