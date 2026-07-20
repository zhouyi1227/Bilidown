use std::{
    fs,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Emitter, Manager};

use crate::backend;

const DEFAULT_TIMEOUT_MINUTES: u16 = 30;
const WARNING_MINUTES: u64 = 5;

#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct IdleSettings {
    pub timeout_minutes: Option<u16>,
}

struct IdleRuntime {
    last_activity: Instant,
    active_jobs: bool,
    warning_sent: bool,
    settings: IdleSettings,
}

pub struct IdleState(Mutex<IdleRuntime>);

impl IdleState {
    pub fn load(app: &App) -> Self {
        let settings = settings_path(app.handle())
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|content| serde_json::from_str::<IdleSettings>(&content).ok())
            .filter(|settings| valid_settings(*settings))
            .unwrap_or(IdleSettings {
                timeout_minutes: Some(DEFAULT_TIMEOUT_MINUTES),
            });
        Self(Mutex::new(IdleRuntime {
            last_activity: Instant::now(),
            active_jobs: false,
            warning_sent: false,
            settings,
        }))
    }
}

const fn valid_settings(settings: IdleSettings) -> bool {
    matches!(settings.timeout_minutes, None | Some(15 | 30 | 60))
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|directory| directory.join("desktop-settings.json"))
}

fn save_settings(app: &AppHandle, settings: IdleSettings) -> Result<(), String> {
    let path =
        settings_path(app).ok_or_else(|| "failed to locate app config directory".to_owned())?;
    let parent = path
        .parent()
        .ok_or_else(|| "invalid app config path".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("failed to create app config directory: {error}"))?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("failed to serialize desktop settings: {error}"))?;
    fs::write(path, content).map_err(|error| format!("failed to save desktop settings: {error}"))
}

#[tauri::command]
pub fn idle_settings(state: tauri::State<'_, IdleState>) -> Result<IdleSettings, String> {
    state
        .0
        .lock()
        .map(|runtime| runtime.settings)
        .map_err(|_| "idle state lock is poisoned".to_owned())
}

#[tauri::command]
pub fn set_idle_timeout(
    app: AppHandle,
    state: tauri::State<'_, IdleState>,
    timeout_minutes: Option<u16>,
) -> Result<IdleSettings, String> {
    let settings = IdleSettings { timeout_minutes };
    if !valid_settings(settings) {
        return Err("idle timeout must be 15, 30, 60, or disabled".to_owned());
    }
    {
        let mut runtime = state
            .0
            .lock()
            .map_err(|_| "idle state lock is poisoned".to_owned())?;
        runtime.settings = settings;
        runtime.last_activity = Instant::now();
        runtime.warning_sent = false;
    }
    save_settings(&app, settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn mark_activity(state: tauri::State<'_, IdleState>) -> Result<(), String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "idle state lock is poisoned".to_owned())?;
    runtime.last_activity = Instant::now();
    runtime.warning_sent = false;
    drop(runtime);
    Ok(())
}

#[tauri::command]
pub fn set_active_jobs(state: tauri::State<'_, IdleState>, active: bool) -> Result<(), String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "idle state lock is poisoned".to_owned())?;
    runtime.active_jobs = active;
    if active {
        runtime.warning_sent = false;
    }
    drop(runtime);
    Ok(())
}

pub fn spawn_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            let decision = {
                let state = app.state::<IdleState>();
                let Ok(mut runtime) = state.0.lock() else {
                    continue;
                };
                let Some(timeout_minutes) = runtime.settings.timeout_minutes else {
                    continue;
                };
                if runtime.active_jobs {
                    continue;
                }
                let elapsed = runtime.last_activity.elapsed();
                let timeout = Duration::from_secs(u64::from(timeout_minutes) * 60);
                if elapsed >= timeout {
                    2
                } else if elapsed
                    >= timeout.saturating_sub(Duration::from_secs(WARNING_MINUTES * 60))
                    && !runtime.warning_sent
                {
                    runtime.warning_sent = true;
                    1
                } else {
                    0
                }
            };
            if decision == 1 {
                let _result = app.emit(
                    "idle-exit-warning",
                    serde_json::json!({ "minutes": WARNING_MINUTES }),
                );
            } else if decision == 2 {
                backend::stop_backend(&app);
                app.exit(0);
                return;
            }
        }
    });
}
