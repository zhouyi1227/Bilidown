use std::{
    io::Write,
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child as ProcessChild, Command},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{App, AppHandle, Manager};
use tauri_plugin_shell::{ShellExt, process::CommandChild};
use uuid::Uuid;

const LOOPBACK: &str = "127.0.0.1";
const DESKTOP_ORIGINS: &str =
    "http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://127.0.0.1:5173";

#[derive(Clone, Serialize)]
pub struct BackendConnection {
    pub base_url: String,
    pub token: String,
}

enum BackendChild {
    Development(ProcessChild),
    Bundled(CommandChild),
}

pub struct BackendState {
    connection: BackendConnection,
    child: Mutex<Option<BackendChild>>,
}

impl BackendState {
    pub fn start(app: &App) -> Result<Self, String> {
        let port = available_port()?;
        let token = Uuid::new_v4().simple().to_string();
        let connection = BackendConnection {
            base_url: format!("http://{LOOPBACK}:{port}"),
            token,
        };
        let child = spawn_backend(app, &connection, port)?;
        wait_until_ready(port)?;
        Ok(Self {
            connection,
            child: Mutex::new(Some(child)),
        })
    }

    pub fn connection(&self) -> BackendConnection {
        self.connection.clone()
    }

    pub fn stop(&self) {
        request_graceful_shutdown(&self.connection);
        thread::sleep(Duration::from_millis(350));
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                match child {
                    BackendChild::Development(mut process) => {
                        let _result = process.kill();
                    }
                    BackendChild::Bundled(process) => {
                        let _result = process.kill();
                    }
                }
            }
        }
    }
}

impl Drop for BackendState {
    fn drop(&mut self) {
        self.stop();
    }
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
    app: &App,
    connection: &BackendConnection,
    port: u16,
) -> Result<BackendChild, String> {
    if cfg!(debug_assertions) {
        return spawn_development_backend(connection, port);
    }

    let mut command = app
        .shell()
        .sidecar("bilidown-backend")
        .map_err(|error| format!("failed to locate backend sidecar: {error}"))?;
    for (key, value) in backend_environment(connection, port) {
        command = command.env(key, value);
    }
    let (_events, child) = command
        .spawn()
        .map_err(|error| format!("failed to start backend sidecar: {error}"))?;
    Ok(BackendChild::Bundled(child))
}

fn spawn_development_backend(
    connection: &BackendConnection,
    port: u16,
) -> Result<BackendChild, String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "failed to find repository root".to_owned())?
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
        .map(BackendChild::Development)
        .map_err(|error| format!("failed to start development backend: {error}"))
}

fn wait_until_ready(port: u16) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if TcpStream::connect((LOOPBACK, port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("backend did not become ready within 15 seconds".to_owned())
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

#[tauri::command]
pub fn backend_connection(state: tauri::State<'_, BackendState>) -> BackendConnection {
    state.connection()
}

pub fn stop_backend(app: &AppHandle) {
    app.state::<BackendState>().stop();
}
