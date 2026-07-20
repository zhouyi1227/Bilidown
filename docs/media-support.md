# Bilibili 媒体支持矩阵

本页对应项目锁定的 `yt-dlp 2026.7.4`。Bilibili 页面和接口会变化；解析结果始终以当前账号、地区和 yt-dlp 实际返回为准。

## 当前支持

| 资源 | yt-dlp 提取器/能力 | Bilidown 行为 |
| --- | --- | --- |
| 普通投稿、分 P、活动页 | `BiliBili` | 精确格式选择；封面/音视频/字幕/弹幕 |
| 互动视频 | `BiliBili` interactive graph | 枚举唯一分支节点，可选择下载 |
| 番剧/影视 | `BiliBiliBangumi*` | 季/媒体/单集预览与批量 |
| 课程 | `BilibiliCheese*` | 季/单课，通常需要购买账号登录 |
| 收藏夹 | `BilibiliFavoritesList` | 预览选择、逐项继续失败 |
| 合集/系列/播放列表 | `BilibiliCollectionList`、`BilibiliSeriesList`、`BilibiliPlaylist` | 预览选择与批量 |
| 稍后再看 | `BilibiliWatchlater` | 需要登录 |
| UP 主空间投稿/音频 | `BilibiliSpaceVideo`、`BilibiliSpaceAudio` | 批量预览与下载 |
| 音频/歌单 | `BilibiliAudio`、`BilibiliAudioAlbum` | 音频下载 |
| 动态/opus | `BiliBiliDynamic` | 下载动态中可提取媒体 |
| 播放器嵌入 | `BiliBiliPlayer` | 解析嵌入视频 |
| 直播 | `BiliLive` | 独立录制器；停止保留或取消删除 |
| BiliIntl | `BiliIntl`、`biliIntl:series` | 视频/剧集，受地区和账号限制 |
| 分区/搜索 | `Bilibili category`、`BilibiliSearch` | 实验性；接口变动风险较高 |

批量预览和单次任务最多 100 项；超过 20 项需要确认。无权限、失效或地区限制条目会单独失败，其他条目继续。

## 字幕与弹幕

yt-dlp 把 Bilibili 弹幕暴露为名为 `danmaku` 的 XML 字幕轨。Bilidown 可直接保存 XML，或在本机转换为 ASS。普通字幕与自动字幕另行下载，并排除 `danmaku` 轨。

## 明确限制

- 不绕过 DRM、付费、会员、账号或地区权限；课程/番剧可下载不代表绕过购买。
- 互动视频可保存 yt-dlp 枚举出的唯一节点，但不能重放用户的点击历史，也不能完整表达脚本化交互。
- ASS 转换覆盖滚动、顶部、底部和基础颜色/字号；高级模式（如特殊定位/脚本弹幕）会简化，不能保证像素级还原。
- 直播“停止并保留”使用 MPEG-TS `.ts`，便于中断时保留已收到片段；容器元数据可能不如正常自然结束完整。
- BiliIntl、搜索和分区接口更容易因地区或站点变更失效，界面会标为实验性。
