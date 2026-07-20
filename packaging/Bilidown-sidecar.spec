# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
executable_suffix = ".exe" if sys.platform == "win32" else ""
yt_datas, yt_binaries, yt_hiddenimports = collect_all("yt_dlp")

datas = yt_datas + [
    (str(root / "packaging" / "THIRD_PARTY_NOTICES.txt"), "."),
    (str(root / "packaging" / "FFMPEG_SOURCE.txt"), "."),
    (str(root / ".tools" / "ffmpeg" / "BUILD_INFO.txt"), "ffmpeg"),
    (str(root / ".tools" / "ffmpeg" / "licenses"), "ffmpeg/licenses"),
]
binaries = yt_binaries + [
    (
        str(root / ".tools" / "ffmpeg" / "bin" / f"ffmpeg{executable_suffix}"),
        "ffmpeg/bin",
    ),
    (
        str(root / ".tools" / "ffmpeg" / "bin" / f"ffprobe{executable_suffix}"),
        "ffmpeg/bin",
    ),
]

a = Analysis(
    [str(root / "packaging" / "entrypoint.py")],
    pathex=[str(root / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=yt_hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="bilidown-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)
