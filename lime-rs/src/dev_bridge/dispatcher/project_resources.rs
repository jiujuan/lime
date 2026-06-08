use super::{args_or_default, get_db, get_string_arg, parse_nested_arg, parse_optional_nested_arg};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

type DynError = Box<dyn std::error::Error>;

pub(super) fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "list_materials" => {
            let args = args_or_default(args);
            let project_id = get_string_arg(&args, "project_id", "projectId")?;
            let filter: Option<crate::models::project_model::MaterialFilter> =
                parse_optional_nested_arg(&args, "filter")?;

            let conn = get_db(state)?
                .lock()
                .map_err(|e| format!("数据库锁定失败: {e}"))?;
            let materials = lime_services::material_service::MaterialService::list_materials(
                &conn,
                &project_id,
                filter,
            )
            .map_err(|e| format!("获取素材列表失败: {e}"))?;
            serde_json::to_value(materials)?
        }
        "get_material_count" => {
            let args = args_or_default(args);
            let project_id = get_string_arg(&args, "project_id", "projectId")?;

            let conn = get_db(state)?
                .lock()
                .map_err(|e| format!("数据库锁定失败: {e}"))?;
            let count = crate::database::dao::material_dao::MaterialDao::count(&conn, &project_id)
                .map_err(|e| format!("获取素材数量失败: {e}"))?;
            serde_json::json!(count)
        }
        "upload_material" => {
            let args = args_or_default(args);
            let req: crate::models::project_model::UploadMaterialRequest =
                parse_nested_arg(&args, "req")?;
            let conn = get_db(state)?
                .lock()
                .map_err(|e| format!("数据库锁定失败: {e}"))?;
            serde_json::to_value(
                lime_services::material_service::MaterialService::upload_material(&conn, req)
                    .map_err(|e| format!("上传素材失败: {e}"))?,
            )?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
