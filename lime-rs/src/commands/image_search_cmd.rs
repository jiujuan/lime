//! 图片搜索 legacy Tauri 命令退场占位。

const DEPRECATED_IMAGE_SEARCH_COMMAND_MESSAGE: &str =
    "图片搜索 legacy Tauri 命令已退场，请使用 App Server provider / evidence current 主链。";

fn deprecated_image_search_command() -> Result<(), String> {
    Err(DEPRECATED_IMAGE_SEARCH_COMMAND_MESSAGE.to_string())
}

/// 搜索 Pixabay 图片。
#[tauri::command]
pub async fn search_pixabay_images() -> Result<(), String> {
    deprecated_image_search_command()
}

/// 联网搜索图片。
#[tauri::command]
pub async fn search_web_images() -> Result<(), String> {
    deprecated_image_search_command()
}
