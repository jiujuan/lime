//! 会话历史 user_visible 标记的轻量读取。

const HISTORY_VISIBILITY_JSON_EXTRACT_BYTES_LIMIT: usize = 64 * 1024;
const HISTORY_VISIBILITY_SCAN_BYTES_LIMIT: usize = 512 * 1024;

fn user_visible_projection_sql() -> String {
    format!(
        "CASE
        WHEN length(content_json) > {scan_limit}
            THEN 1
        WHEN length(content_json) <= {json_extract_limit} AND json_valid(content_json)
            THEN COALESCE(json_extract(content_json, '$.userVisible'), 1)
        WHEN instr(content_json, '\"userVisible\":false') > 0
            OR instr(content_json, '\"userVisible\": false') > 0
            THEN 0
        ELSE 1
    END",
        scan_limit = HISTORY_VISIBILITY_SCAN_BYTES_LIMIT,
        json_extract_limit = HISTORY_VISIBILITY_JSON_EXTRACT_BYTES_LIMIT,
    )
}

fn map_user_visible_flag_row(row: &rusqlite::Row<'_>) -> Result<bool, rusqlite::Error> {
    let user_visible: i64 = row.get(0)?;
    Ok(user_visible != 0)
}

pub(super) fn load_user_visible_message_flags_from_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
    before_message_id: Option<i64>,
) -> Result<Vec<bool>, String> {
    let visibility_projection = user_visible_projection_sql();
    match (history_limit, before_message_id.filter(|value| *value > 0)) {
        (Some(0), _) => Ok(Vec::new()),
        (Some(limit), Some(before_message_id)) => {
            let sql = format!(
                "SELECT user_visible
                 FROM (
                     SELECT id, {visibility_projection} AS user_visible
                     FROM agent_messages
                     WHERE session_id = ?1 AND id < ?2
                     ORDER BY id DESC
                     LIMIT ?3
                 )
                 ORDER BY id ASC"
            );
            let mut stmt = conn
                .prepare(&sql)
                .map_err(|e| format!("准备消息可见性查询失败: {e}"))?;
            let rows = stmt
                .query_map(
                    rusqlite::params![session_id, before_message_id, limit as i64],
                    map_user_visible_flag_row,
                )
                .map_err(|e| format!("查询消息可见性失败: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取消息可见性失败: {e}"))
        }
        (Some(limit), None) => {
            let sql = format!(
                "SELECT user_visible
                 FROM (
                     SELECT id, {visibility_projection} AS user_visible
                     FROM agent_messages
                     WHERE session_id = ?1
                     ORDER BY id DESC
                     LIMIT ?2
                     OFFSET ?3
                 )
                 ORDER BY id ASC"
            );
            let mut stmt = conn
                .prepare(&sql)
                .map_err(|e| format!("准备消息可见性查询失败: {e}"))?;
            let rows = stmt
                .query_map(
                    rusqlite::params![session_id, limit as i64, history_offset as i64],
                    map_user_visible_flag_row,
                )
                .map_err(|e| format!("查询消息可见性失败: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取消息可见性失败: {e}"))
        }
        (None, _) => {
            let sql = format!(
                "SELECT {visibility_projection} AS user_visible
                 FROM agent_messages
                 WHERE session_id = ?1
                 ORDER BY id ASC"
            );
            let mut stmt = conn
                .prepare(&sql)
                .map_err(|e| format!("准备消息可见性查询失败: {e}"))?;
            let rows = stmt
                .query_map(rusqlite::params![session_id], map_user_visible_flag_row)
                .map_err(|e| format!("查询消息可见性失败: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取消息可见性失败: {e}"))
        }
    }
}

pub(super) fn load_chat_user_visible_message_flags_from_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Vec<bool>, String> {
    let visibility_projection = user_visible_projection_sql();
    let sql = format!(
        "SELECT {visibility_projection} AS user_visible
         FROM agent_messages
         WHERE session_id = ?1 AND role IN ('user', 'assistant')
         ORDER BY id ASC"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("准备聊天消息可见性查询失败: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id], map_user_visible_flag_row)
        .map_err(|e| format!("查询聊天消息可见性失败: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取聊天消息可见性失败: {e}"))
}
