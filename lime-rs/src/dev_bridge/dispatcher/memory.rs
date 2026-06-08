use super::{args_or_default, parse_optional_nested_arg};
use crate::commands::unified_memory_cmd::{list_unified_memories, ListFilters};
use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

type DynError = Box<dyn std::error::Error>;

pub(super) fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result = match cmd {
        "unified_memory_list" => {
            let args = args_or_default(args);
            let filters: Option<ListFilters> = parse_optional_nested_arg(&args, "filters")?;

            let Some(db) = &state.db else {
                return Ok(Some(serde_json::json!([])));
            };

            let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
            serde_json::to_value(list_unified_memories(&conn, filters.unwrap_or_default())?)?
        }
        _ => return Ok(None),
    };

    Ok(Some(result))
}
