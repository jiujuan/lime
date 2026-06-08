//! 命令分发器
//!
//! 将 HTTP 请求路由到现有的 Tauri 命令函数。

mod agent_apps;
mod agent_sessions;
mod app_runtime;
mod browser;
mod capability_drafts;
mod channels;
mod companion;
mod content;
mod external_tools;
mod files;
mod knowledge;
mod logs;
mod media_tasks;
mod memory;
mod memory_runtime;
mod models;
mod project_resources;
mod providers;
mod runtime_queries;
mod skills;
mod tray;
mod voice;
mod workspace;

use crate::dev_bridge::DevBridgeState;
use serde::de::DeserializeOwned;
use serde_json::Value as JsonValue;

pub(super) fn get_db(
    state: &DevBridgeState,
) -> Result<&crate::database::DbConnection, Box<dyn std::error::Error>> {
    state
        .db
        .as_ref()
        .ok_or_else(|| "Database not initialized".into())
}

pub(super) fn get_string_arg(
    args: &JsonValue,
    primary: &str,
    secondary: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    args.get(primary)
        .or_else(|| args.get(secondary))
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| format!("缺少参数: {primary}/{secondary}").into())
}

pub(super) fn parse_nested_arg<T: DeserializeOwned>(
    args: &JsonValue,
    key: &str,
) -> Result<T, Box<dyn std::error::Error>> {
    let payload = args.get(key).cloned().unwrap_or_else(|| args.clone());
    Ok(serde_json::from_value(payload)?)
}

pub(super) fn parse_optional_nested_arg<T: DeserializeOwned>(
    args: &JsonValue,
    key: &str,
) -> Result<Option<T>, Box<dyn std::error::Error>> {
    match args.get(key).cloned() {
        Some(value) if value.is_null() => Ok(None),
        Some(value) => Ok(Some(serde_json::from_value(value)?)),
        None => Ok(None),
    }
}

pub(super) fn args_or_default(args: Option<&JsonValue>) -> JsonValue {
    args.cloned().unwrap_or_default()
}

pub(super) fn require_app_handle(
    state: &DevBridgeState,
) -> Result<tauri::AppHandle, Box<dyn std::error::Error>> {
    state
        .app_handle
        .as_ref()
        .cloned()
        .ok_or_else(|| "Dev Bridge 未持有 AppHandle".to_string().into())
}

/// 处理 HTTP 桥接命令请求
///
/// 将命令名和参数分发到对应的命令处理函数
pub async fn handle_command(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    if let Some(result) = app_runtime::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = companion::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = channels::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = logs::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = files::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = external_tools::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = media_tasks::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = knowledge::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = providers::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = voice::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = browser::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = models::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = runtime_queries::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = memory_runtime::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = agent_sessions::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = agent_apps::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = tray::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = workspace::try_handle(state, cmd, args.as_ref())? {
        return Ok(result);
    }

    if let Some(result) = content::try_handle(state, cmd, args.as_ref())? {
        return Ok(result);
    }

    if let Some(result) = project_resources::try_handle(state, cmd, args.as_ref())? {
        return Ok(result);
    }

    if let Some(result) = memory::try_handle(state, cmd, args.as_ref())? {
        return Ok(result);
    }

    if let Some(result) = skills::try_handle(state, cmd, args.as_ref()).await? {
        return Ok(result);
    }

    if let Some(result) = capability_drafts::try_handle(cmd, args.as_ref()).await? {
        return Ok(result);
    }

    Err(format!(
        "[DevBridge] 未知命令: '{cmd}'. 如需此命令，请将其添加到 dispatcher.rs 的 handle_command 函数中。"
    )
    .into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::content_cmd::{ContentDetail, ContentListItem};
    use lime_core::{config::Config, database::schema::create_tables};
    use rusqlite::Connection;
    use std::fs;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use tokio::sync::RwLock;
    use uuid::Uuid;

    fn make_test_db() -> crate::database::DbConnection {
        let conn = Connection::open_in_memory().unwrap();
        create_tables(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    fn make_test_state() -> DevBridgeState {
        let config = Config::default();

        DevBridgeState {
            app_handle: None,
            server: Arc::new(RwLock::new(lime_server::ServerState::new(config.clone()))),
            logs: Arc::new(RwLock::new(crate::logger::create_log_store_from_config(
                &config.logging,
            ))),
            db: Some(make_test_db()),
            api_key_provider_service: Arc::new(
                lime_services::api_key_provider_service::ApiKeyProviderService::new(),
            ),
            connect_state: Arc::new(RwLock::new(None)),
            model_registry: Arc::new(RwLock::new(None)),
            skill_service: Arc::new(lime_services::skill_service::SkillService::new().unwrap()),
            shared_stats: Arc::new(parking_lot::RwLock::new(
                lime_infra::telemetry::StatsAggregator::default(),
            )),
        }
    }

    #[tokio::test]
    async fn workspace_commands_roundtrip() {
        let state = make_test_state();
        let temp_dir = TempDir::new().unwrap();
        let root_path = temp_dir.path().join("social-workbench");

        let created_value = handle_command(
            &state,
            "workspace_create",
            Some(serde_json::json!({
                "request": {
                    "name": "社媒项目",
                    "rootPath": root_path.to_string_lossy().to_string(),
                    "workspaceType": "general"
                }
            })),
        )
        .await
        .unwrap();
        let created_id = created_value["id"].as_str().unwrap().to_string();

        assert_eq!(created_value["name"], "社媒项目");
        assert_eq!(created_value["workspaceType"], "general");

        let list_value = handle_command(&state, "workspace_list", None)
            .await
            .unwrap();
        let list = list_value.as_array().unwrap();

        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["id"], created_id);
    }

    #[tokio::test]
    async fn content_commands_roundtrip() {
        let state = make_test_state();
        let temp_dir = TempDir::new().unwrap();
        let root_path = temp_dir.path().join("content-project");

        let workspace_value = handle_command(
            &state,
            "workspace_create",
            Some(serde_json::json!({
                "request": {
                    "name": "内容项目",
                    "rootPath": root_path.to_string_lossy().to_string(),
                    "workspaceType": "general"
                }
            })),
        )
        .await
        .unwrap();
        let workspace_id = workspace_value["id"].as_str().unwrap().to_string();

        let created_value = handle_command(
            &state,
            "content_create",
            Some(serde_json::json!({
                "request": {
                    "project_id": workspace_id.clone(),
                    "title": "首条社媒文稿",
                    "content_type": "post",
                    "body": "正文内容"
                }
            })),
        )
        .await
        .unwrap();
        let created: ContentDetail = serde_json::from_value(created_value).unwrap();

        assert_eq!(created.title, "首条社媒文稿");
        assert_eq!(created.content_type, "post");

        let list_value = handle_command(
            &state,
            "content_list",
            Some(serde_json::json!({
                "projectId": workspace_id,
            })),
        )
        .await
        .unwrap();
        let list: Vec<ContentListItem> = serde_json::from_value(list_value).unwrap();

        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);
    }

    #[tokio::test]
    async fn retired_file_browser_read_commands_are_not_dev_bridge_facades() {
        let state = make_test_state();
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("preview.txt");
        fs::write(&file_path, "三国人物设定").unwrap();

        for command in ["read_file_preview_cmd", "list_dir"] {
            let error = handle_command(
                &state,
                command,
                Some(serde_json::json!({
                    "path": file_path.to_string_lossy().to_string(),
                    "maxSize": 1024
                })),
            )
            .await
            .expect_err("retired file browser read command should be unknown");

            assert!(error.to_string().contains("[DevBridge] 未知命令"));
        }
    }

    #[tokio::test]
    async fn file_browser_file_name_command_is_bridged() {
        let state = make_test_state();
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("default-source.md");
        fs::write(&file_path, "# Smoke 默认项目资料").unwrap();

        let file_name_value = handle_command(
            &state,
            "get_file_name",
            Some(serde_json::json!({
                "path": file_path.to_string_lossy().to_string(),
            })),
        )
        .await
        .unwrap();
        assert_eq!(file_name_value, "default-source.md");
    }

    #[tokio::test]
    async fn session_files_save_file_command_is_bridged() {
        let state = make_test_state();
        let session_id = format!("devbridge-session-{}", Uuid::new_v4());

        let value = handle_command(
            &state,
            "session_files_save_file",
            Some(serde_json::json!({
                "sessionId": session_id,
                "fileName": "notes/outline.md",
                "content": "# 三国群像",
                "metadata": {
                    "source": "workspace-inline"
                }
            })),
        )
        .await
        .unwrap();

        assert_eq!(value["name"], "notes/outline.md");
        assert_eq!(value["fileType"], "document");
        assert_eq!(value["metadata"]["source"], "workspace-inline");

        let storage = crate::session_files::SessionFileStorage::new().unwrap();
        let saved = storage
            .read_file(&session_id, "notes/outline.md")
            .expect("saved file should be readable");
        assert_eq!(saved, "# 三国群像");

        let _ = storage.delete_session(&session_id);
    }

    #[tokio::test]
    async fn session_files_resolve_file_path_command_is_bridged() {
        let state = make_test_state();
        let session_id = format!("devbridge-session-{}", Uuid::new_v4());
        let storage = crate::session_files::SessionFileStorage::new().unwrap();

        storage
            .save_file(&session_id, "notes/outline.md", "三国群像分镜")
            .unwrap();

        let value = handle_command(
            &state,
            "session_files_resolve_file_path",
            Some(serde_json::json!({
                "sessionId": session_id,
                "fileName": "notes/outline.md"
            })),
        )
        .await
        .unwrap();

        let resolved_path = value.as_str().unwrap();
        assert!(resolved_path.ends_with("notes/outline.md"));
        assert!(std::path::Path::new(resolved_path).exists());

        let _ = storage.delete_session(&session_id);
    }

    #[tokio::test]
    async fn upload_material_command_is_bridged() {
        let state = make_test_state();
        let temp_dir = TempDir::new().unwrap();
        let root_path = temp_dir.path().join("material-project");

        let workspace_value = handle_command(
            &state,
            "workspace_create",
            Some(serde_json::json!({
                "request": {
                    "name": "素材项目",
                    "rootPath": root_path.to_string_lossy().to_string(),
                    "workspaceType": "general"
                }
            })),
        )
        .await
        .unwrap();
        let workspace_id = workspace_value["id"].as_str().unwrap().to_string();

        let value = handle_command(
            &state,
            "upload_material",
            Some(serde_json::json!({
                "req": {
                    "projectId": workspace_id,
                    "name": "三国人物设定.txt",
                    "type": "text",
                    "content": "刘备、关羽、张飞、诸葛亮、曹操、孙权"
                }
            })),
        )
        .await
        .unwrap();

        assert_eq!(value["name"], "三国人物设定.txt");
        assert_eq!(value["type"], "text");
        assert_eq!(value["content"], "刘备、关羽、张飞、诸葛亮、曹操、孙权");
        assert!(value["id"].as_str().is_some());
    }

    #[tokio::test]
    async fn voice_shortcut_status_bridge_query_available() {
        let state = make_test_state();
        let status_value = handle_command(&state, "get_voice_shortcut_runtime_status", None)
            .await
            .unwrap();

        assert!(status_value["shortcut_registered"].is_boolean());
        assert!(status_value["fn_registered"].is_boolean());
    }

    #[tokio::test]
    async fn browser_profile_commands_roundtrip() {
        let state = make_test_state();

        let saved_value = handle_command(
            &state,
            "save_browser_profile_cmd",
            Some(serde_json::json!({
                "request": {
                    "profile_key": "github-attached",
                    "name": "GitHub 已登录 Chrome",
                    "description": "复用当前 Chrome",
                    "site_scope": "github.com",
                    "launch_url": "https://github.com/",
                    "transport_kind": "existing_session"
                }
            })),
        )
        .await
        .unwrap();

        let profile_id = saved_value["id"].as_str().unwrap().to_string();
        assert_eq!(saved_value["profile_key"], "github-attached");
        assert_eq!(saved_value["transport_kind"], "existing_session");

        let active_list = handle_command(
            &state,
            "list_browser_profiles_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(active_list.as_array().unwrap().len(), 1);

        let archived = handle_command(
            &state,
            "archive_browser_profile_cmd",
            Some(serde_json::json!({
                "request": {
                    "id": profile_id
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(archived, serde_json::json!(true));

        let active_list_after_archive = handle_command(
            &state,
            "list_browser_profiles_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert!(active_list_after_archive.as_array().unwrap().is_empty());

        let archived_list = handle_command(
            &state,
            "list_browser_profiles_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": true
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(archived_list.as_array().unwrap().len(), 1);
        assert!(archived_list.as_array().unwrap()[0]["archived_at"]
            .as_str()
            .is_some());

        let restored = handle_command(
            &state,
            "restore_browser_profile_cmd",
            Some(serde_json::json!({
                "request": {
                    "id": archived_list.as_array().unwrap()[0]["id"]
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(restored, serde_json::json!(true));

        let active_list_after_restore = handle_command(
            &state,
            "list_browser_profiles_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(active_list_after_restore.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn browser_environment_preset_commands_roundtrip() {
        let state = make_test_state();

        let saved_value = handle_command(
            &state,
            "save_browser_environment_preset_cmd",
            Some(serde_json::json!({
                "request": {
                    "name": "GitHub 搜索环境",
                    "description": "用于仓库线索检索",
                    "timezone_id": "Asia/Shanghai",
                    "locale": "zh_CN",
                    "accept_language": "zh-CN,zh;q=0.9",
                    "viewport_width": 1440,
                    "viewport_height": 960,
                    "device_scale_factor": 1.25
                }
            })),
        )
        .await
        .unwrap();

        let preset_id = saved_value["id"].as_str().unwrap().to_string();
        assert_eq!(saved_value["name"], "GitHub 搜索环境");
        assert_eq!(saved_value["timezone_id"], "Asia/Shanghai");

        let active_list = handle_command(
            &state,
            "list_browser_environment_presets_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(active_list.as_array().unwrap().len(), 1);

        let archived = handle_command(
            &state,
            "archive_browser_environment_preset_cmd",
            Some(serde_json::json!({
                "request": {
                    "id": preset_id
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(archived, serde_json::json!(true));

        let active_list_after_archive = handle_command(
            &state,
            "list_browser_environment_presets_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert!(active_list_after_archive.as_array().unwrap().is_empty());

        let archived_list = handle_command(
            &state,
            "list_browser_environment_presets_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": true
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(archived_list.as_array().unwrap().len(), 1);
        assert!(archived_list.as_array().unwrap()[0]["archived_at"]
            .as_str()
            .is_some());

        let restored = handle_command(
            &state,
            "restore_browser_environment_preset_cmd",
            Some(serde_json::json!({
                "request": {
                    "id": archived_list.as_array().unwrap()[0]["id"]
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(restored, serde_json::json!(true));

        let active_list_after_restore = handle_command(
            &state,
            "list_browser_environment_presets_cmd",
            Some(serde_json::json!({
                "request": {
                    "include_archived": false
                }
            })),
        )
        .await
        .unwrap();
        assert_eq!(active_list_after_restore.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn site_adapter_launch_readiness_command_is_bridged() {
        let state = make_test_state();

        let value = handle_command(
            &state,
            "site_get_adapter_launch_readiness",
            Some(serde_json::json!({
                "request": {
                    "adapter_name": "x/article-export"
                }
            })),
        )
        .await
        .unwrap();

        assert_eq!(value["adapter"], "x/article-export");
        assert_eq!(value["domain"], "x.com");
        assert_eq!(value["status"], "requires_browser_runtime");
    }

    #[tokio::test]
    async fn skill_execution_catalog_commands_are_bridged() {
        let state = make_test_state();

        let list_value = handle_command(&state, "list_executable_skills", None)
            .await
            .unwrap();
        let skills = list_value.as_array().expect("skills should be array");
        assert!(!skills.is_empty());
        assert!(skills.iter().any(|item| item["name"] == "image_generate"));

        let detail_value = handle_command(
            &state,
            "get_skill_detail",
            Some(serde_json::json!({
                "skillName": "image_generate"
            })),
        )
        .await
        .unwrap();

        assert_eq!(detail_value["name"], "image_generate");
        assert_eq!(detail_value["execution_mode"], "prompt");
    }

    #[tokio::test]
    async fn execute_skill_bridge_requires_app_handle_in_test_state() {
        let state = make_test_state();

        let error = handle_command(
            &state,
            "execute_skill",
            Some(serde_json::json!({
                "skillName": "image_generate",
                "userInput": "画一张春日花园海报"
            })),
        )
        .await
        .expect_err("execute_skill without app handle should fail");

        assert!(error.to_string().contains("Dev Bridge 未持有 AppHandle"));
    }

    #[tokio::test]
    async fn agent_runtime_file_checkpoint_commands_are_bridged() {
        let state = make_test_state();
        let cases = [
            (
                "agent_runtime_list_file_checkpoints",
                serde_json::json!({
                    "request": {
                        "session_id": "session-1"
                    }
                }),
            ),
            (
                "agent_runtime_get_file_checkpoint",
                serde_json::json!({
                    "request": {
                        "session_id": "session-1",
                        "checkpoint_id": "checkpoint-1"
                    }
                }),
            ),
            (
                "agent_runtime_diff_file_checkpoint",
                serde_json::json!({
                    "request": {
                        "session_id": "session-1",
                        "checkpoint_id": "checkpoint-1"
                    }
                }),
            ),
            (
                "agent_runtime_restore_file_checkpoint",
                serde_json::json!({
                    "request": {
                        "session_id": "session-1",
                        "checkpoint_id": "checkpoint-1",
                        "confirm_restore": true,
                        "create_backup": true
                    }
                }),
            ),
        ];

        for (cmd, args) in cases {
            let error = handle_command(&state, cmd, Some(args))
                .await
                .expect_err("missing app handle should fail after bridge routing");

            let error_text = error.to_string();
            assert!(
                error_text.contains("Dev Bridge 未持有 AppHandle"),
                "command {cmd} should route into agent_sessions bridge, got: {error_text}"
            );
        }
    }

    #[tokio::test]
    async fn agent_runtime_subagent_control_commands_are_bridged() {
        let state = make_test_state();
        let cases = [
            "agent_runtime_spawn_subagent",
            "agent_runtime_send_subagent_input",
            "agent_runtime_wait_subagents",
            "agent_runtime_resume_subagent",
            "agent_runtime_close_subagent",
        ];

        for cmd in cases {
            let error = handle_command(
                &state,
                cmd,
                Some(serde_json::json!({
                    "request": {}
                })),
            )
            .await
            .expect_err("missing app handle should fail after bridge routing");

            let error_text = error.to_string();
            assert!(
                error_text.contains("Dev Bridge 未持有 AppHandle"),
                "command {cmd} should route into agent_sessions bridge, got: {error_text}"
            );
        }
    }

    #[tokio::test]
    async fn agent_generate_title_bridge_requires_app_handle_in_test_state() {
        let state = make_test_state();

        let error = handle_command(
            &state,
            "agent_generate_title",
            Some(serde_json::json!({
                "sessionId": "session-1",
                "titleKind": "session"
            })),
        )
        .await
        .expect_err("agent_generate_title without app handle should fail after routing");

        assert!(error.to_string().contains("Dev Bridge 未持有 AppHandle"));
    }

    #[tokio::test]
    async fn get_provider_alias_config_is_bridged() {
        let state = make_test_state();

        let error = handle_command(
            &state,
            "get_provider_alias_config",
            Some(serde_json::json!({
                "provider": "deepseek"
            })),
        )
        .await
        .expect_err("missing model registry should fail after bridge routing");

        assert!(error.to_string().contains("模型注册服务未初始化"));
    }

    #[tokio::test]
    async fn retired_api_key_provider_commands_are_not_dev_bridge_facades() {
        let state = make_test_state();

        for command in [
            "get_api_key_provider",
            "add_custom_api_key_provider",
            "update_api_key_provider",
            "delete_custom_api_key_provider",
            "add_api_key",
            "delete_api_key",
            "toggle_api_key",
            "update_api_key_alias",
            "get_next_api_key",
            "record_api_key_usage",
            "record_api_key_error",
            "get_provider_ui_state",
            "set_provider_ui_state",
            "update_provider_sort_orders",
            "export_api_key_providers",
            "import_api_key_providers",
            "test_api_key_provider_connection",
            "test_api_key_provider_chat",
        ] {
            let error = handle_command(&state, command, Some(serde_json::json!({})))
                .await
                .expect_err("retired API Key Provider command should be unknown");

            assert!(error.to_string().contains("[DevBridge] 未知命令"));
        }
    }

    #[tokio::test]
    async fn gateway_channel_status_is_bridged() {
        let state = make_test_state();

        let error = handle_command(
            &state,
            "gateway_channel_status",
            Some(serde_json::json!({
                "request": {
                    "channel": "telegram"
                }
            })),
        )
        .await
        .expect_err("missing app handle should fail after bridge routing");

        assert!(error.to_string().contains("Dev Bridge 未持有 AppHandle"));
    }

    #[tokio::test]
    async fn wechat_channel_list_accounts_is_bridged() {
        let state = make_test_state();

        let error = handle_command(&state, "wechat_channel_list_accounts", None)
            .await
            .expect_err("missing app handle should fail after bridge routing");

        assert!(error.to_string().contains("Dev Bridge 未持有 AppHandle"));
    }
}
