# Supported Bilibili media

With the pinned `yt-dlp 2026.7.4`, Bilidown covers regular videos and parts, festival pages, interactive graph nodes, bangumi, courses, favorites, collections, series, playlists, watch later, creator-space video/audio, audio albums, dynamic/opus posts, embeds, live rooms, and BiliIntl videos/series. Category and search extractors are experimental.

Subtitles are downloaded separately from the `danmaku` track. Danmaku can be archived as Bilibili XML or converted locally to ASS. The ASS converter supports scrolling, top, bottom, basic color, and font size; advanced positioned/script comments are simplified.

Interactive extraction enumerates unique graph nodes but cannot replay click history. Live stop-and-save produces `.ts` so received fragments survive interruption. Paid, member-only, regional, expired, or inaccessible content remains inaccessible unless the current account already has permission.
