#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${PYTHON:-python3}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "Official macOS builds require Apple Silicon (arm64)." >&2
  exit 1
fi
for binary in ffmpeg ffprobe; do
  test -x "$ROOT/.tools/ffmpeg/bin/$binary" || {
    echo "Run packaging/prepare-ffmpeg-macos.sh before building." >&2
    exit 1
  }
done

cd "$ROOT"
"$PYTHON" -m PyInstaller --version >/dev/null
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend desktop:build
echo "Desktop bundles: src-tauri/target/release/bundle"
