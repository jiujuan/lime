#![cfg(windows)]

use std::ffi::OsString;
use std::sync::{Mutex, MutexGuard};

use aster::tools::{BashTool, Tool, ToolContext};
use serde_json::json;

static ENV_LOCK: Mutex<()> = Mutex::new(());

struct EnvRestore {
    vars: Vec<(&'static str, Option<OsString>)>,
}

impl EnvRestore {
    fn capture(keys: &[&'static str]) -> Self {
        Self {
            vars: keys
                .iter()
                .copied()
                .map(|key| (key, std::env::var_os(key)))
                .collect(),
        }
    }
}

impl Drop for EnvRestore {
    fn drop(&mut self) {
        for (key, value) in &self.vars {
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
        }
    }
}

fn lock_env() -> MutexGuard<'static, ()> {
    ENV_LOCK.lock().expect("env lock should not be poisoned")
}

#[tokio::test]
async fn bash_tool_runs_nested_powershell_when_path_omits_shell() {
    let _guard = lock_env();
    let _restore = EnvRestore::capture(&["PATH", "Path"]);
    std::env::set_var("PATH", "");
    std::env::set_var("Path", "");

    let temp_dir = tempfile::tempdir().expect("temp dir should be created");
    let target_dir = temp_dir.path().join("UCpin");
    let target_dir_ps = target_dir.to_string_lossy().replace('\'', "''");
    let context = ToolContext::new(temp_dir.path().to_path_buf());
    let result = BashTool::new()
        .execute(
            json!({
                "command": format!(
                    r#"powershell -Command "mkdir -p '{}'; Write-Output lime-shell-runtime-ci""#,
                    target_dir_ps
                ),
                "timeout": 10
            }),
            &context,
        )
        .await
        .expect("BashTool should execute through Windows PowerShell fallback");

    assert!(
        result.is_success(),
        "expected shell command to succeed, got: {:?}",
        result
    );
    assert!(
        result
            .message()
            .unwrap_or("")
            .contains("lime-shell-runtime-ci"),
        "expected command output in result, got: {:?}",
        result
    );
    assert!(
        target_dir.is_dir(),
        "expected Windows shell runtime to create directory: {}",
        target_dir.display()
    );
}
