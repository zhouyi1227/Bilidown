# 架构说明

Bilidown 是 Tauri 2 桌面应用：Rust 管理窗口、托盘、单实例、空闲退出和 Python sidecar；FastAPI 负责安全边界、解析和下载；React 只展示非敏感结构化数据。

## 组件

- `backend/bilidown/`：FastAPI、输入规范化、Cookie 会话、yt-dlp 引擎、任务队列、安全中间件和运行时发现。
- `frontend/src/`：React + TypeScript 单页界面、API 客户端、登录状态、媒体选择和 SSE 任务进度。
- `src-tauri/`：Rust 桌面壳、系统托盘、隐私登录窗口和 sidecar 生命周期。
- `packaging/`：PyInstaller 单文件 sidecar、FFmpeg 准备、Tauri Windows/macOS 构建与许可证。
- `tests/` 与 `frontend/e2e/`：后端、媒体、文档、浏览器和显式网络测试。

## 数据流

1. 启动器选择本地端口和随机令牌，启动 Uvicorn 后打开浏览器。
2. `/api/resources/resolve` 规范化可信 Bilibili URL，通过 yt-dlp 生成最多 100 项的结构化预览。
3. 前端按精确格式 ID 与登录来源创建任务。
4. 单并发 `JobManager` 逐项下载并记录部分失败；`LiveJobManager` 为每场直播运行独立录制任务。
5. FFmpeg 仅负责无重编码封装或明确选择的 MP3 转码，最终文件以防覆盖方式移动。

## 状态与生命周期

任务、Cookie 会话和令牌都不持久化。普通任务支持 `partial`；直播可停止保留或取消删除。Rust 托盘在关闭主窗口后继续运行，默认空闲 30 分钟退出，活动任务会抑制空闲退出。

## 平台边界

业务代码保持跨平台；`runtime.py` 发现 PyInstaller 根目录和 FFmpeg，`app.py` 调用平台文件管理器，`packaging/entrypoint.py` 提供原生启动错误提示。PyInstaller 在 Windows x64 与 macOS arm64 原生构建，不能交叉生成目标包。
