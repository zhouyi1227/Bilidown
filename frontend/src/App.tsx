import { AppFooter, AppHeader, AppHero, ResolverPanel } from "./components/AppChrome";
import { AuthPanel } from "./components/AuthPanel";
import { DownloadPanel } from "./components/DownloadPanel";
import { JobList } from "./components/JobList";
import { VideoPreview } from "./components/VideoPreview";
import { useAppController } from "./hooks/useAppController";

export function App() {
  const controller = useAppController();

  if (!controller.hasSession) {
    return <main className="fatal-state"><h1>本地会话已失效</h1><p>请关闭此页面并重新启动 Bilidown。</p></main>;
  }

  if (controller.shuttingDown) {
    return <main className="fatal-state"><h1>Bilidown 已退出</h1><p>后台服务正在停止。现在可以关闭此页面。</p></main>;
  }

  return (
    <main className="app-shell">
      <AppHeader status={controller.status} onQuit={() => void controller.handleQuit()} />
      <AppHero />

      <AuthPanel
        api={controller.api}
        auth={controller.auth}
        authStatus={controller.authStatus}
        checking={controller.authChecking}
        checkError={controller.authCheckError}
        autoSelected={controller.autoSelected}
        onRefresh={() => controller.setAuthCheckNonce((value) => value + 1)}
        onChange={controller.handleAuthChange}
        disabled={controller.resolving || controller.authInitializing}
      />

      <ResolverPanel
        credential={controller.credential}
        error={controller.error}
        resolving={controller.resolving}
        onCredentialChange={controller.setCredential}
        onSubmit={(event) => void controller.handleResolve(event)}
      />

      {controller.video && (
        <VideoPreview
          video={controller.video}
          selectedPages={controller.selectedPages}
          onSelectedPagesChange={controller.setSelectedPages}
        />
      )}
      {controller.video && controller.status && (
        <DownloadPanel
          status={controller.status}
          outputDir={controller.outputDir}
          onOutputDirChange={controller.setOutputDir}
          qualities={controller.commonQualities}
          qualityId={controller.qualityId}
          onQualityIdChange={controller.setQualityId}
          videoMode={controller.videoMode}
          onVideoModeChange={controller.setVideoMode}
          audioFormat={controller.audioFormat}
          onAudioFormatChange={controller.setAudioFormat}
          selectedPageCount={controller.selectedPages.size}
          busy={controller.creating}
          onCreate={(kind) => void controller.handleCreate(kind)}
          onOpenOutput={() => void controller.handleOpenOutput()}
        />
      )}
      <JobList
        jobs={controller.jobs}
        onCancel={(id) => void controller.handleCancel(id)}
        onRetry={(id) => void controller.handleRetry(id)}
      />

      <AppFooter status={controller.status} />
    </main>
  );
}
