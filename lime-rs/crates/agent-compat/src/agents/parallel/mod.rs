// Parallel Agent Execution Module
//
// This module provides parallel execution capabilities:
// - Parallel agent executor with dependency management
// - Agent resource pool for worker management

mod executor;
mod pool;

pub use executor::*;
pub use pool::*;
