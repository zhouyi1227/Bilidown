use std::{
    fs,
    io::Write,
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child as ProcessChild, Command},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{
    ShellExt,
    process::{CommandChild, CommandEvent},
};
use uuid::Uuid;

const LOOPBACK: &str = "127.0.0.1";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const DESKTOP_ORIGINS: &str =
    "http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://127.0.0.1:5173";

#[derive(Clone, Serialize)]
pub struct BackendConnection {
    pub base_url: String,
    pub token: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackendPhase {
    Starting,
    Ready,
    Failed,
    Stopping,
}

#[derive(Clone, Serialize)]
pub struct BackendStatus {
    pub state: BackendPhase,
    pub error_code: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct BackendCommandError {
    pub code: String,
}

enum BackendChild {
    Development(ProcessChild),
    Bundled(CommandChild),
}

impl BackendChild {
    fn kill(self) {
        match self {
            Self::Development(mut process) => {
                let _result = process.kill();
            }
            Self::Bundled(process) => {
                let _result = process.kill();
            }
        }
    }
}

struct SpawnedBackend {
    child: BackendChild,
    events: Option<tauri::async_runtime::Receiver<CommandEvent>>,
}

struct BackendRuntime {
    phase: BackendPhase,
    error_code: Option<String>,
    connection: Option<BackendConnection>,
    child: Option<BackendChild>,
}

pub struct BackendState(Mutex<BackendRuntime>);

impl BackendState {
    pub const fn new() -> Self {
        Self(Mutex::new(BackendRuntime {
            phase: BackendPhase::Starting,
            error_code: None,
            connection: None,
            child: None,
        }))
    }

    fn status(&self) -> Result<BackendStatus, BackendCommandError> {
        self.0
            .lock()
            .map(|runtime| BackendStatus {
                state: runtime.phase,
                error_code: runtime.error_code.clone(),
            })
            .map_err(|_| command_error("backend_state_unavailable"))
    }

    fn connection(&self) -> Result<Option<BackendConnection>, BackendCommandError> {
        let runtime = self
            .0
            .lock()
            .map_err(|_| command_error("backend_state_unavailable"))?;
        match runtime.phase {
            BackendPhase::Ready => Ok(runtime.connection.clone()),
            BackendPhase::Failed => Err(command_error(
                runtime
                    .error_code
                    .as_deref()
                    .unwrap_or("backend_start_failed"),
            )),
            BackendPhase::Stopping => Err(command_error("backend_stopping")),
            BackendPhase::Starting => Ok(None),
        }
    }

    fn begin_retry(&self) -> Result<bool, BackendCommandError> {
        let mut runtime = self
            .0
            .lock()
            .map_err(|_| command_error("backend_state_unavailable"))?;
        if !matches!(runtime.phase, BackendPhase::Failed) {
            return Ok(false);
        }
        runtime.phase = BackendPhase::Starting;
        runtime.error_code = None;
        drop(runtime);
        Ok(true)
    }

    fn complete_start(&self, result: Result<(BackendConnection, BackendChild), &'static str>) {
        let Ok(mut runtime) = self.0.lock() else {
            if let Ok((_connection, child)) = result {
                child.kill();
            }
            return;
        };
        if !matches!(runtime.phase, BackendPhase::Starting) {
            if let Ok((_connection, child)) = result {
                child.kill();
            }
            return;
        }
        match result {
            Ok((connection, child)) => {
                runtime.phase = BackendPhase::Ready;
                runtime.connection = Some(connection);
                runtime.child = Some(child);
            }
            Err(code) => {
                runtime.phase = BackendPhase::Failed;
                runtime.error_code = Some(code.to_owned());
            }
        }
    }

    fn take_for_stop(&self) -> Option<(BackendConnection, BackendChild)> {
        let Ok(mut runtime) = self.0.lock() else {
            return None;
        };
        runtime.phase = BackendPhase::Stopping;
        runtime.connection.take().zip(runtime.child.take())
    }
}

fn command_error(code: &str) -> BackendCommandError {
    BackendCommandError {
        code: code.to_owned(),
    }
}

pub fn spawn_start(app: AppHandle) {
    thread::spawn(move || {
        let result = start_backend(&app);
        update_startup_diagnostic(result.as_ref().err().copied());
        app.state::<BackendState>().complete_start(result);
    });
}

fn update_startup_diagnostic(error_code: Option<&str>) {
    let Some(base) = diagnostic_directory() else {
        return;
    };
    let path = base.join("desktop-startup-error.log");
    if let Some(code) = error_code {
        if fs::create_dir_all(base).is_ok() {
            let _result = fs::write(
                path,
                format!("Bilidown desktop backend startup failed: {code}\n"),
            );
        }
    } else {
        let _result = fs::remove_file(path);
    }
}

fn diagnostic_directory() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|path| path.join("Bilidown"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|path| path.join("Library").join("Logs").join("Bilidown"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|path| path.join(".local").join("state").join("Bilidown"))
    }
}

fn start_backend(app: &AppHandle) -> Result<(BackendConnection, BackendChild), &'static str> {
    let port = available_port().map_err(|_| "backend_port_unavailable")?;
    let connection = BackendConnection {
        base_url: format!("http://{LOOPBACK}:{port}"),
        token: Uuid::new_v4().simple().to_string(),
    };
    let mut spawned = spawn_backend(app, &connection, port)?;
    if let Err(code) = wait_until_ready(port, &mut spawned) {
        spawned.child.kill();
        return Err(code);
    }
    Ok((connection, spawned.child))
}

fn available_port() -> Result<u16, String> {
    let listener = TcpListener::bind((LOOPBACK, 0))
        .map_err(|error| format!("failed to reserve backend port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("failed to inspect backend port: {error}"))
}

fn backend_environment(connection: &BackendConnection, port: u16) -> Vec<(&'static str, String)> {
    vec![
        ("BILIDOWN_PORT", port.to_string()),
        ("BILIDOWN_SESSION_TOKEN", connection.token.clone()),
        ("BILIDOWN_NO_BROWSER", "1".to_owned()),
        ("BILIDOWN_ADDITIONAL_ORIGINS", DESKTOP_ORIGINS.to_owned()),
    ]
}

fn spawn_backend(
    app: &AppHandle,
    connection: &BackendConnection,
    port: u16,
) -> Result<SpawnedBackend, &'static str> {
    if cfg!(debug_assertions) {
        return spawn_development_backend(connection, port);
    }

    let mut command = app
        .shell()
        .sidecar("bilidown-backend")
        .map_err(|_| "backend_sidecar_missing")?;
    for (key, value) in backend_environment(connection, port) {
        command = command.env(key, value);
    }
    let (events, child) = command
        .spawn()
        .map_err(|_| "backend_sidecar_start_failed")?;
    Ok(SpawnedBackend {
        child: BackendChild::Bundled(child),
        events: Some(events),
    })
}

fn spawn_development_backend(
    connection: &BackendConnection,
    port: u16,
) -> Result<SpawnedBackend, &'static str> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("backend_repository_missing")?
        .to_path_buf();
    let python = if cfg!(windows) {
        root.join(".venv").join("Scripts").join("python.exe")
    } else {
        root.join(".venv").join("bin").join("python")
    };
    let mut command = Command::new(python);
    command
        .current_dir(root)
        .args(["-c", "from bilidown.launcher import main; main()"]);
    for (key, value) in backend_environment(connection, port) {
        command.env(key, value);
    }
    command
        .spawn()
        .map(|child| SpawnedBackend {
            child: BackendChild::Development(child),
            events: None,
        })
        .map_err(|_| "backend_development_start_failed")
}

fn wait_until_ready(port: u16, spawned: &mut SpawnedBackend) -> Result<(), &'static str> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect((LOOPBACK, port)).is_ok() {
            return Ok(());
        }
        if backend_exited(spawned)? {
            return Err("backend_exited_early");
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("backend_start_timeout")
}

fn backend_exited(spawned: &mut SpawnedBackend) -> Result<bool, &'static str> {
    match &mut spawned.child {
        BackendChild::Development(process) => process
            .try_wait()
            .map(|status| status.is_some())
            .map_err(|_| "backend_process_unavailable"),
        BackendChild::Bundled(_) => {
            let Some(events) = spawned.events.as_mut() else {
                return Ok(false);
            };
            loop {
                match events.try_recv() {
                    Ok(CommandEvent::Terminated(_))
                    | Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                        return Ok(true);
                    }
                    Ok(CommandEvent::Error(_)) => return Err("backend_process_unavailable"),
                    Ok(_) => {}
                    Err(tokio::sync::mpsc::error::TryRecvError::Empty) => return Ok(false),
                }
            }
        }
    }
}

#[tauri::command]
pub fn backend_status(
    state: tauri::State<'_, BackendState>,
) -> Result<BackendStatus, BackendCommandError> {
    state.status()
}

#[tauri::command]
pub async fn backend_connection(
    state: tauri::State<'_, BackendState>,
) -> Result<BackendConnection, BackendCommandError> {
    let deadline = Instant::now() + STARTUP_TIMEOUT + Duration::from_secs(2);
    while Instant::now() < deadline {
        if let Some(connection) = state.connection()? {
            return Ok(connection);
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(command_error("backend_start_timeout"))
}

#[tauri::command]
pub fn retry_backend(
    app: AppHandle,
    state: tauri::State<'_, BackendState>,
) -> Result<BackendStatus, BackendCommandError> {
    if state.begin_retry()? {
        spawn_start(app);
    }
    state.status()
}

fn request_graceful_shutdown(connection: &BackendConnection) {
    let Ok(mut stream) = TcpStream::connect(connection.base_url.trim_start_matches("http://"))
    else {
        return;
    };
    let request = format!(
        "POST /api/quit HTTP/1.1\r\nHost: {}\r\nOrigin: http://tauri.localhost\r\nX-Bilidown-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        connection.base_url.trim_start_matches("http://"),
        connection.token,
    );
    let _result = stream.write_all(request.as_bytes());
}

pub fn stop_backend(app: &AppHandle) {
    let Some(state) = app.try_state::<BackendState>() else {
        return;
    };
    if let Some((connection, child)) = state.take_for_stop() {
        request_graceful_shutdown(&connection);
        thread::sleep(Duration::from_millis(350));
        child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::{BackendPhase, BackendState};

    #[test]
    fn failed_start_can_be_retried() {
        let state = BackendState::new();

        assert!(matches!(
            state.status(),
            Ok(status) if status.state == BackendPhase::Starting
        ));
        state.complete_start(Err("backend_start_timeout"));
        assert!(matches!(
            state.status(),
            Ok(status)
                if status.state == BackendPhase::Failed
                    && status.error_code.as_deref() == Some("backend_start_timeout")
        ));
        assert!(state.connection().is_err());

        assert_eq!(state.begin_retry(), Ok(true));
        assert!(matches!(
            state.status(),
            Ok(status)
                if status.state == BackendPhase::Starting && status.error_code.is_none()
        ));
        assert_eq!(state.begin_retry(), Ok(false));
    }
}
