use crate::manager::McpClientManager;
use crate::types::McpError;

#[tokio::test]
async fn test_list_resources_returns_empty_when_no_servers() {
    let manager = McpClientManager::new(None);

    // 没有运行的服务器时，应该返回空列表
    let result = manager.list_resources().await.unwrap();
    assert!(result.is_empty());
}

#[tokio::test]
async fn test_list_resource_templates_returns_empty_when_no_servers() {
    let manager = McpClientManager::new(None);

    // 没有运行的服务器时，应该返回空列表
    let result = manager.list_resource_templates().await.unwrap();
    assert!(result.is_empty());
}

#[tokio::test]
async fn test_read_resource_not_found() {
    let manager = McpClientManager::new(None);

    // 读取不存在的资源
    let result = manager.read_resource("file:///nonexistent/resource").await;

    // 应该返回错误
    assert!(result.is_err());
    match result {
        Err(McpError::ToolNotFound(msg)) => {
            assert!(msg.contains("资源不存在"));
        }
        _ => panic!("Expected ToolNotFound error"),
    }
}

#[tokio::test]
async fn test_subscribe_resource_not_found() {
    let manager = McpClientManager::new(None);

    let result = manager
        .subscribe_resource("file:///nonexistent/resource")
        .await;

    assert!(matches!(result, Err(McpError::ToolNotFound(_))));
}

#[tokio::test]
async fn test_unsubscribe_resource_not_found() {
    let manager = McpClientManager::new(None);

    let result = manager
        .unsubscribe_resource("file:///nonexistent/resource")
        .await;

    assert!(matches!(result, Err(McpError::ToolNotFound(_))));
}

#[test]
fn test_convert_resource_to_definition() {
    use rmcp::model::{AnnotateAble, RawResource};

    // 创建一个 rmcp Resource
    let raw_resource = RawResource {
        uri: "file:///test/resource.txt".to_string(),
        name: "resource.txt".to_string(),
        title: Some("Test Resource".to_string()),
        description: Some("A test resource".to_string()),
        mime_type: Some("text/plain".to_string()),
        size: Some(1024),
        icons: None,
        meta: None,
    };
    let resource = raw_resource.no_annotation();

    // 转换为 McpResourceDefinition
    let definition =
        McpClientManager::convert_resource_to_definition(resource, "test_server".to_string());

    // 验证转换结果
    assert_eq!(definition.uri, "file:///test/resource.txt");
    assert_eq!(definition.name, "resource.txt");
    assert_eq!(definition.description, Some("A test resource".to_string()));
    assert_eq!(definition.mime_type, Some("text/plain".to_string()));
    assert_eq!(definition.server_name, "test_server");
}

#[test]
fn test_convert_resource_to_definition_minimal() {
    use rmcp::model::{AnnotateAble, RawResource};

    // 创建一个最小的 rmcp Resource（只有必需字段）
    let raw_resource =
        RawResource::new("file:///minimal.txt".to_string(), "minimal.txt".to_string());
    let resource = raw_resource.no_annotation();

    // 转换为 McpResourceDefinition
    let definition =
        McpClientManager::convert_resource_to_definition(resource, "server1".to_string());

    // 验证转换结果
    assert_eq!(definition.uri, "file:///minimal.txt");
    assert_eq!(definition.name, "minimal.txt");
    assert!(definition.description.is_none());
    assert!(definition.mime_type.is_none());
    assert_eq!(definition.server_name, "server1");
}

#[test]
fn test_convert_resource_template_to_definition() {
    use rmcp::model::{AnnotateAble, RawResourceTemplate};

    let raw_template = RawResourceTemplate {
        uri_template: "file:///{path}".to_string(),
        name: "workspace-file".to_string(),
        title: Some("Workspace File".to_string()),
        description: Some("Read a workspace file by path".to_string()),
        mime_type: Some("text/plain".to_string()),
    };
    let template = raw_template.no_annotation();

    let definition =
        McpClientManager::convert_resource_template_to_definition(template, "docs".to_string());

    assert_eq!(definition.uri_template, "file:///{path}");
    assert_eq!(definition.name, "workspace-file");
    assert_eq!(definition.title, Some("Workspace File".to_string()));
    assert_eq!(
        definition.description,
        Some("Read a workspace file by path".to_string())
    );
    assert_eq!(definition.mime_type, Some("text/plain".to_string()));
    assert_eq!(definition.server_name, "docs");
}

#[test]
fn test_convert_read_resource_result_text() {
    // 创建文本资源内容
    let result = rmcp::model::ReadResourceResult {
        contents: vec![rmcp::model::ResourceContents::text(
            "Hello, World!",
            "file:///test.txt",
        )],
    };

    // 转换为 McpResourceContent
    let mcp_content = McpClientManager::convert_read_resource_result("file:///test.txt", result);

    // 验证转换结果
    assert_eq!(mcp_content.uri, "file:///test.txt");
    assert_eq!(mcp_content.mime_type, Some("text".to_string()));
    assert_eq!(mcp_content.text, Some("Hello, World!".to_string()));
    assert!(mcp_content.blob.is_none());
}

#[test]
fn test_convert_read_resource_result_blob() {
    // 创建二进制资源内容
    let result = rmcp::model::ReadResourceResult {
        contents: vec![rmcp::model::ResourceContents::BlobResourceContents {
            uri: "file:///test.bin".to_string(),
            mime_type: Some("application/octet-stream".to_string()),
            blob: "base64encodeddata".to_string(),
            meta: None,
        }],
    };

    // 转换为 McpResourceContent
    let mcp_content = McpClientManager::convert_read_resource_result("file:///test.bin", result);

    // 验证转换结果
    assert_eq!(mcp_content.uri, "file:///test.bin");
    assert_eq!(
        mcp_content.mime_type,
        Some("application/octet-stream".to_string())
    );
    assert!(mcp_content.text.is_none());
    assert_eq!(mcp_content.blob, Some("base64encodeddata".to_string()));
}

#[test]
fn test_convert_read_resource_result_empty() {
    // 创建空的资源结果
    let result = rmcp::model::ReadResourceResult { contents: vec![] };

    // 转换为 McpResourceContent
    let mcp_content = McpClientManager::convert_read_resource_result("file:///empty.txt", result);

    // 验证转换结果（应该返回空内容）
    assert_eq!(mcp_content.uri, "file:///empty.txt");
    assert!(mcp_content.mime_type.is_none());
    assert!(mcp_content.text.is_none());
    assert!(mcp_content.blob.is_none());
}
