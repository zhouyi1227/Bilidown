from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from bilidown.app import create_app  # noqa: E402


def main() -> None:
    target = ROOT / "frontend" / "openapi.json"
    app = create_app(
        session_token="openapi-schema",
        expected_origin="http://127.0.0.1",
        static_dir=ROOT / ".missing-frontend",
    )
    payload = json.dumps(
        app.openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    target.write_text(f"{payload}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
