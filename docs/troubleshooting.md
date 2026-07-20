# 故障排查

## Windows SmartScreen 阻止启动

先确认 MSI/NSIS 安装包来自项目 Releases，并核对 `SHA256SUMS.txt`。在 SmartScreen 页面选择“更多信息”→“仍要运行”。不要关闭系统的整体安全防护。

## macOS 提示无法验证开发者

ad-hoc 签名包未经过 Apple 公证时可能出现此提示。确认下载来源和 SHA-256 后：

1. 在 Finder 中按住 Control 点击 `Bilidown.app`，选择“打开”；或
2. 打开“系统设置”→“隐私与安全性”，在被阻止的应用旁选择“仍要打开”。

不要执行关闭 Gatekeeper 的全局命令。正式签名且公证的 Release 不需要这些步骤。

## 主窗口没有打开

先查看系统托盘；关闭窗口后 Bilidown 默认仍在后台。双击托盘图标或选择“打开 Bilidown”。仍无窗口时再检查任务管理器/活动监视器和本地环回防火墙。程序只支持 `127.0.0.1`，不能从手机或局域网访问。

## 封面不显示或不能下载

可信的 `bilibili.com`/`hdslb.com` HTTP 地址会升级为 HTTPS。其他域名会被安全过滤。先重新解析；如果视频和音频正常而封面为空，通常是上游没有返回可信封面，不要绕过域名校验。

## 浏览器 Cookie 解密失败

Chrome/Edge 的应用绑定加密可能使直接读取始终失败。请使用“扫码登录 Bilibili”；Firefox 或 Netscape `cookies.txt` 仅作为高级备选。macOS 首次读取 Firefox Cookie 时可能要求钥匙串授权，应核对请求程序后再允许。

## 已是大会员但没有 4K/高码率

确认状态卡显示昵称和会员标签，然后重新解析。投稿源、分 P、地区与账户权限必须同时支持该格式。可用 `BV1NGZtBwELa` 做会员 4K 解析测试；不要用实际上限 1080P 的投稿判断 4K 功能。

## FFmpeg 不可用或合并失败

官方桌面安装包内置 `ffmpeg` 和 `ffprobe`。请重新安装完整应用；自行构建时先运行对应平台的 FFmpeg 准备脚本。

## 412、429、网络超时

Bilibili 可能临时限制请求。暂停频繁解析，稍后重试；关闭代理或切换稳定网络。不要在 CI 中高频运行真实站点测试。站点结构变化时可能需要升级 Bilidown/yt-dlp。

## 日志位置

启动异常日志：

- Windows：`%LOCALAPPDATA%\Bilidown\startup-error.log`
- macOS：`~/Library/Logs/Bilidown/startup-error.log`

提交 Issue 前请删除用户名、完整本地路径和任何 Cookie/签名 URL。参见[安全政策](../SECURITY.md)。
