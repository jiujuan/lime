mod boundary;
mod prompt_context;
mod style_profile;

pub(crate) const MEMORY_SOUL_PROMPT_CONTEXT_KEY: &str = "memory_soul_prompt_context";

pub(crate) use prompt_context::{
    memory_soul_prompt_context_from_config, soul_packet_from_metadata,
};
