//! 会话管理模块（providers crate 部分）
//!
//! 包含 signature_store 和 session_manager，
//! 这两个模块被 converter 和 streaming 直接使用。

pub mod session_manager;
pub mod signature_store;

pub use session_manager::SessionManager;
pub use signature_store::{
    clear_thought_signature, get_thought_signature, has_valid_signature, store_thought_signature,
    take_thought_signature,
};
