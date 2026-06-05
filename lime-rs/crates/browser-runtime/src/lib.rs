pub mod action;
pub mod client;
pub mod manager;
pub mod types;

pub use manager::{BrowserRuntimeManager, EventBufferSnapshot, OpenSessionRequest};
pub use types::{
    BrowserControlMode, BrowserEvent, BrowserEventPayload, BrowserPageInfo,
    BrowserSessionLifecycleState, BrowserStreamMode, BrowserTransportKind, CdpSessionState,
    CdpTargetInfo, FrameMetadata,
};
