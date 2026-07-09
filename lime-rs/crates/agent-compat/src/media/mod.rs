//! Media stub kept only while Aster file read tools are being removed.

use std::path::Path;

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

pub struct EnhancedImageRead {
    pub base64: String,
    pub mime_type: String,
    pub original_size: u64,
    pub dimensions: Option<ImageDimensions>,
}

pub struct ImageDimensions {
    pub original_width: Option<u32>,
    pub original_height: Option<u32>,
    pub display_width: Option<u32>,
    pub display_height: Option<u32>,
}

pub fn read_image_file_enhanced(path: &Path) -> Result<EnhancedImageRead> {
    let content = std::fs::read(path)?;
    let mime_type = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(image_mime_type)
        .unwrap_or("application/octet-stream")
        .to_string();
    Ok(EnhancedImageRead {
        base64: BASE64.encode(&content),
        mime_type,
        original_size: content.len() as u64,
        dimensions: None,
    })
}

pub fn estimate_image_tokens(base64: &str) -> u64 {
    (base64.len() as u64 / 4).max(1)
}

pub fn is_supported_image_format(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "svg"
    )
}

pub fn is_pdf_extension(extension: &str) -> bool {
    extension.eq_ignore_ascii_case("pdf")
}

fn image_mime_type(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}
