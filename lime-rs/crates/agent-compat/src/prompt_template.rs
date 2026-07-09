//! Prompt template compatibility stub.

use anyhow::Result;
use serde::Serialize;

pub fn render_global_file<T: Serialize + ?Sized>(_template: &str, _context: &T) -> Result<String> {
    Ok(String::new())
}

pub fn render_inline_once<T: Serialize + ?Sized>(template: &str, _context: &T) -> Result<String> {
    Ok(template.to_string())
}
