# 登录与 Cookie

Bilidown 不接收账号密码，也不会绕过 Bilibili 权限。推荐在应用内的独立隐私窗口完成 Bilibili 登录：应用直接读取该窗口包括 HttpOnly 在内的 Bilibili Cookie，并只保存在当前运行的后端内存中。

## 一键登录（推荐）

1. 点击“一键登录 Bilibili”，在新开的隐私窗口完成官方页面登录。
2. 回到主窗口点击“导入登录态”。
3. 登录窗口立即关闭，Cookie 仅在本次 Bilidown 运行中有效，退出后清除。

这个流程不依赖 Chrome/Edge Cookie 数据库，因此不会遇到应用绑定加密问题。登录页面来自 Bilibili；Bilidown 不读取或保存你的密码。

## 游客

默认“游客”不读取任何 Cookie。公开视频通常可解析 360P–1080P，实际结果由投稿和 Bilibili 当前策略决定。4K、高码率、HDR、Dolby 或会员音频可能不会返回。

## 本机浏览器

选择 Chrome、Edge 或 Firefox 后，应用通过 yt-dlp 读取该浏览器的 Bilibili Cookie，并检查 `/x/web-interface/nav`。状态卡会显示：

- 登录来源；
- “活跃”或“未检测到有效登录态”；
- 账号昵称；
- 普通账号或 Bilibili 返回的大会员标签。

不会返回头像、UID、会员到期时间、`SESSDATA` 或完整 Cookie。Profile 留空时使用浏览器最近使用的配置；多 Profile 用户可填写浏览器的实际 Profile 名称。

Chrome/Edge 在 Windows 上通常会因 DPAPI 或应用绑定加密无法直接解密。这不是用户操作错误。请优先使用应用内一键登录；Firefox 直读或 `cookies.txt` 只作为高级兼容路径。

## `cookies.txt`

文件必须是 Netscape Cookie 格式。若确实需要导出，可用 yt-dlp 官方支持的浏览器读取方式在自己的电脑生成文件，且只保留 `bilibili.com` 域。不要安装来历不明的 Cookie 扩展，也不要把文件上传到 Issue、网盘或聊天工具。

点击“载入 cookies.txt”后，后端只保留 Bilibili 域条目并建立内存会话。原始上传内容不写入历史记录；退出 Bilidown 后会话失效。若文件包含其他网站 Cookie，它们会被丢弃。

## 状态与画质的关系

“年度大会员”只说明 Cookie 当前有效，并不保证每个投稿都有 4K。画质必须同时满足：投稿确实上传该源、账号有权访问、地区允许、所选分 P 返回该格式。切换登录来源后重新解析视频，旧解析结果不会自动升级。

## 安全处理

- 不要截图或复制 Cookie 内容。
- 怀疑泄漏时立即在 Bilibili 退出所有设备并修改密码。
- 公共电脑上不要加载个人 Cookie。
- CI 和 GitHub Secrets 中禁止保存会员 Cookie；真实会员测试只在受控本机显式运行。
