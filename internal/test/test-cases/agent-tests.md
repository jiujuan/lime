# Agent 测试用例

> Aster Agent 集成的测试用例

## 概述

Agent 测试验证 Aster Agent 在 Lime 中的集成，包括：
- 基础对话功能
- 流式响应
- 工具调用
- 错误处理
- 状态管理

## 测试用例

### 1. 基础对话

#### TC-AGENT-001: 简单对话

```rust
#[tokio::test]
async fn test_simple_chat() {
    let state = create_test_agent_state().await;
    
    let response = state.chat("你好").await.unwrap();
    
    assert!(!response.content.is_empty());
    assert_eq!(response.role, "assistant");
}
```

#### TC-AGENT-002: 多轮对话

```rust
#[tokio::test]
async fn test_multi_turn_chat() {
    let state = create_test_agent_state().await;
    
    // 第一轮
    let r1 = state.chat("我叫小明").await.unwrap();
    assert!(!r1.content.is_empty());
    
    // 第二轮 - 应该记住上下文
    let r2 = state.chat("我叫什么名字？").await.unwrap();
    assert!(r2.content.contains("小明"));
}
```

#### TC-AGENT-003: 系统提示词

```rust
#[tokio::test]
async fn test_system_prompt() {
    let state = create_test_agent_state().await;
    
    state.set_system_prompt("你是一个诗人，只用诗歌回答问题").await;
    
    let response = state.chat("今天天气怎么样？").await.unwrap();
    
    // 响应应该有诗歌风格（包含换行或韵律）
    assert!(response.content.contains('\n') || response.content.len() > 50);
}
```

### 2. 流式响应

#### TC-AGENT-010: 流式输出

```rust
#[tokio::test]
async fn test_streaming_output() {
    let state = create_test_agent_state().await;
    
    let mut stream = state.chat_stream("写一首短诗").await.unwrap();
    
    let mut chunks = Vec::new();
    while let Some(chunk) = stream.next().await {
        chunks.push(chunk);
    }
    
    // 应该有多个 chunk
    assert!(chunks.len() > 1);
    
    // 合并后应该是完整内容
    let full_content: String = chunks.iter()
        .filter_map(|c| c.as_text())
        .collect();
    assert!(!full_content.is_empty());
}
```

#### TC-AGENT-011: 流式事件顺序

```rust
#[tokio::test]
async fn test_streaming_event_order() {
    let state = create_test_agent_state().await;
    
    let mut stream = state.chat_stream("你好").await.unwrap();
    
    let mut events = Vec::new();
    while let Some(event) = stream.next().await {
        events.push(event);
    }
    
    // 验证事件顺序
    let has_start = events.iter().any(|e| matches!(e, StreamEvent::Start));
    let has_delta = events.iter().any(|e| matches!(e, StreamEvent::Delta(_)));
    let has_stop = events.iter().any(|e| matches!(e, StreamEvent::Stop));
    
    assert!(has_start);
    assert!(has_delta);
    assert!(has_stop);
}
```

#### TC-AGENT-012: 流式取消

```rust
#[tokio::test]
async fn test_streaming_cancellation() {
    let state = create_test_agent_state().await;
    
    let mut stream = state.chat_stream("写一篇长文章").await.unwrap();
    
    // 只读取前几个 chunk
    let mut count = 0;
    while let Some(_) = stream.next().await {
        count += 1;
        if count >= 3 {
            break;
        }
    }
    
    // 取消流
    drop(stream);
    
    // 状态应该正确清理
    assert!(state.is_idle().await);
}
```

### 3. 工具调用

#### TC-AGENT-020: 文件读取工具

```rust
#[tokio::test]
async fn test_file_read_tool() {
    let state = create_test_agent_state().await;
    
    // 创建测试文件
    let test_file = create_temp_file("test content").await;
    
    let response = state.chat(&format!("读取文件 {}", test_file.path())).await.unwrap();
    
    // 应该调用了读取工具并返回内容
    assert!(response.content.contains("test content") || 
            response.tool_calls.iter().any(|tc| tc.name == "read_file"));
}
```

#### TC-AGENT-021: 文件写入工具

```rust
#[tokio::test]
async fn test_file_write_tool() {
    let state = create_test_agent_state().await;
    let temp_dir = create_temp_dir().await;
    let file_path = temp_dir.join("output.txt");
    
    let response = state.chat(&format!(
        "在 {} 创建一个文件，内容是 'Hello World'", 
        file_path.display()
    )).await.unwrap();
    
    // 验证文件被创建
    assert!(file_path.exists());
    let content = std::fs::read_to_string(&file_path).unwrap();
    assert!(content.contains("Hello World"));
}
```

#### TC-AGENT-022: 工具调用失败处理

```rust
#[tokio::test]
async fn test_tool_call_failure() {
    let state = create_test_agent_state().await;
    
    // 请求读取不存在的文件
    let response = state.chat("读取 /nonexistent/file.txt").await.unwrap();
    
    // Agent 应该优雅处理错误
    assert!(response.content.contains("不存在") || 
            response.content.contains("找不到") ||
            response.content.contains("无法"));
}
```

### 4. 错误处理

#### TC-AGENT-030: 网络错误恢复

```rust
#[tokio::test]
async fn test_network_error_recovery() {
    let state = create_test_agent_state_with_flaky_network().await;
    
    // 第一次可能失败
    let result1 = state.chat("你好").await;
    
    // 重试应该成功
    let result2 = state.chat("你好").await;
    
    assert!(result1.is_ok() || result2.is_ok());
}
```

#### TC-AGENT-031: 超时处理

```rust
#[tokio::test]
async fn test_timeout_handling() {
    let state = create_test_agent_state_with_timeout(Duration::from_secs(1)).await;
    
    // 长任务应该超时
    let result = state.chat("执行一个需要很长时间的复杂任务").await;
    
    assert!(result.is_err() || 
            result.unwrap().content.contains("超时"));
}
```

#### TC-AGENT-032: 无效输入处理

```rust
#[tokio::test]
async fn test_invalid_input() {
    let state = create_test_agent_state().await;
    
    // 空消息
    let result = state.chat("").await;
    assert!(result.is_err() || !result.unwrap().content.is_empty());
    
    // 超长消息
    let long_msg = "x".repeat(1_000_000);
    let result = state.chat(&long_msg).await;
    // 应该处理或拒绝，不应该崩溃
    assert!(result.is_ok() || result.is_err());
}
```

### 5. 状态管理

#### TC-AGENT-040: 会话隔离

```rust
#[tokio::test]
async fn test_session_isolation() {
    let state1 = create_test_agent_state().await;
    let state2 = create_test_agent_state().await;
    
    // 在 state1 中设置上下文
    state1.chat("我叫小明").await.unwrap();
    
    // state2 不应该知道这个信息
    let response = state2.chat("我叫什么名字？").await.unwrap();
    assert!(!response.content.contains("小明"));
}
```

#### TC-AGENT-041: 会话清理

```rust
#[tokio::test]
async fn test_session_cleanup() {
    let state = create_test_agent_state().await;
    
    // 建立上下文
    state.chat("我叫小明").await.unwrap();
    
    // 清理会话
    state.clear_session().await;
    
    // 上下文应该被清除
    let response = state.chat("我叫什么名字？").await.unwrap();
    assert!(!response.content.contains("小明"));
}
```

#### TC-AGENT-042: 并发请求

```rust
#[tokio::test]
async fn test_concurrent_requests() {
    let state = Arc::new(create_test_agent_state().await);
    
    let handles: Vec<_> = (0..5).map(|i| {
        let state = state.clone();
        tokio::spawn(async move {
            state.chat(&format!("问题 {}", i)).await
        })
    }).collect();
    
    let results: Vec<_> = futures::future::join_all(handles).await;
    
    // 所有请求应该成功或有序失败
    for result in results {
        assert!(result.is_ok());
    }
}
```

## 测试矩阵

| 测试 ID | 场景 | 类型 | 优先级 |
|---------|------|------|--------|
| TC-AGENT-001 | 简单对话 | 功能 | P0 |
| TC-AGENT-002 | 多轮对话 | 功能 | P0 |
| TC-AGENT-010 | 流式输出 | 功能 | P0 |
| TC-AGENT-020 | 文件读取 | 工具 | P1 |
| TC-AGENT-030 | 网络错误 | 错误处理 | P1 |
| TC-AGENT-040 | 会话隔离 | 状态 | P1 |

## 测试辅助函数

```rust
async fn create_test_agent_state() -> AsterAgentState {
    let config = AsterConfig {
        model: "test-model".into(),
        api_key: "test-key".into(),
        ..Default::default()
    };
    
    AsterAgentState::new(config).await.unwrap()
}

async fn create_temp_file(content: &str) -> TempFile {
    let file = TempFile::new().await.unwrap();
    file.write_all(content.as_bytes()).await.unwrap();
    file
}
```

## 运行测试

```bash
cd src-tauri && cargo test agent::
```
