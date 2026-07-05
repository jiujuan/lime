use super::rules::default_tool_execution_policy;
use super::service::ToolExecutionPolicyService;
use crate::agent_tools::catalog::{
    tool_catalog_entries_for_surface, tool_catalog_entry, workspace_default_allowed_tool_names,
    ToolPermissionPlane, WorkspaceToolSurface, APPLY_PATCH_TOOL_NAME,
};
use aster::permission::{ParameterRestriction, PermissionScope, RestrictionType, ToolPermission};
use lime_core::config::ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
pub use tool_runtime::execution_policy::{
    ToolExecutionPolicy, ToolExecutionPolicyResolution, ToolExecutionPolicySource,
    ToolExecutionRestrictionProfile, ToolExecutionSandboxProfile, ToolExecutionWarningPolicy,
};
pub use tool_runtime::execution_policy_service::ToolExecutionResolverInput;

const DURABLE_MEMORY_PATH_PATTERN: &str = r"^/memories(?:/.*)?$";
const SAFE_HTTPS_URL_PATTERN: &str = r"^https://[^\s]+$";

#[derive(Debug, Clone, Copy)]
pub struct WorkspaceExecutionPermissionInput<'a> {
    pub surface: WorkspaceToolSurface,
    pub workspace_root: &'a str,
    pub explicit_read_only_paths: &'a [PathBuf],
    pub auto_mode: bool,
    pub bypass_restrictions: bool,
    pub execution_policy_input: ToolExecutionResolverInput<'a>,
}

#[derive(Debug, Clone)]
struct WorkspacePermissionPatterns {
    workspace_path_pattern: String,
    workspace_abs_path_pattern: String,
    analyze_image_path_pattern: String,
    safe_https_url_pattern: String,
    shell_allow_pattern: String,
}

pub fn tool_execution_policy(tool_name: &str) -> ToolExecutionPolicy {
    default_tool_execution_policy(tool_name)
}

pub fn resolve_tool_execution_policy(
    tool_name: &str,
    input: ToolExecutionResolverInput<'_>,
) -> ToolExecutionPolicy {
    resolve_tool_execution_policy_resolution(tool_name, input).policy
}

pub fn resolve_tool_execution_policy_resolution(
    tool_name: &str,
    input: ToolExecutionResolverInput<'_>,
) -> ToolExecutionPolicyResolution {
    ToolExecutionPolicyService::new(input).resolve(tool_name)
}

pub fn persisted_tool_execution_policy_from_metadata(
    request_metadata: Option<&JsonValue>,
) -> Option<ConfigToolExecutionPolicyConfig> {
    ToolExecutionPolicyService::persisted_policy_from_metadata(request_metadata)
}

pub fn tool_execution_policy_metadata(
    tool_name: &str,
    surface: &str,
    input: ToolExecutionResolverInput<'_>,
) -> HashMap<String, JsonValue> {
    ToolExecutionPolicyService::new(input).metadata(tool_name, surface)
}

pub fn build_workspace_shell_allow_pattern(
    escaped_root: &str,
    allow_extended_shell_commands: bool,
) -> String {
    build_workspace_shell_allow_pattern_with_extra_paths(
        escaped_root,
        &[],
        allow_extended_shell_commands,
    )
}

fn build_workspace_shell_allow_pattern_with_extra_paths(
    escaped_root: &str,
    extra_path_patterns: &[String],
    allow_extended_shell_commands: bool,
) -> String {
    if allow_extended_shell_commands {
        return String::from(r"(?s)^\s*\S.*$");
    }

    let local_roots = if extra_path_patterns.is_empty() {
        escaped_root.to_string()
    } else {
        format!("{escaped_root}|{}", extra_path_patterns.join("|"))
    };

    format!(
        r"^\s*(?:cd\s+({local_roots}|\.|\./|\.\./)|pwd|ls(?:\s+[^;&|]+)?|find\s+({local_roots}|\.|\./|\.\./)[^;&|]*|rg\b[^;&|]*|grep\b[^;&|]*|cat\s+({local_roots}|\.|\./|\.\./)[^;&|]*)\s*$"
    )
}

pub fn should_auto_approve_tool_warnings(
    tool_name: &str,
    auto_mode: bool,
    input: ToolExecutionResolverInput<'_>,
) -> bool {
    auto_mode
        && matches!(
            resolve_tool_execution_policy(tool_name, input).warning_policy,
            ToolExecutionWarningPolicy::ShellCommandRisk
        )
}

pub fn build_workspace_execution_permissions(
    input: WorkspaceExecutionPermissionInput<'_>,
) -> Vec<ToolPermission> {
    let unrestricted = input.auto_mode || input.bypass_restrictions;
    let patterns = build_workspace_permission_patterns(
        input.workspace_root,
        input.explicit_read_only_paths,
        unrestricted,
    );
    let mut permissions = tool_catalog_entries_for_surface(input.surface)
        .into_iter()
        .filter_map(|entry| {
            build_parameter_restricted_permission(
                entry.name,
                input.auto_mode,
                input.bypass_restrictions,
                &patterns,
                input.execution_policy_input,
            )
        })
        .collect::<Vec<_>>();

    if unrestricted {
        permissions.push(ToolPermission {
            tool: "*".to_string(),
            allowed: true,
            priority: 1000,
            conditions: Vec::new(),
            parameter_restrictions: Vec::new(),
            scope: PermissionScope::Session,
            reason: Some(if input.bypass_restrictions {
                "full-access：允许所有工具与参数".to_string()
            } else {
                "Auto 模式：允许所有工具与参数".to_string()
            }),
            expires_at: None,
            metadata: HashMap::new(),
        });
    }

    for tool_name in workspace_default_allowed_tool_names(input.surface) {
        permissions.push(ToolPermission {
            tool: tool_name.to_string(),
            allowed: true,
            priority: 88,
            conditions: Vec::new(),
            parameter_restrictions: Vec::new(),
            scope: PermissionScope::Session,
            reason: Some(format!("允许默认工具: {tool_name}")),
            expires_at: None,
            metadata: HashMap::new(),
        });
    }

    permissions.push(ToolPermission {
        tool: "*".to_string(),
        allowed: false,
        priority: 10,
        conditions: Vec::new(),
        parameter_restrictions: Vec::new(),
        scope: PermissionScope::Session,
        reason: Some("workspace 安全策略：未显式授权的工具默认拒绝".to_string()),
        expires_at: None,
        metadata: HashMap::new(),
    });

    permissions
}

fn build_workspace_permission_patterns(
    workspace_root: &str,
    explicit_read_only_paths: &[PathBuf],
    auto_mode: bool,
) -> WorkspacePermissionPatterns {
    let escaped_root = regex::escape(workspace_root.trim());
    let explicit_path_patterns = explicit_read_only_path_patterns(explicit_read_only_paths);
    let workspace_or_explicit_path_pattern = if explicit_path_patterns.is_empty() {
        format!(r"({escaped_root}|\.|\./|\.\./).*$")
    } else {
        format!(
            r"(?:(?:{escaped_root}|\.|\./|\.\./).*$|{})",
            explicit_path_patterns.join("|")
        )
    };
    WorkspacePermissionPatterns {
        workspace_path_pattern: format!(
            r"^(?:{workspace_or_explicit_path_pattern}|{DURABLE_MEMORY_PATH_PATTERN})"
        ),
        workspace_abs_path_pattern: format!(r"^({escaped_root}).*$"),
        analyze_image_path_pattern: format!(
            r"^(base64:[A-Za-z0-9+/=]+|file://({escaped_root}).*|{workspace_or_explicit_path_pattern})$"
        ),
        safe_https_url_pattern: SAFE_HTTPS_URL_PATTERN.to_string(),
        shell_allow_pattern: build_workspace_shell_allow_pattern_with_extra_paths(
            &escaped_root,
            &explicit_path_patterns,
            auto_mode,
        ),
    }
}

fn explicit_read_only_path_patterns(paths: &[PathBuf]) -> Vec<String> {
    let mut normalized_paths = paths
        .iter()
        .flat_map(|path| normalize_explicit_read_only_path_variants(path).into_iter())
        .collect::<Vec<_>>();
    normalized_paths.sort_by(
        |(left_path, left_descendants), (right_path, right_descendants)| {
            left_path
                .cmp(right_path)
                .then(left_descendants.cmp(right_descendants))
        },
    );
    normalized_paths.dedup();

    normalized_paths
        .into_iter()
        .map(|(path, allow_descendants)| {
            let escaped = regex::escape(&path.to_string_lossy());
            if allow_descendants {
                format!(r"(?:{escaped})(?:[/\\].*)?")
            } else {
                format!(r"(?:{escaped})")
            }
        })
        .collect()
}

fn normalize_explicit_read_only_path_variants(path: &Path) -> Vec<(PathBuf, bool)> {
    if !path.is_absolute() || !path.exists() {
        return Vec::new();
    }

    let normalized = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let allow_descendants = path.is_dir() || normalized.is_dir();
    let mut variants = vec![(path.to_path_buf(), allow_descendants)];
    if normalized != path {
        variants.push((normalized, allow_descendants));
    }
    variants
}

fn build_parameter_restricted_permission(
    tool_name: &str,
    auto_mode: bool,
    bypass_restrictions: bool,
    patterns: &WorkspacePermissionPatterns,
    execution_policy_input: ToolExecutionResolverInput<'_>,
) -> Option<ToolPermission> {
    let catalog_entry = tool_catalog_entry(tool_name)?;
    if catalog_entry.permission_plane != ToolPermissionPlane::ParameterRestricted {
        return None;
    }

    let policy_service = ToolExecutionPolicyService::new(execution_policy_input);
    let resolution = policy_service.resolve(tool_name);
    let policy = resolution.policy;
    let unrestricted = auto_mode || bypass_restrictions;
    let parameter_restrictions = if unrestricted {
        Vec::new()
    } else {
        build_parameter_restrictions(tool_name, policy.restriction_profile, patterns)
    };

    Some(ToolPermission {
        tool: tool_name.to_string(),
        allowed: true,
        priority: permission_priority(tool_name),
        conditions: Vec::new(),
        parameter_restrictions,
        scope: PermissionScope::Session,
        reason: Some(permission_reason(
            tool_name,
            policy.restriction_profile,
            auto_mode,
            bypass_restrictions,
        )),
        expires_at: None,
        metadata: policy_service.metadata_for_resolution(
            tool_name,
            surface_label(catalog_entry.profiles),
            resolution,
        ),
    })
}

fn surface_label(profiles: &[crate::agent_tools::catalog::ToolSurfaceProfile]) -> &'static str {
    if profiles.contains(&crate::agent_tools::catalog::ToolSurfaceProfile::Workbench) {
        "workbench"
    } else if profiles.contains(&crate::agent_tools::catalog::ToolSurfaceProfile::BrowserAssist) {
        "browser_assist"
    } else {
        "core"
    }
}

fn build_parameter_restrictions(
    tool_name: &str,
    profile: ToolExecutionRestrictionProfile,
    patterns: &WorkspacePermissionPatterns,
) -> Vec<ParameterRestriction> {
    match profile {
        ToolExecutionRestrictionProfile::None => Vec::new(),
        ToolExecutionRestrictionProfile::WorkspacePathRequired => {
            vec![pattern_restriction(
                "path",
                &patterns.workspace_path_pattern,
                true,
                Some(format!(
                    "{tool_name}.path 必须在 workspace、相对路径或 `/memories/` 内"
                )),
            )]
        }
        ToolExecutionRestrictionProfile::WorkspacePathOptional => {
            vec![pattern_restriction(
                "path",
                &patterns.workspace_path_pattern,
                false,
                Some(format!(
                    "{tool_name}.path 必须在 workspace、相对路径或 `/memories/` 内"
                )),
            )]
        }
        ToolExecutionRestrictionProfile::WorkspaceAbsolutePathRequired => {
            vec![pattern_restriction(
                "notebook_path",
                &patterns.workspace_abs_path_pattern,
                true,
                Some("NotebookEdit.notebook_path 必须是 workspace 内绝对路径".to_string()),
            )]
        }
        ToolExecutionRestrictionProfile::WorkspaceShellCommand => vec![
            pattern_restriction(
                "command",
                &patterns.shell_allow_pattern,
                false,
                Some(format!("{tool_name}.command 仅允许 workspace 内安全命令")),
            ),
            pattern_restriction(
                "cmd",
                &patterns.shell_allow_pattern,
                false,
                Some(format!("{tool_name}.cmd 兼容参数名，规则与 command 一致")),
            ),
        ],
        ToolExecutionRestrictionProfile::AnalyzeImageInput => {
            vec![pattern_restriction(
                "file_path",
                &patterns.analyze_image_path_pattern,
                true,
                Some(
                    "analyze_image.file_path 仅允许 base64、workspace 内绝对路径或相对路径"
                        .to_string(),
                ),
            )]
        }
        ToolExecutionRestrictionProfile::SafeHttpsUrlRequired => {
            vec![pattern_restriction(
                "url",
                &patterns.safe_https_url_pattern,
                true,
                Some("WebFetch.url 仅允许 https 且禁止内网/本机地址".to_string()),
            )]
        }
    }
}

fn pattern_restriction(
    parameter: &str,
    pattern: &str,
    required: bool,
    description: Option<String>,
) -> ParameterRestriction {
    ParameterRestriction {
        parameter: parameter.to_string(),
        restriction_type: RestrictionType::Pattern,
        values: None,
        pattern: Some(pattern.to_string()),
        validator: None,
        min: None,
        max: None,
        required,
        description,
    }
}

fn permission_priority(tool_name: &str) -> i32 {
    match tool_name {
        "Read" | "Write" | "Edit" | APPLY_PATCH_TOOL_NAME | "Glob" | "Grep" => 100,
        "Bash" | "PowerShell" => 90,
        _ => 88,
    }
}

fn permission_reason(
    tool_name: &str,
    profile: ToolExecutionRestrictionProfile,
    auto_mode: bool,
    bypass_restrictions: bool,
) -> String {
    if bypass_restrictions {
        return match profile {
            ToolExecutionRestrictionProfile::WorkspaceShellCommand => {
                format!("full-access：允许 {tool_name} 执行任意命令")
            }
            ToolExecutionRestrictionProfile::SafeHttpsUrlRequired => {
                format!("full-access：允许 {tool_name} 访问任意 URL")
            }
            ToolExecutionRestrictionProfile::AnalyzeImageInput => {
                format!("full-access：允许 {tool_name} 分析任意图片路径或 base64")
            }
            ToolExecutionRestrictionProfile::WorkspaceAbsolutePathRequired => {
                format!("full-access：允许 {tool_name} 访问任意绝对路径")
            }
            ToolExecutionRestrictionProfile::WorkspacePathRequired
            | ToolExecutionRestrictionProfile::WorkspacePathOptional => {
                format!("full-access：允许 {tool_name} 访问任意路径")
            }
            ToolExecutionRestrictionProfile::None => format!("full-access：允许工具 {tool_name}"),
        };
    }

    if auto_mode {
        return match profile {
            ToolExecutionRestrictionProfile::WorkspaceShellCommand => {
                format!("Auto 模式：允许 {tool_name} 执行任意命令")
            }
            ToolExecutionRestrictionProfile::SafeHttpsUrlRequired => {
                format!("Auto 模式：允许 {tool_name} 访问任意 URL")
            }
            ToolExecutionRestrictionProfile::AnalyzeImageInput => {
                format!("Auto 模式：允许 {tool_name} 分析任意图片路径或 base64")
            }
            ToolExecutionRestrictionProfile::WorkspaceAbsolutePathRequired => {
                format!("Auto 模式：允许 {tool_name} 访问任意绝对路径")
            }
            ToolExecutionRestrictionProfile::WorkspacePathRequired
            | ToolExecutionRestrictionProfile::WorkspacePathOptional => {
                format!("Auto 模式：允许 {tool_name} 访问任意路径")
            }
            ToolExecutionRestrictionProfile::None => format!("Auto 模式：允许工具 {tool_name}"),
        };
    }

    match profile {
        ToolExecutionRestrictionProfile::WorkspacePathRequired => {
            format!("仅允许 {tool_name} 访问当前 workspace 或 `/memories/` 内容")
        }
        ToolExecutionRestrictionProfile::WorkspacePathOptional => {
            format!("仅允许 {tool_name} 在当前 workspace 或 `/memories/` 搜索内容")
        }
        ToolExecutionRestrictionProfile::WorkspaceAbsolutePathRequired => {
            format!("仅允许 {tool_name} 访问 workspace 内绝对路径")
        }
        ToolExecutionRestrictionProfile::WorkspaceShellCommand => {
            format!("workspace 安全策略：{tool_name} 仅允许 workspace 内安全命令")
        }
        ToolExecutionRestrictionProfile::AnalyzeImageInput => {
            "允许分析 workspace 内图片或 base64 数据".to_string()
        }
        ToolExecutionRestrictionProfile::SafeHttpsUrlRequired => {
            "允许安全的 WebFetch 请求".to_string()
        }
        ToolExecutionRestrictionProfile::None => format!("允许工具 {tool_name}"),
    }
}
