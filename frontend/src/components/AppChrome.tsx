import type { FormEventHandler } from "react";

import type { AppStatus } from "../api";

interface AppHeaderProps {
  status: AppStatus | null;
  onQuit: () => void;
}

export function AppHeader({ status, onQuit }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-mark">B</div>
      <div>
        <p className="eyebrow">LOCAL MEDIA TOOL</p>
        <h1>Bilidown</h1>
      </div>
      <div className="header-actions">
        <div className="header-status">
          <span>仅监听 127.0.0.1</span>
          {status && <span>v{status.app_version} · yt-dlp {status.yt_dlp_version}</span>}
        </div>
        <button type="button" className="secondary-button app-quit" onClick={onQuit}>
          退出 Bilidown
        </button>
      </div>
    </header>
  );
}

export function AppHero() {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">BILIBILI UGC DOWNLOADER</p>
        <h2>
          <span className="hero-line">把你有权保存的内容，</span>
          <span className="hero-line hero-line-accent">留在本机。</span>
        </h2>
        <p>输入 BV 号、AV 号、视频链接或 b23.tv 短链。登录态、解析过程和下载记录不会发送给第三方。</p>
      </div>
      <div className="hero-number">01—03</div>
    </section>
  );
}

interface ResolverPanelProps {
  credential: string;
  error: string | null;
  resolving: boolean;
  onCredentialChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ResolverPanel({
  credential,
  error,
  resolving,
  onCredentialChange,
  onSubmit,
}: ResolverPanelProps) {
  return (
    <section className="panel resolver-panel" aria-labelledby="resolver-heading">
      <p className="eyebrow">视频定位</p>
      <h2 id="resolver-heading">粘贴凭据并解析</h2>
      <form className="resolver-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="credential">BV 号、AV 号或视频链接</label>
        <input
          id="credential"
          value={credential}
          onChange={(event) => onCredentialChange(event.target.value)}
          placeholder="BV1xx411c7mD 或 https://www.bilibili.com/video/..."
          disabled={resolving}
          required
        />
        <button type="submit" disabled={resolving}>{resolving ? "解析中…" : "解析视频"}</button>
      </form>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}

export function AppFooter({ status }: { status: AppStatus | null }) {
  return (
    <footer>
      <p>Bilidown 不绕过权限。请遵守 Bilibili 条款及适用版权法律。</p>
      {status && <p>FFmpeg {status.ffmpeg_version ?? "未安装"}</p>}
    </footer>
  );
}
