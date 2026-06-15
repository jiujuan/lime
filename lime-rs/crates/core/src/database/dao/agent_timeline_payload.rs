//! legacy timeline payload 的轻量投影规则。
//!
//! `agent_thread_items.payload_json` 只允许作为迁移期 GUI projection，
//! 不再保存 runtime event truth 或大正文。

use super::agent_timeline::AgentThreadItemPayload;

const HISTORY_FILE_ARTIFACT_INLINE_CONTENT_BYTES_LIMIT: usize = 16 * 1024;
const HISTORY_ITEM_INLINE_OUTPUT_BYTES_LIMIT: usize = 16 * 1024;
const HISTORY_OUTPUT_TRUNCATED_NOTICE: &str = "[历史输出已截断，完整输出未随首屏加载。]";

pub(crate) fn bounded_payload_for_storage(
    payload: &AgentThreadItemPayload,
) -> AgentThreadItemPayload {
    match payload {
        AgentThreadItemPayload::FileArtifact {
            path,
            source,
            content: Some(_),
            metadata,
        } if serialized_char_len(payload) > HISTORY_FILE_ARTIFACT_INLINE_CONTENT_BYTES_LIMIT => {
            AgentThreadItemPayload::FileArtifact {
                path: path.clone(),
                source: source.clone(),
                content: None,
                metadata: metadata.clone(),
            }
        }
        AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            output: Some(output),
            success,
            error,
            metadata,
        } => AgentThreadItemPayload::ToolCall {
            tool_name: tool_name.clone(),
            arguments: arguments.clone(),
            output: Some(bounded_output(output)),
            success: *success,
            error: error.clone(),
            metadata: metadata.clone(),
        },
        AgentThreadItemPayload::CommandExecution {
            command,
            cwd,
            aggregated_output: Some(aggregated_output),
            exit_code,
            error,
        } => AgentThreadItemPayload::CommandExecution {
            command: command.clone(),
            cwd: cwd.clone(),
            aggregated_output: Some(bounded_output(aggregated_output)),
            exit_code: *exit_code,
            error: error.clone(),
        },
        AgentThreadItemPayload::WebSearch {
            query,
            action,
            output: Some(output),
        } => AgentThreadItemPayload::WebSearch {
            query: query.clone(),
            action: action.clone(),
            output: Some(bounded_output(output)),
        },
        _ => payload.clone(),
    }
}

pub(crate) fn history_item_payload_json_projection_sql() -> String {
    format!(
        "CASE
             WHEN NOT json_valid(payload_json) THEN payload_json
             WHEN item_type = 'file_artifact'
                  AND length(payload_json) > {file_limit}
             THEN json_remove(payload_json, '$.content')
             WHEN item_type = 'tool_call'
                  AND json_type(payload_json, '$.output') = 'text'
                  AND length(json_extract(payload_json, '$.output')) > {output_limit}
             THEN json_set(
                 payload_json,
                 '$.output',
                 substr(json_extract(payload_json, '$.output'), 1, {output_limit})
                     || char(10) || char(10)
                     || '{notice}'
             )
             WHEN item_type = 'command_execution'
                  AND json_type(payload_json, '$.aggregated_output') = 'text'
                  AND length(json_extract(payload_json, '$.aggregated_output')) > {output_limit}
             THEN json_set(
                 payload_json,
                 '$.aggregated_output',
                 substr(json_extract(payload_json, '$.aggregated_output'), 1, {output_limit})
                     || char(10) || char(10)
                     || '{notice}'
             )
             WHEN item_type = 'web_search'
                  AND json_type(payload_json, '$.output') = 'text'
                  AND length(json_extract(payload_json, '$.output')) > {output_limit}
             THEN json_set(
                 payload_json,
                 '$.output',
                 substr(json_extract(payload_json, '$.output'), 1, {output_limit})
                     || char(10) || char(10)
                     || '{notice}'
             )
             ELSE payload_json
         END",
        file_limit = HISTORY_FILE_ARTIFACT_INLINE_CONTENT_BYTES_LIMIT,
        output_limit = HISTORY_ITEM_INLINE_OUTPUT_BYTES_LIMIT,
        notice = HISTORY_OUTPUT_TRUNCATED_NOTICE,
    )
}

fn serialized_char_len(payload: &AgentThreadItemPayload) -> usize {
    serde_json::to_string(payload)
        .map(|value| value.chars().count())
        .unwrap_or(0)
}

fn bounded_output(output: &str) -> String {
    if output.chars().count() <= HISTORY_ITEM_INLINE_OUTPUT_BYTES_LIMIT {
        return output.to_string();
    }

    let mut truncated = output
        .chars()
        .take(HISTORY_ITEM_INLINE_OUTPUT_BYTES_LIMIT)
        .collect::<String>();
    truncated.push_str("\n\n");
    truncated.push_str(HISTORY_OUTPUT_TRUNCATED_NOTICE);
    truncated
}
