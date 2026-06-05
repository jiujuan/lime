use std::ffi::OsString;

pub fn var(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| std::env::var(name).ok())
}

pub fn var_os(names: &[&str]) -> Option<OsString> {
    names.iter().find_map(std::env::var_os)
}

pub fn var_nonempty(names: &[&str]) -> Option<String> {
    var(names)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn parse_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

pub fn bool_var(names: &[&str]) -> Option<bool> {
    var(names).as_deref().and_then(parse_bool)
}
