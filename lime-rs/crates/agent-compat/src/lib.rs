//! Aster - AI Agent Framework
//!
//! This crate provides the core functionality for the Aster AI agent.

// Allow dead code for now as some code is reserved for future use
#![allow(dead_code)]

pub mod action_required_manager;
pub mod agents;
pub mod config;
pub mod context;
mod context_mgmt;
pub mod conversation;
mod execution;
pub mod hooks;
mod mcp_utils;
mod media;
pub mod model;
pub mod permission;
mod prompt_template;
pub mod providers;
pub mod recipe;
mod sandbox;
pub mod scheduler;
mod scheduler_trait;
pub mod session;
pub mod session_context;
pub mod tool_inspection;
pub mod tools;
mod utils;
