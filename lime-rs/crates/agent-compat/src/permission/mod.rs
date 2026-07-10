// =============================================================================
// Module Declarations
// =============================================================================

pub(crate) mod permission_confirmation;
pub(crate) mod permission_inspector;
pub(crate) mod permission_judge;
pub(crate) mod permission_store;

// =============================================================================
// Minimal Aster permission compatibility exports
// =============================================================================

// Permission confirmation types
pub use permission_confirmation::{Permission, PermissionConfirmation, PrincipalType};
