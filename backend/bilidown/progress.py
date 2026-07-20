from __future__ import annotations

from collections.abc import Callable
from typing import TypedDict


class ProgressUpdate(TypedDict, total=False):
    phase: str
    current_page: int
    downloaded_bytes: int
    total_bytes: int
    percent: float
    speed: float
    eta: float


ProgressCallback = Callable[[ProgressUpdate], None]
