//! 图片上传 legacy Tauri 命令退场占位。

const DEPRECATED_IMAGE_UPLOAD_COMMAND_MESSAGE: &str =
    "图片上传 legacy Tauri 命令已退场，请使用 App Server artifact / file current 主链。";

fn deprecated_image_upload_command() -> Result<(), String> {
    Err(DEPRECATED_IMAGE_UPLOAD_COMMAND_MESSAGE.to_string())
}

/// 上传图片到会话
#[tauri::command]
pub async fn upload_image_to_session() -> Result<(), String> {
    deprecated_image_upload_command()
}

/// 从会话中读取图片（返回 base64 编码）
#[tauri::command]
pub async fn read_image_from_session() -> Result<(), String> {
    deprecated_image_upload_command()
}
