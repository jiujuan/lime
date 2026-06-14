use std::path::PathBuf;

use crate::parser::Hunk;
use crate::parser::ParseError;
use crate::parser::UpdateFileChunk;
use crate::parser::ADD_FILE_MARKER;
use crate::parser::BEGIN_PATCH_MARKER;
use crate::parser::CHANGE_CONTEXT_MARKER;
use crate::parser::DELETE_FILE_MARKER;
use crate::parser::EMPTY_CHANGE_CONTEXT_MARKER;
use crate::parser::END_PATCH_MARKER;
use crate::parser::EOF_MARKER;
use crate::parser::MOVE_TO_MARKER;
use crate::parser::UPDATE_FILE_MARKER;

use Hunk::*;
use ParseError::*;

const ENVIRONMENT_ID_MARKER: &str = "*** Environment ID: ";

#[derive(Debug, Default, Clone)]
pub struct StreamingPatchParser {
    line_buffer: String,
    state: StreamingParserState,
    line_number: usize,
}

#[derive(Debug, Default, Clone)]
struct StreamingParserState {
    mode: StreamingParserMode,
    hunks: Vec<Hunk>,
}

#[derive(Debug, Default, Clone, Copy)]
enum StreamingParserMode {
    #[default]
    NotStarted,
    StartedPatch,
    AddFile,
    DeleteFile,
    UpdateFile {
        hunk_line_number: usize,
    },
    EndedPatch,
}

impl StreamingPatchParser {
    fn is_environment_id_preamble_line(&self, line: &str) -> bool {
        line.starts_with(ENVIRONMENT_ID_MARKER)
    }

    fn ensure_update_hunk_is_not_empty(&self, line: &str) -> Result<(), ParseError> {
        if let Some(UpdateFile { path, chunks, .. }) = self.state.hunks.last() {
            if chunks.is_empty() {
                if let StreamingParserMode::UpdateFile { hunk_line_number } = self.state.mode {
                    return Err(InvalidHunkError {
                        message: format!("Update file hunk for path '{}' is empty", path.display()),
                        line_number: hunk_line_number,
                    });
                }
            }
            if chunks
                .last()
                .is_some_and(|chunk| chunk.old_lines.is_empty() && chunk.new_lines.is_empty())
            {
                if line == END_PATCH_MARKER {
                    return Err(InvalidHunkError {
                        message: "Update hunk does not contain any lines".to_string(),
                        line_number: self.line_number,
                    });
                }
                return Err(InvalidHunkError {
                    message: format!(
                        "Unexpected line found in update hunk: '{line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)"
                    ),
                    line_number: self.line_number,
                });
            }
        }
        Ok(())
    }

    fn handle_hunk_headers_and_end_patch(&mut self, trimmed: &str) -> Result<bool, ParseError> {
        if trimmed == END_PATCH_MARKER {
            self.ensure_update_hunk_is_not_empty(trimmed)?;
            self.state.mode = StreamingParserMode::EndedPatch;
            return Ok(true);
        }
        if let Some(path) = trimmed.strip_prefix(ADD_FILE_MARKER) {
            self.ensure_update_hunk_is_not_empty(trimmed)?;
            self.state.hunks.push(AddFile {
                path: PathBuf::from(path),
                contents: String::new(),
            });
            self.state.mode = StreamingParserMode::AddFile;
            return Ok(true);
        }
        if let Some(path) = trimmed.strip_prefix(DELETE_FILE_MARKER) {
            self.ensure_update_hunk_is_not_empty(trimmed)?;
            self.state.hunks.push(DeleteFile {
                path: PathBuf::from(path),
            });
            self.state.mode = StreamingParserMode::DeleteFile;
            return Ok(true);
        }
        if let Some(path) = trimmed.strip_prefix(UPDATE_FILE_MARKER) {
            self.ensure_update_hunk_is_not_empty(trimmed)?;
            self.state.hunks.push(UpdateFile {
                path: PathBuf::from(path),
                move_path: None,
                chunks: Vec::new(),
            });
            self.state.mode = StreamingParserMode::UpdateFile {
                hunk_line_number: self.line_number,
            };
            return Ok(true);
        }
        Ok(false)
    }

    pub fn push_delta(&mut self, delta: &str) -> Result<Vec<Hunk>, ParseError> {
        for ch in delta.chars() {
            if ch == '\n' {
                let mut line = std::mem::take(&mut self.line_buffer);
                line.truncate(line.strip_suffix('\r').map_or(line.len(), str::len));
                self.line_number += 1;
                self.process_line(&line)?;
            } else {
                self.line_buffer.push(ch);
            }
        }

        Ok(self.state.hunks.clone())
    }

    pub fn finish(&mut self) -> Result<Vec<Hunk>, ParseError> {
        if !self.line_buffer.is_empty() {
            let line = std::mem::take(&mut self.line_buffer);
            self.line_number += 1;
            if line.trim() == END_PATCH_MARKER {
                self.ensure_update_hunk_is_not_empty(line.trim())?;
                self.state.mode = StreamingParserMode::EndedPatch;
            } else {
                self.process_line(&line)?;
            }
        }

        if !matches!(self.state.mode, StreamingParserMode::EndedPatch) {
            return Err(InvalidPatchError(
                "The last line of the patch must be '*** End Patch'".to_string(),
            ));
        }

        Ok(self.state.hunks.clone())
    }

    fn process_line(&mut self, line: &str) -> Result<(), ParseError> {
        let trimmed = line.trim();
        match self.state.mode {
            StreamingParserMode::NotStarted => {
                if trimmed == BEGIN_PATCH_MARKER {
                    self.state.mode = StreamingParserMode::StartedPatch;
                    return Ok(());
                }
                Err(InvalidPatchError(
                    "The first line of the patch must be '*** Begin Patch'".to_string(),
                ))
            }
            StreamingParserMode::StartedPatch => {
                if self.is_environment_id_preamble_line(line) {
                    return Ok(());
                }
                if self.handle_hunk_headers_and_end_patch(trimmed)? {
                    return Ok(());
                }
                Err(InvalidHunkError {
                    message: format!(
                        "'{trimmed}' is not a valid hunk header. Valid hunk headers: '*** Add File: {{path}}', '*** Delete File: {{path}}', '*** Update File: {{path}}'"
                    ),
                    line_number: self.line_number,
                })
            }
            StreamingParserMode::AddFile => {
                if self.handle_hunk_headers_and_end_patch(trimmed)? {
                    return Ok(());
                }
                if let Some(line_to_add) = line.strip_prefix('+') {
                    if let Some(AddFile { contents, .. }) = self.state.hunks.last_mut() {
                        contents.push_str(line_to_add);
                        contents.push('\n');
                        return Ok(());
                    }
                }
                Err(InvalidHunkError {
                    message: format!(
                        "'{trimmed}' is not a valid hunk header. Valid hunk headers: '*** Add File: {{path}}', '*** Delete File: {{path}}', '*** Update File: {{path}}'"
                    ),
                    line_number: self.line_number,
                })
            }
            StreamingParserMode::DeleteFile => {
                if self.handle_hunk_headers_and_end_patch(trimmed)? {
                    return Ok(());
                }
                Err(InvalidHunkError {
                    message: format!(
                        "'{trimmed}' is not a valid hunk header. Valid hunk headers: '*** Add File: {{path}}', '*** Delete File: {{path}}', '*** Update File: {{path}}'"
                    ),
                    line_number: self.line_number,
                })
            }
            StreamingParserMode::UpdateFile { hunk_line_number } => {
                self.process_update_file_line(line, hunk_line_number)
            }
            StreamingParserMode::EndedPatch => Ok(()),
        }
    }

    fn process_update_file_line(
        &mut self,
        line: &str,
        hunk_line_number: usize,
    ) -> Result<(), ParseError> {
        let update_line = line.trim_end();
        if self.handle_hunk_headers_and_end_patch(update_line)? {
            return Ok(());
        }

        if let Some(UpdateFile {
            move_path, chunks, ..
        }) = self.state.hunks.last_mut()
        {
            if chunks.is_empty() && move_path.is_none() {
                if let Some(move_to_path) = update_line.strip_prefix(MOVE_TO_MARKER) {
                    *move_path = Some(PathBuf::from(move_to_path));
                    self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                    return Ok(());
                }
            }

            if (update_line == EMPTY_CHANGE_CONTEXT_MARKER
                || update_line.starts_with(CHANGE_CONTEXT_MARKER))
                && chunks
                    .last()
                    .is_some_and(|chunk| chunk.old_lines.is_empty() && chunk.new_lines.is_empty())
            {
                return Err(InvalidHunkError {
                    message: format!(
                        "Unexpected line found in update hunk: '{line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)"
                    ),
                    line_number: self.line_number,
                });
            }

            if update_line == EMPTY_CHANGE_CONTEXT_MARKER {
                chunks.push(UpdateFileChunk {
                    change_context: None,
                    old_lines: Vec::new(),
                    new_lines: Vec::new(),
                    is_end_of_file: false,
                });
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if let Some(change_context) = update_line.strip_prefix(CHANGE_CONTEXT_MARKER) {
                chunks.push(UpdateFileChunk {
                    change_context: Some(change_context.to_string()),
                    old_lines: Vec::new(),
                    new_lines: Vec::new(),
                    is_end_of_file: false,
                });
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if update_line == EOF_MARKER {
                if chunks
                    .last()
                    .is_some_and(|chunk| chunk.old_lines.is_empty() && chunk.new_lines.is_empty())
                {
                    return Err(InvalidHunkError {
                        message: "Update hunk does not contain any lines".to_string(),
                        line_number: self.line_number,
                    });
                }
                if let Some(chunk) = chunks.last_mut() {
                    chunk.is_end_of_file = true;
                }
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if line.is_empty() {
                push_default_context_line(chunks, String::new());
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if let Some(line_to_add) = line.strip_prefix(' ') {
                push_default_context_line(chunks, line_to_add.to_string());
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if let Some(line_to_add) = line.strip_prefix('+') {
                ensure_default_chunk(chunks)
                    .new_lines
                    .push(line_to_add.to_string());
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if let Some(line_to_remove) = line.strip_prefix('-') {
                ensure_default_chunk(chunks)
                    .old_lines
                    .push(line_to_remove.to_string());
                self.state.mode = StreamingParserMode::UpdateFile { hunk_line_number };
                return Ok(());
            }

            if chunks
                .last()
                .is_some_and(|chunk| !chunk.old_lines.is_empty() || !chunk.new_lines.is_empty())
            {
                return Err(InvalidHunkError {
                    message: format!(
                        "Expected update hunk to start with a @@ context marker, got: '{line}'"
                    ),
                    line_number: self.line_number,
                });
            }
        }
        Err(InvalidHunkError {
            message: format!(
                "Unexpected line found in update hunk: '{line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)"
            ),
            line_number: self.line_number,
        })
    }
}

fn ensure_default_chunk(chunks: &mut Vec<UpdateFileChunk>) -> &mut UpdateFileChunk {
    if chunks.is_empty() {
        chunks.push(UpdateFileChunk {
            change_context: None,
            old_lines: Vec::new(),
            new_lines: Vec::new(),
            is_end_of_file: false,
        });
    }
    chunks.last_mut().expect("default chunk")
}

fn push_default_context_line(chunks: &mut Vec<UpdateFileChunk>, line: String) {
    let chunk = ensure_default_chunk(chunks);
    chunk.old_lines.push(line.clone());
    chunk.new_lines.push(line);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streams_complete_lines_before_end_patch() {
        let mut parser = StreamingPatchParser::default();
        assert_eq!(
            parser.push_delta("*** Begin Patch\n*** Add File: src/hello.txt\n+hello\n+wor"),
            Ok(vec![AddFile {
                path: PathBuf::from("src/hello.txt"),
                contents: "hello\n".to_string(),
            }])
        );
        assert_eq!(
            parser.push_delta("ld\n"),
            Ok(vec![AddFile {
                path: PathBuf::from("src/hello.txt"),
                contents: "hello\nworld\n".to_string(),
            }])
        );
    }

    #[test]
    fn streams_large_patch_split_by_character() {
        let patch = "\
*** Begin Patch
*** Add File: docs/release-notes.md
+# Release notes
*** Update File: src/config.rs
@@ impl Config
-    pub apply_patch_progress: bool,
+    pub stream_apply_patch_progress: bool,
*** Delete File: src/legacy_patch_progress.rs
*** Update File: crates/cli/src/main.rs
*** Move to: crates/cli/src/bin/app.rs
@@ fn run()
-    let args = Args::parse();
+    let cli = Cli::parse();
*** End Patch";

        let mut parser = StreamingPatchParser::default();
        let mut max_hunk_count = 0;
        let mut saw_hunk_counts = Vec::new();
        let mut hunks = Vec::new();
        for ch in patch.chars() {
            let updated_hunks = parser.push_delta(&ch.to_string()).unwrap();
            if !updated_hunks.is_empty() {
                let hunk_count = updated_hunks.len();
                assert!(hunk_count >= max_hunk_count);
                if hunk_count > max_hunk_count {
                    saw_hunk_counts.push(hunk_count);
                    max_hunk_count = hunk_count;
                }
                hunks = updated_hunks;
            }
        }

        assert_eq!(saw_hunk_counts, vec![1, 2, 3, 4]);
        assert_eq!(hunks.len(), 4);
        assert_eq!(
            hunks
                .iter()
                .map(|hunk| match hunk {
                    AddFile { .. } => "add",
                    DeleteFile { .. } => "delete",
                    UpdateFile {
                        move_path: Some(_), ..
                    } => "move-update",
                    UpdateFile {
                        move_path: None, ..
                    } => "update",
                })
                .collect::<Vec<_>>(),
            vec!["add", "update", "delete", "move-update"]
        );
    }

    #[test]
    fn finish_processes_final_line_without_newline() {
        let mut parser = StreamingPatchParser::default();
        assert_eq!(
            parser.push_delta("*** Begin Patch\n*** Add File: file.txt\n+hello\n*** End Patch"),
            Ok(vec![AddFile {
                path: PathBuf::from("file.txt"),
                contents: "hello\n".to_string(),
            }])
        );
        assert_eq!(
            parser.finish(),
            Ok(vec![AddFile {
                path: PathBuf::from("file.txt"),
                contents: "hello\n".to_string(),
            }])
        );
    }

    #[test]
    fn finish_requires_end_patch() {
        let mut parser = StreamingPatchParser::default();
        assert_eq!(
            parser.push_delta("*** Begin Patch\n*** Add File: file.txt\n+hello\n"),
            Ok(vec![AddFile {
                path: PathBuf::from("file.txt"),
                contents: "hello\n".to_string(),
            }])
        );
        assert_eq!(
            parser.finish(),
            Err(InvalidPatchError(
                "The last line of the patch must be '*** End Patch'".to_string(),
            ))
        );
    }
}
