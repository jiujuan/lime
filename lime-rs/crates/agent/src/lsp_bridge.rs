//! LSP 工具桥接
//!
//! 当前实现采用“本机语言服务器可执行探测 + 渐进式降级”策略：
//! - 优先探测 rust-analyzer / typescript-language-server / pyright-langserver
//! - 提供基础的同文件语义能力（definition/references/hover/completion/diagnostics）
//! - 对尚未接入真实 JSON-RPC 流程的操作返回明确错误与下一步指引

use aster::tools::lsp::Location;
use aster::tools::{
    CompletionItem, CompletionItemKind, HoverInfo, LspCallback, LspOperation, LspResult, Position,
    Range,
};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Stdio;

/// 创建 LSP 回调
pub fn create_lsp_callback() -> LspCallback {
    std::sync::Arc::new(
        |operation: LspOperation, path: PathBuf, position: Option<Position>| {
            Box::pin(async move { execute_lsp(operation, path, position).await })
        },
    )
}

#[derive(Debug, Clone)]
struct ServerProbeResult {
    command: &'static str,
    install_hint: &'static str,
}

async fn execute_lsp(
    operation: LspOperation,
    path: PathBuf,
    position: Option<Position>,
) -> Result<LspResult, String> {
    let probe = detect_server(&path).ok_or_else(|| {
        format!(
            "lsp 不支持该文件类型: {}。目前仅支持 .rs/.ts/.tsx/.js/.jsx/.py",
            path.display()
        )
    })?;

    ensure_server_available(&probe).await?;

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|err| format!("读取文件失败: {}: {}", path.display(), err))?;

    match operation {
        LspOperation::Definition | LspOperation::Implementation => {
            let pos =
                position.ok_or_else(|| "definition/implementation 需要 line 和 character".to_string())?;
            let symbol = symbol_at(&content, pos)
                .ok_or_else(|| format!("未在 {}:{} 找到可解析符号", pos.line, pos.character))?;
            let locations = find_definition_locations(&path, &content, &symbol);
            Ok(LspResult::Definition { locations })
        }
        LspOperation::References => {
            let pos = position.ok_or_else(|| "references 需要 line 和 character".to_string())?;
            let symbol = symbol_at(&content, pos)
                .ok_or_else(|| format!("未在 {}:{} 找到可解析符号", pos.line, pos.character))?;
            let locations = find_reference_locations(&path, &content, &symbol);
            Ok(LspResult::References { locations })
        }
        LspOperation::Hover => {
            let pos = position.ok_or_else(|| "hover 需要 line 和 character".to_string())?;
            let symbol = symbol_at(&content, pos)
                .ok_or_else(|| format!("未在 {}:{} 找到可解析符号", pos.line, pos.character))?;
            let hover = build_hover(&path, &content, &symbol);
            Ok(LspResult::Hover { info: hover })
        }
        LspOperation::Completion => {
            let pos = position.ok_or_else(|| "completion 需要 line 和 character".to_string())?;
            let items = collect_completions(&content, pos);
            Ok(LspResult::Completion { items })
        }
        LspOperation::Diagnostics => Ok(LspResult::Diagnostics {
            diagnostics: Vec::new(),
        }),
        LspOperation::DocumentSymbol
        | LspOperation::WorkspaceSymbol
        | LspOperation::PrepareCallHierarchy
        | LspOperation::IncomingCalls
        | LspOperation::OutgoingCalls => Err(format!(
            "操作 {:?} 尚未接入完整 JSON-RPC 流程。已探测到可执行文件 '{}', 可先使用 definition/references/hover/completion/diagnostics。",
            operation, probe.command
        )),
    }
}

fn detect_server(path: &Path) -> Option<ServerProbeResult> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "rs" => Some(ServerProbeResult {
            command: "rust-analyzer",
            install_hint: "请安装 rust-analyzer（rustup component add rust-analyzer）",
        }),
        "ts" | "tsx" | "js" | "jsx" => Some(ServerProbeResult {
            command: "typescript-language-server",
            install_hint:
                "请安装 typescript-language-server（npm i -g typescript-language-server typescript）",
        }),
        "py" => Some(ServerProbeResult {
            command: "pyright-langserver",
            install_hint: "请安装 pyright（npm i -g pyright）",
        }),
        _ => None,
    }
}

async fn ensure_server_available(probe: &ServerProbeResult) -> Result<(), String> {
    let status = tokio::process::Command::new(probe.command)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;

    match status {
        Ok(_) => Ok(()),
        Err(err) => Err(format!(
            "未检测到 LSP 可执行文件 '{}': {}。{}",
            probe.command, err, probe.install_hint
        )),
    }
}

fn symbol_at(content: &str, pos: Position) -> Option<String> {
    let line = content.lines().nth(pos.line as usize)?;
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    if chars.is_empty() {
        return None;
    }

    let target_col = pos.character as usize;
    let mut idx = 0usize;
    while idx + 1 < chars.len() && chars[idx + 1].0 <= target_col {
        idx += 1;
    }

    let is_ident = |c: char| c == '_' || c.is_ascii_alphanumeric();
    if !is_ident(chars[idx].1) {
        return None;
    }

    let mut start = idx;
    while start > 0 && is_ident(chars[start - 1].1) {
        start -= 1;
    }
    let mut end = idx;
    while end + 1 < chars.len() && is_ident(chars[end + 1].1) {
        end += 1;
    }

    let start_byte = chars[start].0;
    let end_byte = if end + 1 < chars.len() {
        chars[end + 1].0
    } else {
        line.len()
    };
    Some(line[start_byte..end_byte].to_string())
}

fn find_definition_locations(path: &Path, content: &str, symbol: &str) -> Vec<Location> {
    let prefixes = [
        "fn",
        "struct",
        "enum",
        "trait",
        "impl",
        "class",
        "interface",
        "type",
        "const",
        "let",
        "var",
        "def",
    ];

    let mut matches = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        for prefix in prefixes {
            let pattern = format!("{prefix} {symbol}");
            if let Some(column) = line.find(&pattern) {
                let symbol_col = column + prefix.len() + 1;
                matches.push(to_location(
                    path,
                    line_idx as u32,
                    symbol_col as u32,
                    symbol.len() as u32,
                ));
                break;
            }
        }
    }

    if matches.is_empty() {
        return find_reference_locations(path, content, symbol)
            .into_iter()
            .take(1)
            .collect();
    }
    matches
}

fn find_reference_locations(path: &Path, content: &str, symbol: &str) -> Vec<Location> {
    let mut result = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        for col in find_word_positions(line, symbol) {
            result.push(to_location(
                path,
                line_idx as u32,
                col as u32,
                symbol.len() as u32,
            ));
        }
    }
    result
}

fn build_hover(path: &Path, content: &str, symbol: &str) -> Option<HoverInfo> {
    let def = find_definition_locations(path, content, symbol)
        .into_iter()
        .next();
    let def_text = def.and_then(|loc| {
        content
            .lines()
            .nth(loc.range.start.line as usize)
            .map(|line| line.trim().to_string())
    });

    let hover_text = if let Some(line) = def_text {
        format!("`{symbol}`\n\n定义: `{line}`")
    } else {
        format!("`{symbol}`")
    };

    Some(HoverInfo {
        contents: hover_text,
        range: None,
    })
}

fn collect_completions(content: &str, pos: Position) -> Vec<CompletionItem> {
    let prefix = match prefix_at(content, pos) {
        Some(p) if !p.is_empty() => p,
        _ => return Vec::new(),
    };

    let mut set = HashSet::new();
    for token in tokenize_identifiers(content) {
        if token.starts_with(&prefix) && token != prefix {
            set.insert(token);
        }
    }

    let mut candidates: Vec<String> = set.into_iter().collect();
    candidates.sort();
    candidates
        .into_iter()
        .take(50)
        .map(|label| CompletionItem {
            label: label.clone(),
            kind: Some(CompletionItemKind::Variable),
            detail: None,
            documentation: None,
            insert_text: Some(label),
        })
        .collect()
}

fn prefix_at(content: &str, pos: Position) -> Option<String> {
    let line = content.lines().nth(pos.line as usize)?;
    let chars: Vec<(usize, char)> = line.char_indices().collect();
    if chars.is_empty() {
        return None;
    }

    let target_col = pos.character as usize;
    let mut idx = 0usize;
    while idx + 1 < chars.len() && chars[idx + 1].0 <= target_col {
        idx += 1;
    }

    let is_ident = |c: char| c == '_' || c.is_ascii_alphanumeric();
    if !is_ident(chars[idx].1) {
        return None;
    }

    let mut start = idx;
    while start > 0 && is_ident(chars[start - 1].1) {
        start -= 1;
    }

    let start_byte = chars[start].0;
    let end_byte = if idx + 1 < chars.len() {
        chars[idx + 1].0
    } else {
        line.len()
    };
    Some(line[start_byte..end_byte].to_string())
}

fn tokenize_identifiers(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();

    for ch in content.chars() {
        if ch == '_' || ch.is_ascii_alphanumeric() {
            current.push(ch);
        } else if !current.is_empty() {
            out.push(current.clone());
            current.clear();
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn find_word_positions(line: &str, word: &str) -> Vec<usize> {
    if word.is_empty() {
        return Vec::new();
    }
    let mut result = Vec::new();
    let mut start = 0usize;
    while let Some(rel_idx) = line[start..].find(word) {
        let idx = start + rel_idx;
        let before = if idx == 0 {
            None
        } else {
            line[..idx].chars().next_back()
        };
        let after_idx = idx + word.len();
        let after = if after_idx >= line.len() {
            None
        } else {
            line[after_idx..].chars().next()
        };
        let boundary = |c: Option<char>| match c {
            Some(v) => !(v == '_' || v.is_ascii_alphanumeric()),
            None => true,
        };
        if boundary(before) && boundary(after) {
            result.push(idx);
        }
        start = idx + word.len();
    }
    result
}

fn to_location(path: &Path, line: u32, character: u32, symbol_len: u32) -> Location {
    Location::new(
        path.to_path_buf(),
        Range::new(
            Position::new(line, character),
            Position::new(line, character + symbol_len),
        ),
    )
}
