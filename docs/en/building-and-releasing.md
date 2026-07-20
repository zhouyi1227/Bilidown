# Building and releasing

Install Python 3.12/3.13, Node 22, pnpm, Rust stable with clippy/rustfmt, the platform’s native Tauri prerequisites, and the pinned FFmpeg build.

```powershell
.venv\Scripts\python -m pip install -e ".[dev]"
pnpm --dir frontend install --frozen-lockfile
packaging\prepare-ffmpeg.ps1
packaging\build-desktop.ps1 -Python .\.venv\Scripts\python.exe
```

On Apple Silicon macOS, run `prepare-ffmpeg-macos.sh` and `build-desktop.sh`. The build creates the one-file Python sidecar first, then Tauri produces native Windows installers or a macOS DMG/app bundle. Builds must be native; they cannot be cross-compiled between Windows and macOS.
