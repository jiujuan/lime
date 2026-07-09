//! Sandbox stub - minimal for compatibility

pub use config::{SandboxConfig, SandboxType};
pub use executor::{execute_in_sandbox_with_options, ExecutorOptions, ExecutorResult};

pub mod output_buffer {
    const DEFAULT_LIMIT: usize = 128 * 1024;

    #[derive(Debug, Clone)]
    pub struct BoundedOutputBuffer {
        data: Vec<u8>,
        bytes: usize,
        omitted_bytes: usize,
        limit: usize,
    }

    impl Default for BoundedOutputBuffer {
        fn default() -> Self {
            Self::new(DEFAULT_LIMIT)
        }
    }

    impl BoundedOutputBuffer {
        pub fn new(limit: usize) -> Self {
            Self {
                data: Vec::new(),
                bytes: 0,
                omitted_bytes: 0,
                limit,
            }
        }

        pub fn write(&mut self, data: &[u8]) {
            self.push_chunk(data);
        }

        pub fn push_chunk(&mut self, data: &[u8]) {
            self.bytes = self.bytes.saturating_add(data.len());
            let retained = self.limit.saturating_sub(self.data.len()).min(data.len());
            self.data.extend_from_slice(&data[..retained]);
            self.omitted_bytes = self
                .omitted_bytes
                .saturating_add(data.len().saturating_sub(retained));
        }

        pub fn as_bytes(&self) -> &[u8] {
            &self.data
        }

        pub fn into_captured_output(self) -> CapturedOutput {
            CapturedOutput {
                retained: self.data,
                bytes: self.bytes,
                omitted_bytes: self.omitted_bytes,
                truncated: self.omitted_bytes > 0,
            }
        }
    }

    #[derive(Debug, Clone)]
    pub struct CapturedOutput {
        pub retained: Vec<u8>,
        pub bytes: usize,
        pub omitted_bytes: usize,
        pub truncated: bool,
    }

    impl CapturedOutput {
        pub fn from_bytes(bytes: &[u8]) -> Self {
            Self {
                retained: bytes.to_vec(),
                bytes: bytes.len(),
                omitted_bytes: 0,
                truncated: false,
            }
        }
    }

    pub struct OutputBuffer {
        data: Vec<u8>,
    }

    impl OutputBuffer {
        pub fn new() -> Self {
            Self { data: Vec::new() }
        }

        pub fn write(&mut self, data: &[u8]) {
            self.data.extend_from_slice(data);
        }

        pub fn as_bytes(&self) -> &[u8] {
            &self.data
        }
    }
}

mod config {
    use serde::{Deserialize, Serialize};

    #[derive(Clone, Copy, Debug, Serialize, Deserialize)]
    pub enum SandboxType {
        None,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SandboxConfig {
        pub sandbox_type: SandboxType,
    }

    impl Default for SandboxConfig {
        fn default() -> Self {
            Self {
                sandbox_type: SandboxType::None,
            }
        }
    }
}

mod executor {
    use anyhow::Result;
    use std::collections::HashMap;

    pub struct ExecutorOptions {
        pub command: String,
        pub args: Vec<String>,
        pub timeout: Option<u64>,
        pub env: HashMap<String, String>,
        pub working_dir: Option<String>,
    }

    pub struct ExecutorResult {
        pub stdout: String,
        pub stderr: String,
        pub exit_code: i32,
        pub stdout_bytes: usize,
        pub stderr_bytes: usize,
        pub stdout_omitted_bytes: usize,
        pub stderr_omitted_bytes: usize,
        pub stdout_truncated: bool,
        pub stderr_truncated: bool,
        pub sandboxed: bool,
        pub sandbox_type: crate::sandbox::SandboxType,
        pub duration: Option<u64>,
    }

    pub async fn execute_in_sandbox_with_options(
        _options: ExecutorOptions,
        _sandbox_config: &crate::sandbox::SandboxConfig,
    ) -> Result<ExecutorResult> {
        Ok(ExecutorResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
            stdout_bytes: 0,
            stderr_bytes: 0,
            stdout_omitted_bytes: 0,
            stderr_omitted_bytes: 0,
            stdout_truncated: false,
            stderr_truncated: false,
            sandboxed: false,
            sandbox_type: crate::sandbox::SandboxType::None,
            duration: None,
        })
    }
}
