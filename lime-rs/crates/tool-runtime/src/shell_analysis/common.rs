use regex::Regex;
use std::sync::OnceLock;

pub(super) fn split_segments(command: &str) -> Vec<&str> {
    let mut segments = Vec::new();
    let mut start = 0usize;
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = command.char_indices().peekable();

    while let Some((index, ch)) = chars.next() {
        match ch {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            ';' | '\n' if !in_single && !in_double => {
                push_segment(command, &mut segments, start, index);
                start = index + ch.len_utf8();
            }
            '&' if !in_single && !in_double => {
                if let Some((next_index, next_char)) = chars.peek().copied() {
                    if next_char == '&' {
                        push_segment(command, &mut segments, start, index);
                        let _ = chars.next();
                        start = next_index + next_char.len_utf8();
                    }
                }
            }
            '|' if !in_single && !in_double => {
                push_segment(command, &mut segments, start, index);
                if let Some((next_index, next_char)) = chars.peek().copied() {
                    if next_char == '|' {
                        let _ = chars.next();
                        start = next_index + next_char.len_utf8();
                    } else {
                        start = index + ch.len_utf8();
                    }
                } else {
                    start = index + ch.len_utf8();
                }
            }
            _ => {}
        }
    }

    push_segment(command, &mut segments, start, command.len());
    segments
}

pub(super) fn tokenize_words(segment: &str, escape_char: char) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;

    for ch in segment.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            ch if ch == escape_char && !in_single => {
                escaped = true;
            }
            '\'' if !in_double => {
                in_single = !in_single;
            }
            '"' if !in_single => {
                in_double = !in_double;
            }
            ch if ch.is_whitespace() && !in_single && !in_double => {
                if !current.is_empty() {
                    words.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        words.push(current);
    }

    words
}

pub(super) fn normalize_shell_word(word: &str) -> String {
    word.trim_matches(|ch| matches!(ch, '"' | '\'' | '`' | '(' | ')' | ','))
        .to_ascii_lowercase()
}

pub(super) fn normalized_tool_name(tool_name: &str) -> String {
    tool_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

pub(super) fn command_references_wsl_drive_mount(command: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)(^|[\s'"(=:/])/(?:mnt|run/desktop/mnt/host)/[a-z](?:/|$)"#)
            .expect("valid WSL drive mount regex")
    })
    .is_match(command)
}

pub(super) fn detect_high_risk_git_command(
    command: &str,
    split: fn(&str) -> Vec<&str>,
    extract_words: fn(&str) -> Vec<String>,
) -> Option<String> {
    for segment in split(command) {
        let words = extract_words(segment);
        if words.first().map(String::as_str) != Some("git") {
            continue;
        }
        match words.get(1).map(String::as_str).unwrap_or_default() {
            "reset" if words.iter().any(|word| word == "--hard") => {
                return Some(
                    "Blocked: `git reset --hard` is a destructive repository operation."
                        .to_string(),
                );
            }
            "clean" if is_forced_git_clean(&words) => {
                return Some(
                    "Blocked: forced `git clean` may permanently remove untracked files."
                        .to_string(),
                );
            }
            "push" if words.iter().any(|word| word == "--force" || word == "-f") => {
                return Some(
                    "Blocked: force-pushing git history requires explicit manual confirmation."
                        .to_string(),
                );
            }
            _ => {}
        }
    }
    None
}

pub(super) fn is_forced_git_clean(words: &[String]) -> bool {
    let has_force = words
        .iter()
        .any(|word| word.starts_with('-') && word.contains('f'));
    let has_scope = words.iter().any(|word| {
        word.starts_with('-') && (word.contains('d') || word.contains('x') || word.contains('X'))
    });
    has_force && has_scope
}

pub(super) fn is_mutating_git_subcommand(subcommand: &str) -> bool {
    matches!(
        subcommand,
        "add"
            | "am"
            | "apply"
            | "branch"
            | "checkout"
            | "cherry-pick"
            | "clean"
            | "commit"
            | "merge"
            | "mv"
            | "pull"
            | "push"
            | "rebase"
            | "reset"
            | "restore"
            | "revert"
            | "rm"
            | "stash"
            | "switch"
            | "tag"
    )
}

fn push_segment<'a>(command: &'a str, segments: &mut Vec<&'a str>, start: usize, end: usize) {
    let segment = command[start..end].trim();
    if !segment.is_empty() {
        segments.push(segment);
    }
}
