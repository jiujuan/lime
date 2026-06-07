//! Agent App standalone / runtime-backed dev shell 独立窗口管理。
//!
//! 这里只负责 Tauri WebviewWindow 宿主；Runtime、policy、secret、evidence 仍由
//! Agent App current 主链提供，避免 Shell 复制 Desktop 内部服务。

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use url::Url;

#[derive(Debug, thiserror::Error)]
pub enum AgentAppShellWindowError {
    #[error("窗口 URL 无效: {0}")]
    InvalidUrl(String),
    #[error("Deep Link 无效: {0}")]
    InvalidDeepLink(String),
    #[error("窗口创建失败: {0}")]
    CreateFailed(String),
    #[error("窗口操作失败: {0}")]
    OperationFailed(String),
}

#[derive(Debug, Clone)]
pub struct AgentAppShellWindowOpenRequest {
    pub app_id: String,
    pub install_mode: String,
    pub entry_key: String,
    pub title: String,
    pub entry_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellChromeInfo {
    pub deep_link_scheme: String,
    pub open_entry_key: String,
    pub tray_enabled: bool,
    pub close_policy: String,
    pub menu_item_ids: Vec<String>,
    pub multi_app_management: bool,
    pub runtime_bypass: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellWindowInfo {
    pub label: String,
    pub title: String,
    pub url: String,
    pub reused: bool,
    pub chrome: AgentAppShellChromeInfo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentAppShellNativeAction {
    AboutApp,
    OpenPrimaryEntry,
    CheckUpdates,
    QuitApp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellDeepLinkOpenRequest {
    pub app_id: String,
    pub entry_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeMenuEvent {
    pub app_id: String,
    pub item_id: String,
    pub action: AgentAppShellNativeAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeMenuItemSpec {
    pub id: String,
    pub label_key: String,
    pub action: AgentAppShellNativeAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeMenuSpec {
    pub app_id: String,
    pub app_name: String,
    pub items: Vec<AgentAppShellNativeMenuItemSpec>,
    pub multi_app_management: bool,
    pub runtime_bypass: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeTrayItemSpec {
    pub id: String,
    pub label_key: String,
    pub action: AgentAppShellNativeAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeTraySpec {
    pub app_id: String,
    pub tooltip: String,
    pub items: Vec<AgentAppShellNativeTrayItemSpec>,
    pub multi_app_management: bool,
    pub runtime_bypass: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellNativeChromeSpec {
    pub app_id: String,
    pub app_name: String,
    pub menu: AgentAppShellNativeMenuSpec,
    pub tray: AgentAppShellNativeTraySpec,
    pub close_policy: String,
    pub deep_link_scheme: String,
    pub multi_app_management: bool,
    pub runtime_bypass: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentAppShellStandaloneRuntimeEnv {
    pub app_id: String,
    pub entry_key: String,
    pub deep_link_scheme: String,
}

#[cfg(desktop)]
pub struct AgentAppShellNativeChromeManager<R: Runtime> {
    tray: tauri::tray::TrayIcon<R>,
    chrome: AgentAppShellNativeChromeSpec,
}

const WINDOW_LABEL_PREFIX: &str = "agent-app-shell";
const NATIVE_MENU_ITEM_PREFIX: &str = "agent-app-shell";
const AGENT_APP_SHELL_DEEP_LINK_SCHEME_PREFIX: &str = "lime-agent-";
const AGENT_APP_SHELL_NATIVE_EVENT_PREFIX: &str = "agent-app-shell://";
const STANDALONE_APP_ID_ENV: &str = "LIME_AGENT_APP_STANDALONE_APP_ID";
const STANDALONE_ENTRY_KEY_ENV: &str = "LIME_AGENT_APP_STANDALONE_ENTRY_KEY";
const STANDALONE_DEEP_LINK_SCHEME_ENV: &str = "LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME";
const WINDOW_WIDTH: f64 = 1280.0;
const WINDOW_HEIGHT: f64 = 860.0;
const MIN_WINDOW_WIDTH: f64 = 960.0;
const MIN_WINDOW_HEIGHT: f64 = 640.0;

impl AgentAppShellNativeAction {
    fn menu_item_id(&self) -> &'static str {
        match self {
            Self::AboutApp => "about",
            Self::OpenPrimaryEntry => "open",
            Self::CheckUpdates => "check_updates",
            Self::QuitApp => "quit",
        }
    }

    fn label_key(&self) -> &'static str {
        match self {
            Self::AboutApp => "agentApp.shell.menu.about",
            Self::OpenPrimaryEntry => "agentApp.shell.menu.open",
            Self::CheckUpdates => "agentApp.shell.menu.checkUpdates",
            Self::QuitApp => "agentApp.shell.menu.quit",
        }
    }
}

impl AgentAppShellStandaloneRuntimeEnv {
    fn from_values(
        app_id: String,
        entry_key: Option<String>,
        deep_link_scheme: Option<String>,
    ) -> Option<Self> {
        let app_id = app_id.trim();
        if app_id.is_empty() {
            return None;
        }

        let entry_key = entry_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "dashboard".to_string());
        let deep_link_scheme = deep_link_scheme
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| build_agent_app_shell_deep_link_scheme(app_id));

        Some(Self {
            app_id: app_id.to_string(),
            entry_key,
            deep_link_scheme,
        })
    }
}

#[cfg(desktop)]
impl<R: Runtime> AgentAppShellNativeChromeManager<R> {
    pub fn tray_id(&self) -> &str {
        self.tray.id().as_ref()
    }

    pub fn app_id(&self) -> &str {
        &self.chrome.app_id
    }
}

pub fn resolve_agent_app_shell_standalone_runtime_env_from<F>(
    mut getenv: F,
) -> Option<AgentAppShellStandaloneRuntimeEnv>
where
    F: FnMut(&str) -> Option<String>,
{
    let app_id = getenv(STANDALONE_APP_ID_ENV)?;
    AgentAppShellStandaloneRuntimeEnv::from_values(
        app_id,
        getenv(STANDALONE_ENTRY_KEY_ENV),
        getenv(STANDALONE_DEEP_LINK_SCHEME_ENV),
    )
}

pub fn resolve_agent_app_shell_standalone_runtime_env() -> Option<AgentAppShellStandaloneRuntimeEnv>
{
    resolve_agent_app_shell_standalone_runtime_env_from(|key| std::env::var(key).ok())
}

fn normalize_window_label_part(value: &str) -> String {
    let normalized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = normalized.trim_matches('-').trim_matches('_');
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.chars().take(72).collect()
    }
}

pub fn build_agent_app_shell_window_label(app_id: &str, install_mode: &str) -> String {
    format!(
        "{WINDOW_LABEL_PREFIX}-{}-{}",
        normalize_window_label_part(app_id),
        normalize_window_label_part(install_mode)
    )
}

pub fn is_agent_app_shell_window_label(label: &str) -> bool {
    label
        .strip_prefix(WINDOW_LABEL_PREFIX)
        .is_some_and(|suffix| suffix.starts_with('-') && suffix.len() > 1)
}

pub fn should_hide_agent_app_shell_window_on_close(label: &str) -> bool {
    should_hide_agent_app_shell_window_on_close_for_runtime(
        label,
        resolve_agent_app_shell_standalone_runtime_env().as_ref(),
    )
}

pub fn should_hide_agent_app_shell_window_on_close_for_runtime(
    label: &str,
    standalone_runtime: Option<&AgentAppShellStandaloneRuntimeEnv>,
) -> bool {
    is_agent_app_shell_window_label(label) || (standalone_runtime.is_some() && label == "main")
}

pub fn build_agent_app_shell_deep_link_scheme(app_id: &str) -> String {
    let normalized: String = app_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = normalized.trim_matches('-');
    if slug.is_empty() {
        "lime-agent-app".to_string()
    } else {
        format!("lime-agent-{slug}")
    }
}

pub fn build_agent_app_shell_deep_link_url(app_id: &str, entry_key: &str) -> String {
    let scheme = build_agent_app_shell_deep_link_scheme(app_id);
    let mut url = Url::parse(&format!("{scheme}://open"))
        .expect("Agent App shell deep link scheme is generated from ASCII slug");
    url.query_pairs_mut().append_pair(
        "entry",
        if entry_key.trim().is_empty() {
            "dashboard"
        } else {
            entry_key
        },
    );
    url.to_string()
}

pub fn parse_agent_app_shell_deep_link_url(
    app_id: &str,
    url: &str,
) -> Result<AgentAppShellDeepLinkOpenRequest, AgentAppShellWindowError> {
    let parsed = Url::parse(url)
        .map_err(|error| AgentAppShellWindowError::InvalidDeepLink(error.to_string()))?;
    let expected_scheme = build_agent_app_shell_deep_link_scheme(app_id);
    if parsed.scheme() != expected_scheme {
        return Err(AgentAppShellWindowError::InvalidDeepLink(format!(
            "scheme mismatch: expected {expected_scheme}, got {}",
            parsed.scheme()
        )));
    }
    if parsed.host_str() != Some("open") {
        return Err(AgentAppShellWindowError::InvalidDeepLink(
            "仅允许 open deep link action".to_string(),
        ));
    }
    let entry_key = parsed
        .query_pairs()
        .find_map(|(key, value)| {
            if key == "entry" {
                Some(value.into_owned())
            } else {
                None
            }
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "dashboard".to_string());

    Ok(AgentAppShellDeepLinkOpenRequest {
        app_id: app_id.to_string(),
        entry_key,
    })
}

pub fn is_agent_app_shell_deep_link_url(url: &str) -> bool {
    Url::parse(url)
        .map(|parsed| {
            parsed
                .scheme()
                .starts_with(AGENT_APP_SHELL_DEEP_LINK_SCHEME_PREFIX)
        })
        .unwrap_or(false)
}

pub fn parse_agent_app_shell_deep_link_url_any(
    url: &str,
) -> Result<AgentAppShellDeepLinkOpenRequest, AgentAppShellWindowError> {
    let parsed = Url::parse(url)
        .map_err(|error| AgentAppShellWindowError::InvalidDeepLink(error.to_string()))?;
    let Some(app_id) = parsed
        .scheme()
        .strip_prefix(AGENT_APP_SHELL_DEEP_LINK_SCHEME_PREFIX)
        .filter(|value| !value.trim().is_empty())
    else {
        return Err(AgentAppShellWindowError::InvalidDeepLink(format!(
            "scheme is not an Agent App shell scheme: {}",
            parsed.scheme()
        )));
    };
    if parsed.host_str() != Some("open") {
        return Err(AgentAppShellWindowError::InvalidDeepLink(
            "仅允许 open deep link action".to_string(),
        ));
    }
    let entry_key = parsed
        .query_pairs()
        .find_map(|(key, value)| {
            if key == "entry" {
                Some(value.into_owned())
            } else {
                None
            }
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "dashboard".to_string());

    Ok(AgentAppShellDeepLinkOpenRequest {
        app_id: app_id.to_string(),
        entry_key,
    })
}

pub fn build_agent_app_shell_native_menu_item_id(
    app_id: &str,
    action: AgentAppShellNativeAction,
) -> String {
    format!(
        "{NATIVE_MENU_ITEM_PREFIX}:{}:{}",
        normalize_window_label_part(app_id),
        action.menu_item_id()
    )
}

pub fn resolve_agent_app_shell_native_menu_action(
    app_id: &str,
    item_id: &str,
) -> Option<AgentAppShellNativeAction> {
    let prefix = format!(
        "{NATIVE_MENU_ITEM_PREFIX}:{}:",
        normalize_window_label_part(app_id)
    );
    let action = item_id.strip_prefix(&prefix)?;
    match action {
        "about" => Some(AgentAppShellNativeAction::AboutApp),
        "open" => Some(AgentAppShellNativeAction::OpenPrimaryEntry),
        "check_updates" => Some(AgentAppShellNativeAction::CheckUpdates),
        "quit" => Some(AgentAppShellNativeAction::QuitApp),
        _ => None,
    }
}

pub fn resolve_agent_app_shell_native_menu_event(
    item_id: &str,
) -> Option<AgentAppShellNativeMenuEvent> {
    let suffix = item_id.strip_prefix(&format!("{NATIVE_MENU_ITEM_PREFIX}:"))?;
    let (app_id, action_id) = suffix.rsplit_once(':')?;
    if app_id.trim().is_empty() {
        return None;
    }
    let action = match action_id {
        "about" => AgentAppShellNativeAction::AboutApp,
        "open" => AgentAppShellNativeAction::OpenPrimaryEntry,
        "check_updates" => AgentAppShellNativeAction::CheckUpdates,
        "quit" => AgentAppShellNativeAction::QuitApp,
        _ => return None,
    };
    Some(AgentAppShellNativeMenuEvent {
        app_id: app_id.to_string(),
        item_id: item_id.to_string(),
        action,
    })
}

pub fn build_agent_app_shell_native_menu_spec(
    app_id: &str,
    app_name: &str,
) -> AgentAppShellNativeMenuSpec {
    let actions = [
        AgentAppShellNativeAction::AboutApp,
        AgentAppShellNativeAction::OpenPrimaryEntry,
        AgentAppShellNativeAction::CheckUpdates,
        AgentAppShellNativeAction::QuitApp,
    ];
    let items = actions
        .into_iter()
        .map(|action| AgentAppShellNativeMenuItemSpec {
            id: build_agent_app_shell_native_menu_item_id(app_id, action.clone()),
            label_key: action.label_key().to_string(),
            action,
        })
        .collect();

    AgentAppShellNativeMenuSpec {
        app_id: app_id.to_string(),
        app_name: if app_name.trim().is_empty() {
            app_id.to_string()
        } else {
            app_name.to_string()
        },
        items,
        multi_app_management: false,
        runtime_bypass: false,
    }
}

pub fn build_agent_app_shell_native_tray_spec(
    app_id: &str,
    app_name: &str,
) -> AgentAppShellNativeTraySpec {
    let actions = [
        AgentAppShellNativeAction::OpenPrimaryEntry,
        AgentAppShellNativeAction::CheckUpdates,
        AgentAppShellNativeAction::QuitApp,
    ];
    let items = actions
        .into_iter()
        .map(|action| AgentAppShellNativeTrayItemSpec {
            id: build_agent_app_shell_native_menu_item_id(app_id, action.clone()),
            label_key: action.label_key().to_string(),
            action,
        })
        .collect();

    AgentAppShellNativeTraySpec {
        app_id: app_id.to_string(),
        tooltip: if app_name.trim().is_empty() {
            app_id.to_string()
        } else {
            app_name.to_string()
        },
        items,
        multi_app_management: false,
        runtime_bypass: false,
    }
}

pub fn build_agent_app_shell_native_chrome_spec(
    app_id: &str,
    app_name: &str,
    _entry_key: &str,
) -> AgentAppShellNativeChromeSpec {
    AgentAppShellNativeChromeSpec {
        app_id: app_id.to_string(),
        app_name: if app_name.trim().is_empty() {
            app_id.to_string()
        } else {
            app_name.to_string()
        },
        menu: build_agent_app_shell_native_menu_spec(app_id, app_name),
        tray: build_agent_app_shell_native_tray_spec(app_id, app_name),
        close_policy: "hide_to_tray".to_string(),
        deep_link_scheme: build_agent_app_shell_deep_link_scheme(app_id),
        multi_app_management: false,
        runtime_bypass: false,
    }
}

fn agent_app_shell_native_menu_label(action: &AgentAppShellNativeAction, app_name: &str) -> String {
    let app_name = if app_name.trim().is_empty() {
        "Agent App"
    } else {
        app_name.trim()
    };
    match action {
        AgentAppShellNativeAction::AboutApp => format!("关于 {app_name}"),
        AgentAppShellNativeAction::OpenPrimaryEntry => format!("打开 {app_name}"),
        AgentAppShellNativeAction::CheckUpdates => "检查更新".to_string(),
        AgentAppShellNativeAction::QuitApp => format!("退出 {app_name}"),
    }
}

#[cfg(target_os = "macos")]
pub fn build_agent_app_shell_macos_app_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{
        Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    };

    let package_info = app_handle.package_info();
    let standalone_runtime = resolve_agent_app_shell_standalone_runtime_env();
    let app_id = standalone_runtime
        .as_ref()
        .map(|runtime| runtime.app_id.as_str())
        .unwrap_or("agent-app");
    let app_name = package_info.name.clone();
    let about = MenuItem::with_id(
        app_handle,
        build_agent_app_shell_native_menu_item_id(app_id, AgentAppShellNativeAction::AboutApp),
        agent_app_shell_native_menu_label(&AgentAppShellNativeAction::AboutApp, &app_name),
        true,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(
        app_handle,
        build_agent_app_shell_native_menu_item_id(
            app_id,
            AgentAppShellNativeAction::OpenPrimaryEntry,
        ),
        agent_app_shell_native_menu_label(&AgentAppShellNativeAction::OpenPrimaryEntry, &app_name),
        true,
        None::<&str>,
    )?;
    let check_updates = MenuItem::with_id(
        app_handle,
        build_agent_app_shell_native_menu_item_id(app_id, AgentAppShellNativeAction::CheckUpdates),
        agent_app_shell_native_menu_label(&AgentAppShellNativeAction::CheckUpdates, &app_name),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app_handle,
        build_agent_app_shell_native_menu_item_id(app_id, AgentAppShellNativeAction::QuitApp),
        agent_app_shell_native_menu_label(&AgentAppShellNativeAction::QuitApp, &app_name),
        true,
        None::<&str>,
    )?;

    let app_submenu = Submenu::with_items(
        app_handle,
        app_name,
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app_handle)?,
            &open,
            &check_updates,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::services(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::hide(app_handle, None)?,
            &PredefinedMenuItem::hide_others(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &quit,
        ],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app_handle,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app_handle, None)?,
            &PredefinedMenuItem::maximize(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::close_window(app_handle, None)?,
        ],
    )?;
    let help_menu = Submenu::with_id_and_items(app_handle, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app_handle,
        &[
            &app_submenu,
            &Submenu::with_items(
                app_handle,
                "File",
                true,
                &[&PredefinedMenuItem::close_window(app_handle, None)?],
            )?,
            &Submenu::with_items(
                app_handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app_handle, None)?,
                    &PredefinedMenuItem::redo(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::cut(app_handle, None)?,
                    &PredefinedMenuItem::copy(app_handle, None)?,
                    &PredefinedMenuItem::paste(app_handle, None)?,
                    &PredefinedMenuItem::select_all(app_handle, None)?,
                ],
            )?,
            &Submenu::with_items(
                app_handle,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app_handle, None)?],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
}

#[cfg(desktop)]
fn build_agent_app_shell_native_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    chrome: &AgentAppShellNativeChromeSpec,
) -> Result<tauri::menu::Menu<R>, AgentAppShellWindowError> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let open = MenuItem::with_id(
        app,
        build_agent_app_shell_native_menu_item_id(
            &chrome.app_id,
            AgentAppShellNativeAction::OpenPrimaryEntry,
        ),
        agent_app_shell_native_menu_label(
            &AgentAppShellNativeAction::OpenPrimaryEntry,
            &chrome.app_name,
        ),
        true,
        None::<&str>,
    )
    .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))?;
    let check_updates = MenuItem::with_id(
        app,
        build_agent_app_shell_native_menu_item_id(
            &chrome.app_id,
            AgentAppShellNativeAction::CheckUpdates,
        ),
        agent_app_shell_native_menu_label(
            &AgentAppShellNativeAction::CheckUpdates,
            &chrome.app_name,
        ),
        true,
        None::<&str>,
    )
    .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))?;
    let quit = MenuItem::with_id(
        app,
        build_agent_app_shell_native_menu_item_id(
            &chrome.app_id,
            AgentAppShellNativeAction::QuitApp,
        ),
        agent_app_shell_native_menu_label(&AgentAppShellNativeAction::QuitApp, &chrome.app_name),
        true,
        None::<&str>,
    )
    .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))?;
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))?;

    Menu::with_items(app, &[&open, &check_updates, &separator, &quit])
        .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))
}

#[cfg(desktop)]
pub fn create_agent_app_shell_native_chrome_manager<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<AgentAppShellNativeChromeManager<R>>, AgentAppShellWindowError> {
    use tauri::image::Image;
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let Some(runtime) = resolve_agent_app_shell_standalone_runtime_env() else {
        return Ok(None);
    };
    let app_name = app.package_info().name.clone();
    let chrome =
        build_agent_app_shell_native_chrome_spec(&runtime.app_id, &app_name, &runtime.entry_key);
    if chrome.deep_link_scheme != runtime.deep_link_scheme {
        tracing::warn!(
            "[Agent App Shell] runtime deep link scheme 与 chrome spec 不一致: env={} spec={}",
            runtime.deep_link_scheme,
            chrome.deep_link_scheme
        );
    }
    let menu = build_agent_app_shell_native_tray_menu(app, &chrome)?;
    let icon = Image::from_bytes(include_bytes!("../../icons/32x32.png"))
        .map_err(|error| AgentAppShellWindowError::OperationFailed(error.to_string()))?;
    let app_id = chrome.app_id.clone();
    let tray = TrayIconBuilder::with_id(format!(
        "agent-app-shell-tray-{}",
        normalize_window_label_part(&chrome.app_id)
    ))
    .icon(icon)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .tooltip(&chrome.tray.tooltip)
    .on_tray_icon_event(move |tray, event| match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
        | TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            let app = tray.app_handle();
            if let Err(error) = reveal_agent_app_shell_window_for_app(app, &app_id) {
                tracing::warn!("[Agent App Shell] 托盘打开窗口失败: {}", error);
            }
        }
        _ => {}
    })
    .on_menu_event(|app, event| {
        let item_id = event.id().as_ref();
        if handle_agent_app_shell_native_menu_event(app, item_id) {
            tracing::info!("[Agent App Shell] 已处理 native tray 事件: {}", item_id);
        }
    })
    .build(app)
    .map_err(|error| AgentAppShellWindowError::CreateFailed(error.to_string()))?;

    Ok(Some(AgentAppShellNativeChromeManager { tray, chrome }))
}

fn build_agent_app_shell_chrome_info(app_id: &str, entry_key: &str) -> AgentAppShellChromeInfo {
    AgentAppShellChromeInfo {
        deep_link_scheme: build_agent_app_shell_deep_link_scheme(app_id),
        open_entry_key: if entry_key.trim().is_empty() {
            "dashboard".to_string()
        } else {
            entry_key.to_string()
        },
        tray_enabled: true,
        close_policy: "hide_to_tray".to_string(),
        menu_item_ids: vec![
            "open".to_string(),
            "check_updates".to_string(),
            "quit".to_string(),
        ],
        multi_app_management: false,
        runtime_bypass: false,
    }
}

fn reveal_agent_app_shell_window_for_app<R: Runtime>(
    app: &AppHandle<R>,
    app_id: &str,
) -> Result<bool, AgentAppShellWindowError> {
    if resolve_agent_app_shell_standalone_runtime_env()
        .as_ref()
        .is_some_and(|runtime| runtime.app_id == app_id)
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            window.show().map_err(|error| {
                AgentAppShellWindowError::OperationFailed(format!("显示主窗口失败: {error}"))
            })?;
            window.set_focus().map_err(|error| {
                AgentAppShellWindowError::OperationFailed(format!("聚焦主窗口失败: {error}"))
            })?;
            return Ok(true);
        }
    }

    for install_mode in ["standalone", "runtime_backed"] {
        let label = build_agent_app_shell_window_label(app_id, install_mode);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.unminimize();
            window.show().map_err(|error| {
                AgentAppShellWindowError::OperationFailed(format!("显示窗口失败: {error}"))
            })?;
            window.set_focus().map_err(|error| {
                AgentAppShellWindowError::OperationFailed(format!("聚焦窗口失败: {error}"))
            })?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn emit_agent_app_shell_native_event<R: Runtime>(
    app: &AppHandle<R>,
    event_name: &str,
    payload: &AgentAppShellNativeMenuEvent,
) {
    if let Err(error) = app.emit(event_name, payload) {
        tracing::warn!("[Agent App Shell] 发送 native menu 事件失败: {}", error);
    }
}

pub fn handle_agent_app_shell_native_menu_event<R: Runtime>(
    app: &AppHandle<R>,
    item_id: &str,
) -> bool {
    let Some(event) = resolve_agent_app_shell_native_menu_event(item_id) else {
        return false;
    };

    match event.action.clone() {
        AgentAppShellNativeAction::AboutApp => {
            emit_agent_app_shell_native_event(
                app,
                &format!("{AGENT_APP_SHELL_NATIVE_EVENT_PREFIX}about"),
                &event,
            );
        }
        AgentAppShellNativeAction::OpenPrimaryEntry => {
            if let Err(error) = reveal_agent_app_shell_window_for_app(app, &event.app_id) {
                tracing::warn!("[Agent App Shell] 原生菜单打开窗口失败: {}", error);
            }
            emit_agent_app_shell_native_event(
                app,
                &format!("{AGENT_APP_SHELL_NATIVE_EVENT_PREFIX}open-primary-entry"),
                &event,
            );
        }
        AgentAppShellNativeAction::CheckUpdates => {
            emit_agent_app_shell_native_event(
                app,
                &format!("{AGENT_APP_SHELL_NATIVE_EVENT_PREFIX}check-updates"),
                &event,
            );
        }
        AgentAppShellNativeAction::QuitApp => {
            app.exit(0);
        }
    }
    true
}

pub fn handle_agent_app_shell_deep_link_url<R: Runtime>(
    app: &AppHandle<R>,
    url: &str,
) -> Result<AgentAppShellDeepLinkOpenRequest, AgentAppShellWindowError> {
    let request = parse_agent_app_shell_deep_link_url_any(url)?;
    let _ = reveal_agent_app_shell_window_for_app(app, &request.app_id)?;
    if let Err(error) = app.emit("agent-app-shell://deep-link-open", &request) {
        tracing::warn!("[Agent App Shell] 发送 deep link open 事件失败: {}", error);
    }
    Ok(request)
}

fn normalize_window_title(title: &str, app_id: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        app_id.to_string()
    } else {
        title.chars().take(80).collect()
    }
}

fn parse_shell_window_url(entry_url: &str) -> Result<Url, AgentAppShellWindowError> {
    let parsed = Url::parse(entry_url)
        .map_err(|error| AgentAppShellWindowError::InvalidUrl(error.to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AgentAppShellWindowError::InvalidUrl(format!(
            "仅允许 http/https dev shell URL: {}",
            parsed.scheme()
        )));
    }
    Ok(parsed)
}

pub fn open_agent_app_shell_window(
    app: &AppHandle,
    request: AgentAppShellWindowOpenRequest,
) -> Result<AgentAppShellWindowInfo, AgentAppShellWindowError> {
    let label = build_agent_app_shell_window_label(&request.app_id, &request.install_mode);
    let title = normalize_window_title(&request.title, &request.app_id);
    let parsed_url = parse_shell_window_url(&request.entry_url)?;
    let chrome = build_agent_app_shell_chrome_info(&request.app_id, &request.entry_key);

    if let Some(window) = app.get_webview_window(&label) {
        let url_literal = serde_json::to_string(&request.entry_url).map_err(|error| {
            AgentAppShellWindowError::OperationFailed(format!("窗口 URL 编码失败: {error}"))
        })?;
        let js = format!("window.location.replace({url_literal});");
        window.eval(&js).map_err(|error| {
            AgentAppShellWindowError::OperationFailed(format!("导航失败: {error}"))
        })?;
        let _ = window.set_title(&title);
        let _ = window.unminimize();
        window.show().map_err(|error| {
            AgentAppShellWindowError::OperationFailed(format!("显示窗口失败: {error}"))
        })?;
        window.set_focus().map_err(|error| {
            AgentAppShellWindowError::OperationFailed(format!("聚焦窗口失败: {error}"))
        })?;
        return Ok(AgentAppShellWindowInfo {
            label,
            title,
            url: request.entry_url,
            reused: true,
            chrome,
        });
    }

    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed_url))
        .title(&title)
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)
        .resizable(true)
        .visible(true)
        .focused(true)
        .center()
        .build()
        .map_err(|error| AgentAppShellWindowError::CreateFailed(format!("{error}")))?;

    Ok(AgentAppShellWindowInfo {
        label,
        title,
        url: request.entry_url,
        reused: false,
        chrome,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_window_label_is_stable_and_sanitized() {
        assert_eq!(
            build_agent_app_shell_window_label("content-factory-app", "standalone"),
            "agent-app-shell-content-factory-app-standalone"
        );
        assert_eq!(
            build_agent_app_shell_window_label("内容工厂", "runtime backed"),
            "agent-app-shell-unknown-runtime-backed"
        );
    }

    #[test]
    fn shell_window_close_policy_only_applies_to_agent_app_shell_labels() {
        assert!(should_hide_agent_app_shell_window_on_close(
            "agent-app-shell-content-factory-app-standalone"
        ));
        let standalone_runtime = AgentAppShellStandaloneRuntimeEnv {
            app_id: "content-factory-app".to_string(),
            entry_key: "dashboard".to_string(),
            deep_link_scheme: "lime-agent-content-factory-app".to_string(),
        };
        assert!(should_hide_agent_app_shell_window_on_close_for_runtime(
            "main",
            Some(&standalone_runtime),
        ));
        assert!(!should_hide_agent_app_shell_window_on_close_for_runtime(
            "main", None,
        ));
        assert!(!should_hide_agent_app_shell_window_on_close("main"));
        assert!(!should_hide_agent_app_shell_window_on_close(
            "agent-app-shellfish"
        ));
        assert!(!should_hide_agent_app_shell_window_on_close(
            "agent-app-shell-"
        ));
    }

    #[test]
    fn shell_chrome_policy_is_single_app_and_runtime_governed() {
        let chrome = build_agent_app_shell_chrome_info("content-factory-app", "dashboard");

        assert_eq!(chrome.deep_link_scheme, "lime-agent-content-factory-app");
        assert_eq!(chrome.open_entry_key, "dashboard");
        assert_eq!(chrome.close_policy, "hide_to_tray");
        assert_eq!(chrome.menu_item_ids, vec!["open", "check_updates", "quit"]);
        assert!(chrome.tray_enabled);
        assert!(!chrome.multi_app_management);
        assert!(!chrome.runtime_bypass);
    }

    #[test]
    fn shell_standalone_runtime_env_uses_defaults_without_lime_desktop_identity() {
        let runtime = resolve_agent_app_shell_standalone_runtime_env_from(|key| match key {
            STANDALONE_APP_ID_ENV => Some(" content-factory-app ".to_string()),
            _ => None,
        })
        .expect("standalone app id should enable runtime chrome");

        assert_eq!(runtime.app_id, "content-factory-app");
        assert_eq!(runtime.entry_key, "dashboard");
        assert_eq!(runtime.deep_link_scheme, "lime-agent-content-factory-app");
        assert!(
            resolve_agent_app_shell_standalone_runtime_env_from(|_| None).is_none(),
            "没有 standalone app id 时不能启用独立原生 chrome"
        );
    }

    #[test]
    fn shell_deep_link_only_opens_expected_single_app_entry() {
        let url = build_agent_app_shell_deep_link_url("content-factory-app", "dashboard");

        assert_eq!(url, "lime-agent-content-factory-app://open?entry=dashboard");
        assert_eq!(
            parse_agent_app_shell_deep_link_url("content-factory-app", &url).unwrap(),
            AgentAppShellDeepLinkOpenRequest {
                app_id: "content-factory-app".to_string(),
                entry_key: "dashboard".to_string(),
            }
        );
        assert!(
            parse_agent_app_shell_deep_link_url("other-app", &url).is_err(),
            "不同 App 的 deep link scheme 不能串用"
        );
        assert!(
            parse_agent_app_shell_deep_link_url(
                "content-factory-app",
                "lime-agent-content-factory-app://settings?entry=dashboard",
            )
            .is_err(),
            "standalone shell 只允许 open 单入口 action"
        );
    }

    #[test]
    fn shell_deep_link_router_accepts_agent_app_scheme_without_desktop_lime_prefix() {
        let url = "lime-agent-content-factory-app://open?entry=dashboard";

        assert!(is_agent_app_shell_deep_link_url(url));
        assert!(!is_agent_app_shell_deep_link_url(
            "lime://connect?token=abc"
        ));
        assert_eq!(
            parse_agent_app_shell_deep_link_url_any(url).unwrap(),
            AgentAppShellDeepLinkOpenRequest {
                app_id: "content-factory-app".to_string(),
                entry_key: "dashboard".to_string(),
            }
        );
        assert!(
            parse_agent_app_shell_deep_link_url_any(
                "lime-agent-content-factory-app://settings?entry=dashboard",
            )
            .is_err(),
            "standalone shell deep link 不能打开 Desktop settings 或多 App 管理动作"
        );
    }

    #[test]
    fn shell_native_menu_actions_are_namespaced_per_app() {
        let about = build_agent_app_shell_native_menu_item_id(
            "content-factory-app",
            AgentAppShellNativeAction::AboutApp,
        );
        let open = build_agent_app_shell_native_menu_item_id(
            "content-factory-app",
            AgentAppShellNativeAction::OpenPrimaryEntry,
        );
        let check_updates = build_agent_app_shell_native_menu_item_id(
            "content-factory-app",
            AgentAppShellNativeAction::CheckUpdates,
        );

        assert_eq!(about, "agent-app-shell:content-factory-app:about");
        assert_eq!(open, "agent-app-shell:content-factory-app:open");
        assert_eq!(
            resolve_agent_app_shell_native_menu_action("content-factory-app", &about),
            Some(AgentAppShellNativeAction::AboutApp)
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_action("content-factory-app", &open),
            Some(AgentAppShellNativeAction::OpenPrimaryEntry)
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_action("content-factory-app", &check_updates),
            Some(AgentAppShellNativeAction::CheckUpdates)
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_action("other-app", &open),
            None
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_action("content-factory-app", "open-window"),
            None
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_event(&check_updates),
            Some(AgentAppShellNativeMenuEvent {
                app_id: "content-factory-app".to_string(),
                item_id: "agent-app-shell:content-factory-app:check_updates".to_string(),
                action: AgentAppShellNativeAction::CheckUpdates,
            })
        );
        assert_eq!(
            resolve_agent_app_shell_native_menu_event("lime:open-window"),
            None,
            "Agent App shell 菜单事件不能误接 Desktop 菜单命名空间"
        );
    }

    #[test]
    fn shell_native_menu_spec_uses_label_keys_and_forbids_desktop_management() {
        let spec = build_agent_app_shell_native_menu_spec("content-factory-app", "Content Factory");

        assert_eq!(spec.app_id, "content-factory-app");
        assert_eq!(spec.app_name, "Content Factory");
        assert!(!spec.multi_app_management);
        assert!(!spec.runtime_bypass);
        assert_eq!(
            spec.items
                .iter()
                .map(|item| item.label_key.as_str())
                .collect::<Vec<_>>(),
            vec![
                "agentApp.shell.menu.about",
                "agentApp.shell.menu.open",
                "agentApp.shell.menu.checkUpdates",
                "agentApp.shell.menu.quit",
            ]
        );
        assert_eq!(
            spec.items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "agent-app-shell:content-factory-app:about",
                "agent-app-shell:content-factory-app:open",
                "agent-app-shell:content-factory-app:check_updates",
                "agent-app-shell:content-factory-app:quit",
            ]
        );
    }

    #[test]
    fn shell_native_tray_spec_is_single_app_and_uses_same_namespaced_actions() {
        let spec = build_agent_app_shell_native_tray_spec("content-factory-app", "Content Factory");

        assert_eq!(spec.app_id, "content-factory-app");
        assert_eq!(spec.tooltip, "Content Factory");
        assert!(!spec.multi_app_management);
        assert!(!spec.runtime_bypass);
        assert_eq!(
            spec.items
                .iter()
                .map(|item| item.label_key.as_str())
                .collect::<Vec<_>>(),
            vec![
                "agentApp.shell.menu.open",
                "agentApp.shell.menu.checkUpdates",
                "agentApp.shell.menu.quit",
            ]
        );
        assert_eq!(
            spec.items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "agent-app-shell:content-factory-app:open",
                "agent-app-shell:content-factory-app:check_updates",
                "agent-app-shell:content-factory-app:quit",
            ]
        );
    }

    #[test]
    fn shell_native_chrome_spec_combines_menu_tray_deep_link_and_close_policy() {
        let spec = build_agent_app_shell_native_chrome_spec(
            "content-factory-app",
            "Content Factory",
            "dashboard",
        );

        assert_eq!(spec.app_id, "content-factory-app");
        assert_eq!(spec.app_name, "Content Factory");
        assert_eq!(spec.deep_link_scheme, "lime-agent-content-factory-app");
        assert_eq!(spec.close_policy, "hide_to_tray");
        assert!(!spec.multi_app_management);
        assert!(!spec.runtime_bypass);
        assert_eq!(spec.menu.items.len(), 4);
        assert_eq!(spec.tray.items.len(), 3);
        assert!(spec
            .tray
            .items
            .iter()
            .all(|item| resolve_agent_app_shell_native_menu_event(&item.id).is_some()));
    }

    #[test]
    fn shell_window_url_only_allows_http_or_https() {
        assert!(parse_shell_window_url("http://127.0.0.1:4199/dashboard").is_ok());
        assert!(parse_shell_window_url("https://localhost/app").is_ok());
        assert!(parse_shell_window_url("file:///tmp/app.html").is_err());
        assert!(parse_shell_window_url("not a url").is_err());
    }
}
