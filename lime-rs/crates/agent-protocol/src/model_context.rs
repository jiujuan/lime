use std::collections::HashMap;
use std::sync::LazyLock;

pub static MODEL_CONTEXT_WINDOWS: LazyLock<HashMap<&'static str, usize>> = LazyLock::new(|| {
    let mut windows = HashMap::new();

    windows.insert("claude-3-5-sonnet-20241022", 200_000);
    windows.insert("claude-3-7-sonnet-20250219", 200_000);
    windows.insert("claude-4-0-sonnet-20250514", 200_000);
    windows.insert("claude-3-opus-20240229", 200_000);
    windows.insert("claude-3-sonnet-20240229", 200_000);
    windows.insert("claude-3-haiku-20240307", 200_000);
    windows.insert("gpt-4o", 128_000);
    windows.insert("gpt-4o-mini", 128_000);
    windows.insert("gpt-4-turbo", 128_000);
    windows.insert("gpt-4", 8_192);
    windows.insert("gpt-3.5-turbo", 16_385);
    windows.insert("default", 200_000);

    windows
});
