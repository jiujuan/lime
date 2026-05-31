# Lime Agent 评估指南

> 基于 Anthropic AI Agent 评估指南的实践

## 概述

Lime 集成了 Aster Agent，需要专门的评估体系来确保 Agent 行为的正确性和稳定性。本指南基于 Anthropic 官方评估指南和 Orchids Bridge 项目的实践经验。

## 核心概念

### 评估术语

| 术语 | 定义 | Lime 示例 |
|------|------|----------------|
| **Task** | 单个测试任务 | "使用 Agent 读取文件并总结" |
| **Trial** | 对任务的一次尝试 | 同一任务运行 5 次 |
| **Grader** | 评分器 | 代码检查、LLM 判断 |
| **Transcript** | 完整记录 | Agent 的所有消息和工具调用 |
| **Outcome** | 最终结果 | 任务是否完成 |

### 评分器类型

```
┌─────────────────────────────────────────────────────────────────┐
│                        评分器类型                                │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   代码评分器     │   模型评分器     │       人工评分器            │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • 工具调用验证   │ • 回答质量评估   │ • 复杂任务评审              │
│ • 输出格式检查   │ • 语义相似度     │ • 边界情况判断              │
│ • 状态断言       │ • 多轮对话评估   │ • 用户体验评估              │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## 评估场景

### 1. 工具调用评估

验证 Agent 正确调用工具：

```rust
#[cfg(test)]
mod agent_tool_tests {
    use super::*;

    #[tokio::test]
    async fn test_file_read_tool_call() {
        let agent = create_test_agent().await;
        
        let response = agent.chat("请读取 /test/file.txt 的内容").await;
        
        // 验证工具调用
        assert!(response.tool_calls.iter().any(|tc| {
            tc.name == "read_file" && 
            tc.args.get("path") == Some(&"/test/file.txt".into())
        }));
    }

    #[tokio::test]
    async fn test_no_unnecessary_tool_calls() {
        let agent = create_test_agent().await;
        
        // 简单问题不应该调用工具
        let response = agent.chat("1 + 1 等于多少？").await;
        
        assert!(response.tool_calls.is_empty());
    }
}
```

### 2. 流式响应评估

验证流式输出的正确性：

```rust
#[tokio::test]
async fn test_streaming_response_format() {
    let agent = create_test_agent().await;
    let mut stream = agent.chat_stream("你好").await;
    
    let mut events = Vec::new();
    while let Some(event) = stream.next().await {
        events.push(event);
    }
    
    // 验证事件序列
    assert!(events.iter().any(|e| matches!(e, StreamEvent::Start)));
    assert!(events.iter().any(|e| matches!(e, StreamEvent::Delta(_))));
    assert!(events.iter().any(|e| matches!(e, StreamEvent::Stop)));
}

#[tokio::test]
async fn test_streaming_content_accumulation() {
    let agent = create_test_agent().await;
    let mut stream = agent.chat_stream("写一首短诗").await;
    
    let mut content = String::new();
    while let Some(event) = stream.next().await {
        if let StreamEvent::Delta(delta) = event {
            content.push_str(&delta);
        }
    }
    
    // 验证内容非空且有意义
    assert!(!content.is_empty());
    assert!(content.len() > 20);
}
```

### 3. 错误处理评估

验证 Agent 正确处理错误：

```rust
#[tokio::test]
async fn test_invalid_tool_graceful_handling() {
    let agent = create_test_agent().await;
    
    // 请求不存在的文件
    let response = agent.chat("读取 /nonexistent/file.txt").await;
    
    // Agent 应该优雅处理错误
    assert!(response.content.contains("文件不存在") || 
            response.content.contains("无法找到"));
}

#[tokio::test]
async fn test_timeout_handling() {
    let agent = create_test_agent_with_timeout(Duration::from_secs(1)).await;
    
    // 长时间任务应该超时
    let result = agent.chat("执行一个需要很长时间的任务").await;
    
    assert!(result.is_err() || result.unwrap().content.contains("超时"));
}
```

## 评估指标

### pass@k 与 pass^k

```
pass@k = P(至少 1 次成功 | k 次尝试)
pass^k = P(全部成功 | k 次尝试)
```

**应用场景**：
- **pass@k**：代码生成、创意任务（找到一个解决方案即可）
- **pass^k**：关键操作、用户交互（每次都必须成功）

### 评估脚本

```rust
async fn evaluate_task(task: &Task, trials: usize) -> EvalResult {
    let mut successes = 0;
    let mut transcripts = Vec::new();
    
    for _ in 0..trials {
        let agent = create_fresh_agent().await;
        let transcript = agent.run_task(task).await;
        
        let passed = task.grader.evaluate(&transcript);
        if passed {
            successes += 1;
        }
        
        transcripts.push(transcript);
    }
    
    EvalResult {
        task_id: task.id.clone(),
        trials,
        successes,
        pass_at_k: 1.0 - (1.0 - successes as f64 / trials as f64).powi(trials as i32),
        pass_pow_k: (successes as f64 / trials as f64).powi(trials as i32),
        transcripts,
    }
}
```

## 测试套件组织

### 能力评估 vs 回归评估

| 类型 | 目标 | 初始通过率 | 用途 |
|------|------|-----------|------|
| **能力评估** | Agent 能做什么？ | 低 | 推动改进 |
| **回归评估** | Agent 还能做以前能做的吗？ | ~100% | 防止退化 |

### 测试套件结构

```
tests/agent/
├── capability/              # 能力评估
│   ├── file_operations.rs   # 文件操作能力
│   ├── code_generation.rs   # 代码生成能力
│   └── reasoning.rs         # 推理能力
├── regression/              # 回归评估
│   ├── basic_chat.rs        # 基础对话
│   ├── tool_calls.rs        # 工具调用
│   └── streaming.rs         # 流式响应
└── edge_cases/              # 边界情况
    ├── error_handling.rs
    └── timeout.rs
```

## 评估原则

### 1. 评估结果，而非路径

```rust
// ❌ 错误：检查具体的工具调用顺序
fn test_bad() {
    assert_eq!(transcript[0].tool, "list_files");
    assert_eq!(transcript[1].tool, "read_file");
}

// ✅ 正确：检查最终结果
fn test_good() {
    assert!(outcome.file_content.contains("expected content"));
}
```

### 2. 平衡问题集

```rust
// 测试"应该做"
#[test]
fn test_should_read_file_when_asked() { ... }

// 测试"不应该做"
#[test]
fn test_should_not_read_file_without_permission() { ... }
```

### 3. 从 Bug 到测试

每个修复的 Bug 都应该有对应的测试用例：

```rust
// Bug: Agent 在文件不存在时无限重试
// 修复后添加测试
#[test]
fn test_no_infinite_retry_on_missing_file() {
    let agent = create_test_agent();
    let response = agent.chat("读取 /nonexistent.txt").await;
    
    // 验证重试次数有限
    assert!(response.tool_calls.len() <= 3);
}
```

## 运行评估

```bash
# 运行所有 Agent 评估
cd src-tauri && cargo test agent::

# 运行能力评估
cargo test agent::capability::

# 运行回归评估
cargo test agent::regression::

# 运行多次试验
cargo test agent:: -- --test-threads=1 --nocapture
```

## 下一步

- [测试用例：Agent](test-cases/agent-tests.md)
- [单元测试指南](unit-tests.md)
