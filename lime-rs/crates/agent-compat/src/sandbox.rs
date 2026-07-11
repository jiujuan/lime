//! Minimal sandbox config DTO retained for Aster context lowering.

pub use config::SandboxConfig;

mod config {
    use serde::{Deserialize, Serialize};

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SandboxConfig;

    impl Default for SandboxConfig {
        fn default() -> Self {
            Self
        }
    }
}
