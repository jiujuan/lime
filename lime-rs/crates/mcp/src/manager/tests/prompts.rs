use crate::manager::McpClientManager;
use crate::types::{McpContent, McpError};

#[tokio::test]
async fn test_list_prompts_returns_empty_when_no_servers() {
    let manager = McpClientManager::new(None);

    // 没有运行的服务器时，应该返回空列表
    let result = manager.list_prompts().await.unwrap();
    assert!(result.is_empty());
}

#[tokio::test]
async fn test_get_prompt_not_found() {
    let manager = McpClientManager::new(None);

    // 获取不存在的提示词
    let result = manager
        .get_prompt("nonexistent_prompt", serde_json::Map::new())
        .await;

    // 应该返回错误
    assert!(result.is_err());
    match result {
        Err(McpError::ToolNotFound(msg)) => {
            assert!(msg.contains("nonexistent_prompt"));
        }
        _ => panic!("Expected ToolNotFound error"),
    }
}

#[test]
fn test_convert_prompt_to_definition() {
    // 创建一个 rmcp Prompt
    let prompt = rmcp::model::Prompt {
        name: "test_prompt".into(),
        title: Some("Test Prompt Title".into()),
        description: Some("A test prompt description".into()),
        arguments: Some(vec![
            rmcp::model::PromptArgument {
                name: "arg1".to_string(),
                title: None,
                description: Some("First argument".to_string()),
                required: Some(true),
            },
            rmcp::model::PromptArgument {
                name: "arg2".to_string(),
                title: None,
                description: Some("Second argument".to_string()),
                required: Some(false),
            },
        ]),
        icons: None,
        meta: None,
    };

    // 转换为 McpPromptDefinition
    let definition =
        McpClientManager::convert_prompt_to_definition(prompt, "test_server".to_string());

    // 验证转换结果
    assert_eq!(definition.name, "test_prompt");
    assert_eq!(
        definition.description,
        Some("A test prompt description".to_string())
    );
    assert_eq!(definition.server_name, "test_server");
    assert_eq!(definition.arguments.len(), 2);

    // 验证第一个参数
    assert_eq!(definition.arguments[0].name, "arg1");
    assert_eq!(
        definition.arguments[0].description,
        Some("First argument".to_string())
    );
    assert!(definition.arguments[0].required);

    // 验证第二个参数
    assert_eq!(definition.arguments[1].name, "arg2");
    assert_eq!(
        definition.arguments[1].description,
        Some("Second argument".to_string())
    );
    assert!(!definition.arguments[1].required);
}

#[test]
fn test_convert_prompt_to_definition_no_arguments() {
    // 创建一个没有参数的 rmcp Prompt
    let prompt = rmcp::model::Prompt {
        name: "simple_prompt".into(),
        title: None,
        description: None,
        arguments: None,
        icons: None,
        meta: None,
    };

    // 转换为 McpPromptDefinition
    let definition = McpClientManager::convert_prompt_to_definition(prompt, "server1".to_string());

    // 验证转换结果
    assert_eq!(definition.name, "simple_prompt");
    assert!(definition.description.is_none());
    assert_eq!(definition.server_name, "server1");
    assert!(definition.arguments.is_empty());
}

#[test]
fn test_convert_prompt_message_user() {
    // 创建一个用户消息
    let msg = rmcp::model::PromptMessage::new_text(
        rmcp::model::PromptMessageRole::User,
        "Hello, assistant!",
    );

    // 转换为 McpPromptMessage
    let mcp_msg = McpClientManager::convert_prompt_message(msg);

    // 验证转换结果
    assert_eq!(mcp_msg.role, "user");
    match mcp_msg.content {
        McpContent::Text { text } => {
            assert_eq!(text, "Hello, assistant!");
        }
        _ => panic!("Expected Text content"),
    }
}

#[test]
fn test_convert_prompt_message_assistant() {
    // 创建一个助手消息
    let msg = rmcp::model::PromptMessage::new_text(
        rmcp::model::PromptMessageRole::Assistant,
        "Hello, user!",
    );

    // 转换为 McpPromptMessage
    let mcp_msg = McpClientManager::convert_prompt_message(msg);

    // 验证转换结果
    assert_eq!(mcp_msg.role, "assistant");
    match mcp_msg.content {
        McpContent::Text { text } => {
            assert_eq!(text, "Hello, user!");
        }
        _ => panic!("Expected Text content"),
    }
}

#[test]
fn test_convert_prompt_message_content_text() {
    // 创建文本内容
    let content = rmcp::model::PromptMessageContent::Text {
        text: "Test text content".to_string(),
    };

    // 转换为 McpContent
    let mcp_content = McpClientManager::convert_prompt_message_content(content);

    // 验证转换结果
    match mcp_content {
        McpContent::Text { text } => {
            assert_eq!(text, "Test text content");
        }
        _ => panic!("Expected Text content"),
    }
}

#[test]
fn test_convert_get_prompt_result() {
    // 创建 GetPromptResult
    let result = rmcp::model::GetPromptResult {
        description: Some("Test prompt result".into()),
        messages: vec![
            rmcp::model::PromptMessage::new_text(
                rmcp::model::PromptMessageRole::User,
                "User message",
            ),
            rmcp::model::PromptMessage::new_text(
                rmcp::model::PromptMessageRole::Assistant,
                "Assistant response",
            ),
        ],
    };

    // 转换为 McpPromptResult
    let mcp_result = McpClientManager::convert_get_prompt_result(result);

    // 验证转换结果
    assert_eq!(
        mcp_result.description,
        Some("Test prompt result".to_string())
    );
    assert_eq!(mcp_result.messages.len(), 2);
    assert_eq!(mcp_result.messages[0].role, "user");
    assert_eq!(mcp_result.messages[1].role, "assistant");
}

// ========================================================================
// 资源管理测试（Task 4.5）
// ========================================================================
