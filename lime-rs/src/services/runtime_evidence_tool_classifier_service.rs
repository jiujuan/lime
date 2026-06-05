//! Runtime evidence 工具 / 命令分类。
//!
//! 只保留 stable classifier，presentation 层不得从这些值派生本地化文案。

pub(crate) fn is_browser_tool_name(tool_name: &str) -> bool {
    let normalized = tool_name.trim().to_ascii_lowercase();
    normalized.contains("browser")
        || normalized.contains("playwright")
        || normalized.contains("chrome_devtools")
        || normalized.contains("cdp")
}

pub(crate) fn is_browser_command(command: &str) -> bool {
    let normalized = command.trim().to_ascii_lowercase();
    (normalized.contains("browser") || normalized.contains("playwright"))
        && !is_gui_smoke_command(command)
}

pub(crate) fn is_gui_smoke_command(command: &str) -> bool {
    let normalized = command.trim().to_ascii_lowercase();
    normalized.contains("verify:gui-smoke") || normalized.contains("verify-gui-smoke")
}
