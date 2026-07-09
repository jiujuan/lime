//! Hooks stub - minimal compatibility

pub use types::FrontmatterHooks;

mod types {
    use serde::{Deserialize, Serialize};

    #[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
    pub struct FrontmatterHooks {
        pub custom: std::collections::HashMap<String, Vec<String>>,
    }
}
