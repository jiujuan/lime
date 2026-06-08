//! 文档导入 / 导出 legacy Tauri 命令退场占位。

const DEPRECATED_DOCUMENT_IMPORT_COMMAND_MESSAGE: &str =
    "文档导入 / 导出 legacy Tauri 命令已退场，请使用 App Server 或 Electron Desktop Host current 文件通道。";

fn deprecated_document_import_command() -> Result<(), String> {
    Err(DEPRECATED_DOCUMENT_IMPORT_COMMAND_MESSAGE.to_string())
}

/// 导入文档内容
#[tauri::command]
pub async fn import_document() -> Result<(), String> {
    deprecated_document_import_command()
}

/// 导入文档并保存到会话
#[tauri::command]
pub async fn import_document_to_session() -> Result<(), String> {
    deprecated_document_import_command()
}

/// 保存导出的文档到指定路径
#[tauri::command]
pub async fn save_exported_document() -> Result<(), String> {
    deprecated_document_import_command()
}
