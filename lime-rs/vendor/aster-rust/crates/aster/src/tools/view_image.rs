//! 本地图片查看工具。
//!
//! `Read` 工具会把图片编码塞进文本输出；`view_image` 则把图片作为
//! model-visible image content 返回，避免模型只能看到 base64 字符串。

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use std::path::{Path, PathBuf};

use crate::media::{estimate_image_tokens, is_supported_image_format, read_image_file_enhanced};
use crate::tools::base::{PermissionCheckResult, Tool};
use crate::tools::context::{ToolContext, ToolResult};
use crate::tools::error::ToolError;
use crate::tools::file::read::MAX_IMAGE_FILE_SIZE;

pub const VIEW_IMAGE_TOOL_NAME: &str = "view_image";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ViewImageDetail {
    High,
    Original,
}

impl ViewImageDetail {
    fn parse(raw: Option<&str>) -> Result<Self, ToolError> {
        match raw.map(str::trim).filter(|value| !value.is_empty()) {
            None | Some("high") => Ok(Self::High),
            Some("original") => Ok(Self::Original),
            Some(value) => Err(ToolError::invalid_params(format!(
                "view_image.detail only supports `high` or `original`, got `{value}`"
            ))),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Original => "original",
        }
    }
}

#[derive(Debug, Deserialize)]
struct ViewImageInput {
    path: String,
    #[serde(default)]
    detail: Option<String>,
}

#[derive(Debug, Default)]
pub struct ViewImageTool;

impl ViewImageTool {
    pub fn new() -> Self {
        Self
    }

    fn resolve_path(raw_path: &str, working_directory: &Path) -> Result<PathBuf, ToolError> {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            return Err(ToolError::invalid_params(
                "Missing required parameter: path",
            ));
        }

        if trimmed.starts_with("file://") {
            return url::Url::parse(trimmed)
                .map_err(|error| {
                    ToolError::invalid_params(format!("Invalid file URL `{trimmed}`: {error}"))
                })?
                .to_file_path()
                .map_err(|_| {
                    ToolError::invalid_params(format!(
                        "Invalid local file URL for view_image: `{trimmed}`"
                    ))
                });
        }

        let path = PathBuf::from(trimmed);
        if path.is_absolute() {
            Ok(path)
        } else {
            Ok(working_directory.join(path))
        }
    }

    fn ensure_supported_image(path: &Path) -> Result<(), ToolError> {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if is_supported_image_format(extension) {
            return Ok(());
        }

        Err(ToolError::invalid_params(format!(
            "Unsupported image format `{}`. Supported formats: png, jpg, jpeg, gif, webp",
            extension
        )))
    }

    fn format_output(
        path: &Path,
        mime_type: &str,
        size_bytes: u64,
        token_estimate: u64,
        detail: ViewImageDetail,
        dimensions: Option<&crate::media::ImageDimensions>,
    ) -> String {
        let mut lines = vec![
            format!("Viewed image: {}", path.display()),
            format!("Format: {mime_type}"),
            format!(
                "Size: {} KB ({size_bytes} bytes)",
                size_bytes.div_ceil(1024)
            ),
            format!("Detail: {}", detail.as_str()),
            format!("Estimated tokens: {token_estimate}"),
        ];

        if let Some(dimensions) = dimensions {
            if let (Some(width), Some(height)) =
                (dimensions.original_width, dimensions.original_height)
            {
                lines.push(format!("Dimensions: {width}x{height}"));
            }
        }

        lines.push("Image content is attached to this tool result.".to_string());
        lines.join("\n")
    }
}

#[async_trait]
impl Tool for ViewImageTool {
    fn name(&self) -> &str {
        VIEW_IMAGE_TOOL_NAME
    }

    fn description(&self) -> &str {
        "View a local image from the filesystem and return it as image content for vision-capable models. Only use when the user gives a local image path and the image is not already attached to the conversation."
    }

    fn input_schema(&self) -> serde_json::Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Local filesystem path to an image file. Relative paths are resolved against the working directory."
                },
                "detail": {
                    "type": "string",
                    "enum": ["high", "original"],
                    "description": "Optional detail hint. Omit or use `high` for default behavior; use `original` when high-fidelity perception is needed."
                }
            },
            "required": ["path"]
        })
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["ViewImage", "ViewImageTool"]
    }

    async fn execute(
        &self,
        params: serde_json::Value,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let input: ViewImageInput = serde_json::from_value(params)
            .map_err(|error| ToolError::invalid_params(format!("Invalid input: {error}")))?;
        let detail = ViewImageDetail::parse(input.detail.as_deref())?;
        let path = Self::resolve_path(&input.path, &context.working_directory)?;
        Self::ensure_supported_image(&path)?;

        let metadata = std::fs::metadata(&path)?;
        if !metadata.is_file() {
            return Err(ToolError::execution_failed(format!(
                "Image path is not a file: {}",
                path.display()
            )));
        }
        if metadata.len() > MAX_IMAGE_FILE_SIZE {
            return Err(ToolError::execution_failed(format!(
                "Image too large: {} bytes (max: {} bytes)",
                metadata.len(),
                MAX_IMAGE_FILE_SIZE
            )));
        }

        let image = read_image_file_enhanced(&path).map_err(|error| {
            ToolError::execution_failed(format!("Failed to read image: {error}"))
        })?;
        let token_estimate = estimate_image_tokens(&image.base64);
        let image_url = format!("data:{};base64,{}", image.mime_type, image.base64);
        let dimensions = image.dimensions.as_ref();
        let output = Self::format_output(
            &path,
            &image.mime_type,
            image.original_size,
            token_estimate,
            detail,
            dimensions,
        );

        let mut result = ToolResult::success(output)
            .with_metadata("tool_result_kind", json!("view_image"))
            .with_metadata("model_visible_image", json!(true))
            .with_metadata("image_url", json!(image_url))
            .with_metadata("mime_type", json!(image.mime_type))
            .with_metadata("path", json!(path.display().to_string()))
            .with_metadata("detail", json!(detail.as_str()))
            .with_metadata("original_size", json!(image.original_size))
            .with_metadata("token_estimate", json!(token_estimate));

        if let Some(dimensions) = dimensions {
            result = result.with_metadata(
                "dimensions",
                json!({
                    "original_width": dimensions.original_width,
                    "original_height": dimensions.original_height,
                    "display_width": dimensions.display_width,
                    "display_height": dimensions.display_height,
                }),
            );
        }

        Ok(result)
    }

    async fn check_permissions(
        &self,
        params: &serde_json::Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        let Some(path) = params.get("path").and_then(serde_json::Value::as_str) else {
            return PermissionCheckResult::deny("Missing path parameter");
        };

        match Self::resolve_path(path, &context.working_directory) {
            Ok(path) => {
                tracing::debug!("Permission check for view_image: {}", path.display());
                PermissionCheckResult::allow()
            }
            Err(error) => PermissionCheckResult::deny(error.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_BYTES: &[u8] = b"\x89PNG\r\n\x1a\nminimal-png";

    #[tokio::test]
    async fn view_image_returns_model_visible_image_metadata_without_base64_output() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let image_path = temp_dir.path().join("sample.png");
        std::fs::write(&image_path, PNG_BYTES).expect("write png");

        let tool = ViewImageTool::new();
        let result = tool
            .execute(
                json!({ "path": "sample.png" }),
                &ToolContext::new(temp_dir.path().to_path_buf()),
            )
            .await
            .expect("view image result");

        let output = result.output.expect("output");
        assert!(output.contains("Viewed image:"));
        assert!(output.contains("Format: image/png"));
        assert!(!output.contains("base64,"));
        assert_eq!(
            result.metadata.get("model_visible_image"),
            Some(&json!(true))
        );
        assert_eq!(result.metadata.get("mime_type"), Some(&json!("image/png")));
        assert_eq!(result.metadata.get("detail"), Some(&json!("high")));
        assert_eq!(
            result
                .metadata
                .get("image_url")
                .and_then(|value| value.as_str()),
            Some("data:image/png;base64,iVBORw0KGgptaW5pbWFsLXBuZw==")
        );
    }

    #[tokio::test]
    async fn view_image_rejects_invalid_detail() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let image_path = temp_dir.path().join("sample.png");
        std::fs::write(&image_path, PNG_BYTES).expect("write png");

        let tool = ViewImageTool::new();
        let error = tool
            .execute(
                json!({ "path": "sample.png", "detail": "low" }),
                &ToolContext::new(temp_dir.path().to_path_buf()),
            )
            .await
            .expect_err("invalid detail should fail");

        assert!(error
            .to_string()
            .contains("only supports `high` or `original`"));
    }
}
