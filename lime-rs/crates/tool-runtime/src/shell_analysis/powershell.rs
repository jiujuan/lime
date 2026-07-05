use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::path_guard::{resolve_static_path_candidate, PathMutationCandidate, PathMutationKind};

use super::common::{
    detect_high_risk_git_command, is_mutating_git_subcommand, normalize_shell_word, split_segments,
    tokenize_words,
};

pub(super) fn is_command_concurrency_safe(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return false;
    }

    if has_powershell_write_redirection(trimmed) {
        return false;
    }

    let mut saw_segment = false;
    for segment in split_powershell_segments(trimmed) {
        let words = extract_powershell_command_words(segment);
        if words.is_empty() {
            continue;
        }
        saw_segment = true;

        let command_name = words[0].as_str();
        if is_mutating_powershell_cmdlet(command_name) {
            return false;
        }
        if command_name == "git"
            && is_mutating_git_subcommand(words.get(1).map(String::as_str).unwrap_or_default())
        {
            return false;
        }
        if !is_known_read_only_powershell_command(command_name, &words) {
            return false;
        }
    }

    saw_segment
}

pub(super) fn missing_read_targets(command: &str, cwd: &Path) -> Vec<PathBuf> {
    let mut missing_paths = Vec::new();
    for raw_path in collect_read_path_candidates(command) {
        let Some(resolved_path) = resolve_static_path_candidate(&raw_path, cwd) else {
            continue;
        };
        if resolved_path.exists() || missing_paths.contains(&resolved_path) {
            continue;
        }
        missing_paths.push(resolved_path);
    }
    missing_paths
}

pub(super) fn collect_path_candidates(command: &str) -> Vec<PathMutationCandidate> {
    let mut candidates = powershell_write_redirection_re()
        .captures_iter(command)
        .filter_map(|captures| captures.name("target"))
        .map(|target| PathMutationCandidate::new(target.as_str(), PathMutationKind::Write))
        .collect::<Vec<_>>();

    for segment in split_powershell_segments(command) {
        let raw_words = tokenize_powershell_words(segment);
        if raw_words.is_empty() {
            continue;
        }
        let words = normalize_powershell_words(&raw_words);
        let Some(command_name) = words.first().map(String::as_str) else {
            continue;
        };
        match command_name {
            "set-content" | "add-content" | "clear-content" | "remove-item" | "copy-item"
            | "move-item" | "rename-item" | "new-item" | "out-file" | "tee-object"
            | "export-csv" | "export-clixml" | "invoke-webrequest" | "invoke-restmethod" => {
                let kind = if command_name == "remove-item" {
                    PathMutationKind::Remove
                } else {
                    PathMutationKind::Write
                };
                for target in extract_powershell_write_targets(&raw_words, command_name) {
                    candidates.push(PathMutationCandidate::new(target, kind));
                }
            }
            _ => {}
        }
    }
    candidates
}

pub(super) fn detect_high_risk_reason(command: &str) -> Option<String> {
    if powershell_symlink_re().is_match(command) {
        return Some(
            "Blocked: creating symbolic links or junctions is not allowed in PowerShell tool."
                .to_string(),
        );
    }
    detect_high_risk_git_command(
        command,
        split_powershell_segments,
        extract_powershell_command_words,
    )
}

pub(super) fn detect_mutating_warning(command: &str) -> Option<String> {
    if has_powershell_write_redirection(command) {
        return Some("Command writes to files via PowerShell redirection".to_string());
    }

    for segment in split_powershell_segments(command) {
        let words = extract_powershell_command_words(segment);
        let Some(command_name) = words.first().map(String::as_str) else {
            continue;
        };
        if matches!(command_name, "invoke-webrequest" | "invoke-restmethod")
            && words
                .iter()
                .any(|word| matches!(word.as_str(), "-outfile" | "-literalpath" | "-path"))
        {
            return Some(format!(
                "Command may persist downloaded content via `{command_name}`"
            ));
        }
        if is_mutating_powershell_cmdlet(command_name) {
            return Some(format!(
                "Command may modify files or project state via `{command_name}`"
            ));
        }
        if command_name == "git" {
            let subcommand = words.get(1).map(String::as_str).unwrap_or_default();
            if is_mutating_git_subcommand(subcommand) {
                return Some(format!(
                    "Command modifies repository state via `git {subcommand}`"
                ));
            }
        }
    }

    None
}

pub(super) fn detect_blocked_sleep_pattern(command: &str) -> Option<String> {
    let trimmed = command.trim();
    let first = trimmed.split([';', '|', '&', '\r', '\n']).next()?.trim();
    let captures = powershell_sleep_re().captures(first)?;
    let secs = captures.get(1)?.as_str().parse::<u64>().ok()?;
    if secs < 2 {
        return None;
    }

    let rest = trimmed
        .get(first.len()..)
        .unwrap_or("")
        .trim_start_matches(|ch: char| ch.is_whitespace() || ch == ';' || ch == '|' || ch == '&')
        .trim();

    if rest.is_empty() {
        Some(format!("standalone Start-Sleep {secs}"))
    } else {
        Some(format!("Start-Sleep {secs} followed by: {rest}"))
    }
}

fn collect_read_path_candidates(command: &str) -> Vec<String> {
    let mut candidates = Vec::new();

    for segment in split_powershell_segments(command) {
        let raw_words = tokenize_powershell_words(segment);
        if raw_words.is_empty() {
            continue;
        }

        let normalized_words = normalize_powershell_words(&raw_words);
        let Some(command_name) = normalized_words.first().map(String::as_str) else {
            continue;
        };
        candidates.extend(extract_powershell_read_targets(&raw_words, command_name));
    }

    candidates
}

fn split_powershell_segments(command: &str) -> Vec<&str> {
    split_segments(command)
}

fn tokenize_powershell_words(segment: &str) -> Vec<String> {
    tokenize_words(segment, '`')
}

fn normalize_powershell_words(raw_words: &[String]) -> Vec<String> {
    let mut normalized = raw_words
        .iter()
        .map(|word| resolve_powershell_alias(&normalize_shell_word(word)).to_string())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();

    while let Some(word) = normalized.first() {
        if matches!(word.as_str(), "&" | "." | "powershell" | "pwsh") {
            normalized.remove(0);
            continue;
        }
        break;
    }

    normalized
}

fn extract_powershell_command_words(segment: &str) -> Vec<String> {
    normalize_powershell_words(&tokenize_powershell_words(segment))
}

fn resolve_powershell_alias(word: &str) -> &str {
    match word {
        "rm" | "del" | "erase" | "ri" => "remove-item",
        "mv" | "move" | "mi" => "move-item",
        "cp" | "copy" | "cpi" => "copy-item",
        "ren" | "rni" => "rename-item",
        "ni" | "mkdir" | "md" => "new-item",
        "sc" => "set-content",
        "ac" => "add-content",
        "tee" => "tee-object",
        "iwr" => "invoke-webrequest",
        "irm" => "invoke-restmethod",
        "cat" | "gc" | "type" => "get-content",
        "ls" | "dir" | "gci" => "get-childitem",
        "sls" => "select-string",
        "sl" | "cd" | "chdir" => "set-location",
        _ => word,
    }
}

fn extract_powershell_read_targets(raw_words: &[String], command_name: &str) -> Vec<String> {
    if raw_words.len() <= 1 {
        return Vec::new();
    }

    let mut named_targets = Vec::new();
    let mut positional_targets = Vec::new();
    let mut index = 1usize;
    let mut after_double_dash = false;
    let path_params = ["-path", "-literalpath", "-lp"];

    while index < raw_words.len() {
        let word = &raw_words[index];
        let normalized = normalize_shell_word(word);

        if !after_double_dash && word == "--" {
            after_double_dash = true;
            index += 1;
            continue;
        }

        if !after_double_dash && normalized.starts_with('-') {
            if let Some((param, value)) = normalized.split_once(':') {
                if path_params.contains(&param) && !value.is_empty() {
                    named_targets.push(value.to_string());
                }
                index += 1;
                continue;
            }

            if path_params.contains(&normalized.as_str()) {
                if let Some(next) = raw_words.get(index + 1) {
                    named_targets.push(next.clone());
                    index += 2;
                    continue;
                }
            }

            index += 1;
            continue;
        }

        positional_targets.push(word.clone());
        index += 1;
    }

    if !named_targets.is_empty() {
        return named_targets;
    }

    match command_name {
        "get-content" | "get-childitem" => positional_targets.into_iter().rev().take(1).collect(),
        "select-string" if positional_targets.len() >= 2 => {
            positional_targets.into_iter().rev().take(1).collect()
        }
        _ => Vec::new(),
    }
}

fn extract_powershell_write_targets(raw_words: &[String], command_name: &str) -> Vec<String> {
    if raw_words.len() <= 1 {
        return Vec::new();
    }

    let mut named_targets = Vec::new();
    let mut positional_targets = Vec::new();
    let mut index = 1usize;
    let mut after_double_dash = false;
    let path_params = [
        "-path",
        "-literalpath",
        "-destination",
        "-filepath",
        "-outfile",
        "-pspath",
        "-lp",
    ];

    while index < raw_words.len() {
        let word = &raw_words[index];
        let normalized = normalize_shell_word(word);

        if !after_double_dash && word == "--" {
            after_double_dash = true;
            index += 1;
            continue;
        }

        if !after_double_dash && normalized.starts_with('-') {
            if let Some((param, value)) = normalized.split_once(':') {
                if path_params.contains(&param) && !value.is_empty() {
                    named_targets.push(value.to_string());
                }
                index += 1;
                continue;
            }

            if path_params.contains(&normalized.as_str()) {
                if let Some(next) = raw_words.get(index + 1) {
                    named_targets.push(next.clone());
                    index += 2;
                    continue;
                }
            }

            index += 1;
            continue;
        }

        positional_targets.push(word.clone());
        index += 1;
    }

    if !named_targets.is_empty() {
        return named_targets;
    }

    match command_name {
        "set-content" | "add-content" | "clear-content" | "remove-item" | "rename-item"
        | "new-item" | "out-file" | "tee-object" | "export-csv" | "export-clixml" => {
            positional_targets.into_iter().take(1).collect()
        }
        "copy-item" | "move-item" => positional_targets.into_iter().skip(1).take(1).collect(),
        "invoke-webrequest" | "invoke-restmethod" => Vec::new(),
        _ => Vec::new(),
    }
}

fn is_mutating_powershell_cmdlet(name: &str) -> bool {
    matches!(
        name,
        "set-content"
            | "add-content"
            | "clear-content"
            | "remove-item"
            | "copy-item"
            | "move-item"
            | "rename-item"
            | "new-item"
            | "out-file"
            | "tee-object"
            | "export-csv"
            | "export-clixml"
            | "expand-archive"
    )
}

fn is_known_read_only_powershell_command(command_name: &str, words: &[String]) -> bool {
    match command_name {
        "get-content" | "get-childitem" | "select-string" | "get-item" | "resolve-path"
        | "split-path" | "test-path" | "measure-object" | "select-object" | "sort-object"
        | "where-object" | "format-table" | "format-list" => true,
        "git" => matches!(
            words.get(1).map(String::as_str).unwrap_or_default(),
            "status" | "diff" | "show" | "log" | "rev-parse" | "ls-files" | "grep" | "blame"
        ),
        _ => false,
    }
}

fn is_safe_powershell_sink(target: &str) -> bool {
    let normalized = normalize_shell_word(target);
    matches!(
        normalized.as_str(),
        "$null" | "nul" | "null:" | "[system.io.stream]::null" | "&1" | "&2"
    )
}

fn has_powershell_write_redirection(command: &str) -> bool {
    powershell_write_redirection_re()
        .captures_iter(command)
        .filter_map(|captures| captures.name("target"))
        .any(|target| !is_safe_powershell_sink(target.as_str()))
}

fn powershell_write_redirection_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?x)
            (?:^|[\s;(])
            (?:\d+)?(?:>>?|>\|)
            \s*
            (?P<target>'[^']*'|"[^"]*"|[^\s;&|()]+)
        "#,
        )
        .expect("valid powershell write redirection regex")
    })
}

fn powershell_symlink_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?ix)
            \b(?:new-item|ni|cmd\s*/c\s+mklink)\b
            [^\n;|&]*
            (?:
                (?:-itemtype|-type|-it(?:emtype)?|-ty(?:pe)?)\s*(?::|=|\s)\s*
                ['"]?(symboliclink|junction|hardlink)
                |
                \s/(?:d|j)\b
            )
        "#,
        )
        .expect("valid powershell symlink regex")
    })
}

fn powershell_sleep_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)^(?:start-sleep|sleep)(?:\s+-s(?:econds)?)?\s+(\d+)\s*$")
            .expect("valid PowerShell sleep regex")
    })
}
