# Login and cookies

The recommended flow is **Sign in to Bilibili** inside Bilidown. A separate private WebView opens the official Bilibili site; after sign-in, Bilidown collects only Bilibili cookies, including HttpOnly cookies, into backend memory. They are cleared on exit. Bilidown never receives or stores your password.

This avoids Chrome and Edge application-bound cookie encryption. Direct Firefox access and Netscape `cookies.txt` remain advanced compatibility options. Never upload cookies to issues, cloud drives, or chat.

Login does not grant extra rights. Available formats still depend on the media, account entitlement, region, and Bilibili’s current policy.
