use super::{args_or_default, get_string_arg, parse_nested_arg, require_app_handle};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;
use tauri::Manager;

type DynError = Box<dyn std::error::Error>;

fn get_optional_string_arg(args: &JsonValue, primary: &str, secondary: &str) -> Option<String> {
    args.get(primary)
        .or_else(|| args.get(secondary))
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn get_optional_images_arg(
    args: &JsonValue,
) -> Result<Option<Vec<crate::skills::SkillExecutionImageInput>>, DynError> {
    let Some(value) = args.get("images").cloned() else {
        return Ok(None);
    };
    Ok(Some(serde_json::from_value(value)?))
}

fn get_optional_request_context_arg(args: &JsonValue) -> Option<JsonValue> {
    args.get("requestContext")
        .cloned()
        .or_else(|| args.get("request_context").cloned())
}

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "get_skills_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let refresh_remote = args
                .get("refresh_remote")
                .or_else(|| args.get("refreshRemote"))
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            let app_type: crate::models::app_type::AppType = app.parse().map_err(|e: String| e)?;

            let db = state
                .db
                .as_ref()
                .ok_or("DevBridge 缺少数据库连接，无法读取 Skill 列表")?;
            let skills = crate::commands::skill_cmd::resolve_skills_for_app(
                db,
                &state.skill_service,
                &app_type,
                refresh_remote,
            )
            .await
            .map_err(|e| e.to_string())?;
            serde_json::to_value(skills)?
        }
        "get_local_skills_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();

            let db = state
                .db
                .as_ref()
                .ok_or("DevBridge 缺少数据库连接，无法读取本地 Skill 列表")?;
            let app_type: crate::models::app_type::AppType = app.parse().map_err(|e: String| e)?;
            let installed_states = {
                let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
                crate::database::dao::skills::SkillDao::get_skills(&conn)
                    .map_err(|e| format!("{e}"))?
            };
            let skills = state
                .skill_service
                .list_local_skills(&app_type, &installed_states)
                .map_err(|e| format!("{e}"))?;
            serde_json::to_value(skills)?
        }
        "inspect_local_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let inspection =
                crate::commands::skill_cmd::inspect_local_skill_for_app(app, directory)
                    .map_err(|e| format!("检查本地 Skill 失败: {e}"))?;
            serde_json::to_value(inspection)?
        }
        "inspect_local_skill_detail_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let inspection =
                crate::commands::skill_cmd::inspect_local_skill_detail_for_app(app, directory)
                    .map_err(|e| format!("检查本地 Skill 详情失败: {e}"))?;
            serde_json::to_value(inspection)?
        }
        "reveal_local_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let result = crate::commands::skill_cmd::reveal_local_skill_for_app(app, directory)
                .map_err(|e| format!("显示本地 Skill 目录失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "rename_local_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let new_directory = get_string_arg(&args, "new_directory", "new_directory")
                .or_else(|_| get_string_arg(&args, "newDirectory", "newDirectory"))?;
            let result = crate::commands::skill_cmd::rename_local_skill_for_app(
                app,
                directory,
                new_directory,
            )
            .map_err(|e| format!("重命名本地 Skill 失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "replace_local_skill_package_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let source_path = get_string_arg(&args, "source_path", "source_path")
                .or_else(|_| get_string_arg(&args, "sourcePath", "sourcePath"))?;
            let result = crate::commands::skill_cmd::replace_local_skill_package_for_app(
                app,
                directory,
                source_path,
            )
            .map_err(|e| format!("替换本地 Skill 安装包失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "create_skill_scaffold_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let request = parse_nested_arg::<crate::commands::skill_cmd::CreateSkillScaffoldRequest>(
                &args, "request",
            )?;
            let inspection =
                crate::commands::skill_cmd::create_skill_scaffold_for_app(app, request)
                    .map_err(|e| format!("创建 Skill 脚手架失败: {e}"))?;
            serde_json::to_value(inspection)?
        }
        "import_local_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let source_path = get_string_arg(&args, "source_path", "source_path")
                .or_else(|_| get_string_arg(&args, "sourcePath", "sourcePath"))?;
            let result = crate::commands::skill_cmd::import_local_skill_for_app(app, source_path)
                .map_err(|e| format!("导入本地 Skill 失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "inspect_local_skill_package_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let source_path = get_string_arg(&args, "source_path", "source_path")
                .or_else(|_| get_string_arg(&args, "sourcePath", "sourcePath"))?;
            let result =
                crate::commands::skill_cmd::inspect_local_skill_package_for_app(app, source_path)
                    .map_err(|e| format!("检查本地 Skill 安装包失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "install_local_skill_package_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let source_path = get_string_arg(&args, "source_path", "source_path")
                .or_else(|_| get_string_arg(&args, "sourcePath", "sourcePath"))?;
            let skill_name = get_optional_string_arg(&args, "skill_name", "skillName");
            let result = crate::commands::skill_cmd::install_local_skill_package_for_app(
                app,
                source_path,
                skill_name,
            )
            .map_err(|e| format!("安装本地 Skill 安装包失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "export_local_skill_package_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let target_path = get_string_arg(&args, "target_path", "target_path")
                .or_else(|_| get_string_arg(&args, "targetPath", "targetPath"))?;
            let result = crate::commands::skill_cmd::export_local_skill_package_for_app(
                app,
                directory,
                target_path,
            )
            .map_err(|e| format!("导出本地 Skill 安装包失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "take_pending_skill_package_open_requests" => {
            let result = crate::commands::skill_cmd::take_pending_skill_package_open_requests()
                .map_err(|e| format!("读取待处理 Skill 安装包打开请求失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "get_skill_package_file_association_status" => {
            let result = crate::commands::skill_cmd::get_skill_package_file_association_status()
                .map_err(|e| format!("读取 Skill 安装包文件关联状态失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "set_skill_package_file_association_default" => {
            let result = crate::commands::skill_cmd::set_skill_package_file_association_default()
                .map_err(|e| format!("设置 Skill 安装包默认打开方式失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "install_marketplace_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let bundle = parse_nested_arg::<crate::commands::skill_cmd::MarketplaceSkillBundle>(
                &args, "bundle",
            )?;
            let result = crate::commands::skill_cmd::install_marketplace_skill_for_app(app, bundle)
                .map_err(|e| format!("安装官方 Skill 失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "install_skill_from_download_url_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let request = parse_nested_arg::<
                crate::commands::skill_cmd::SkillDownloadInstallRequest,
            >(&args, "request")?;
            let result =
                crate::commands::skill_cmd::install_skill_from_download_url_for_app(app, request)
                    .await
                    .map_err(|e| format!("安装下载 Skill 失败: {e}"))?;
            serde_json::to_value(result)?
        }
        "uninstall_skill" | "uninstall_skill_for_app" => {
            let args = args_or_default(args);
            let app = args
                .get("app")
                .and_then(|value| value.as_str())
                .unwrap_or("lime")
                .to_string();
            let directory = get_string_arg(&args, "directory", "directory")?;
            let app_type: crate::models::app_type::AppType = app.parse().map_err(|e: String| e)?;

            lime_services::skill_service::SkillService::uninstall_skill(&app_type, &directory)
                .map_err(|e| format!("卸载本地 Skill 失败: {e}"))?;

            if let Some(db) = &state.db {
                let key = format!("{}:{directory}", app_type.to_string().to_lowercase());
                let skill_state = crate::models::skill_model::SkillState {
                    installed: false,
                    installed_at: chrono::Utc::now(),
                };
                let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
                crate::database::dao::skills::SkillDao::update_skill_state(
                    &conn,
                    &key,
                    &skill_state,
                )
                .map_err(|e| format!("更新 Skill 安装状态失败: {e}"))?;
            }

            if matches!(app_type, crate::models::app_type::AppType::Lime) {
                crate::agent::AsterAgentState::reload_lime_skills();
            }

            serde_json::json!(true)
        }
        "get_installed_lime_skills" => serde_json::to_value(
            crate::commands::skill_cmd::get_installed_lime_skills()
                .await
                .map_err(|e| format!("读取 Lime Skills 列表失败: {e}"))?,
        )?,
        "refresh_skill_cache" => {
            state.skill_service.refresh_cache();
            serde_json::json!(true)
        }
        "inspect_remote_skill" => {
            let args = args_or_default(args);
            let owner = get_string_arg(&args, "owner", "owner")?;
            let name = get_string_arg(&args, "name", "name")?;
            let branch = get_string_arg(&args, "branch", "branch")?;
            let directory = get_string_arg(&args, "directory", "directory")?;
            let inspection = state
                .skill_service
                .inspect_remote_skill(&owner, &name, &branch, &directory)
                .await
                .map_err(|e| format!("检查远程 Skill 失败: {e}"))?;
            serde_json::to_value(inspection)?
        }
        "execute_skill" => {
            let app_handle = require_app_handle(state)?;
            let args = args_or_default(args);
            let skill_name = get_string_arg(&args, "skillName", "skill_name")
                .or_else(|_| get_string_arg(&args, "skill_name", "skillName"))?;
            let user_input = get_string_arg(&args, "userInput", "user_input")
                .or_else(|_| get_string_arg(&args, "user_input", "userInput"))?;
            let images = get_optional_images_arg(&args)?;
            let request_context = get_optional_request_context_arg(&args);
            let provider_override =
                get_optional_string_arg(&args, "providerOverride", "provider_override");
            let model_override = get_optional_string_arg(&args, "modelOverride", "model_override");
            let execution_id = get_optional_string_arg(&args, "executionId", "execution_id");
            let session_id = get_optional_string_arg(&args, "sessionId", "session_id");
            let db = app_handle.state::<crate::database::DbConnection>();
            let api_key_provider_service =
                app_handle
                    .state::<crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState>();
            let config_manager = app_handle.state::<crate::config::GlobalConfigManagerState>();
            let aster_state = app_handle.state::<crate::agent::AsterAgentState>();
            serde_json::to_value(
                crate::commands::skill_exec_cmd::execute_skill(
                    app_handle.clone(),
                    db,
                    api_key_provider_service,
                    config_manager,
                    aster_state,
                    skill_name,
                    user_input,
                    images,
                    request_context,
                    provider_override,
                    model_override,
                    execution_id,
                    session_id,
                )
                .await
                .map_err(|e| format!("执行 Skill 失败: {e}"))?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
