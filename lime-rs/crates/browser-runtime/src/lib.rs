pub mod action;
pub mod client;
pub mod evidence;
pub mod manager;
pub mod profile_scope;
pub mod types;

pub use manager::{BrowserRuntimeManager, EventBufferSnapshot, OpenSessionRequest};
pub use profile_scope::{
    cleanup_plan_for_owner, BrowserProfileCleanupPlan, BrowserProfileOwner, BrowserProfileScope,
    BrowserProfileScopeKind,
};
pub use types::{
    BrowserControlMode, BrowserEvent, BrowserEventPayload, BrowserPageInfo,
    BrowserSessionLifecycleState, BrowserStreamMode, BrowserTransportKind, CdpSessionState,
    CdpTargetInfo, FrameMetadata,
};
