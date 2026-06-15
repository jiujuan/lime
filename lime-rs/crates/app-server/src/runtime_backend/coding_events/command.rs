use serde_json::Value;

use super::non_empty_string;

const CANONICAL_SHELL_SCRIPT_PREFIX: &str = "__runtime_shell_script__";
const CANONICAL_POWERSHELL_SCRIPT_PREFIX: &str = "__runtime_powershell_script__";
const COMMAND_SUMMARY_MAX_CHARS: usize = 180;
const COMMAND_ARGV_MAX_ITEMS: usize = 12;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct CommandFacts {
    pub(super) command: String,
    pub(super) canonical_command: String,
    pub(super) summary: String,
    pub(super) argv: Vec<String>,
    pub(super) source: &'static str,
}

pub(super) fn command_facts_from_arguments(arguments: Option<&Value>) -> Option<CommandFacts> {
    command_value_from_arguments(arguments).map(command_facts_from_value)
}

pub(super) fn command_facts_from_text(command: &str) -> Option<CommandFacts> {
    let command = non_empty_string(command)?;
    Some(command_facts_from_value(CommandValue::Text(command)))
}

fn command_facts_from_value(value: CommandValue) -> CommandFacts {
    let command = value.display_text();
    let argv = value.argv();
    let canonical_argv = canonical_argv(&argv, &command);
    let canonical_command = canonical_argv.join(" ");
    let summary = command_summary(&canonical_argv, &command);
    CommandFacts {
        command,
        canonical_command,
        summary,
        argv: canonical_argv
            .into_iter()
            .take(COMMAND_ARGV_MAX_ITEMS)
            .collect(),
        source: value.source(),
    }
}

fn command_value_from_arguments(arguments: Option<&Value>) -> Option<CommandValue> {
    let object = arguments?.as_object()?;
    for key in ["command", "cmd", "script"] {
        if let Some(value) = object.get(key) {
            if let Some(values) = value.as_array() {
                let argv = values
                    .iter()
                    .filter_map(|value| value.as_str())
                    .filter_map(non_empty_string)
                    .collect::<Vec<_>>();
                if !argv.is_empty() {
                    return Some(CommandValue::Argv(argv));
                }
            }
            if let Some(command) = value.as_str().and_then(non_empty_string) {
                return Some(CommandValue::Text(command));
            }
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum CommandValue {
    Text(String),
    Argv(Vec<String>),
}

impl CommandValue {
    fn display_text(&self) -> String {
        match self {
            Self::Text(command) => command.clone(),
            Self::Argv(argv) => argv.join(" "),
        }
    }

    fn argv(&self) -> Vec<String> {
        match self {
            Self::Text(command) => shell_words(command),
            Self::Argv(argv) => argv.clone(),
        }
    }

    fn source(&self) -> &'static str {
        match self {
            Self::Text(_) => "text",
            Self::Argv(_) => "argv",
        }
    }
}

fn canonical_argv(argv: &[String], fallback_command: &str) -> Vec<String> {
    if argv.is_empty() {
        return vec![fallback_command.to_string()];
    }
    if let Some(script) = shell_lc_script(argv) {
        let script_argv = shell_words(script);
        if is_plain_single_command(&script_argv) {
            return script_argv;
        }
        return vec![
            CANONICAL_SHELL_SCRIPT_PREFIX.to_string(),
            shell_mode(argv).unwrap_or("-c").to_string(),
            script.to_string(),
        ];
    }
    if let Some(script) = powershell_command_script(argv) {
        return vec![
            CANONICAL_POWERSHELL_SCRIPT_PREFIX.to_string(),
            script.to_string(),
        ];
    }
    argv.iter()
        .map(|item| {
            if is_shell_binary(item) || is_powershell_binary(item) {
                binary_name(item)
            } else {
                item.clone()
            }
        })
        .collect()
}

fn shell_lc_script(argv: &[String]) -> Option<&str> {
    let shell = argv.first()?;
    if !is_shell_binary(shell) {
        return None;
    }
    let mode = argv.get(1)?;
    if mode != "-c" && mode != "-lc" {
        return None;
    }
    argv.get(2).map(String::as_str).and_then(non_empty_str)
}

fn shell_mode(argv: &[String]) -> Option<&str> {
    argv.get(1).map(String::as_str)
}

fn powershell_command_script(argv: &[String]) -> Option<&str> {
    let shell = argv.first()?;
    if !is_powershell_binary(shell) {
        return None;
    }
    argv.windows(2).find_map(|window| {
        let flag = window[0].to_ascii_lowercase();
        if matches!(flag.as_str(), "-command" | "-c" | "/c") {
            non_empty_str(&window[1])
        } else {
            None
        }
    })
}

fn is_plain_single_command(argv: &[String]) -> bool {
    !argv.is_empty()
        && !argv.iter().any(|part| {
            matches!(
                part.as_str(),
                "&&" | "||" | "|" | ";" | ">" | ">>" | "<" | "<<" | "2>" | "2>>"
            )
        })
}

fn command_summary(argv: &[String], fallback_command: &str) -> String {
    let summary = if argv.is_empty() {
        fallback_command.to_string()
    } else {
        argv.iter().take(4).cloned().collect::<Vec<_>>().join(" ")
    };
    truncate_chars(&summary, COMMAND_SUMMARY_MAX_CHARS)
}

fn shell_words(command: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut chars = command.chars().peekable();
    let mut quote: Option<char> = None;

    while let Some(ch) = chars.next() {
        match quote {
            Some('\'') => {
                if ch == '\'' {
                    quote = None;
                } else {
                    current.push(ch);
                }
            }
            Some('"') => match ch {
                '"' => quote = None,
                '\\' => {
                    if let Some(next) = chars.next() {
                        current.push(next);
                    }
                }
                _ => current.push(ch),
            },
            Some(_) => unreachable!(),
            None => match ch {
                '\'' | '"' => quote = Some(ch),
                '\\' => {
                    if let Some(next) = chars.next() {
                        current.push(next);
                    }
                }
                ' ' | '\t' | '\n' | '\r' => push_word(&mut words, &mut current),
                '&' | '|' => {
                    push_word(&mut words, &mut current);
                    if chars.peek() == Some(&ch) {
                        chars.next();
                        words.push(format!("{ch}{ch}"));
                    } else {
                        words.push(ch.to_string());
                    }
                }
                ';' | '<' | '>' => {
                    push_word(&mut words, &mut current);
                    if ch == '>' && chars.peek() == Some(&'>') {
                        chars.next();
                        words.push(">>".to_string());
                    } else {
                        words.push(ch.to_string());
                    }
                }
                _ => current.push(ch),
            },
        }
    }
    push_word(&mut words, &mut current);
    words
}

fn push_word(words: &mut Vec<String>, current: &mut String) {
    if let Some(word) = non_empty_string(current) {
        words.push(word);
    }
    current.clear();
}

fn is_shell_binary(value: &str) -> bool {
    matches!(binary_name(value).as_str(), "bash" | "sh" | "zsh")
}

fn is_powershell_binary(value: &str) -> bool {
    matches!(
        binary_name(value).as_str(),
        "pwsh" | "powershell" | "powershell.exe"
    )
}

fn binary_name(value: &str) -> String {
    value
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(value)
        .trim_matches(['"', '\''])
        .to_ascii_lowercase()
}

fn non_empty_str(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, character) in value.chars().enumerate() {
        if index >= max_chars {
            output.push('…');
            break;
        }
        output.push(character);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonicalizes_bash_lc_single_command_to_plain_argv() {
        let facts = command_facts_from_arguments(Some(&json!({
            "command": ["/bin/bash", "-lc", "cargo test -p app-server coding_events"]
        })))
        .expect("command facts");

        assert_eq!(
            facts.command,
            "/bin/bash -lc cargo test -p app-server coding_events"
        );
        assert_eq!(
            facts.canonical_command,
            "cargo test -p app-server coding_events"
        );
        assert_eq!(facts.summary, "cargo test -p app-server");
        assert_eq!(
            facts.argv,
            vec!["cargo", "test", "-p", "app-server", "coding_events"]
        );
        assert_eq!(facts.source, "argv");
    }

    #[test]
    fn preserves_complex_shell_script_without_losing_text() {
        let facts =
            command_facts_from_text("bash -lc 'git status && npm test'").expect("command facts");

        assert_eq!(
            facts.canonical_command,
            "__runtime_shell_script__ -lc git status && npm test"
        );
        assert_eq!(
            facts.summary,
            "__runtime_shell_script__ -lc git status && npm test"
        );
    }

    #[test]
    fn canonicalizes_powershell_command_wrapper() {
        let facts = command_facts_from_arguments(Some(&json!({
            "command": ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "-Command", "Write-Output ok"]
        })))
        .expect("command facts");

        assert_eq!(
            facts.canonical_command,
            "__runtime_powershell_script__ Write-Output ok"
        );
        assert_eq!(facts.source, "argv");
    }
}
