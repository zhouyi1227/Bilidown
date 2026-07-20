# Getting started

Download the Windows x64 installer (`.msi` or NSIS `.exe`), the Windows x64 portable ZIP (`Bilidown-<version>-windows-x64-portable.zip`), or the Apple Silicon macOS `.dmg` from Releases. Verify its SHA-256 checksum before installing or extracting.

For the portable ZIP, fully extract the archive and run `Bilidown.exe`. Keep `bilidown-backend.exe`, `README.txt`, and the license/source notices in the same folder; do not run it from the ZIP preview window. The portable edition does not install services, startup entries, or registry settings. Windows 10/11 normally includes Microsoft Edge WebView2 Runtime; install the Evergreen Runtime if no application window appears.

Paste a supported Bilibili URL or a BV/AV ID, resolve it, select up to 100 preview items, then choose video, audio, cover, subtitles, danmaku XML, or danmaku ASS. Batches over 20 items require confirmation and continue past individual failures.

Closing the main window hides Bilidown in the system tray. Use the tray to reopen it; on macOS, clicking the running Bilidown icon in the Dock also restores the window. The tray menu also provides a 15/30/60-minute idle timeout (or disables it) and a complete quit action. Active downloads and live recordings prevent idle exit.

If the packaged backend cannot start, the desktop window remains open and offers retry or quit instead of terminating the whole application. Sanitized startup diagnostics are written to `~/Library/Logs/Bilidown/desktop-startup-error.log` on macOS and `%LOCALAPPDATA%\Bilidown\desktop-startup-error.log` on Windows.

Live room URLs use the independent recorder. “Stop and save” preserves received MPEG-TS data as `.ts`; “Cancel and delete” removes the recording’s temporary files.
