//! Utils stub - minimal helpers for compatibility during migration

pub fn sanitize_unicode_tags(s: &str) -> String {
    s.replace('\u{E000}', "").replace('\u{E001}', "")
}

pub fn contains_unicode_tags(s: &str) -> bool {
    s.contains('\u{E000}') || s.contains('\u{E001}')
}

pub fn is_token_cancelled(token: &Option<tokio_util::sync::CancellationToken>) -> bool {
    token
        .as_ref()
        .is_some_and(tokio_util::sync::CancellationToken::is_cancelled)
}

pub fn safe_truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect()
    }
}
