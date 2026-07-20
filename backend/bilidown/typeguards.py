from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import TypeGuard, cast


def is_string_mapping(value: object) -> TypeGuard[dict[str, object]]:
    if not isinstance(value, dict):
        return False
    mapping = cast(dict[object, object], value)
    return all(isinstance(key, str) for key in mapping)


def as_mapping(value: object) -> dict[str, object] | None:
    if not is_string_mapping(value):
        return None
    return value


def as_mappings(value: object) -> list[dict[str, object]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        return []
    sequence = cast(Sequence[object], value)
    return [item for item in sequence if is_string_mapping(item)]


def as_str(value: object, *, default: str = "") -> str:
    return value if isinstance(value, str) else default


def as_optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def as_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def as_bool(value: object) -> bool:
    return value is True


def copy_string_mapping(value: Mapping[str, object]) -> dict[str, object]:
    return dict(value)
