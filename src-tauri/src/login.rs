use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const LOGIN_LABEL: &str = "bilibili-login";

#[derive(Serialize)]
pub struct CookieImport {
    content: String,
    cookie_count: usize,
}

#[tauri::command]
pub fn open_bilibili_login(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let url =
        Url::parse("https://passport.bilibili.com/login").map_err(|error| error.to_string())?;
    WebviewWindowBuilder::new(&app, LOGIN_LABEL, WebviewUrl::External(url))
        .title("Bilibili Login")
        .inner_size(1120.0, 760.0)
        .min_inner_size(720.0, 560.0)
        .center()
        .incognito(true)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn close_bilibili_login(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_LABEL) {
        window
            .clear_all_browsing_data()
            .map_err(|error| error.to_string())?;
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn collect_bilibili_cookies(app: AppHandle) -> Result<CookieImport, String> {
    let window = app
        .get_webview_window(LOGIN_LABEL)
        .ok_or_else(|| "Bilibili login window is not open".to_owned())?;
    let cookie_window = window.clone();
    let cookies = tauri::async_runtime::spawn_blocking(move || cookie_window.cookies())
        .await
        .map_err(|error| format!("failed to join cookie reader: {error}"))?
        .map_err(|error| format!("failed to read login cookies: {error}"))?;

    let mut lines = vec!["# Netscape HTTP Cookie File".to_owned()];
    let mut count = 0_usize;
    for cookie in cookies {
        let domain = cookie.domain().unwrap_or_default();
        if !domain.ends_with("bilibili.com") {
            continue;
        }
        let http_only_prefix = if cookie.http_only() == Some(true) {
            "#HttpOnly_"
        } else {
            ""
        };
        let include_subdomains = if domain.starts_with('.') {
            "TRUE"
        } else {
            "FALSE"
        };
        let path = cookie.path().unwrap_or("/");
        let secure = if cookie.secure() == Some(true) {
            "TRUE"
        } else {
            "FALSE"
        };
        let expires = cookie
            .expires()
            .and_then(tauri::webview::cookie::Expiration::datetime)
            .map_or(
                0,
                tauri::webview::cookie::time::OffsetDateTime::unix_timestamp,
            );
        lines.push(format!(
            "{http_only_prefix}{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{}\t{}",
            cookie.name(),
            cookie.value(),
        ));
        count += 1;
    }
    if count == 0 {
        return Err("No Bilibili cookies were found; finish login and try again".to_owned());
    }
    let _result = window.clear_all_browsing_data();
    let _result = window.close();
    Ok(CookieImport {
        content: format!("{}\n", lines.join("\n")),
        cookie_count: count,
    })
}
