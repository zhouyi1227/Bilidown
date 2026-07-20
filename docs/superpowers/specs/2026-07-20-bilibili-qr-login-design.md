# Bilibili QR Login Replacement

## Context

The embedded Bilibili login WebView renders blank on Windows. Tauri's desktop
CSP only applies to local `tauri://` assets, so changing that CSP cannot repair
an external `https://passport.bilibili.com` document. The current Bilibili QR
login generation and polling endpoints respond successfully, providing a
browser-independent way to establish a login session.

## Design

Replace the embedded WebView login with an in-app QR flow backed by the local
FastAPI service:

1. `POST /api/auth/qr-login` requests a QR login key and URL from Bilibili and
   returns an SVG data URI generated locally.
2. The UI displays the QR code and polls `POST /api/auth/qr-login/poll` every
   two seconds with the opaque QR key.
3. The poll response maps Bilibili's pending, scanned, confirmed, expired, and
   failure states to explicit typed API results. On confirmation, the backend
   parses only the returned Bilibili redirect parameters, creates a temporary
   CookieStore session, and returns its session ID and cookie count.
4. The UI switches to that cookie session, refreshes account status, and stops
   polling. Users can cancel or create a fresh code after expiration.

The QR image is generated locally with the small pure-Python `qrcode` package;
the QR URL, QR key, redirect URL, and cookies are never sent to a third-party
QR rendering service and are never written to disk or logs. `cookies.txt`
import and existing browser-cookie import remain available as fallback paths.

Remove the unused Tauri external-login window, its commands, and its frontend
bridge once the QR flow is in place. This eliminates the white-window path
rather than leaving a broken alternative in the UI.

## API and Failure Behavior

The API remains loopback-only and protected by the existing per-launch session
token. QR keys are opaque, constrained in length, and valid only during the
short Bilibili login interval. Redirect parameters are accepted only for a
fixed allowlist of Bilibili session-cookie names, then encoded into the
existing Netscape cookie format before entering CookieStore.

Network and malformed-response failures return a typed user-facing error;
expiration is a non-error state that enables “refresh QR code”. Polling is
cancelled when the component unmounts, the user cancels, or login succeeds.

## Verification

- Unit tests mock Bilibili generate/poll responses, including pending, scanned,
  confirmed, expired, malformed, and network-error cases.
- Tests verify only allowlisted cookie names enter the temporary session and
  that redirect URLs/cookie values never appear in errors or logs.
- Component tests verify polling, cancellation, expiration refresh, and the
  authenticated-state transition.
- Run strict Python/TypeScript checks, the full test suites, and a Windows
  desktop smoke test that displays a generated QR code without scanning it.

## Scope

This change replaces the in-app browser login only. It does not automate a
user's Bilibili login, bypass account restrictions, persist CookieStore data,
or change the existing browser-cookie and `cookies.txt` methods.
