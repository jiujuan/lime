//! 对话摘要器
//!
//! 当对话历史过长时，使用 LLM 生成简洁摘要替代旧消息，
//! 保留关键上下文同时减少 token 消耗。

use serde::{Deserialize, Serialize};

/// 判断字符是否为 CJK（中日韩）字符
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}' |   // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' |   // CJK Unified Ideographs Extension A
        '\u{F900}'..='\u{FAFF}' |   // CJK Compatibility Ideographs
        '\u{3000}'..='\u{303F}' |   // CJK Symbols and Punctuation
        '\u{FF00}'..='\u{FFEF}'     // Halfwidth and Fullwidth Forms
    )
}

/// 简单的 token 估算（中文约 1.5 token/字，英文约 0.75 token/word）
pub fn estimate_tokens(text: &str) -> usize {
    let cjk_chars = text.chars().filter(|c| is_cjk(*c)).count();
    let non_cjk_len = text.len().saturating_sub(cjk_chars);
    (cjk_chars as f64 * 1.5) as usize + (non_cjk_len as f64 * 0.25) as usize
}

/// 摘要配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryConfig {
    /// 是否启用
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// 触发摘要的消息数阈值
    #[serde(default = "default_threshold")]
    pub threshold_messages: usize,
    /// 摘要后保留的最近消息数
    #[serde(default = "default_keep_recent")]
    pub keep_recent_messages: usize,
    /// 摘要最大要点数
    #[serde(default = "default_max_points")]
    pub max_summary_points: usize,
    /// 系统消息永不压缩
    #[serde(default = "default_true")]
    pub preserve_system_messages: bool,
    /// 工具调用结果只保留摘要
    #[serde(default = "default_true")]
    pub summarize_tool_results: bool,
    /// 保留最近 N 轮完整对话（一轮 = user + assistant）
    #[serde(default = "default_keep_turns")]
    pub keep_recent_turns: usize,
    /// Token 触发阈值（优先于消息数阈值）
    #[serde(default = "default_token_threshold")]
    pub token_threshold: Option<usize>,
}

fn default_enabled() -> bool {
    true
}
fn default_threshold() -> usize {
    50
}
fn default_keep_recent() -> usize {
    20
}
fn default_max_points() -> usize {
    12
}
fn default_true() -> bool {
    true
}
fn default_keep_turns() -> usize {
    10
}
fn default_token_threshold() -> Option<usize> {
    Some(80000)
}

impl Default for SummaryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold_messages: default_threshold(),
            keep_recent_messages: default_keep_recent(),
            max_summary_points: default_max_points(),
            preserve_system_messages: true,
            summarize_tool_results: true,
            keep_recent_turns: default_keep_turns(),
            token_threshold: default_token_threshold(),
        }
    }
}

/// 摘要请求
///
/// 包含需要发送给 LLM 的摘要请求信息
#[derive(Debug, Clone)]
pub struct SummaryRequest {
    /// 摘要 prompt（system 消息）
    pub system_prompt: String,
    /// 需要摘要的消息（作为 user 消息发送）
    pub messages_to_summarize: String,
    /// 被摘要的消息数
    pub messages_to_compact: usize,
    /// 当前估算 token 数
    pub current_tokens: usize,
}

/// 摘要结果
#[derive(Debug, Clone)]
pub struct SummaryResult {
    /// 摘要后的消息列表（摘要 system 消息 + 保留的最近消息）
    pub messages: Vec<serde_json::Value>,
    /// 是否进行了摘要
    pub summarized: bool,
    /// 被摘要的消息数
    pub summarized_count: usize,
}

/// 对话摘要器
pub struct ConversationSummarizer {
    config: SummaryConfig,
}

impl ConversationSummarizer {
    pub fn new(config: SummaryConfig) -> Self {
        Self { config }
    }

    /// 判断是否需要摘要
    pub fn should_summarize(&self, messages: &[serde_json::Value]) -> bool {
        if !self.config.enabled {
            return false;
        }

        // 优先检查 token 阈值
        if let Some(token_threshold) = self.config.token_threshold {
            let total_text: String = messages
                .iter()
                .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
                .collect::<Vec<_>>()
                .join("");
            let total_tokens = estimate_tokens(&total_text);
            if total_tokens >= token_threshold {
                return true;
            }
        }

        messages.len() > self.config.threshold_messages
    }

    /// 构建摘要请求
    ///
    /// 将需要摘要的旧消息格式化为 LLM 请求
    pub fn build_summary_request(&self, messages: &[serde_json::Value]) -> Option<SummaryRequest> {
        if !self.should_summarize(messages) {
            return None;
        }

        let non_system_msgs: Vec<_> = messages
            .iter()
            .filter(|msg| {
                msg.get("role")
                    .and_then(|r| r.as_str())
                    .map(|r| r != "system")
                    .unwrap_or(true)
            })
            .collect();

        let keep = self.config.keep_recent_messages.min(non_system_msgs.len());
        let to_summarize = non_system_msgs.len().saturating_sub(keep);

        if to_summarize == 0 {
            return None;
        }

        let msgs_text: Vec<String> = non_system_msgs[..to_summarize]
            .iter()
            .map(|msg| {
                let role = msg
                    .get("role")
                    .and_then(|r| r.as_str())
                    .unwrap_or("unknown");

                // 工具调用结果用紧凑格式
                if self.config.summarize_tool_results {
                    if let Some(tool_name) = extract_tool_name(msg) {
                        let content = extract_content_text(msg);
                        let truncated = if content.len() > 200 {
                            format!("{}...(truncated)", &content[..200])
                        } else {
                            content
                        };
                        return format!("[{role}][tool:{tool_name}]: {truncated}");
                    }
                }

                let content = extract_content_text(msg);
                format!("[{role}]: {content}")
            })
            .collect();

        let messages_text = msgs_text.join("\n\n");

        let system_prompt = format!(
            "你是一个对话摘要助手。请将以下对话历史总结为最多 {} 个关键要点。\n\
             要求：\n\
             - 保留重要的决策、结论和上下文\n\
             - 保留关键的技术细节和代码引用\n\
             - 使用简洁的要点格式\n\
             - 按时间顺序组织\n\
             - 不要遗漏用户的关键需求",
            self.config.max_summary_points
        );

        let current_tokens = estimate_tokens(&messages_text);

        Some(SummaryRequest {
            system_prompt,
            messages_to_summarize: messages_text,
            messages_to_compact: to_summarize,
            current_tokens,
        })
    }

    /// 将摘要文本组装为最终消息列表
    ///
    /// 结构：原始 system 消息 + 摘要 system 消息 + 保留的最近消息
    pub fn assemble_with_summary(
        &self,
        original_messages: &[serde_json::Value],
        summary_text: &str,
    ) -> SummaryResult {
        let (system_msgs, non_system_msgs): (Vec<_>, Vec<_>) =
            original_messages.iter().partition(|msg| {
                msg.get("role")
                    .and_then(|r| r.as_str())
                    .map(|r| r == "system")
                    .unwrap_or(false)
            });

        let keep = self.config.keep_recent_messages.min(non_system_msgs.len());
        let summarized_count = non_system_msgs.len().saturating_sub(keep);

        let mut result = Vec::new();

        // 1. 原始 system 消息
        for msg in &system_msgs {
            result.push((*msg).clone());
        }

        // 2. 摘要 system 消息
        if summarized_count > 0 && !summary_text.is_empty() {
            result.push(serde_json::json!({
                "role": "system",
                "content": format!(
                    "[对话摘要 - 以下是之前 {} 条消息的摘要]\n\n{}",
                    summarized_count, summary_text
                )
            }));
        }

        // 3. 保留的最近消息
        let start = non_system_msgs.len().saturating_sub(keep);
        for msg in &non_system_msgs[start..] {
            result.push((*msg).clone());
        }

        SummaryResult {
            messages: result,
            summarized: summarized_count > 0,
            summarized_count,
        }
    }
}

/// 从消息中提取工具名称（如果是工具调用或工具结果）
fn extract_tool_name(msg: &serde_json::Value) -> Option<String> {
    // tool_use 格式（Anthropic）
    if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
        for item in content {
            if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                return item.get("name").and_then(|n| n.as_str()).map(String::from);
            }
            if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                return item
                    .get("tool_use_id")
                    .and_then(|n| n.as_str())
                    .map(String::from);
            }
        }
    }
    // function_call 格式（OpenAI）
    if let Some(fc) = msg.get("function_call") {
        return fc.get("name").and_then(|n| n.as_str()).map(String::from);
    }
    // tool_calls 格式（OpenAI）
    if let Some(tcs) = msg.get("tool_calls").and_then(|t| t.as_array()) {
        if let Some(first) = tcs.first() {
            return first
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|n| n.as_str())
                .map(String::from);
        }
    }
    None
}

/// 将 SubAgent 的完整结果压缩为摘要
pub fn summarize_subagent_result(result: &str, max_length: usize) -> String {
    if result.len() <= max_length {
        return result.to_string();
    }
    // 保留开头和结尾各占一半
    let half = max_length / 2;
    let start = &result[..half];
    let end = &result[result.len() - half..];
    format!(
        "{start}\n\n... [省略 {} 字符] ...\n\n{end}",
        result.len() - max_length
    )
}

/// 从消息中提取文本内容
///
/// 兼容 OpenAI 格式（content 为字符串）和 Anthropic 格式（content 为数组）
fn extract_content_text(msg: &serde_json::Value) -> String {
    match msg.get("content") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                    item.get("text").and_then(|t| t.as_str()).map(String::from)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// 在完整摘要前，先截断过长的工具输出
/// max_tool_output_tokens: 单个工具输出的最大 token 数
pub fn microcompact(messages: &mut [serde_json::Value], max_tool_output_tokens: usize) {
    for msg in messages.iter_mut() {
        if !is_tool_result(msg) {
            continue;
        }
        let content = match extract_tool_content_text(msg) {
            Some(text) => text,
            None => continue,
        };
        let tokens = estimate_tokens(&content);
        if tokens > max_tool_output_tokens {
            let truncated = truncate_to_tokens(&content, max_tool_output_tokens);
            set_tool_content_text(
                msg,
                &format!("{}\n\n[输出已截断，原始约 {} tokens]", truncated, tokens),
            );
        }
    }
}

/// 将文本截断到大约指定的 token 数
fn truncate_to_tokens(text: &str, max_tokens: usize) -> String {
    let mut current_tokens = 0.0f64;
    let max = max_tokens as f64;
    let mut last_valid_idx = 0;
    for (idx, ch) in text.char_indices() {
        let char_tokens = if is_cjk(ch) { 1.5 } else { 0.25 };
        current_tokens += char_tokens;
        if current_tokens >= max {
            break;
        }
        last_valid_idx = idx + ch.len_utf8();
    }
    text[..last_valid_idx].to_string()
}

/// 检查消息是否为工具结果
fn is_tool_result(msg: &serde_json::Value) -> bool {
    msg.get("role").and_then(|r| r.as_str()) == Some("user")
        && msg.get("content").map_or(false, |c| {
            if let Some(arr) = c.as_array() {
                arr.iter()
                    .any(|item| item.get("type").and_then(|t| t.as_str()) == Some("tool_result"))
            } else {
                false
            }
        })
}

/// 提取工具结果消息的文本内容
fn extract_tool_content_text(msg: &serde_json::Value) -> Option<String> {
    if let Some(content) = msg.get("content") {
        if let Some(s) = content.as_str() {
            return Some(s.to_string());
        }
        if let Some(arr) = content.as_array() {
            let texts: Vec<&str> = arr
                .iter()
                .filter_map(|item| {
                    if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                        item.get("content").and_then(|c| c.as_str())
                    } else if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                        item.get("text").and_then(|t| t.as_str())
                    } else {
                        None
                    }
                })
                .collect();
            if !texts.is_empty() {
                return Some(texts.join("\n"));
            }
        }
    }
    None
}

/// 设置工具结果消息的文本内容
fn set_tool_content_text(msg: &mut serde_json::Value, text: &str) {
    if let Some(content) = msg.get_mut("content") {
        if content.is_string() {
            *content = serde_json::Value::String(text.to_string());
        } else if let Some(arr) = content.as_array_mut() {
            for item in arr.iter_mut() {
                if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                    if let Some(c) = item.get_mut("content") {
                        *c = serde_json::Value::String(text.to_string());
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_default_config() {
        let config = SummaryConfig::default();
        assert!(config.enabled);
        assert_eq!(config.threshold_messages, 50);
        assert_eq!(config.keep_recent_messages, 20);
        assert_eq!(config.max_summary_points, 12);
        assert!(config.preserve_system_messages);
        assert!(config.summarize_tool_results);
        assert_eq!(config.keep_recent_turns, 10);
        assert_eq!(config.token_threshold, Some(80000));
    }

    fn make_messages(n: usize) -> Vec<serde_json::Value> {
        (0..n).map(|i| json!({"role": if i % 2 == 0 { "user" } else { "assistant" }, "content": format!("msg {i}")})).collect()
    }

    #[test]
    fn test_should_summarize_disabled() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: false,
            threshold_messages: 5,
            ..Default::default()
        });
        assert!(!s.should_summarize(&make_messages(100)));
    }

    #[test]
    fn test_should_summarize_below_threshold() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 50,
            ..Default::default()
        });
        assert!(!s.should_summarize(&make_messages(30)));
        assert!(!s.should_summarize(&make_messages(50))); // 等于阈值不触发
    }

    #[test]
    fn test_should_summarize_above_threshold() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 5,
            ..Default::default()
        });
        assert!(s.should_summarize(&make_messages(6)));
        assert!(s.should_summarize(&make_messages(100)));
    }

    #[test]
    fn test_build_summary_request_none_when_disabled() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: false,
            threshold_messages: 2,
            keep_recent_messages: 1,
            ..Default::default()
        });
        let msgs = vec![
            json!({"role": "user", "content": "a"}),
            json!({"role": "assistant", "content": "b"}),
            json!({"role": "user", "content": "c"}),
        ];
        assert!(s.build_summary_request(&msgs).is_none());
    }

    #[test]
    fn test_build_summary_request_with_messages() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 2,
            keep_recent_messages: 1,
            max_summary_points: 5,
            ..Default::default()
        });
        let msgs = vec![
            json!({"role": "system", "content": "You are helpful."}),
            json!({"role": "user", "content": "Hello"}),
            json!({"role": "assistant", "content": "Hi!"}),
            json!({"role": "user", "content": "Latest"}),
        ];
        // 总消息数 4 > threshold 2，非 system 消息 3 条，保留 1 条，摘要 2 条
        let req = s.build_summary_request(&msgs).unwrap();
        assert!(req.system_prompt.contains("5"));
        assert!(req.messages_to_summarize.contains("[user]: Hello"));
        assert!(req.messages_to_summarize.contains("[assistant]: Hi!"));
        assert!(!req.messages_to_summarize.contains("Latest"));
    }

    #[test]
    fn test_assemble_with_summary() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 2,
            keep_recent_messages: 1,
            ..Default::default()
        });
        let msgs = vec![
            json!({"role": "user", "content": "old1"}),
            json!({"role": "assistant", "content": "old2"}),
            json!({"role": "user", "content": "recent"}),
        ];
        let result = s.assemble_with_summary(&msgs, "摘要内容");
        assert!(result.summarized);
        assert_eq!(result.summarized_count, 2);
        // 摘要 system + 保留的 1 条 = 2
        assert_eq!(result.messages.len(), 2);
        assert_eq!(result.messages[0]["role"], "system");
        assert!(result.messages[0]["content"]
            .as_str()
            .unwrap()
            .contains("摘要内容"));
        assert_eq!(result.messages[1]["content"], "recent");
    }

    #[test]
    fn test_assemble_preserves_system_messages() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 2,
            keep_recent_messages: 1,
            ..Default::default()
        });
        let msgs = vec![
            json!({"role": "system", "content": "You are helpful."}),
            json!({"role": "user", "content": "old"}),
            json!({"role": "assistant", "content": "old reply"}),
            json!({"role": "user", "content": "recent"}),
        ];
        let result = s.assemble_with_summary(&msgs, "summary");
        // system 原始 + 摘要 system + 保留 1 条 = 3
        assert_eq!(result.messages.len(), 3);
        assert_eq!(result.messages[0]["content"], "You are helpful.");
        assert_eq!(result.messages[1]["role"], "system");
        assert!(result.messages[1]["content"]
            .as_str()
            .unwrap()
            .contains("summary"));
        assert_eq!(result.messages[2]["content"], "recent");
    }

    #[test]
    fn test_extract_content_text_string() {
        let msg = json!({"role": "user", "content": "hello world"});
        assert_eq!(extract_content_text(&msg), "hello world");
    }

    #[test]
    fn test_extract_content_text_array() {
        // Anthropic 格式
        let msg = json!({
            "role": "user",
            "content": [
                {"type": "text", "text": "part1"},
                {"type": "image", "source": {}},
                {"type": "text", "text": "part2"}
            ]
        });
        assert_eq!(extract_content_text(&msg), "part1\npart2");
    }

    #[test]
    fn test_extract_content_text_empty() {
        let msg = json!({"role": "user"});
        assert_eq!(extract_content_text(&msg), "");

        let msg2 = json!({"role": "user", "content": null});
        assert_eq!(extract_content_text(&msg2), "");

        let msg3 = json!({"role": "user", "content": 42});
        assert_eq!(extract_content_text(&msg3), "");
    }

    #[test]
    fn test_extract_tool_name_anthropic() {
        let msg = json!({
            "role": "assistant",
            "content": [
                {"type": "tool_use", "name": "read_file", "id": "t1", "input": {}}
            ]
        });
        assert_eq!(extract_tool_name(&msg), Some("read_file".to_string()));
    }

    #[test]
    fn test_extract_tool_name_openai() {
        let msg = json!({
            "role": "assistant",
            "tool_calls": [
                {"id": "t1", "type": "function", "function": {"name": "grep", "arguments": "{}"}}
            ]
        });
        assert_eq!(extract_tool_name(&msg), Some("grep".to_string()));
    }

    #[test]
    fn test_extract_tool_name_none() {
        let msg = json!({"role": "user", "content": "hello"});
        assert_eq!(extract_tool_name(&msg), None);
    }

    #[test]
    fn test_summarize_subagent_result_short() {
        let result = "short result";
        assert_eq!(summarize_subagent_result(result, 100), "short result");
    }

    #[test]
    fn test_summarize_subagent_result_long() {
        let result = "a".repeat(500);
        let summary = summarize_subagent_result(&result, 200);
        assert!(summary.len() < 500);
        assert!(summary.contains("省略"));
        assert!(summary.contains("300 字符"));
    }

    #[test]
    fn test_tool_result_compact_format() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 2,
            keep_recent_messages: 1,
            summarize_tool_results: true,
            ..Default::default()
        });
        let msgs = vec![
            json!({"role": "assistant", "content": [
                {"type": "tool_use", "name": "bash", "id": "t1", "input": {}}
            ]}),
            json!({"role": "user", "content": "old msg"}),
            json!({"role": "assistant", "content": "old reply"}),
            json!({"role": "user", "content": "recent"}),
        ];
        let req = s.build_summary_request(&msgs).unwrap();
        assert!(req.messages_to_summarize.contains("[tool:bash]"));
    }

    #[test]
    fn test_estimate_tokens_english() {
        let text = "Hello world this is a test";
        let tokens = estimate_tokens(text);
        assert!(tokens > 0);
        assert!(tokens < 30); // 26 chars * 0.25 ≈ 6-7
    }

    #[test]
    fn test_estimate_tokens_chinese() {
        let text = "你好世界这是测试";
        let tokens = estimate_tokens(text);
        assert!(tokens >= 8); // 8 CJK chars * 1.5 = 12
    }

    #[test]
    fn test_estimate_tokens_mixed() {
        let text = "Hello 你好 World 世界";
        let tokens = estimate_tokens(text);
        assert!(tokens > 0);
    }

    #[test]
    fn test_microcompact_truncates_long_tool_output() {
        let long_output = "x".repeat(10000);
        let mut messages = vec![json!({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "t1",
                    "content": long_output
                }
            ]
        })];
        microcompact(&mut messages, 100);
        let content = extract_tool_content_text(&messages[0]).unwrap();
        assert!(content.contains("输出已截断"));
        assert!(content.len() < long_output.len());
    }

    #[test]
    fn test_microcompact_preserves_short_output() {
        let short_output = "short result";
        let mut messages = vec![json!({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "t1",
                    "content": short_output
                }
            ]
        })];
        microcompact(&mut messages, 1000);
        let content = extract_tool_content_text(&messages[0]).unwrap();
        assert_eq!(content, short_output);
    }

    #[test]
    fn test_truncate_to_tokens() {
        let text = "a".repeat(1000);
        let truncated = truncate_to_tokens(&text, 100);
        assert!(truncated.len() < 1000);
    }

    #[test]
    fn test_should_summarize_token_threshold() {
        let s = ConversationSummarizer::new(SummaryConfig {
            enabled: true,
            threshold_messages: 1000,  // 高消息阈值
            token_threshold: Some(10), // 低 token 阈值
            ..Default::default()
        });
        let msgs = vec![json!({"role": "user", "content": "a".repeat(100)})];
        assert!(s.should_summarize(&msgs));
    }
}
