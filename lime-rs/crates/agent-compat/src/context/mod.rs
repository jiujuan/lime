//! Minimal Aster context compatibility surface.
//!
//! Full Aster context management was deleted from this staging crate. The
//! remaining export is only the trace DTO still required by the reply/event
//! compat boundary.

mod trace;

pub use trace::ContextTraceStep;
