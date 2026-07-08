//! file request processor tests.

use super::super::*;
use app_server_protocol::{
    ClientCapabilities, JsonRpcMessage, METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
    METHOD_FILE_SYSTEM_CREATE_FILE, METHOD_FILE_SYSTEM_DELETE_FILE,
    METHOD_FILE_SYSTEM_LIST_DIRECTORY, METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
    METHOD_FILE_SYSTEM_RENAME_FILE, METHOD_INITIALIZE, METHOD_INITIALIZED, RequestId,
};
use serde_json::json;

#[tokio::test]
async fn app_server_file_system_methods_require_initialized_and_return_current_results() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_FILE_SYSTEM_CREATE_FILE,
            Some(json!({ "path": "." })),
        ))
        .await
        .expect("blocked response");
    assert!(matches!(
        &blocked[0],
        JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
    ));

    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "test-client".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })
                .expect("initialize params"),
            ),
        ))
        .await
        .expect("initialize");
    processor.handle_notification(JsonRpcNotification::new(
        METHOD_INITIALIZED,
        Some(json!({})),
    ));

    let temp_dir = tempfile::tempdir().expect("temp dir");
    let file_path = temp_dir.path().join("README.md");
    std::fs::write(&file_path, "# Lime").expect("write file");
    let created_file_path = temp_dir.path().join("created.txt");
    let created_dir_path = temp_dir.path().join("created-dir");
    let renamed_file_path = temp_dir.path().join("renamed.txt");
    let expected_dir_path = std::fs::canonicalize(temp_dir.path())
        .expect("canonical temp dir")
        .to_string_lossy()
        .into_owned();
    let expected_file_path = std::fs::canonicalize(&file_path)
        .expect("canonical file")
        .to_string_lossy()
        .into_owned();

    let listing_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(3),
            METHOD_FILE_SYSTEM_LIST_DIRECTORY,
            Some(json!({ "path": temp_dir.path() })),
        ))
        .await
        .expect("directory listing response");
    match &listing_messages[0] {
        JsonRpcMessage::Response(response) => {
            let actual_dir_path =
                std::fs::canonicalize(response.result["path"].as_str().expect("listing path"))
                    .expect("canonical response dir")
                    .to_string_lossy()
                    .into_owned();
            assert_eq!(actual_dir_path.as_str(), expected_dir_path.as_str());
            assert_eq!(response.result["entries"][0]["name"], "README.md");
        }
        other => panic!("expected response, got {other:?}"),
    }

    let create_file_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(5),
            METHOD_FILE_SYSTEM_CREATE_FILE,
            Some(json!({ "path": created_file_path })),
        ))
        .await
        .expect("create file response");
    assert!(matches!(
        &create_file_messages[0],
        JsonRpcMessage::Response(response)
            if response.result == serde_json::json!({})
    ));
    assert!(created_file_path.is_file());

    let create_directory_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(6),
            METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
            Some(json!({ "path": created_dir_path })),
        ))
        .await
        .expect("create directory response");
    assert!(matches!(
        &create_directory_messages[0],
        JsonRpcMessage::Response(response)
            if response.result == serde_json::json!({})
    ));
    assert!(created_dir_path.is_dir());

    let rename_file_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(7),
            METHOD_FILE_SYSTEM_RENAME_FILE,
            Some(json!({
                "oldPath": created_file_path,
                "newPath": renamed_file_path,
            })),
        ))
        .await
        .expect("rename file response");
    assert!(matches!(
        &rename_file_messages[0],
        JsonRpcMessage::Response(response)
            if response.result == serde_json::json!({})
    ));
    assert!(!created_file_path.exists());
    assert!(renamed_file_path.is_file());

    let delete_file_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(8),
            METHOD_FILE_SYSTEM_DELETE_FILE,
            Some(json!({
                "path": renamed_file_path,
                "recursive": false,
            })),
        ))
        .await
        .expect("delete file response");
    assert!(matches!(
        &delete_file_messages[0],
        JsonRpcMessage::Response(response)
            if response.result == serde_json::json!({})
    ));
    assert!(!renamed_file_path.exists());

    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(9),
            METHOD_FILE_SYSTEM_DELETE_FILE,
            Some(json!({
                "path": created_dir_path,
                "recursive": true,
            })),
        ))
        .await
        .expect("delete directory response");
    assert!(!created_dir_path.exists());

    let preview_messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(10),
            METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
            Some(json!({
                "path": file_path,
                "maxSize": 1024,
            })),
        ))
        .await
        .expect("file preview response");
    match &preview_messages[0] {
        JsonRpcMessage::Response(response) => {
            let actual_file_path =
                std::fs::canonicalize(response.result["path"].as_str().expect("preview path"))
                    .expect("canonical response file")
                    .to_string_lossy()
                    .into_owned();
            assert_eq!(actual_file_path.as_str(), expected_file_path.as_str());
            assert_eq!(response.result["content"], "# Lime");
            assert_eq!(response.result["isBinary"], false);
        }
        other => panic!("expected response, got {other:?}"),
    }
}
