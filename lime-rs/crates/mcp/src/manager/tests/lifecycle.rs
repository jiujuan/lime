use super::common::*;
use crate::manager::{create_mcp_manager_state, McpClientManager};
use crate::types::McpError;
use std::sync::Arc;

#[test]
fn test_manager_creation() {
    let manager = McpClientManager::new(None);
    // 验证初始状态
    assert!(manager.emitter.is_none());
}

#[tokio::test]
async fn test_initial_state() {
    let manager = McpClientManager::new(None);

    // 验证连接池为空
    assert_eq!(manager.running_server_count().await, 0);
    assert!(manager.get_running_servers().await.is_empty());

    // 验证缓存无效
    assert!(!manager.is_tool_cache_valid().await);
    assert!(manager.get_cached_tools().await.is_none());
}

#[tokio::test]
async fn test_add_client() {
    let manager = McpClientManager::new(None);
    let client = create_test_client("test-server");

    // 添加客户端
    let result = manager.add_client("test-server".to_string(), client).await;
    assert!(result.is_ok());

    // 验证客户端已添加
    assert!(manager.is_server_running("test-server").await);
    assert_eq!(manager.running_server_count().await, 1);
}

#[tokio::test]
async fn test_add_duplicate_client() {
    let manager = McpClientManager::new(None);
    let client1 = create_test_client("test-server");
    let client2 = create_test_client("test-server");

    // 添加第一个客户端
    manager
        .add_client("test-server".to_string(), client1)
        .await
        .unwrap();

    // 尝试添加重复的客户端
    let result = manager.add_client("test-server".to_string(), client2).await;
    assert!(result.is_err());

    // 验证错误类型
    match result {
        Err(McpError::ServerAlreadyRunning(name)) => {
            assert_eq!(name, "test-server");
        }
        _ => panic!("Expected ServerAlreadyRunning error"),
    }
}

#[tokio::test]
async fn test_remove_client() {
    let manager = McpClientManager::new(None);
    let client = create_test_client("test-server");

    // 添加客户端
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 移除客户端
    let removed = manager.remove_client("test-server").await;
    assert!(removed.is_some());

    // 验证客户端已移除
    assert!(!manager.is_server_running("test-server").await);
    assert_eq!(manager.running_server_count().await, 0);
}

#[tokio::test]
async fn test_remove_nonexistent_client() {
    let manager = McpClientManager::new(None);

    // 尝试移除不存在的客户端
    let removed = manager.remove_client("nonexistent").await;
    assert!(removed.is_none());
}

#[tokio::test]
async fn test_has_client_and_get_config() {
    let manager = McpClientManager::new(None);
    let client = create_test_client("test-server");

    // 添加客户端
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 检查客户端是否存在
    assert!(manager.has_client("test-server").await);
    assert!(!manager.has_client("nonexistent").await);

    // 获取客户端配置
    let config = manager.get_client_config("test-server").await;
    assert!(config.is_some());
    assert_eq!(config.unwrap().command(), "test-command");

    // 获取不存在的客户端配置
    let nonexistent_config = manager.get_client_config("nonexistent").await;
    assert!(nonexistent_config.is_none());
}

#[tokio::test]
async fn test_get_running_servers() {
    let manager = McpClientManager::new(None);

    // 添加多个客户端
    manager
        .add_client("server1".to_string(), create_test_client("server1"))
        .await
        .unwrap();
    manager
        .add_client("server2".to_string(), create_test_client("server2"))
        .await
        .unwrap();
    manager
        .add_client("server3".to_string(), create_test_client("server3"))
        .await
        .unwrap();

    // 获取运行中的服务器列表
    let servers = manager.get_running_servers().await;
    assert_eq!(servers.len(), 3);
    assert!(servers.contains(&"server1".to_string()));
    assert!(servers.contains(&"server2".to_string()));
    assert!(servers.contains(&"server3".to_string()));
}

#[tokio::test]
async fn test_tool_cache_operations() {
    let manager = McpClientManager::new(None);

    // 初始状态：缓存无效
    assert!(!manager.is_tool_cache_valid().await);
    assert!(manager.get_cached_tools().await.is_none());

    // 更新缓存
    let tools = vec![
        create_test_tool("tool1", "Test tool 1", "server1"),
        create_test_tool("tool2", "Test tool 2", "server1"),
    ];
    manager.update_tool_cache(tools.clone()).await;

    // 验证缓存有效
    assert!(manager.is_tool_cache_valid().await);
    let cached = manager.get_cached_tools().await;
    assert!(cached.is_some());
    assert_eq!(cached.unwrap().len(), 2);

    // 失效缓存
    manager.invalidate_tool_cache().await;

    // 验证缓存已失效
    assert!(!manager.is_tool_cache_valid().await);
    assert!(manager.get_cached_tools().await.is_none());
}

#[tokio::test]
async fn test_is_server_running() {
    let manager = McpClientManager::new(None);

    // 初始状态：没有服务器运行
    assert!(!manager.is_server_running("test-server").await);

    // 添加客户端
    manager
        .add_client("test-server".to_string(), create_test_client("test-server"))
        .await
        .unwrap();

    // 验证服务器正在运行
    assert!(manager.is_server_running("test-server").await);

    // 移除客户端
    manager.remove_client("test-server").await;

    // 验证服务器不再运行
    assert!(!manager.is_server_running("test-server").await);
}

#[test]
fn test_create_mcp_manager_state() {
    let state = create_mcp_manager_state(None);
    // 验证状态已创建
    assert!(Arc::strong_count(&state) >= 1);
}

#[tokio::test]
async fn test_start_server_already_running() {
    let manager = McpClientManager::new(None);

    // 先添加一个客户端模拟已运行的服务器
    let client = create_test_client("test-server");
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 尝试启动已运行的服务器
    let config = create_test_config();
    let result = manager.start_server("test-server", &config).await;

    // 应该返回 ServerAlreadyRunning 错误
    assert!(result.is_err());
    match result {
        Err(McpError::ServerAlreadyRunning(name)) => {
            assert_eq!(name, "test-server");
        }
        _ => panic!("Expected ServerAlreadyRunning error"),
    }
}

#[tokio::test]
async fn test_start_server_invalid_command() {
    let manager = McpClientManager::new(None);

    // 使用不存在的命令
    let config = create_test_config_with_command("/nonexistent/command/that/does/not/exist", 5);

    let result = manager.start_server("test-server", &config).await;

    // 应该返回 ProcessSpawnFailed 错误
    assert!(result.is_err());
    match result {
        Err(McpError::ProcessSpawnFailed(_)) => {}
        Err(e) => panic!("Expected ProcessSpawnFailed error, got: {:?}", e),
        Ok(_) => panic!("Expected error, but got Ok"),
    }
}

#[tokio::test]
async fn test_stop_server_not_running() {
    let manager = McpClientManager::new(None);

    // 停止未运行的服务器（幂等操作，应该成功）
    let result = manager.stop_server("nonexistent-server").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_stop_server_removes_from_pool() {
    let manager = McpClientManager::new(None);

    // 添加一个客户端
    let client = create_test_client("test-server");
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 验证服务器在运行
    assert!(manager.is_server_running("test-server").await);

    // 停止服务器
    let result = manager.stop_server("test-server").await;
    assert!(result.is_ok());

    // 验证服务器已停止
    assert!(!manager.is_server_running("test-server").await);
}

#[tokio::test]
async fn test_stop_server_invalidates_cache() {
    let manager = McpClientManager::new(None);

    // 添加一个客户端
    let client = create_test_client("test-server");
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 设置工具缓存
    let tools = vec![create_test_tool("tool1", "Test tool", "test-server")];
    manager.update_tool_cache(tools).await;
    assert!(manager.is_tool_cache_valid().await);

    // 停止服务器
    manager.stop_server("test-server").await.unwrap();

    // 验证缓存已失效
    assert!(!manager.is_tool_cache_valid().await);
}

#[tokio::test]
async fn test_restart_server_stops_then_starts() {
    let manager = McpClientManager::new(None);

    // 添加一个客户端模拟已运行的服务器
    let client = create_test_client("test-server");
    manager
        .add_client("test-server".to_string(), client)
        .await
        .unwrap();

    // 使用无效命令重启（会失败在启动阶段）
    let config = create_test_config_with_command("/nonexistent/command", 5);

    // 重启应该先停止成功，然后启动失败
    let result = manager.restart_server("test-server", &config).await;
    assert!(result.is_err());

    // 验证服务器已被停止（即使启动失败）
    assert!(!manager.is_server_running("test-server").await);
}

// ========================================================================
// 工具名称冲突解决测试（Task 4.3）
// ========================================================================
