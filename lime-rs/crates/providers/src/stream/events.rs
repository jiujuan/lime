//! 统一流事件类型
//!
//! 定义流式传输的中间表示 (Intermediate Representation)，
//! 用于解耦解析器 (parsers) 和生成器 (generators)。
//!
//! # 设计原则
//!
//! - Parsers 输出 `StreamEvent`
//! - Generators 消费 `StreamEvent` 生成目标格式
//! - 不同后端的解析器都输出相同的 `StreamEvent` 类型
//! - 不同前端的生成器都消费相同的 `StreamEvent` 类型

use serde::{Deserialize, Serialize};

/// 统一流事件类型
///
/// 作为不同协议之间的中间表示，解耦：
/// - 后端流格式解析 (AWS Event Stream, OpenAI SSE, Anthropic SSE)
/// - 前端流格式生成 (OpenAI SSE, Anthropic SSE, Gemini SSE)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StreamEvent {
    /// 消息开始
    ///
    /// 表示一个新的消息/响应开始
    MessageStart {
        /// 消息 ID
        id: String,
        /// 模型名称
        model: String,
    },

    /// 内容块开始
    ///
    /// 表示一个新的内容块开始（文本或工具调用）
    ContentBlockStart {
        /// 内容块索引
        index: u32,
        /// 内容块类型
        block_type: ContentBlockType,
    },

    /// 文本内容增量
    ///
    /// 对应文本内容的增量输出
    TextDelta {
        /// 文本内容
        text: String,
    },

    /// 工具调用开始
    ///
    /// 表示一个新的工具调用开始
    ToolUseStart {
        /// 工具调用 ID
        id: String,
        /// 工具名称
        name: String,
    },

    /// 工具调用参数增量
    ///
    /// 工具调用参数的增量输出（部分 JSON）
    ToolUseInputDelta {
        /// 工具调用 ID
        id: String,
        /// 参数增量（部分 JSON 字符串）
        partial_json: String,
    },

    /// 工具调用结束
    ///
    /// 表示工具调用参数传输完成
    ToolUseStop {
        /// 工具调用 ID
        id: String,
    },

    /// 内容块结束
    ///
    /// 表示一个内容块传输完成
    ContentBlockStop {
        /// 内容块索引
        index: u32,
    },

    /// 消息结束
    ///
    /// 表示整个消息/响应结束
    MessageStop {
        /// 停止原因
        stop_reason: StopReason,
    },

    /// 使用量信息
    ///
    /// Token 使用统计
    Usage {
        /// 输入 token 数
        input_tokens: u32,
        /// 输出 token 数
        output_tokens: u32,
        /// 缓存读取 token 数（可选）
        cache_read_input_tokens: Option<u32>,
        /// 缓存创建 token 数（可选）
        cache_creation_input_tokens: Option<u32>,
    },

    /// 后端特定使用量（如 CodeWhisperer credits）
    ///
    /// 用于传递后端特定的使用量信息
    BackendUsage {
        /// 消耗的 credits
        credits: f64,
        /// 上下文使用百分比
        context_percentage: f64,
    },

    /// 错误事件
    ///
    /// 流处理过程中的错误
    Error {
        /// 错误类型
        error_type: String,
        /// 错误消息
        message: String,
    },

    /// Ping/心跳事件
    ///
    /// 保持连接活跃
    Ping,
}

/// 内容块类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContentBlockType {
    /// 文本内容
    Text,
    /// 工具调用
    ToolUse {
        /// 工具调用 ID
        id: String,
        /// 工具名称
        name: String,
    },
}

/// 停止原因
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum StopReason {
    /// 正常结束
    #[default]
    EndTurn,
    /// 达到最大 token 数
    MaxTokens,
    /// 需要工具调用
    ToolUse,
    /// 用户停止
    StopSequence,
    /// 其他原因
    Other(String),
}

impl std::str::FromStr for StopReason {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "end_turn" | "stop" => Ok(Self::EndTurn),
            "max_tokens" | "length" => Ok(Self::MaxTokens),
            "tool_use" | "tool_calls" => Ok(Self::ToolUse),
            "stop_sequence" => Ok(Self::StopSequence),
            _ => Ok(Self::Other(s.to_string())),
        }
    }
}

impl StopReason {
    /// 转换为 OpenAI 格式的字符串
    pub fn to_openai_str(&self) -> &str {
        match self {
            Self::EndTurn => "stop",
            Self::MaxTokens => "length",
            Self::ToolUse => "tool_calls",
            Self::StopSequence => "stop",
            Self::Other(_) => "stop",
        }
    }

    /// 转换为 Anthropic 格式的字符串
    pub fn to_anthropic_str(&self) -> &str {
        match self {
            Self::EndTurn => "end_turn",
            Self::MaxTokens => "max_tokens",
            Self::ToolUse => "tool_use",
            Self::StopSequence => "stop_sequence",
            Self::Other(s) => s,
        }
    }
}

/// 流事件上下文
///
/// 用于在流处理过程中跟踪状态
#[derive(Debug, Clone, Default)]
pub struct StreamContext {
    /// 消息 ID
    pub message_id: Option<String>,
    /// 模型名称
    pub model: Option<String>,
    /// 当前内容块索引
    pub current_block_index: u32,
    /// 活跃的工具调用 ID 列表
    pub active_tool_calls: Vec<String>,
    /// 累计输入 tokens
    pub input_tokens: u32,
    /// 累计输出 tokens
    pub output_tokens: u32,
}

impl StreamContext {
    /// 创建新的上下文
    pub fn new() -> Self {
        Self::default()
    }

    /// 使用消息 ID 和模型创建上下文
    pub fn with_message(id: String, model: String) -> Self {
        Self {
            message_id: Some(id),
            model: Some(model),
            ..Default::default()
        }
    }

    /// 获取下一个内容块索引
    pub fn next_block_index(&mut self) -> u32 {
        let index = self.current_block_index;
        self.current_block_index += 1;
        index
    }

    /// 添加活跃的工具调用
    pub fn add_tool_call(&mut self, id: String) {
        if !self.active_tool_calls.contains(&id) {
            self.active_tool_calls.push(id);
        }
    }

    /// 移除工具调用
    pub fn remove_tool_call(&mut self, id: &str) {
        self.active_tool_calls.retain(|x| x != id);
    }

    /// 检查是否有活跃的工具调用
    pub fn has_active_tool_calls(&self) -> bool {
        !self.active_tool_calls.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stop_reason_from_str() {
        assert_eq!(
            "end_turn".parse::<StopReason>().unwrap(),
            StopReason::EndTurn
        );
        assert_eq!("stop".parse::<StopReason>().unwrap(), StopReason::EndTurn);
        assert_eq!(
            "max_tokens".parse::<StopReason>().unwrap(),
            StopReason::MaxTokens
        );
        assert_eq!(
            "length".parse::<StopReason>().unwrap(),
            StopReason::MaxTokens
        );
        assert_eq!(
            "tool_use".parse::<StopReason>().unwrap(),
            StopReason::ToolUse
        );
        assert_eq!(
            "tool_calls".parse::<StopReason>().unwrap(),
            StopReason::ToolUse
        );
    }

    #[test]
    fn test_stop_reason_to_openai() {
        assert_eq!(StopReason::EndTurn.to_openai_str(), "stop");
        assert_eq!(StopReason::MaxTokens.to_openai_str(), "length");
        assert_eq!(StopReason::ToolUse.to_openai_str(), "tool_calls");
    }

    #[test]
    fn test_stop_reason_to_anthropic() {
        assert_eq!(StopReason::EndTurn.to_anthropic_str(), "end_turn");
        assert_eq!(StopReason::MaxTokens.to_anthropic_str(), "max_tokens");
        assert_eq!(StopReason::ToolUse.to_anthropic_str(), "tool_use");
    }

    #[test]
    fn test_stream_context_block_index() {
        let mut ctx = StreamContext::new();
        assert_eq!(ctx.next_block_index(), 0);
        assert_eq!(ctx.next_block_index(), 1);
        assert_eq!(ctx.next_block_index(), 2);
    }

    #[test]
    fn test_stream_context_tool_calls() {
        let mut ctx = StreamContext::new();
        assert!(!ctx.has_active_tool_calls());

        ctx.add_tool_call("tool_1".to_string());
        assert!(ctx.has_active_tool_calls());

        ctx.add_tool_call("tool_2".to_string());
        assert_eq!(ctx.active_tool_calls.len(), 2);

        ctx.remove_tool_call("tool_1");
        assert_eq!(ctx.active_tool_calls.len(), 1);
        assert!(ctx.has_active_tool_calls());

        ctx.remove_tool_call("tool_2");
        assert!(!ctx.has_active_tool_calls());
    }
}
