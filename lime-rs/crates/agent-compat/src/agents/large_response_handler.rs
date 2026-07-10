use chrono::Utc;
use rmcp::model::{CallToolResult, Content, ErrorData};
use std::fs::File;
use std::io::Write;

const LARGE_TEXT_THRESHOLD: usize = 200_000;

/// Process tool response and handle large text content
pub fn process_tool_response(
    response: Result<CallToolResult, ErrorData>,
) -> Result<CallToolResult, ErrorData> {
    match response {
        Ok(mut result) => {
            let mut processed_contents = Vec::new();

            for content in result.content {
                match content.as_text() {
                    Some(text_content) => {
                        // Check if text exceeds threshold
                        if text_content.text.chars().count() > LARGE_TEXT_THRESHOLD {
                            // Write to temp file
                            match write_large_text_to_file(&text_content.text) {
                                Ok(file_path) => {
                                    // Create a new text content with reference to the file
                                    let message = format!(
                                        "The response returned from the tool call was larger ({} characters) and is stored in the file which you can use other tools to examine or search in: {}",
                                        text_content.text.chars().count(),
                                        file_path
                                    );
                                    processed_contents.push(Content::text(message));
                                }
                                Err(e) => {
                                    // If file writing fails, include original content with warning
                                    let warning = format!(
                                        "Warning: Failed to write large response to file: {}. Showing full content instead.\n\n{}",
                                        e,
                                        text_content.text
                                    );
                                    processed_contents.push(Content::text(warning));
                                }
                            }
                        } else {
                            // Keep original content for smaller texts
                            processed_contents.push(content);
                        }
                    }
                    None => {
                        // Pass through other content types unchanged
                        processed_contents.push(content);
                    }
                }
            }

            result.content = processed_contents;
            Ok(result)
        }
        Err(e) => Err(e),
    }
}

/// Write large text content to a temporary file
fn write_large_text_to_file(content: &str) -> Result<String, std::io::Error> {
    // Create temp directory if it doesn't exist
    let temp_dir = std::env::temp_dir().join("aster_mcp_responses");
    std::fs::create_dir_all(&temp_dir)?;

    // Generate a unique filename with timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S%.6f");
    let filename = format!("mcp_response_{}.txt", timestamp);
    let file_path = temp_dir.join(&filename);

    // Write content to file
    let mut file = File::create(&file_path)?;
    file.write_all(content.as_bytes())?;

    Ok(file_path.to_string_lossy().to_string())
}
