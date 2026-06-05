use super::*;

pub(super) fn merge_runtime_memory_prefetch_prompt(
    base_prompt: Option<String>,
    prefetch_prompt: Option<&str>,
) -> Option<String> {
    let Some(prefetch_prompt) = prefetch_prompt
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return base_prompt;
    };

    match base_prompt {
        Some(base) => {
            if base.contains(TURN_MEMORY_PREFETCH_PROMPT_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(prefetch_prompt.to_string())
            } else {
                Some(format!("{base}\n\n{prefetch_prompt}"))
            }
        }
        None => Some(prefetch_prompt.to_string()),
    }
}

pub(super) fn quoted_absolute_path_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r#"["'“”‘’](?P<path>(?:/|[A-Za-z]:\\)[^"'“”‘’\r\n]+)["'“”‘’]"#)
            .expect("quoted absolute path regex should compile")
    })
}

pub(super) fn unix_absolute_path_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r#"(?P<path>/[^\s"'“”‘’,;:，。；：、()（）{}\[\]【】<>《》]+)"#)
            .expect("unix absolute path regex should compile")
    })
}

pub(super) fn windows_absolute_path_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r#"(?P<path>[A-Za-z]:\\[^\s"'“”‘’,;:，。；：、()（）{}\[\]【】<>《》]+)"#)
            .expect("windows absolute path regex should compile")
    })
}

pub(super) fn normalize_explicit_local_path_candidate(candidate: &str) -> Option<String> {
    let trimmed = candidate
        .trim()
        .trim_end_matches(|ch: char| {
            matches!(
                ch,
                '.' | ','
                    | ';'
                    | ':'
                    | '。'
                    | '，'
                    | '；'
                    | '：'
                    | ')'
                    | '）'
                    | ']'
                    | '】'
                    | '}'
                    | '>'
            )
        })
        .trim();

    if trimmed.is_empty() {
        return None;
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() || !path.exists() {
        return None;
    }

    Some(
        path.canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string(),
    )
}

pub(super) fn push_unique_focus_path(paths: &mut Vec<String>, candidate: &str) {
    let Some(normalized) = normalize_explicit_local_path_candidate(candidate) else {
        return;
    };

    if paths.iter().any(|existing| existing == &normalized) {
        return;
    }

    paths.push(normalized);
}

pub(super) fn build_runtime_environment_system_prompt_for(
    workspace_root: &str,
    os: &str,
    family: &str,
    is_windows: bool,
) -> String {
    let shell = if is_windows {
        "PowerShell / Windows PowerShell"
    } else {
        "POSIX sh"
    };
    let path_style = if is_windows {
        r#"Windows 原生路径，例如 `C:\Users\name\file.txt` 或 `$env:SystemDrive\file.txt`"#
    } else {
        "POSIX 路径，例如 `/Users/name/file.txt`"
    };

    let mut lines = vec![
        TURN_RUNTIME_ENVIRONMENT_PROMPT_MARKER.to_string(),
        format!("- 当前运行系统: {os} ({family})"),
        format!("- 当前工作目录: {}", workspace_root.trim()),
        format!("- Shell 命令运行时: {shell}"),
        format!("- 本机路径格式: {path_style}"),
        "- 处理用户提到的“系统盘”“C 盘”“根目录”时，必须先按当前运行系统解释，不要跨平台猜路径。"
            .to_string(),
    ];

    if is_windows {
        lines.extend([
            "- Windows 原生运行时不要把 C 盘改写成 `/mnt/c`；`/mnt/c` 只适用于明确处于 WSL/Linux shell 的会话。".to_string(),
            "- 需要确认系统盘时，优先使用 PowerShell 查询 `$env:SystemDrive`、`$env:SystemRoot` 或 `Get-PSDrive -PSProvider FileSystem`。".to_string(),
            "- 在 Windows 写文件时优先使用 `Write` 工具或 PowerShell 的 `Set-Content -Encoding utf8`，路径用双引号包裹。".to_string(),
        ]);
    } else {
        lines.extend([
            "- 非 Windows 运行时不要臆造 `C:\\`、`D:\\` 等盘符；如果用户要求 Windows 专属路径，先说明当前环境无法直接访问 Windows 系统盘或请求确认映射。".to_string(),
            "- 只有在命令结果或环境变量明确表明当前处于 WSL 时，才考虑 `/mnt/<drive>` 路径。".to_string(),
        ]);
    }

    lines.join("\n")
}

pub(super) fn build_runtime_environment_system_prompt(workspace_root: &str) -> String {
    build_runtime_environment_system_prompt_for(
        workspace_root,
        std::env::consts::OS,
        std::env::consts::FAMILY,
        cfg!(target_os = "windows"),
    )
}

pub(super) fn merge_system_prompt_with_runtime_environment(
    base_prompt: Option<String>,
    workspace_root: &str,
) -> Option<String> {
    let environment_prompt = build_runtime_environment_system_prompt(workspace_root);

    match base_prompt {
        Some(base) => {
            if base.contains(TURN_RUNTIME_ENVIRONMENT_PROMPT_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(environment_prompt)
            } else {
                Some(format!("{base}\n\n{environment_prompt}"))
            }
        }
        None => Some(environment_prompt),
    }
}

pub(super) fn extract_explicit_local_focus_paths_from_message(message: &str) -> Vec<String> {
    let mut paths = Vec::new();

    for captures in quoted_absolute_path_regex().captures_iter(message) {
        if let Some(path) = captures.name("path") {
            push_unique_focus_path(&mut paths, path.as_str());
        }
    }

    for captures in unix_absolute_path_regex().captures_iter(message) {
        if let Some(path) = captures.name("path") {
            push_unique_focus_path(&mut paths, path.as_str());
        }
    }

    for captures in windows_absolute_path_regex().captures_iter(message) {
        if let Some(path) = captures.name("path") {
            push_unique_focus_path(&mut paths, path.as_str());
        }
    }

    paths
}

pub(super) fn merge_system_prompt_with_explicit_local_path_focus(
    base_prompt: Option<String>,
    user_message: &str,
    workspace_root: &str,
) -> Option<String> {
    let focus_paths = extract_explicit_local_focus_paths_from_message(user_message);
    if focus_paths.is_empty() {
        return base_prompt;
    }

    let workspace_root = workspace_root.trim();
    let should_warn_about_workspace =
        !workspace_root.is_empty() && focus_paths.iter().all(|path| path != workspace_root);

    let mut lines = vec![
        TURN_LOCAL_PATH_FOCUS_PROMPT_MARKER.to_string(),
        "本回合用户已经明确给出本地路径；这些路径是当前侦查与读取的第一优先级。".to_string(),
    ];
    for path in focus_paths.iter().take(3) {
        lines.push(format!("- 优先路径: {path}"));
    }
    lines.push(
        "- 第一批只围绕这些显式路径做 2 到 4 个只读工具调用，优先精确搜索和读取关键文件。"
            .to_string(),
    );
    lines.push(
        "- 如果有多个彼此独立的目录或文件需要核对，优先在同一批里并行完成这些只读调用，不要一轮只看一个。"
            .to_string(),
    );
    if should_warn_about_workspace {
        lines.push(format!(
            "- 不要先扫描当前默认工作目录 {workspace_root} 或其它无关目录，除非这些显式路径证据不足，或用户明确要求比较当前工作区。"
        ));
    }
    lines.push(
        "- 如果这些显式路径不存在、无法读取，或必须回退到其它路径，先在用户可见结论正文里说明原因，再继续下一批。"
            .to_string(),
    );
    lines.push(
        "- 不要在只拿到一两个证据点时就仓促下结论；如果证据还不够，继续下一批读取后再总结。"
            .to_string(),
    );
    let focus_prompt = lines.join("\n");

    match base_prompt {
        Some(base) => {
            if base.contains(TURN_LOCAL_PATH_FOCUS_PROMPT_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(focus_prompt)
            } else {
                Some(format!("{base}\n\n{focus_prompt}"))
            }
        }
        None => Some(focus_prompt),
    }
}
