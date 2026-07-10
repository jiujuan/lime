//! Read Tool Implementation
//!
//! This module implements the `ReadTool` for reading files with:
//! - Text file reading with line numbers
//! - Document text previews
//! - Jupyter notebook reading
//! - File read history tracking
//!
//! Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

use std::fs;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::debug;

use super::{compute_content_hash, FileReadRecord, SharedFileReadHistory};
use crate::tools::base::{PermissionCheckResult, Tool};
use crate::tools::context::{ToolContext, ToolOptions, ToolResult};
use crate::tools::error::ToolError;

/// Maximum file size for text files (10MB)
pub const MAX_TEXT_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// Supported image extensions
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"];

/// Supported text extensions (non-exhaustive, used for hints)
const TEXT_EXTENSIONS: &[&str] = &[
    "txt",
    "md",
    "rs",
    "py",
    "js",
    "ts",
    "jsx",
    "tsx",
    "json",
    "yaml",
    "yml",
    "toml",
    "xml",
    "html",
    "css",
    "scss",
    "less",
    "sql",
    "sh",
    "bash",
    "zsh",
    "c",
    "cpp",
    "h",
    "hpp",
    "java",
    "go",
    "rb",
    "php",
    "swift",
    "kt",
    "scala",
    "r",
    "lua",
    "pl",
    "pm",
    "ex",
    "exs",
    "erl",
    "hrl",
    "hs",
    "ml",
    "mli",
    "fs",
    "fsx",
    "clj",
    "cljs",
    "lisp",
    "el",
    "vim",
    "conf",
    "ini",
    "cfg",
    "env",
    "gitignore",
    "dockerignore",
    "makefile",
    "cmake",
    "gradle",
];

/// Line range for partial file reading
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LineRange {
    /// Start line (1-indexed, inclusive)
    pub start: usize,
    /// End line (1-indexed, inclusive, None means to end of file)
    pub end: Option<usize>,
}

impl LineRange {
    /// Create a new line range
    pub fn new(start: usize, end: Option<usize>) -> Self {
        Self { start, end }
    }

    /// Create a range from start to end of file
    pub fn from_start(start: usize) -> Self {
        Self { start, end: None }
    }

    /// Create a range for a specific number of lines from start
    pub fn lines(start: usize, count: usize) -> Self {
        Self {
            start,
            end: Some(start + count - 1),
        }
    }
}

/// Read Tool for reading files
///
/// Supports reading:
/// - Text files with line numbers
/// - Document text previews
/// - Jupyter notebooks
///
/// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
/// File analysis information for enhanced text reading
#[derive(Debug)]
struct TextFileInfo {
    path: PathBuf,
    extension: String,
    language: Option<String>,
    file_category: String,
    size_bytes: u64,
    total_lines: usize,
}

#[derive(Debug)]
pub struct ReadTool {
    /// Shared file read history
    read_history: SharedFileReadHistory,
    /// Whether PDF reading is enabled
    pdf_enabled: bool,
}

impl ReadTool {
    /// Create a new ReadTool with shared history
    pub fn new(read_history: SharedFileReadHistory) -> Self {
        Self {
            read_history,
            pdf_enabled: false,
        }
    }

    /// Enable PDF reading
    pub fn with_pdf_enabled(mut self, enabled: bool) -> Self {
        self.pdf_enabled = enabled;
        self
    }

    /// Get the shared read history
    pub fn read_history(&self) -> &SharedFileReadHistory {
        &self.read_history
    }
}

// =============================================================================
// Text File Reading (Requirements: 4.1)
// =============================================================================

impl ReadTool {
    pub async fn read_document(
        &self,
        path: &Path,
        context: &ToolContext,
    ) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "Document not found: {}",
                full_path.display()
            )));
        }

        let metadata = fs::metadata(&full_path)?;
        let text = document_preview::extract_document_text_from_path(
            &full_path,
            Some(MAX_TEXT_FILE_SIZE as usize),
        )
        .map_err(|error| ToolError::execution_failed(error.to_string()))?;
        let content = fs::read(&full_path)?;
        self.record_file_read(&full_path, &content, &metadata)?;

        let mut output = Vec::new();
        output.push(format!("[Document Text Preview: {}]", full_path.display()));
        output.push(format!("Size: {} bytes", metadata.len()));
        output.push(String::new());
        output.push(text);

        debug!("Read document preview: {}", full_path.display());

        Ok(output.join("\n"))
    }

    pub fn is_document_file(path: &Path) -> bool {
        document_preview::is_supported_document(path)
    }
}

impl ReadTool {
    /// Read a text file with line numbers
    ///
    /// Returns the file content with line numbers prefixed.
    /// Optionally reads only a specific line range.
    ///
    /// Requirements: 4.1
    pub async fn read_text(
        &self,
        path: &Path,
        range: Option<LineRange>,
        context: &ToolContext,
    ) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Check file exists
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "File not found: {}",
                full_path.display()
            )));
        }

        // Check file size
        let metadata = fs::metadata(&full_path)?;
        if metadata.len() > MAX_TEXT_FILE_SIZE {
            return Err(ToolError::execution_failed(format!(
                "File too large: {} bytes (max: {} bytes)",
                metadata.len(),
                MAX_TEXT_FILE_SIZE
            )));
        }

        // Read file content
        let content = fs::read(&full_path)?;
        let text = String::from_utf8_lossy(&content);

        // Record the read
        self.record_file_read(&full_path, &content, &metadata)?;

        // Format with line numbers
        let lines: Vec<&str> = text.lines().collect();
        let total_lines = lines.len();

        let (start, end) = match range {
            Some(r) => {
                let start = r.start.saturating_sub(1).min(total_lines);
                let end = r.end.map(|e| e.min(total_lines)).unwrap_or(total_lines);
                (start, end)
            }
            None => (0, total_lines),
        };

        // Calculate line number width for formatting
        let line_width = (end.max(1)).to_string().len();

        let formatted: Vec<String> = lines[start..end]
            .iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = start + i + 1;
                format!("{:>width$} | {}", line_num, line, width = line_width)
            })
            .collect();

        debug!(
            "Read text file: {} ({} lines, showing {}-{})",
            full_path.display(),
            total_lines,
            start + 1,
            end
        );

        Ok(formatted.join("\n"))
    }

    /// Record a file read in the history
    fn record_file_read(
        &self,
        path: &Path,
        content: &[u8],
        metadata: &fs::Metadata,
    ) -> Result<(), ToolError> {
        let hash = compute_content_hash(content);
        let mtime = metadata.modified().ok();
        let line_count = String::from_utf8_lossy(content).lines().count();

        let mut record = FileReadRecord::new(path.to_path_buf(), hash, metadata.len())
            .with_line_count(line_count);

        if let Some(mt) = mtime {
            record = record.with_mtime(mt);
        }

        self.read_history.write().unwrap().record_read(record);
        Ok(())
    }

    /// Resolve a path relative to the working directory
    fn resolve_path(&self, path: &Path, context: &ToolContext) -> PathBuf {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            context.working_directory.join(path)
        }
    }
}

// =============================================================================
// Retired image read path
// =============================================================================

impl ReadTool {
    /// Retired Aster image read path. Use the current `view_image` tool.
    pub async fn read_image(
        &self,
        path: &Path,
        context: &ToolContext,
    ) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Check file exists
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "Image not found: {}",
                full_path.display()
            )));
        }

        Err(ToolError::execution_failed(format!(
            "Image reading through Read is retired: {}. Use the current view_image tool for model-visible image inputs.",
            full_path.display()
        )))
    }

    /// Check if a file is an image based on extension.
    pub fn is_image_file(path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        IMAGE_EXTENSIONS.contains(&ext.as_str())
    }
}

// =============================================================================
// Retired PDF multimodal read path
// =============================================================================

impl ReadTool {
    /// Retired Aster PDF multimodal read path.
    pub async fn read_pdf(&self, path: &Path, context: &ToolContext) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Check file exists
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "PDF not found: {}",
                full_path.display()
            )));
        }

        let _pdf_enabled = self.pdf_enabled;
        Err(ToolError::execution_failed(format!(
            "PDF multimodal reading through Read is retired: {}. Use current document preview or document ingestion instead.",
            full_path.display()
        )))
    }

    /// Check if a file is a PDF.
    pub fn is_pdf_file(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("pdf"))
            .unwrap_or(false)
    }
}

// =============================================================================
// Jupyter Notebook Reading (Requirements: 4.4)
// =============================================================================

impl ReadTool {
    /// Read an SVG file with enhanced rendering capabilities
    ///
    /// 增强版实现，对齐当前 SVG 读取能力：
    /// - Supports SVG content analysis
    /// - Provides rendering information
    /// - Includes vector graphics analysis capabilities
    /// - Returns structured information for AI processing
    ///
    /// Requirements: 4.2 (extended)
    pub async fn read_svg(&self, path: &Path, context: &ToolContext) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Check file exists
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "SVG not found: {}",
                full_path.display()
            )));
        }

        // Read file content
        let content = fs::read(&full_path)?;
        let metadata = fs::metadata(&full_path)?;
        let svg_text = String::from_utf8_lossy(&content);

        // Record the read
        self.record_file_read(&full_path, &content, &metadata)?;

        // Calculate metadata
        let size_kb = (metadata.len() as f64 / 1024.0).round() as u64;

        // Build enhanced output with analysis information
        let mut output = Vec::new();
        output.push(format!("[Enhanced SVG Analysis: {}]", full_path.display()));
        output.push(format!("Size: {} KB ({} bytes)", size_kb, metadata.len()));
        output.push("Content type: Scalable Vector Graphics".to_string());
        output.push(String::new());

        // Add analysis capabilities information
        output.push("AI Analysis Capabilities:".to_string());
        output.push("- Vector graphics structure analysis".to_string());
        output.push("- Shape and path recognition".to_string());
        output.push("- Text content extraction".to_string());
        output.push("- Color scheme analysis".to_string());
        output.push("- Diagram and flowchart interpretation".to_string());
        output.push("- Icon and symbol recognition".to_string());
        output.push(String::new());

        // Add SVG content preview (first few lines)
        output.push("SVG Content Preview:".to_string());
        let lines: Vec<&str> = svg_text.lines().take(10).collect();
        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                output.push(format!("  {}: {}", i + 1, trimmed));
            }
        }

        if svg_text.lines().count() > 10 {
            output.push("  ... (content truncated)".to_string());
        }

        debug!(
            "Enhanced SVG read: {} ({} KB)",
            full_path.display(),
            size_kb
        );

        // Return enhanced analysis with full SVG content
        Ok(format!(
            "{}\n\nFull SVG Content:\n{}",
            output.join("\n"),
            svg_text
        ))
    }

    /// Read a Jupyter notebook file with enhanced analysis
    ///
    /// 增强版实现，对齐当前 Notebook 读取能力：
    /// - Extracts and formats code cells and markdown cells
    /// - Provides execution output analysis
    /// - Includes data visualization detection
    /// - Returns structured information for AI processing
    ///
    /// Requirements: 4.4
    pub async fn read_notebook(
        &self,
        path: &Path,
        context: &ToolContext,
    ) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Check file exists and read content
        let (content, metadata, notebook) = self.load_notebook_file(&full_path)?;

        // Record the read
        self.record_file_read(&full_path, &content, &metadata)?;

        // Extract cells and build output
        let cells = self.extract_notebook_cells(&notebook)?;
        let output = self.build_notebook_output(&full_path, &metadata, cells);

        debug!(
            "Enhanced notebook read: {} ({} cells)",
            full_path.display(),
            cells.len()
        );

        Ok(output.join("\n"))
    }

    /// Add notebook header and statistics
    fn add_notebook_header(
        &self,
        output: &mut Vec<String>,
        full_path: &Path,
        metadata: &fs::Metadata,
        cells: &[serde_json::Value],
    ) {
        output.push(format!(
            "[Enhanced Notebook Analysis: {}]",
            full_path.display()
        ));
        output.push(format!(
            "Size: {} KB",
            (metadata.len() as f64 / 1024.0).round() as u64
        ));
        output.push(format!("Total cells: {}", cells.len()));

        // Analyze cell types
        let (code_cells, markdown_cells, other_cells) = self.analyze_cell_types(cells);
        output.push(format!(
            "Code cells: {}, Markdown cells: {}, Other: {}",
            code_cells, markdown_cells, other_cells
        ));
        output.push(String::new());
    }

    /// Load and parse notebook file
    fn load_notebook_file(
        &self,
        full_path: &Path,
    ) -> Result<(Vec<u8>, fs::Metadata, serde_json::Value), ToolError> {
        // Check file exists
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "Notebook not found: {}",
                full_path.display()
            )));
        }

        // Read and parse JSON
        let content = fs::read(full_path)?;
        let metadata = fs::metadata(full_path)?;

        let notebook: serde_json::Value = serde_json::from_slice(&content).map_err(|e| {
            ToolError::execution_failed(format!("Failed to parse notebook JSON: {}", e))
        })?;

        Ok((content, metadata, notebook))
    }

    /// Extract cells from notebook JSON
    fn extract_notebook_cells<'a>(
        &self,
        notebook: &'a serde_json::Value,
    ) -> Result<&'a Vec<serde_json::Value>, ToolError> {
        notebook
            .get("cells")
            .and_then(|c| c.as_array())
            .ok_or_else(|| ToolError::execution_failed("Invalid notebook format: missing cells"))
    }

    /// Build complete notebook output
    fn build_notebook_output(
        &self,
        full_path: &Path,
        metadata: &fs::Metadata,
        cells: &[serde_json::Value],
    ) -> Vec<String> {
        let mut output = Vec::new();

        // Add header and statistics
        self.add_notebook_header(&mut output, full_path, metadata, cells);

        // Add analysis capabilities
        self.add_analysis_capabilities(&mut output);

        // Process each cell
        self.process_notebook_cells(&mut output, cells);

        output
    }

    /// Analyze cell types and return counts
    fn analyze_cell_types(&self, cells: &[serde_json::Value]) -> (usize, usize, usize) {
        let mut code_cells = 0;
        let mut markdown_cells = 0;
        let mut other_cells = 0;

        for cell in cells {
            match cell
                .get("cell_type")
                .and_then(|t| t.as_str())
                .unwrap_or("unknown")
            {
                "code" => code_cells += 1,
                "markdown" => markdown_cells += 1,
                _ => other_cells += 1,
            }
        }

        (code_cells, markdown_cells, other_cells)
    }

    /// Add analysis capabilities description
    fn add_analysis_capabilities(&self, output: &mut Vec<String>) {
        output.push("AI Analysis Capabilities:".to_string());
        output.push("- Code execution flow analysis".to_string());
        output.push("- Data visualization interpretation".to_string());
        output.push("- Scientific computation analysis".to_string());
        output.push("- Documentation and markdown processing".to_string());
        output.push("- Output and result interpretation".to_string());
        output.push("- Machine learning workflow analysis".to_string());
        output.push(String::new());
    }

    /// Process all notebook cells
    fn process_notebook_cells(&self, output: &mut Vec<String>, cells: &[serde_json::Value]) {
        for (i, cell) in cells.iter().enumerate() {
            self.process_single_cell(output, cell, i + 1);
            output.push(String::new());
        }
    }

    /// Process a single notebook cell
    fn process_single_cell(
        &self,
        output: &mut Vec<String>,
        cell: &serde_json::Value,
        cell_num: usize,
    ) {
        let cell_type = cell
            .get("cell_type")
            .and_then(|t| t.as_str())
            .unwrap_or("unknown");

        let source = cell
            .get("source")
            .map(|s| self.extract_cell_source(s))
            .unwrap_or_default();

        match cell_type {
            "code" => {
                output.push(format!("## Cell {} [Code Cell] 🐍", cell_num));
                output.push("```python".to_string());
                output.push(source);
                output.push("```".to_string());

                // Include outputs if present
                self.process_cell_outputs(output, cell);
            }
            "markdown" => {
                output.push(format!("## Cell {} [Markdown Cell] 📝", cell_num));
                output.push(source);
            }
            _ => {
                output.push(format!("## Cell {} [{}] ❓", cell_num, cell_type));
                output.push(source);
            }
        }
    }

    /// Process cell outputs
    fn process_cell_outputs(&self, output: &mut Vec<String>, cell: &serde_json::Value) {
        if let Some(outputs) = cell.get("outputs").and_then(|o| o.as_array()) {
            if !outputs.is_empty() {
                output.push("### Execution Output:".to_string());
                for (out_idx, out) in outputs.iter().enumerate() {
                    if let Some(text) = self.extract_output_text(out) {
                        output.push(format!(
                            "#### Output {} [{}]:",
                            out_idx + 1,
                            out.get("output_type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("result")
                        ));
                        output.push("```".to_string());
                        output.push(text);
                        output.push("```".to_string());
                    }
                }
            }
        }
    }

    /// Extract source from a cell (handles both string and array formats)
    fn extract_cell_source(&self, source: &serde_json::Value) -> String {
        match source {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Array(arr) => arr
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(""),
            _ => String::new(),
        }
    }

    /// Extract text from cell output
    fn extract_output_text(&self, output: &serde_json::Value) -> Option<String> {
        // Try "text" field first (stream output)
        if let Some(text) = output.get("text") {
            return Some(self.extract_cell_source(text));
        }

        // Try "data" -> "text/plain" (execute_result)
        if let Some(data) = output.get("data") {
            if let Some(text) = data.get("text/plain") {
                return Some(self.extract_cell_source(text));
            }
        }

        None
    }

    /// Check if a file is a Jupyter notebook
    pub fn is_notebook_file(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase() == "ipynb")
            .unwrap_or(false)
    }
}

// =============================================================================
// Tool Trait Implementation
// =============================================================================

#[async_trait]
impl Tool for ReadTool {
    fn name(&self) -> &str {
        "Read"
    }

    fn description(&self) -> &str {
        "File reader for text, document previews, SVG, and Jupyter notebooks. \
         Text files are returned as direct line-numbered content by default, \
         with an optional enhanced analysis mode when explicitly requested. \
         Images must use the current view_image tool; PDF multimodal ingestion is not provided by Read. \
         Optimized for reliable file reading in agent workflows."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read (relative to working directory or absolute)"
                },
                "start_line": {
                    "type": "integer",
                    "description": "Start line number (1-indexed, for text files only)",
                    "minimum": 1
                },
                "end_line": {
                    "type": "integer",
                    "description": "End line number (1-indexed, inclusive, for text files only)",
                    "minimum": 1
                },
                "text_output_mode": {
                    "type": "string",
                    "enum": ["plain", "enhanced"],
                    "description": "For text files only. `plain` returns direct line-numbered content and is the default. `enhanced` adds file-analysis headers and hints."
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(
        &self,
        params: serde_json::Value,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        // Check for cancellation
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        // Extract path parameter
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::invalid_params("Missing required parameter: path"))?;

        let path = Path::new(path_str);

        // Determine file type and read accordingly with enhanced analysis
        if Self::is_image_file(path) {
            let content = self.read_image(path, context).await?;
            return Ok(ToolResult::success(content)
                .with_metadata("file_type", serde_json::json!("image"))
                .with_metadata("analysis_type", serde_json::json!("enhanced_multimodal")));
        }

        if Self::is_pdf_file(path) {
            let content = self.read_pdf(path, context).await?;
            return Ok(ToolResult::success(content)
                .with_metadata("file_type", serde_json::json!("pdf"))
                .with_metadata("analysis_type", serde_json::json!("enhanced_document")));
        }

        if Self::is_svg_file(path) {
            let content = self.read_svg(path, context).await?;
            return Ok(ToolResult::success(content)
                .with_metadata("file_type", serde_json::json!("svg"))
                .with_metadata("analysis_type", serde_json::json!("enhanced_vector")));
        }

        if Self::is_notebook_file(path) {
            let content = self.read_notebook(path, context).await?;
            return Ok(ToolResult::success(content)
                .with_metadata("file_type", serde_json::json!("notebook"))
                .with_metadata("analysis_type", serde_json::json!("enhanced_computational")));
        }

        if Self::is_document_file(path) {
            let content = self.read_document(path, context).await?;
            return Ok(ToolResult::success(content)
                .with_metadata("file_type", serde_json::json!("document"))
                .with_metadata("analysis_type", serde_json::json!("document_text")));
        }

        // Enhanced text file reading with intelligent analysis
        let range = self.extract_line_range(&params);
        let text_output_mode = self.extract_text_output_mode(&params);
        let content = match text_output_mode {
            TextOutputMode::Plain => self.read_text(path, range, context).await?,
            TextOutputMode::Enhanced => self.read_text_enhanced(path, range, context).await?,
        };

        Ok(ToolResult::success(content)
            .with_metadata("file_type", serde_json::json!("text"))
            .with_metadata("analysis_type", serde_json::json!("textual"))
            .with_metadata("text_output_mode", json!(text_output_mode.as_str())))
    }

    async fn check_permissions(
        &self,
        params: &serde_json::Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        // Extract path for permission check
        let path_str = match params.get("path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return PermissionCheckResult::deny("Missing path parameter"),
        };

        let path = Path::new(path_str);
        let full_path = self.resolve_path(path, context);

        // Check if path is within allowed directories
        // For now, allow all reads (permission manager handles restrictions)
        debug!("Permission check for read: {}", full_path.display());

        PermissionCheckResult::allow()
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new()
            .with_max_retries(1)
            .with_base_timeout(std::time::Duration::from_secs(30))
    }
}

impl ReadTool {
    /// Extract line range from parameters
    fn extract_line_range(&self, params: &serde_json::Value) -> Option<LineRange> {
        let start = params
            .get("start_line")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize);
        let end = params
            .get("end_line")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize);

        match (start, end) {
            (Some(s), e) => Some(LineRange::new(s, e)),
            (None, Some(e)) => Some(LineRange::new(1, Some(e))),
            (None, None) => None,
        }
    }

    fn extract_text_output_mode(&self, params: &serde_json::Value) -> TextOutputMode {
        match params
            .get("text_output_mode")
            .and_then(|value| value.as_str())
            .unwrap_or("plain")
        {
            "enhanced" => TextOutputMode::Enhanced,
            _ => TextOutputMode::Plain,
        }
    }

    /// Read a text file with enhanced analysis capabilities
    ///
    /// 增强版实现，对齐当前文本读取能力：
    /// - Provides intelligent content analysis
    /// - Detects programming languages and file types
    /// - Includes syntax highlighting hints
    /// - Returns structured information for AI processing
    ///
    /// Requirements: 4.1
    pub async fn read_text_enhanced(
        &self,
        path: &Path,
        range: Option<LineRange>,
        context: &ToolContext,
    ) -> Result<String, ToolError> {
        let full_path = self.resolve_path(path, context);

        // Load and validate file
        let (content, metadata, text) = self.load_text_file(&full_path)?;

        // Record the read
        self.record_file_read(&full_path, &content, &metadata)?;

        // Analyze and format content
        let file_info = self.analyze_text_file(&full_path, &text, &metadata);
        let formatted_content = self.format_text_with_lines(&text, range);
        let output = self.build_text_analysis_output(&file_info, &formatted_content, range);

        debug!(
            "Enhanced text read: {} ({} lines, {}, {})",
            full_path.display(),
            file_info.total_lines,
            file_info.file_category,
            file_info.language.unwrap_or_else(|| "unknown".to_string())
        );

        Ok(output.join("\n"))
    }

    /// Analyze text file and extract metadata
    fn analyze_text_file(&self, path: &Path, text: &str, metadata: &fs::Metadata) -> TextFileInfo {
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let language = self.detect_programming_language(&extension, text);
        let file_category = self.categorize_file_type(&extension);
        let total_lines = text.lines().count();

        TextFileInfo {
            path: path.to_path_buf(),
            extension,
            language,
            file_category,
            size_bytes: metadata.len(),
            total_lines,
        }
    }

    /// Load and validate text file
    fn load_text_file(
        &self,
        full_path: &Path,
    ) -> Result<(Vec<u8>, fs::Metadata, String), ToolError> {
        // Check file exists and size
        if !full_path.exists() {
            return Err(ToolError::execution_failed(format!(
                "File not found: {}",
                full_path.display()
            )));
        }

        let metadata = fs::metadata(full_path)?;
        if metadata.len() > MAX_TEXT_FILE_SIZE {
            return Err(ToolError::execution_failed(format!(
                "File too large: {} bytes (max: {} bytes)",
                metadata.len(),
                MAX_TEXT_FILE_SIZE
            )));
        }

        // Read and process file
        let content = fs::read(full_path)?;
        let text = String::from_utf8_lossy(&content).to_string();

        Ok((content, metadata, text))
    }

    /// Format text content with line numbers
    fn format_text_with_lines(&self, text: &str, range: Option<LineRange>) -> Vec<String> {
        let lines: Vec<&str> = text.lines().collect();
        let total_lines = lines.len();

        let (start, end) = match range {
            Some(r) => {
                let start = r.start.saturating_sub(1).min(total_lines);
                let end = r.end.map(|e| e.min(total_lines)).unwrap_or(total_lines);
                (start, end)
            }
            None => (0, total_lines),
        };

        let line_width = (end.max(1)).to_string().len();

        lines[start..end]
            .iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = start + i + 1;
                format!("{:>width$} | {}", line_num, line, width = line_width)
            })
            .collect()
    }

    /// Build enhanced text analysis output
    fn build_text_analysis_output(
        &self,
        file_info: &TextFileInfo,
        formatted_content: &[String],
        range: Option<LineRange>,
    ) -> Vec<String> {
        let mut output = Vec::new();

        // Add header information
        output.push(format!(
            "[Enhanced Text Analysis: {}]",
            file_info.path.display()
        ));
        output.push(format!(
            "File type: {} ({})",
            file_info.file_category, file_info.extension
        ));
        if let Some(lang) = &file_info.language {
            output.push(format!("Programming language: {}", lang));
        }
        output.push(format!(
            "Size: {} KB ({} bytes)",
            (file_info.size_bytes as f64 / 1024.0).round() as u64,
            file_info.size_bytes
        ));

        // Add line information
        let (start, end) = self.get_display_range(file_info.total_lines, range);
        output.push(format!(
            "Lines: {} total, showing {}-{}",
            file_info.total_lines, start, end
        ));
        output.push(String::new());

        // Add analysis capabilities
        self.add_text_analysis_capabilities(&mut output, &file_info.file_category);

        // Add formatted content
        output.push("File Content:".to_string());
        output.extend_from_slice(formatted_content);

        output
    }

    /// Get display range for line information
    fn get_display_range(&self, total_lines: usize, range: Option<LineRange>) -> (usize, usize) {
        match range {
            Some(r) => {
                let start = r.start.min(total_lines + 1);
                let end = r.end.map(|e| e.min(total_lines)).unwrap_or(total_lines);
                (start, end)
            }
            None => (1, total_lines),
        }
    }

    /// Add analysis capabilities based on file type
    fn add_text_analysis_capabilities(&self, output: &mut Vec<String>, file_category: &str) {
        output.push("AI Analysis Capabilities:".to_string());
        match file_category {
            "Source Code" => {
                output.push("- Code structure and syntax analysis".to_string());
                output.push("- Function and class identification".to_string());
                output.push("- Code quality and best practices review".to_string());
                output.push("- Bug detection and security analysis".to_string());
                output.push("- Documentation and comment analysis".to_string());
            }
            "Configuration" => {
                output.push("- Configuration structure analysis".to_string());
                output.push("- Setting validation and optimization".to_string());
                output.push("- Dependency and version management".to_string());
                output.push("- Security configuration review".to_string());
            }
            "Documentation" => {
                output.push("- Content structure and organization".to_string());
                output.push("- Writing quality and clarity analysis".to_string());
                output.push("- Link and reference validation".to_string());
                output.push("- Documentation completeness review".to_string());
            }
            _ => {
                output.push("- Content analysis and understanding".to_string());
                output.push("- Structure and format recognition".to_string());
                output.push("- Data extraction and processing".to_string());
                output.push("- Pattern recognition and insights".to_string());
            }
        }
        output.push(String::new());
    }

    /// Detect programming language from extension and content
    fn detect_programming_language(&self, extension: &str, content: &str) -> Option<String> {
        match extension {
            "rs" => Some("Rust".to_string()),
            "py" => Some("Python".to_string()),
            "js" => Some("JavaScript".to_string()),
            "ts" => Some("TypeScript".to_string()),
            "jsx" => Some("React JSX".to_string()),
            "tsx" => Some("React TSX".to_string()),
            "java" => Some("Java".to_string()),
            "c" => Some("C".to_string()),
            "cpp" | "cc" | "cxx" => Some("C++".to_string()),
            "h" | "hpp" => Some("C/C++ Header".to_string()),
            "go" => Some("Go".to_string()),
            "rb" => Some("Ruby".to_string()),
            "php" => Some("PHP".to_string()),
            "swift" => Some("Swift".to_string()),
            "kt" => Some("Kotlin".to_string()),
            "scala" => Some("Scala".to_string()),
            "sh" | "bash" | "zsh" => Some("Shell Script".to_string()),
            "sql" => Some("SQL".to_string()),
            "html" => Some("HTML".to_string()),
            "css" => Some("CSS".to_string()),
            "scss" | "sass" => Some("SCSS/Sass".to_string()),
            "xml" => Some("XML".to_string()),
            "json" => Some("JSON".to_string()),
            "yaml" | "yml" => Some("YAML".to_string()),
            "toml" => Some("TOML".to_string()),
            "md" => Some("Markdown".to_string()),
            _ => {
                // Try to detect from content
                if content.starts_with("#!/bin/bash") || content.starts_with("#!/bin/sh") {
                    Some("Shell Script".to_string())
                } else if content.starts_with("#!/usr/bin/env python") {
                    Some("Python".to_string())
                } else if content.starts_with("#!/usr/bin/env node") {
                    Some("JavaScript".to_string())
                } else {
                    None
                }
            }
        }
    }

    /// Categorize file type for analysis
    fn categorize_file_type(&self, extension: &str) -> String {
        match extension {
            "rs" | "py" | "js" | "ts" | "jsx" | "tsx" | "java" | "c" | "cpp" | "cc" | "cxx"
            | "h" | "hpp" | "go" | "rb" | "php" | "swift" | "kt" | "scala" | "sh" | "bash"
            | "zsh" | "sql" => "Source Code".to_string(),

            "json" | "yaml" | "yml" | "toml" | "xml" | "ini" | "cfg" | "conf" | "env" => {
                "Configuration".to_string()
            }

            "md" | "txt" | "rst" | "adoc" => "Documentation".to_string(),

            "html" | "css" | "scss" | "sass" | "less" => "Web Content".to_string(),

            "csv" | "tsv" | "log" => "Data File".to_string(),

            _ => "Text File".to_string(),
        }
    }

    /// Check if a file is likely a text file based on extension (enhanced version)
    pub fn is_text_file(path: &Path) -> bool {
        match path.extension().and_then(|e| e.to_str()) {
            Some(ext) => {
                let ext_lower = ext.to_lowercase();
                // If it's a known text extension, return true
                // If it's a known non-text extension (image, pdf, notebook, svg), return false
                // Otherwise, default to true (assume text)
                if TEXT_EXTENSIONS.contains(&ext_lower.as_str()) {
                    true
                } else if IMAGE_EXTENSIONS.contains(&ext_lower.as_str())
                    || ext_lower == "pdf"
                    || ext_lower == "ipynb"
                    || ext_lower == "svg"
                {
                    false
                } else {
                    true // Unknown extensions default to text
                }
            }
            None => true, // No extension defaults to text
        }
    }

    /// Check if a file is an SVG
    pub fn is_svg_file(path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase() == "svg")
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TextOutputMode {
    Plain,
    Enhanced,
}

impl TextOutputMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Plain => "plain",
            Self::Enhanced => "enhanced",
        }
    }
}

// =============================================================================
// Unit Tests
// =============================================================================
