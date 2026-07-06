//! Aster - AI Agent Framework
//!
//! This crate provides the core functionality for the Aster AI agent.

// Allow dead code for now as some code is reserved for future use
#![allow(dead_code)]

pub mod action_required_manager;
pub mod agents;
pub mod claude_plugin_cache;
pub mod config;
pub mod context;
pub mod context_mgmt;
pub mod conversation;
pub mod execution;
pub mod hints;
pub mod hooks;
pub mod mcp;
pub mod mcp_utils;
pub mod media;
pub mod model;
pub mod network;
pub mod oauth;
pub mod parser;
pub mod permission;
pub mod plan;
pub mod posthog;
pub mod prompt_template;
pub mod providers;
pub mod recipe;
pub mod rules;
pub mod sandbox;
pub mod scheduler;
pub mod scheduler_trait;
pub mod security;
pub mod session;
pub mod session_context;
pub mod skills;
pub mod slash_commands;
pub mod streaming;
pub mod token_counter;
pub mod tool_inspection;
pub mod tool_monitor;
pub mod tools;
pub mod user_message_manager;
pub mod utils;
