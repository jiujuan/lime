//! 应用运行器模块
//!
//! 包含 Tauri 应用的主入口函数和命令注册。

use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg(desktop)]
use tauri::Listener;
#[cfg(target_os = "windows")]
use winapi::um::winuser::{MessageBoxW, MB_ICONERROR, MB_OK};

use crate::commands;
use crate::tray::{TrayIconStatus, TrayManager, TrayStateSnapshot};

use super::bootstrap::{self, AppStates};
use super::commands as app_commands;
use super::types::{AppState, TrayManagerState};

const MAIN_WINDOW_LABEL: &str = "main";
const SKIP_STARTUP_WINDOW_REVEAL_ENV: &str = "LIME_SKIP_STARTUP_WINDOW_REVEAL";
const DISABLE_SINGLE_INSTANCE_ENV: &str = "LIME_DISABLE_SINGLE_INSTANCE";
const STARTUP_WINDOW_REVEAL_FALLBACK_DELAY_MS: u64 = 2_500;

fn env_flag_enabled(key: &str) -> bool {
    matches!(
        std::env::var(key)
            .ok()
            .as_deref()
            .map(str::trim)
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1") | Some("true") | Some("yes") | Some("on")
    )
}

fn should_reveal_main_window_on_startup() -> bool {
    !env_flag_enabled(SKIP_STARTUP_WINDOW_REVEAL_ENV)
}

fn should_enable_single_instance() -> bool {
    !env_flag_enabled(DISABLE_SINGLE_INSTANCE_ENV)
}

fn should_forward_deep_link_argument(value: &str) -> bool {
    value.starts_with("lime://")
        || crate::services::agent_app_shell_window::is_agent_app_shell_deep_link_url(value)
}

fn should_minimize_to_tray(window_label: &str, minimize_to_tray: bool) -> bool {
    minimize_to_tray && window_label == MAIN_WINDOW_LABEL
}

fn should_hide_window_on_close(window_label: &str, minimize_to_tray: bool) -> bool {
    crate::services::agent_app_shell_window::should_hide_agent_app_shell_window_on_close(
        window_label,
    ) || should_minimize_to_tray(window_label, minimize_to_tray)
}

fn report_fatal_startup_error(stage: &str, error: &str) {
    let message = format!("Lime 启动失败（{stage}）\n\n{error}");
    tracing::error!("{message}");
    eprintln!("{message}");
    show_fatal_startup_dialog("Lime 启动失败", &message);
}

#[cfg(target_os = "windows")]
fn show_fatal_startup_dialog(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::iter;
    use std::os::windows::ffi::OsStrExt;

    fn to_wide(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(iter::once(0))
            .collect()
    }

    let title_wide = to_wide(title);
    let message_wide = to_wide(message);

    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message_wide.as_ptr(),
            title_wide.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_startup_dialog(_title: &str, _message: &str) {}

/// 运行 Tauri 应用
///
/// 这是应用的主入口点，负责：
/// 1. 加载和验证配置
/// 2. 初始化所有应用状态
/// 3. 配置 Tauri Builder（插件、状态管理、事件处理）
/// 4. 注册所有 Tauri 命令
/// 5. 启动应用
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _profiling_guard = crate::profiling::init();

    // 加载并验证配置
    let config = match bootstrap::load_and_validate_config() {
        Ok(cfg) => cfg,
        Err(err) => {
            report_fatal_startup_error("加载配置", &err.to_string());
            return;
        }
    };

    tauri::async_runtime::block_on(
        crate::services::environment_service::apply_configured_environment(&config),
    );

    // 初始化崩溃上报（保持 guard 生命周期直到应用退出）
    let _crash_reporting_guard = crate::crash_reporting::init_from_config(&config);

    // 初始化所有应用状态
    let states = match bootstrap::init_states(&config) {
        Ok(s) => s,
        Err(err) => {
            report_fatal_startup_error("初始化应用状态", &err);
            return;
        }
    };

    // 解构状态以便使用
    let AppStates {
        state,
        logs,
        db,
        skill_service: skill_service_state,
        api_key_provider_service: api_key_provider_service_state,
        machine_id_service: machine_id_service_state,
        telemetry: telemetry_state,
        aster_agent: aster_agent_state,
        connect_state,
        model_registry: model_registry_state,
        global_config_manager: global_config_manager_state,
        webview_manager: webview_manager_state,
        chrome_profile_manager: chrome_profile_manager_state,
        update_check_service: update_check_service_state,
        context_memory_service,
        recording_service,
        mcp_manager: mcp_manager_state,
        automation_service: automation_service_state,
        shared_stats,
        shared_tokens,
        shared_logger,
    } = states;

    // Clone for setup hook
    let state_clone = state.clone();
    let logs_clone = logs.clone();
    let db_clone = db.clone();
    #[cfg(debug_assertions)]
    let api_key_provider_service_clone = api_key_provider_service_state.0.clone();
    #[cfg(debug_assertions)]
    let connect_state_clone = connect_state.0.clone();
    #[cfg(debug_assertions)]
    let model_registry_clone = model_registry_state.clone();
    #[cfg(debug_assertions)]
    let skill_service_clone = skill_service_state.0.clone();
    let shared_stats_clone = shared_stats.clone();
    let shared_tokens_clone = shared_tokens.clone();
    let shared_logger_clone = shared_logger.clone();
    let update_check_service_clone = update_check_service_state.clone();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ));

    // 在桌面端注册 Deep Link 插件
    // _Requirements: 1.4_
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_deep_link::init());
    }

    #[cfg(target_os = "macos")]
    {
        if crate::services::agent_app_shell_window::resolve_agent_app_shell_standalone_runtime_env()
            .is_some()
        {
            builder = builder.menu(
                crate::services::agent_app_shell_window::build_agent_app_shell_macos_app_menu,
            );
        } else {
            builder = builder.menu(super::window_chrome::build_lime_app_menu);
        }
    }

    if should_enable_single_instance() {
        builder = builder
            // 单实例插件：当第二个实例启动时，将 URL 传递给第一个实例
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                tracing::info!("[单实例] 收到来自新实例的参数: {:?}", args);

                // 将窗口带到前台
                if should_reveal_main_window_on_startup() {
                    if let Some(window) = app.get_webview_window("main") {
                        super::window_chrome::reveal_main_window(&window, "启动");
                    }
                } else {
                    tracing::info!("[启动] 已跳过主窗口展示流程（headless smoke 模式）");
                }

                let deep_link_urls: Vec<String> = args
                    .iter()
                    .filter_map(|arg| {
                        let value = arg.trim();
                        if should_forward_deep_link_argument(value) {
                            Some(value.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();

                if !deep_link_urls.is_empty() {
                    tracing::info!("[单实例] 转发 Deep Link URL: {:?}", deep_link_urls);
                    if let Err(error) = app.emit("deep-link://new-url", &deep_link_urls) {
                        tracing::error!("[单实例] 转发 Deep Link URL 失败: {}", error);
                    }
                }
            }));
    } else {
        tracing::info!("[启动] 已禁用单实例插件（当前会话允许并行实例）");
    }

    let run_result = builder
        .manage(state)
        .manage(logs)
        .manage(db)
        .manage(skill_service_state)
        .manage(api_key_provider_service_state)
        .manage(machine_id_service_state)
        .manage(telemetry_state)
        .manage(aster_agent_state)
        .manage(connect_state)
        .manage(model_registry_state)
        .manage(global_config_manager_state)
        .manage(webview_manager_state)
        .manage(chrome_profile_manager_state)
        .manage(update_check_service_state)
        .manage(context_memory_service)
        .manage(recording_service)
        .manage(mcp_manager_state)
        .manage(automation_service_state)
        .manage(crate::services::companion_service::CompanionServiceState::default())
        .manage(lime_gateway::telegram::TelegramGatewayState::default())
        .manage(lime_gateway::discord::DiscordGatewayState::default())
        .manage(lime_gateway::feishu::FeishuGatewayState::default())
        .manage(lime_gateway::wechat::WechatGatewayState::default())
        .manage(lime_gateway::wechat::WechatLoginState::default())
        .on_window_event(move |window, event| {
            // 处理窗口关闭事件
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let window_label = window.label().to_string();
                // 获取配置，检查是否启用最小化到托盘
                let app_handle = window.app_handle();
                if let Some(app_state) = app_handle.try_state::<AppState>() {
                    // 使用 block_on 同步获取配置
                    let minimize_to_tray = tauri::async_runtime::block_on(async {
                        let state = app_state.read().await;
                        state.config.minimize_to_tray
                    });

                    if should_hide_window_on_close(&window_label, minimize_to_tray) {
                        // 阻止默认关闭行为
                        api.prevent_close();
                        // 隐藏窗口而不是关闭
                        if let Err(e) = window.hide() {
                            tracing::error!("[窗口] 隐藏窗口失败: {}", e);
                        } else {
                            tracing::info!("[窗口] 窗口已最小化到托盘");
                        }
                    }
                }
            }
        })
        .setup(move |app| {
            // 启动时沿用固定初始窗口尺寸，避免隐藏窗口最大化在展示后才生效造成首帧跳动。
            if let Some(main_window) = app.get_webview_window("main") {
                super::window_chrome::apply_main_window_chrome(&main_window);

                if should_reveal_main_window_on_startup() {
                    super::window_chrome::prepare_main_window_for_startup(&main_window, "启动");

                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(tokio::time::Duration::from_millis(
                            STARTUP_WINDOW_REVEAL_FALLBACK_DELAY_MS,
                        ))
                        .await;

                        if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                            match window.is_visible() {
                                Ok(true) => {}
                                Ok(false) => {
                                    tracing::warn!(
                                        "[启动] 前端首帧未主动展示主窗口，执行兜底展示"
                                    );
                                    super::window_chrome::reveal_prepared_main_window(
                                        &window,
                                        "启动兜底",
                                    );
                                }
                                Err(error) => {
                                    tracing::warn!(
                                        "[启动] 读取主窗口可见状态失败，执行兜底展示: {}",
                                        error
                                    );
                                    super::window_chrome::reveal_prepared_main_window(
                                        &window,
                                        "启动兜底",
                                    );
                                }
                            }
                        }
                    });
                } else {
                    tracing::info!("[启动] 已跳过主窗口展示流程（headless smoke 模式）");
                }

                #[cfg(debug_assertions)]
                if env_flag_enabled("LIME_OPEN_WEBVIEW_DEVTOOLS") {
                    main_window.open_devtools();
                    tracing::info!("[Profiling] 已自动打开主窗口 WebView DevTools");
                }
            } else {
                tracing::warn!("[启动] 未找到主窗口，无法执行启动展示流程");
            }

            #[cfg(target_os = "windows")]
            {
                crate::services::windows_startup_service::maybe_show_windows_startup_notice(
                    &app.handle(),
                );
            }

            // 初始化托盘管理器。AgentAPP standalone 使用单 App 原生托盘，避免继承 Lime Desktop 多 App 菜单。
            if crate::services::agent_app_shell_window::resolve_agent_app_shell_standalone_runtime_env()
                .is_some()
            {
                match crate::services::agent_app_shell_window::create_agent_app_shell_native_chrome_manager(app.handle()) {
                    Ok(Some(native_chrome)) => {
                        let tray_id = native_chrome.tray_id().to_string();
                        let app_id = native_chrome.app_id().to_string();
                        app.manage(native_chrome);
                        tracing::info!(
                            "[启动] Agent App Shell 原生 chrome 已初始化: app_id={} tray_id={}",
                            app_id,
                            tray_id
                        );
                    }
                    Ok(None) => {
                        tracing::warn!(
                            "[启动] Agent App Shell standalone 环境缺失，跳过原生 chrome"
                        );
                    }
                    Err(error) => {
                        tracing::error!(
                            "[启动] Agent App Shell 原生 chrome 初始化失败: {}",
                            error
                        );
                    }
                }
                let tray_state: TrayManagerState<tauri::Wry> =
                    TrayManagerState(Arc::new(tokio::sync::RwLock::new(None)));
                app.manage(tray_state);
            } else {
                // Requirements 1.4: Lime Desktop 启动时显示停止状态图标
                match TrayManager::new(app.handle()) {
                    Ok(tray_manager) => {
                        tracing::info!("[启动] 托盘管理器初始化成功");
                        // 将托盘管理器存储到应用状态中
                        let tray_state: TrayManagerState<tauri::Wry> =
                            TrayManagerState(Arc::new(tokio::sync::RwLock::new(Some(tray_manager))));
                        app.manage(tray_state);
                    }
                    Err(e) => {
                        tracing::error!("[启动] 托盘管理器初始化失败: {}", e);
                        // 即使托盘初始化失败，应用仍然可以运行
                        let tray_state: TrayManagerState<tauri::Wry> =
                            TrayManagerState(Arc::new(tokio::sync::RwLock::new(None)));
                        app.manage(tray_state);
                    }
                }
            }

            // 设置 GlobalConfigManager 的事件发射器（用于向前端发送事件）
            if let Some(config_manager) =
                app.try_state::<crate::config::GlobalConfigManagerState>()
            {
                let emitter = std::sync::Arc::new(
                    crate::config::observer::TauriConfigEmitter::new(app.handle().clone()),
                );
                config_manager.0.set_emitter(emitter);
                tracing::info!("[启动] GlobalConfigManager 事件发射器已设置");
            }

            // 设置 MCP Manager 的事件发射器（用于发送 mcp:* 事件）
            if let Some(mcp_manager) = app.try_state::<crate::mcp::McpManagerState>() {
                let app_handle = app.handle().clone();
                let emitter = lime_core::DynEmitter::new(
                    crate::app::TauriEventEmitter(app_handle),
                );
                tauri::async_runtime::block_on(async {
                    let mut manager = mcp_manager.lock().await;
                    manager.set_emitter(emitter);
                });
                tracing::info!("[启动] MCP Manager 事件发射器已设置");
            }

            let startup_runtime_resume = {
                let aster_agent_state = app.try_state::<crate::agent::AsterAgentState>();
                let db_state = app.try_state::<crate::database::DbConnection>();
                let api_key_provider_service =
                    app.try_state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
                let log_state = app.try_state::<crate::LogState>();
                let config_manager = app.try_state::<crate::config::GlobalConfigManagerState>();
                let mcp_manager = app.try_state::<crate::mcp::McpManagerState>();
                let automation_state =
                    app.try_state::<crate::services::automation_service::AutomationServiceState>();

                match (
                    aster_agent_state,
                    db_state,
                    api_key_provider_service,
                    log_state,
                    config_manager,
                    mcp_manager,
                    automation_state,
                ) {
                    (
                        Some(aster_agent_state),
                        Some(db_state),
                        Some(api_key_provider_service),
                        Some(log_state),
                        Some(config_manager),
                        Some(mcp_manager),
                        Some(automation_state),
                    ) => Some((
                        app.handle().clone(),
                        aster_agent_state.inner().clone(),
                        db_state.inner().clone(),
                        crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState(
                            api_key_provider_service.0.clone(),
                        ),
                        log_state.inner().clone(),
                        crate::config::GlobalConfigManagerState(
                            config_manager.0.clone(),
                        ),
                        mcp_manager.inner().clone(),
                        automation_state.inner().clone(),
                    )),
                    _ => None,
                }
            };

            if let Some((
                app_handle,
                state,
                db,
                api_key_provider_service,
                logs,
                config_manager,
                mcp_manager,
                automation_state,
            )) = startup_runtime_resume
            {
                tauri::async_runtime::spawn(async move {
                    match crate::commands::aster_agent_cmd::resume_persisted_runtime_queues_on_startup(
                        app_handle,
                        &state,
                        &db,
                        &api_key_provider_service,
                        &logs,
                        &config_manager,
                        &mcp_manager,
                        &automation_state,
                    )
                    .await
                    {
                        Ok(resumed) if resumed > 0 => {
                            tracing::info!("[启动] 已恢复 {} 个会话的排队执行", resumed);
                        }
                        Ok(_) => {
                            tracing::debug!("[启动] 无需恢复持久化排队执行");
                        }
                        Err(error) => {
                            tracing::warn!("[启动] 恢复持久化排队执行失败: {}", error);
                        }
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                let app_handle = app.handle().clone();
                let server_state = state_clone.clone();
                let logs = logs_clone.clone();
                let db = Some(db_clone.clone());
                let api_key_provider_service = api_key_provider_service_clone.clone();
                let connect_state = connect_state_clone.clone();
                let model_registry = model_registry_clone.clone();
                let skill_service = skill_service_clone.clone();
                let shared_stats = shared_stats_clone.clone();

                tauri::async_runtime::spawn(async move {
                    match crate::dev_bridge::DevBridgeServer::start(
                        app_handle,
                        server_state,
                        logs,
                        db,
                        api_key_provider_service,
                        connect_state,
                        model_registry,
                        skill_service,
                        shared_stats,
                        None,
                    )
                    .await
                    {
                        Ok(()) => tracing::info!("[启动] Dev Bridge 已启动"),
                        Err(error) => tracing::error!("[启动] Dev Bridge 启动失败: {}", error),
                    }
                });
            }

            // 初始化语音输入模块
            {
                let app_handle = app.handle();
                match crate::voice::init(app_handle) {
                    Ok(()) => {
                        tracing::info!("[启动] 语音输入模块初始化成功");
                    }
                    Err(e) => {
                        tracing::error!("[启动] 语音输入模块初始化失败: {}", e);
                        // 语音模块初始化失败不影响应用运行
                    }
                }
            }

            // 初始化 Connect 状态
            // _Requirements: 1.4, 2.1_
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let app_data_dir = lime_core::app_paths::best_effort_data_dir();

                    // 初始化 Connect 状态
                    match crate::app::connect_state::init_connect_state(app_data_dir).await {
                        Ok(connect_state_inner) => {
                            tracing::info!("[启动] Connect 模块初始化成功");
                            // 更新状态
                            if let Some(state) = app_handle
                                .try_state::<crate::app::connect_state::ConnectStateWrapper>()
                            {
                                let mut guard = state.0.write().await;
                                *guard = Some(connect_state_inner);
                            }
                        }
                        Err(e) => {
                            tracing::error!("[启动] Connect 模块初始化失败: {:?}", e);
                        }
                    }
                });
            }

            // 初始化 Model Registry 服务
            {
                let app_handle = app.handle().clone();
                let db_clone = db_clone.clone();

                tauri::async_runtime::spawn(async move {
                    // 创建 ModelRegistryService
                    let service = lime_services::model_registry_service::ModelRegistryService::new(db_clone);

                    // 初始化服务
                    match service.initialize().await {
                        Ok(()) => {
                            tracing::info!("[启动] Model Registry 服务初始化成功");
                            // 更新状态
                            if let Some(state) = app_handle
                                .try_state::<crate::commands::model_registry_cmd::ModelRegistryState>()
                            {
                                let mut guard = state.write().await;
                                *guard = Some(service);
                            }
                        }
                        Err(e) => {
                            tracing::error!("[启动] Model Registry 服务初始化失败: {}", e);
                        }
                    }
                });
            }

            // 注册 Deep Link 事件处理器（桌面端）
            // _Requirements: 1.4_
            #[cfg(desktop)]
            {
                app.on_menu_event(|app, event| {
                    let item_id = event.id().as_ref();
                    if crate::services::agent_app_shell_window::handle_agent_app_shell_native_menu_event(
                        app, item_id,
                    ) {
                        tracing::info!("[Agent App Shell] 已处理 native menu 事件: {}", item_id);
                    }
                });

                let app_handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    let urls = event.payload().to_string();
                    tracing::info!("[Deep Link] 收到 URL: {}", urls);
                    // 解析 URL 并处理
                    let app_handle_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                            // 尝试解析为 JSON 数组（Tauri deep-link 插件返回的格式）
                            if let Ok(url_list) = serde_json::from_str::<Vec<String>>(&urls) {
                                for url in url_list {
                                    if crate::services::agent_app_shell_window::is_agent_app_shell_deep_link_url(&url) {
                                        match crate::services::agent_app_shell_window::handle_agent_app_shell_deep_link_url(&app_handle_clone, &url) {
                                            Ok(request) => {
                                                tracing::info!(
                                                    "[Agent App Shell] 已处理 deep link: app_id={} entry_key={}",
                                                    request.app_id,
                                                    request.entry_key
                                                );
                                            }
                                            Err(error) => {
                                                tracing::error!(
                                                    "[Agent App Shell] 解析 deep link 失败: {}",
                                                    error
                                                );
                                                let _ = app_handle_clone.emit(
                                                    "agent-app-shell://deep-link-error",
                                                    &format!("{error}"),
                                                );
                                            }
                                        }
                                        continue;
                                    }
                                    if url.starts_with("lime://connect") {
                                        // 直接走 current connect 解析链路。
                                        if let Some(state) = app_handle_clone
                                            .try_state::<crate::app::connect_state::ConnectStateWrapper>()
                                        {
                                            match crate::connect::parse_deep_link(&url) {
                                                Ok(payload) => {
                                                    // 查询中转商信息
                                                    let (relay_info, is_verified) = {
                                                        let state_guard = state.0.read().await;
                                                        if let Some(connect_state) = state_guard.as_ref() {
                                                            let info = connect_state.registry.get(&payload.relay);
                                                            let verified = info.is_some();
                                                            (info, verified)
                                                        } else {
                                                            (None, false)
                                                        }
                                                    };

                                                    let result = crate::app::connect_state::DeepLinkResult {
                                                        payload,
                                                        relay_info,
                                                        is_verified,
                                                    };

                                                    // 发送事件到前端
                                                    if let Err(e) = app_handle_clone.emit("deep-link-connect", &result) {
                                                        tracing::error!("[Deep Link] 发送事件失败: {}", e);
                                                    }
                                                }
                                                Err(e) => {
                                                    tracing::error!("[Deep Link] 解析 URL 失败: {:?}", e);
                                                    // 发送错误事件到前端
                                                    let _ = app_handle_clone.emit("deep-link-error", &format!("{e:?}"));
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if crate::services::agent_app_shell_window::is_agent_app_shell_deep_link_url(&urls) {
                                match crate::services::agent_app_shell_window::handle_agent_app_shell_deep_link_url(&app_handle_clone, &urls) {
                                    Ok(request) => {
                                        tracing::info!(
                                            "[Agent App Shell] 已处理 deep link: app_id={} entry_key={}",
                                            request.app_id,
                                            request.entry_key
                                        );
                                    }
                                    Err(error) => {
                                        tracing::error!(
                                            "[Agent App Shell] 解析 deep link 失败: {}",
                                            error
                                        );
                                        let _ = app_handle_clone.emit(
                                            "agent-app-shell://deep-link-error",
                                            &format!("{error}"),
                                        );
                                    }
                                }
                            } else if urls.starts_with("lime://connect") {
                                // 直接处理单个 URL
                                if let Some(state) = app_handle_clone
                                    .try_state::<crate::app::connect_state::ConnectStateWrapper>()
                                {
                                    match crate::connect::parse_deep_link(&urls) {
                                        Ok(payload) => {
                                            let (relay_info, is_verified) = {
                                                let state_guard = state.0.read().await;
                                                if let Some(connect_state) = state_guard.as_ref() {
                                                    let info = connect_state.registry.get(&payload.relay);
                                                    let verified = info.is_some();
                                                    (info, verified)
                                                } else {
                                                    (None, false)
                                                }
                                            };

                                            let result = crate::app::connect_state::DeepLinkResult {
                                                payload,
                                                relay_info,
                                                is_verified,
                                            };

                                            if let Err(e) = app_handle_clone.emit("deep-link-connect", &result) {
                                                tracing::error!("[Deep Link] 发送事件失败: {}", e);
                                            }
                                        }
                                        Err(e) => {
                                            tracing::error!("[Deep Link] 解析 URL 失败: {:?}", e);
                                            let _ = app_handle_clone.emit("deep-link-error", &format!("{e:?}"));
                                        }
                                    }
                                }
                            }
                        });
                });
            }

            // 自动启动服务器
            let state = state_clone.clone();
            let logs = logs_clone.clone();
            let db = db_clone.clone();
            let shared_stats = shared_stats_clone.clone();
            let shared_tokens = shared_tokens_clone.clone();
            let shared_logger = shared_logger_clone.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 启动服务器（使用共享的遥测实例）
                {
                    let mut s = state.write().await;
                    logs.write()
                        .await
                        .add("info", "[启动] 正在自动启动服务器...");
                    match s
                        .start_with_telemetry(
                            logs.clone(),
                            Some(db),
                            Some(shared_stats),
                            Some(shared_tokens),
                            Some(shared_logger),
                        )
                        .await
                    {
                        Ok(_) => {
                            // 使用 status() 获取实际使用的地址（可能已经自动切换到有效的 IP）
                            let status = s.status();
                            let host = status.host;
                            let port = status.port;
                            logs.write()
                                .await
                                .add("info", &format!("[启动] 服务器已启动: {host}:{port}"));
                        }
                        Err(e) => {
                            logs.write()
                                .await
                                .add("error", &format!("[启动] 服务器启动失败: {e}"));
                        }
                    }
                }

                // 更新托盘状态
                if let Some(tray_state) = app_handle.try_state::<TrayManagerState<tauri::Wry>>() {
                    let tray_guard = tray_state.0.read().await;
                    if let Some(tray_manager) = tray_guard.as_ref() {
                        let current_state = tray_manager.get_state().await;
                        let icon_status = TrayIconStatus::Running;

                        let snapshot = TrayStateSnapshot {
                            icon_status,
                            today_requests: current_state.today_requests,
                            auto_start_enabled: current_state.auto_start_enabled,
                            current_model_provider_type: current_state.current_model_provider_type,
                            current_model_provider_label: current_state
                                .current_model_provider_label,
                            current_model: current_state.current_model,
                            current_theme_label: current_state.current_theme_label,
                            quick_model_groups: current_state.quick_model_groups,
                        };

                        if let Err(e) = tray_manager.update_state(snapshot).await {
                            tracing::error!("[启动] 更新托盘状态失败: {}", e);
                        } else {
                            tracing::info!("[启动] 托盘状态已更新");
                        }
                    }
                }
            });

            // 启动会话文件清理任务（清理 30 天前的过期会话）
            tauri::async_runtime::spawn(async move {
                // 延迟 10 秒执行，避免影响启动性能
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

                match crate::session_files::SessionFileStorage::new() {
                    Ok(storage) => {
                        // 清理过期会话（30 天）
                        match storage.cleanup_expired(30) {
                            Ok(count) if count > 0 => {
                                tracing::info!("[启动] 已清理 {} 个过期会话", count);
                            }
                            Ok(_) => {
                                tracing::debug!("[启动] 无过期会话需要清理");
                            }
                            Err(e) => {
                                tracing::warn!("[启动] 清理过期会话失败: {}", e);
                            }
                        }
                        // 清理空会话
                        match storage.cleanup_empty() {
                            Ok(count) if count > 0 => {
                                tracing::info!("[启动] 已清理 {} 个空会话", count);
                            }
                            Ok(_) => {}
                            Err(e) => {
                                tracing::warn!("[启动] 清理空会话失败: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("[启动] 会话文件存储初始化失败: {}", e);
                    }
                }
            });

            // 初始化自动化调度服务（设置 AppHandle 并根据配置自动启动）
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // 组件监督器：自动化调度服务启动失败时自动重试
                    let max_retries = 3;
                    let mut retry_count = 0;
                    let mut retry_delay = tokio::time::Duration::from_secs(5);

                    loop {
                        if retry_count >= max_retries {
                            tracing::error!("[启动] 自动化调度服务启动重试次数已达上限，放弃启动");
                            break;
                        }

                        tokio::time::sleep(retry_delay).await;

                        if let Some(automation_state) = app_handle
                            .try_state::<crate::services::automation_service::AutomationServiceState>()
                        {
                            let mut service = automation_state.0.write().await;
                            service.set_app_handle(app_handle.clone());

                            if service.get_config().enabled {
                                let self_ref = automation_state.0.clone();
                                match service.start(self_ref).await {
                                    Ok(()) => {
                                        tracing::info!("[启动] 自动化调度服务已自动启动（尝试 {}/{}）", retry_count + 1, max_retries);
                                        break;
                                    }
                                    Err(e) => {
                                        tracing::warn!("[启动] 自动化调度服务启动失败（尝试 {}/{}）: {}", retry_count + 1, max_retries, e);
                                        retry_count += 1;
                                        retry_delay = retry_delay.saturating_mul(2);
                                    }
                                }
                            } else {
                                tracing::info!("[启动] 自动化调度服务已禁用，跳过启动");
                                break;
                            }
                        } else {
                            tracing::error!("[启动] 无法获取 AutomationServiceState");
                            break;
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Server commands (from app::commands)
            // Config commands (from app::commands)
            app_commands::get_endpoint_providers,
            app_commands::set_endpoint_provider,
            // OpenAI Custom commands (from app::commands)
            app_commands::get_openai_custom_status,
            app_commands::set_openai_custom_config,
            // Claude Custom commands (from app::commands)
            app_commands::get_claude_custom_status,
            app_commands::set_claude_custom_config,
            // API test commands (from app::commands)
            app_commands::get_available_models,
            app_commands::check_api_compatibility,
            // Agent App Desktop shell / runtime facade commands
            commands::browser_runtime_cmd::open_browser_runtime_debugger_window,
            commands::browser_runtime_cmd::close_browser_runtime_debugger_window,
            commands::browser_runtime_cmd::launch_browser_session,
            commands::browser_runtime_cmd::launch_browser_runtime_assist,
            // Hint route commands
            commands::security_perf_cmd::get_hint_routes,
            // Machine ID commands
            commands::machine_id_cmd::get_current_machine_id,
            commands::machine_id_cmd::set_machine_id,
            commands::machine_id_cmd::generate_random_machine_id,
            commands::machine_id_cmd::validate_machine_id,
            commands::machine_id_cmd::check_admin_privileges,
            commands::machine_id_cmd::get_os_type,
            commands::machine_id_cmd::backup_machine_id_to_file,
            commands::machine_id_cmd::restore_machine_id_from_file,
            commands::machine_id_cmd::format_machine_id,
            commands::machine_id_cmd::detect_machine_id_format,
            commands::machine_id_cmd::convert_machine_id_format,
            commands::machine_id_cmd::get_machine_id_history,
            commands::machine_id_cmd::clear_machine_id_override,
            commands::machine_id_cmd::copy_machine_id_to_clipboard,
            commands::machine_id_cmd::paste_machine_id_from_clipboard,
            commands::machine_id_cmd::get_system_info,
            commands::agent_cmd::agent_generate_title,
            commands::aster_agent_cmd::tool_runtime::social_tools::social_generate_cover_image_cmd,
            // Model Registry commands
            commands::model_registry_cmd::get_model_registry,
            commands::model_registry_cmd::get_model_registry_provider_ids,
            commands::model_registry_cmd::refresh_model_registry,
            commands::model_registry_cmd::search_models,
            commands::model_registry_cmd::get_model_preferences,
            commands::model_registry_cmd::toggle_model_favorite,
            commands::model_registry_cmd::hide_model,
            commands::model_registry_cmd::record_model_usage,
            commands::model_registry_cmd::get_model_sync_state,
            commands::model_registry_cmd::get_models_for_provider,
            commands::model_registry_cmd::get_models_by_tier,
            commands::model_registry_cmd::get_provider_alias_config,
            commands::model_registry_cmd::get_all_alias_configs,
            // Browser environment preset commands
            commands::browser_environment_cmd::list_browser_environment_presets_cmd,
            commands::browser_environment_cmd::save_browser_environment_preset_cmd,
            commands::browser_environment_cmd::archive_browser_environment_preset_cmd,
            commands::browser_environment_cmd::restore_browser_environment_preset_cmd,
            // Browser connector commands
            commands::browser_connector_cmd::get_browser_connector_settings_cmd,
            commands::browser_connector_cmd::set_browser_connector_install_root_cmd,
            commands::browser_connector_cmd::set_browser_connector_enabled_cmd,
            commands::browser_connector_cmd::set_system_connector_enabled_cmd,
            commands::browser_connector_cmd::set_browser_action_capability_enabled_cmd,
            commands::browser_connector_cmd::get_browser_connector_install_status_cmd,
            commands::browser_connector_cmd::install_browser_connector_extension_cmd,
            commands::browser_connector_cmd::open_browser_extensions_page_cmd,
            commands::browser_connector_cmd::open_browser_remote_debugging_page_cmd,
            commands::browser_connector_cmd::open_browser_connector_guide_window,
            // Browser profile commands
            commands::browser_profile_cmd::list_browser_profiles_cmd,
            commands::browser_profile_cmd::save_browser_profile_cmd,
            commands::browser_profile_cmd::archive_browser_profile_cmd,
            commands::browser_profile_cmd::restore_browser_profile_cmd,
            commands::browser_profile_cmd::launch_browser_profile_runtime_assist_cmd,
            // Sysinfo commands
            crate::services::sysinfo_service::subscribe_sysinfo,
            crate::services::sysinfo_service::unsubscribe_sysinfo,
            // File browser commands
            crate::services::file_browser_service::get_file_name,
            // Webview commands
            commands::webview_cmd::open_chrome_profile_window,
            commands::webview_cmd::get_chrome_profile_sessions,
            commands::webview_cmd::close_chrome_profile_session,
            commands::webview_cmd::cleanup_gui_smoke_chrome_profiles,
            commands::webview_cmd::get_chrome_bridge_endpoint_info,
            commands::webview_cmd::get_chrome_bridge_status,
            commands::webview_cmd::disconnect_browser_connector_session,
            commands::webview_cmd::chrome_bridge_execute_command,
            commands::webview_cmd::get_browser_backends_status,
            commands::webview_cmd::get_browser_backend_policy,
            commands::webview_cmd::set_browser_backend_policy,
            commands::webview_cmd::list_cdp_targets,
            commands::webview_cmd::open_cdp_session,
            commands::webview_cmd::close_cdp_session,
            commands::webview_cmd::start_browser_stream,
            commands::webview_cmd::stop_browser_stream,
            commands::webview_cmd::get_browser_session_state,
            commands::webview_cmd::take_over_browser_session,
            commands::webview_cmd::release_browser_session,
            commands::webview_cmd::resume_browser_session,
            commands::webview_cmd::get_browser_event_buffer,
            commands::webview_cmd::browser_execute_action,
            commands::webview_cmd::get_browser_action_audit_logs,
            // Workspace commands
            commands::workspace_cmd::workspace_list,
            commands::workspace_cmd::workspace_get,
            commands::workspace_cmd::workspace_get_default,
            commands::workspace_cmd::workspace_ensure_ready,
            commands::workspace_cmd::workspace_ensure_default_ready,
            commands::workspace_cmd::workspace_get_by_path,
            commands::workspace_cmd::workspace_get_projects_root,
            commands::workspace_cmd::workspace_resolve_project_path,
            commands::workspace_cmd::get_or_create_default_project,
            commands::workspace_cmd::build_project_system_prompt,
            // Persona commands
            // Memory commands (Character, WorldBuilding, Outline)
            commands::memory_cmd::character_create,
            commands::memory_cmd::character_get,
            commands::memory_cmd::character_list,
            commands::memory_cmd::character_update,
            commands::memory_cmd::character_delete,
            commands::memory_cmd::world_building_get,
            commands::memory_cmd::world_building_update,
            commands::memory_cmd::outline_node_create,
            commands::memory_cmd::outline_node_get,
            commands::memory_cmd::outline_node_list,
            commands::memory_cmd::outline_node_update,
            commands::memory_cmd::outline_node_delete,
            commands::memory_cmd::project_memory_get,
        ])
        .build(tauri::generate_context!())
        .map(|app| {
            app.run(|_app_handle, _event| {
                // Skill package open requests 已迁到 Electron Desktop Host current。
            });
        });

    if let Err(error) = run_result {
        report_fatal_startup_error("启动 Tauri 应用", &error.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::{
        should_enable_single_instance, should_forward_deep_link_argument,
        should_hide_window_on_close, should_minimize_to_tray, DISABLE_SINGLE_INSTANCE_ENV,
    };

    #[test]
    fn should_only_minimize_main_window_to_tray() {
        assert!(should_minimize_to_tray("main", true));
        assert!(!should_minimize_to_tray("secondary-window", true));
        assert!(!should_minimize_to_tray("main", false));
    }

    #[test]
    fn should_hide_agent_app_shell_window_on_close_without_global_tray_setting() {
        assert!(should_hide_window_on_close(
            "agent-app-shell-content-factory-app-standalone",
            false
        ));
        assert!(!should_hide_window_on_close("secondary-window", false));
    }

    #[test]
    fn should_allow_disabling_single_instance_via_env() {
        unsafe {
            std::env::remove_var(DISABLE_SINGLE_INSTANCE_ENV);
        }
        assert!(should_enable_single_instance());

        unsafe {
            std::env::set_var(DISABLE_SINGLE_INSTANCE_ENV, "1");
        }
        assert!(!should_enable_single_instance());

        unsafe {
            std::env::remove_var(DISABLE_SINGLE_INSTANCE_ENV);
        }
    }

    #[test]
    fn should_forward_agent_app_shell_deep_links_to_primary_instance() {
        assert!(should_forward_deep_link_argument(
            "lime://connect?token=abc"
        ));
        assert!(should_forward_deep_link_argument(
            "lime-agent-content-factory-app://open?entry=dashboard"
        ));
        assert!(!should_forward_deep_link_argument(
            "https://lime.local/agent-apps/content-factory-app"
        ));
    }
}
