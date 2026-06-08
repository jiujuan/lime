#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const sourceRoots = ["src"];
const productionRuntimeRoots = ["src", "electron", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoredDirectories = new Set([
  ".git",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "target",
]);

const frontendCommandPatterns = [
  /\bsafeInvoke(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /\binvoke(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /\binvokeAgentRuntimeBridge(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
];

const knownDeferredRegistrationReasons = new Map();
const retiredFileBrowserFacadeCommands = new Set([
  "list_dir",
  "read_file_preview_cmd",
  "create_file",
  "create_directory",
  "delete_file",
  "rename_file",
]);
const retiredAutomationFacadeCommands = new Set([
  "get_automation_scheduler_config",
  "update_automation_scheduler_config",
  "get_automation_status",
  "get_automation_jobs",
  "get_automation_job",
  "create_automation_job",
  "update_automation_job",
  "delete_automation_job",
  "run_automation_job_now",
  "get_automation_health",
  "get_automation_run_history",
  "preview_automation_schedule",
  "validate_automation_schedule",
]);
const retiredApiKeyProviderFacadeCommands = new Set([
  "get_api_key_providers",
  "get_system_provider_catalog",
  "get_api_key_provider",
  "read_api_key_provider_config",
  "add_custom_api_key_provider",
  "create_api_key_provider",
  "update_api_key_provider",
  "delete_custom_api_key_provider",
  "delete_api_key_provider",
  "add_api_key",
  "create_api_key_provider_key",
  "delete_api_key",
  "delete_api_key_provider_key",
  "toggle_api_key",
  "update_api_key_alias",
  "update_api_key_provider_key",
  "get_next_api_key",
  "next_api_key_provider_key",
  "record_api_key_usage",
  "record_api_key_provider_key_usage",
  "record_api_key_error",
  "record_api_key_provider_key_error",
  "get_provider_ui_state",
  "read_api_key_provider_ui_state",
  "set_provider_ui_state",
  "write_api_key_provider_ui_state",
  "update_provider_sort_orders",
  "update_api_key_provider_sort_orders",
  "export_api_key_providers",
  "export_api_key_provider_config",
  "import_api_key_providers",
  "import_api_key_provider_config",
  "test_api_key_provider_connection",
  "test_api_key_provider_chat",
  "fetch_provider_models_auto",
  "fetch_provider_models_from_api",
]);
const retiredAgentAppPackageFacadeCommands = new Set([
  "agent_app_fetch_cloud_package",
  "agent_app_inspect_local_package",
  "agent_app_list_installed",
  "agent_app_save_installed_state",
  "agent_app_set_disabled",
  "agent_app_uninstall",
  "agent_app_uninstall_rehearsal",
]);
const currentFileBrowserDesktopHostShellCommands = new Set([
  "get_home_dir",
  "get_file_manager_locations",
  "get_file_icon_data_url",
  "reveal_in_finder",
  "open_with_default_app",
]);
const retiredTauriGenerateHandlerCommands = new Set([
  "add_model_to_provider",
  "add_prompt",
  "add_provider",
  "create_a2ui_form",
  "auto_import_prompt",
  "clear_request_logs",
  "companion_get_pet_status",
  "companion_launch_pet",
  "companion_send_pet_command",
  "close_webview_panel",
  "create_webview_panel",
  "delete_prompt",
  "enable_prompt",
  "execute_ecommerce_review_reply",
  "expand_path",
  "export_bundle",
  "export_config",
  "export_config_yaml",
  "get_all_provider_models",
  "get_a2ui_form",
  "get_a2ui_forms_by_message",
  "get_a2ui_forms_by_session",
  "get_auto_launch_status",
  "get_config_dir_path",
  "get_config_paths",
  "get_config_status",
  "get_current_prompt_file_content",
  "get_daily_usage_trends",
  "get_experimental_config",
  "get_injection_config",
  "get_injection_rules",
  "get_model_usage_ranking",
  "get_models_config",
  "get_provider_models",
  "get_prompts",
  "get_relay_info",
  "get_request_log_detail",
  "get_request_logs",
  "get_stats_by_model",
  "get_stats_by_provider",
  "get_stats_summary",
  "get_token_stats_by_day",
  "get_token_stats_by_model",
  "get_token_stats_by_provider",
  "get_token_summary",
  "get_tool_versions",
  "get_usage_stats",
  "get_available_voices",
  "get_webview_panels",
  "get_websocket_connections",
  "get_websocket_status",
  "handle_deep_link",
  "handle_open_deep_link",
  "import_bundle",
  "import_config",
  "import_document",
  "import_document_to_session",
  "import_prompt_from_file",
  "get_telegram_remote_status",
  "list_relay_providers",
  "navigate_webview_panel",
  "open_auth_dir",
  "open_codex_cli_login",
  "open_codex_cli_logout",
  "open_config_folder",
  "open_external_url",
  "read_image_from_session",
  "refresh_relay_registry",
  "resize_webview_panel",
  "remove_model_from_provider",
  "remove_provider",
  "save_exported_document",
  "save_experimental_config",
  "save_models_config",
  "save_relay_api_key",
  "save_a2ui_form_data",
  "search_pixabay_images",
  "search_web_images",
  "send_connect_callback",
  "set_auto_launch",
  "set_injection_enabled",
  "set_websocket_enabled",
  "start_telegram_remote",
  "start_oem_cloud_oauth_callback_bridge",
  "stop_telegram_remote",
  "submit_a2ui_form",
  "sync_tray_model_shortcuts",
  "test_tts",
  "toggle_model_enabled",
  "focus_webview_panel",
  "add_injection_rule",
  "remove_injection_rule",
  "update_prompt",
  "update_injection_rule",
  "upload_image_to_session",
  "upsert_prompt",
  "validate_config_yaml",
  "validate_import",
]);
const retiredTauriCommandModules = new Set([
  "a2ui_form_cmd",
  "config_cmd",
  "companion_cmd",
  "connect_cmd",
  "document_import_cmd",
  "ecommerce_review_reply_cmd",
  "experimental_cmd",
  "external_tools_cmd",
  "image_search_cmd",
  "image_upload_cmd",
  "injection_cmd",
  "knowledge_cmd",
  "models_cmd",
  "prompt_cmd",
  "telemetry_cmd",
  "telegram_remote_cmd",
  "theme_context_cmd",
  "tray_cmd",
  "voice_test_cmd",
  "websocket_cmd",
]);

function addDeferredCommands(commands, reason) {
  for (const command of commands) {
    knownDeferredRegistrationReasons.set(command, reason);
  }
}

const currentElectronHostRequiredCommands = new Set([
  "app_server_handle_json_lines",
  "app_server_drain_events",
  "aster_agent_init",
  "agent_runtime_create_session",
  "agent_runtime_submit_turn",
  "agent_runtime_interrupt_turn",
  "agent_runtime_update_session",
  "agent_runtime_respond_action",
  "agent_runtime_get_thread_read",
  "agent_runtime_export_evidence_pack",
  "agent_runtime_get_tool_inventory",
  "agent_runtime_list_sessions",
  "agent_runtime_get_session",
  "agent_runtime_list_workspace_skill_bindings",
  "agent_app_launch_shell",
  "agent_app_get_ui_runtime_status",
  "agent_app_start_ui_runtime",
  "agent_app_stop_ui_runtime",
  "get_all_alias_configs",
  "get_default_provider",
  "get_experimental_config",
  "get_model_preferences",
  "get_model_registry",
  "get_model_registry_provider_ids",
  "get_model_sync_state",
  "get_daily_usage_trends",
  "get_model_usage_ranking",
  "get_models_by_tier",
  "get_models_for_provider",
  "get_provider_alias_config",
  "get_usage_stats",
  "open_external_url",
  "project_memory_get",
  "save_experimental_config",
  "start_oem_cloud_oauth_callback_bridge",
  "workspace_ensure_default_ready",
  "workspace_ensure_ready",
  "workspace_get",
  "workspace_get_by_path",
  "workspace_get_default",
  "workspace_get_projects_root",
  "workspace_list",
  "workspace_resolve_project_path",
]);

const currentDevBridgeTruthRequiredCommands = new Set([
  "agent_app_get_ui_runtime_status",
  "agent_app_start_ui_runtime",
  "agent_app_stop_ui_runtime",
  "open_external_url",
  "start_oem_cloud_oauth_callback_bridge",
  "project_memory_get",
]);

const electronDiagnosticFacadeCommands = new Set([
  "get_asr_credentials",
  "get_browser_backend_policy",
  "get_browser_backends_status",
  "get_browser_connector_install_status_cmd",
  "get_browser_connector_settings_cmd",
  "get_chrome_bridge_endpoint_info",
  "get_chrome_bridge_status",
  "get_chrome_profile_sessions",
  "get_environment_preview",
  "get_voice_input_config",
  "get_voice_shortcut_runtime_status",
  "list_audio_devices",
  "site_get_adapter_catalog_status",
  "site_list_adapters",
  "unified_memory_stats",
  "voice_models_get_install_state",
  "voice_models_list_catalog",
]);

addDeferredCommands(
  [
    "agent_start_process",
    "agent_stop_process",
    "agent_get_process_status",
    "aster_agent_status",
    "aster_agent_configure_provider",
    "aster_agent_reset",
    "agent_runtime_compact_session",
    "agent_runtime_resume_thread",
    "agent_runtime_replay_request",
    "agent_runtime_get_objective",
    "agent_runtime_set_objective",
    "agent_runtime_update_objective_status",
    "agent_runtime_clear_objective",
    "agent_runtime_continue_objective",
    "agent_runtime_audit_objective",
    "agent_runtime_list_file_checkpoints",
    "agent_runtime_get_file_checkpoint",
    "agent_runtime_diff_file_checkpoint",
    "agent_runtime_restore_file_checkpoint",
    "agent_runtime_promote_queued_turn",
    "agent_runtime_remove_queued_turn",
    "agent_runtime_delete_session",
    "agent_runtime_export_analysis_handoff",
    "agent_runtime_export_handoff_bundle",
    "agent_runtime_export_review_decision_template",
    "agent_runtime_save_review_decision",
    "agent_runtime_export_replay_case",
    "agent_runtime_spawn_subagent",
    "agent_runtime_send_subagent_input",
    "agent_runtime_wait_subagents",
    "agent_runtime_resume_subagent",
    "agent_runtime_close_subagent",
  ],
  "compat: agent_runtime legacy/side-effect commands remain behind the existing runtime adapter until App Server JSON-RPC methods land.",
);

addDeferredCommands(
  [
    "agent_app_select_directory",
    "agent_app_runtime_start_task",
    "agent_app_runtime_cancel_task",
    "agent_app_runtime_get_task",
    "agent_app_runtime_submit_host_response",
    "execute_skill",
    "inspect_local_skill_detail_for_app",
    "reveal_local_skill_for_app",
    "rename_local_skill_for_app",
    "replace_local_skill_package_for_app",
    "inspect_local_skill_package_for_app",
    "install_local_skill_package_for_app",
    "export_local_skill_package_for_app",
    "take_pending_skill_package_open_requests",
    "get_skill_package_file_association_status",
    "set_skill_package_file_association_default",
    "install_marketplace_skill_for_app",
    "install_skill_from_download_url_for_app",
  ],
  "compat: Agent App and skill package commands are native feature surfaces; do not bulk-register them as Electron App Server truth bridge commands.",
);

addDeferredCommands(
  [
    "gateway_channel_status",
    "wechat_channel_list_accounts",
    "site_list_adapters",
    "site_recommend_adapters",
    "site_search_adapters",
    "site_get_adapter_info",
    "site_get_adapter_launch_readiness",
    "site_get_adapter_catalog_status",
    "site_apply_adapter_catalog_bootstrap",
    "site_clear_adapter_catalog_cache",
    "site_import_adapter_yaml_bundle",
    "site_run_adapter",
    "site_debug_run_adapter",
    "site_save_adapter_result",
    "create_image_generation_task_artifact",
    "create_audio_generation_task_artifact",
    "complete_audio_generation_task_artifact",
    "get_media_task_artifact",
    "list_media_task_artifacts",
    "cancel_media_task_artifact",
  ],
  "compat: feature-specific native commands await dedicated current App Server protocol coverage before Electron host registration.",
);

addDeferredCommands(
  [
    "capability_draft_create",
    "capability_draft_list",
    "capability_draft_get",
    "capability_draft_verify",
    "capability_draft_register",
    "capability_draft_submit_approval_session_inputs",
    "capability_draft_execute_controlled_get",
  ],
  "compat: Capability Draft generation / verification / registration remains a gated native feature surface; registered skills discovery has moved to App Server workspaceRegisteredSkills/list.",
);

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isRuntimeSource(relativePath) {
  const normalizedPath = normalizePath(relativePath);
  const extension = path.extname(normalizedPath);
  if (!sourceExtensions.has(extension)) {
    return false;
  }
  if (normalizedPath.endsWith(".d.ts")) {
    return false;
  }
  if (
    normalizedPath.includes("/__tests__/") ||
    normalizedPath.includes("/__mocks__/") ||
    /\.test\.[^.]+$/.test(normalizedPath) ||
    /\.spec\.[^.]+$/.test(normalizedPath)
  ) {
    return false;
  }
  return true;
}

function walkDirectory(rootDirectory) {
  const results = [];
  if (!fs.existsSync(rootDirectory)) {
    return results;
  }

  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDirectory(absolutePath));
      continue;
    }

    const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
    if (isRuntimeSource(relativePath)) {
      results.push(relativePath);
    }
  }

  return results;
}

function addUsage(map, command, relativePath) {
  if (!map.has(command)) {
    map.set(command, new Set());
  }
  map.get(command).add(relativePath);
}

function isFrameworkPluginCommand(command) {
  return command.startsWith("plugin:");
}

function extractCommandsFromSource(sourceCode) {
  const commands = new Set();
  for (const pattern of frontendCommandPatterns) {
    for (const match of sourceCode.matchAll(pattern)) {
      const command = match[1];
      if (isFrameworkPluginCommand(command)) {
        continue;
      }
      commands.add(command);
    }
  }
  return commands;
}

function collectFrontendCommandUsage() {
  const commandUsage = new Map();
  for (const root of sourceRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    for (const relativePath of walkDirectory(absoluteRoot)) {
      const absolutePath = path.join(repoRoot, relativePath);
      const sourceCode = fs.readFileSync(absolutePath, "utf8");
      for (const command of extractCommandsFromSource(sourceCode)) {
        addUsage(commandUsage, command, relativePath);
      }
    }
  }
  return commandUsage;
}

function collectAgentRuntimeSchemaUsage() {
  const commandUsage = new Map();
  const schemaPath = path.join(
    repoRoot,
    "src/lib/governance/agentRuntimeCommandSchema.json",
  );
  if (!fs.existsSync(schemaPath)) {
    return commandUsage;
  }

  const relativePath = normalizePath(path.relative(repoRoot, schemaPath));
  const parsed = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const schemaCommands = Array.isArray(parsed?.commands) ? parsed.commands : [];

  for (const entry of schemaCommands) {
    const command = String(entry?.command ?? "").trim();
    if (!command) {
      continue;
    }
    addUsage(commandUsage, command, relativePath);
  }

  return commandUsage;
}

function extractBalancedBlock(sourceCode, startIndex, openChar, closeChar) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = startIndex; index < sourceCode.length; index += 1) {
    const currentChar = sourceCode[index];
    const nextChar = sourceCode[index + 1];

    if (inLineComment) {
      if (currentChar === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (currentChar === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && currentChar === "'") {
        inSingleQuote = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && currentChar === '"') {
        inDoubleQuote = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (inTemplateString) {
      if (!escaped && currentChar === "`") {
        inTemplateString = false;
      }
      escaped = !escaped && currentChar === "\\";
      continue;
    }

    if (currentChar === "/" && nextChar === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (currentChar === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (currentChar === "'") {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (currentChar === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (currentChar === "`") {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (currentChar === openChar) {
      depth += 1;
      continue;
    }

    if (currentChar === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return sourceCode.slice(startIndex + 1, index);
      }
    }
  }

  throw new Error(`无法提取 ${openChar}${closeChar} 平衡块`);
}

function collectElectronHostCommands() {
  const channelsPath = path.join(repoRoot, "electron/ipcChannels.ts");
  const sourceCode = fs.readFileSync(channelsPath, "utf8");
  const marker = "export const ELECTRON_HOST_COMMANDS = [";
  const markerIndex = sourceCode.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("未找到 Electron host command 白名单");
  }

  const bracketStart = markerIndex + marker.length - 1;
  const commandBody = extractBalancedBlock(sourceCode, bracketStart, "[", "]");
  const commands = new Set();

  for (const match of commandBody.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    commands.add(match[1]);
  }

  return commands;
}

function collectMockPriorityCommands() {
  const filePath = path.join(
    repoRoot,
    "src/lib/dev-bridge/mockPriorityCommands.ts",
  );
  const sourceCode = fs.readFileSync(filePath, "utf8");
  const match = sourceCode.match(
    /const mockPriorityCommands = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  if (!match) {
    throw new Error("未找到 mockPriorityCommands 定义");
  }

  const commands = new Set();
  for (const stringMatch of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
    commands.add(stringMatch[1]);
  }
  return commands;
}

function collectBridgeTruthCommands() {
  const filePath = path.join(repoRoot, "src/lib/dev-bridge/commandPolicy.ts");
  const sourceCode = fs.readFileSync(filePath, "utf8");
  const match = sourceCode.match(
    /const bridgeTruthCommands = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  if (!match) {
    throw new Error("未找到 bridgeTruthCommands 定义");
  }

  const commands = new Set();
  for (const stringMatch of match[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
    commands.add(stringMatch[1]);
  }
  return commands;
}

function readAgentCommandCatalog() {
  const catalogPath = path.join(
    repoRoot,
    "src/lib/governance/agentCommandCatalog.json",
  );
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

function sortCommands(commands) {
  return [...commands].sort((left, right) => left.localeCompare(right));
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function isAllowedTestMockFixtureSource(relativePath) {
  return (
    relativePath === "src/lib/dev-bridge/explicitMockFallback.ts" ||
    relativePath === "src/lib/desktop-host/core.ts" ||
    relativePath === "src/lib/desktop-host/event.ts" ||
    /^src\/lib\/desktop-host\/[A-Za-z0-9_-]+Mocks\.ts$/.test(relativePath)
  );
}

function printCommandGroup(title, commands, usageMap) {
  console.error(`\n## ${title}`);
  for (const command of sortCommands(commands)) {
    console.error(`- ${command}`);
    if (usageMap?.has(command)) {
      const files = sortCommands(usageMap.get(command));
      for (const file of files) {
        console.error(`  - ${file}`);
      }
    }
  }
}

function addForbiddenSubstringFailures(
  failures,
  relativePath,
  sourceCode,
  rules,
) {
  for (const rule of rules) {
    if (sourceCode.includes(rule.substring)) {
      failures.push({
        file: relativePath,
        message: rule.message,
        token: rule.substring,
      });
    }
  }
}

function addRequiredSubstringFailures(
  failures,
  relativePath,
  sourceCode,
  rules,
) {
  for (const rule of rules) {
    if (!sourceCode.includes(rule.substring)) {
      failures.push({
        file: relativePath,
        message: rule.message,
        token: rule.substring,
      });
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasStandaloneIdentifier(sourceCode, identifier) {
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegExp(identifier)}([^A-Za-z0-9_]|$)`,
  );
  return pattern.test(sourceCode);
}

function hasTauriCommandRegistration(sourceCode, command) {
  const pattern = new RegExp(
    String.raw`\bcommands::[A-Za-z0-9_]+::${escapeRegExp(command)}\b`,
  );
  return pattern.test(sourceCode);
}

function stripRustTestModules(sourceCode) {
  return sourceCode.replace(
    /(?:^|\n)\s*#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*(?:pub\s+)?mod\s+\w+\s*(?:\{[\s\S]*$|;)/m,
    "\n",
  );
}

function readProductionSourceForGuard(relativePath) {
  const sourceCode = readSource(relativePath);
  return relativePath.endsWith(".rs")
    ? stripRustTestModules(sourceCode)
    : sourceCode;
}

function extractNamedFunctionBody(sourceCode, marker) {
  const markerIndex = sourceCode.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`未找到函数定义: ${marker}`);
  }
  const braceStart = sourceCode.indexOf("{", markerIndex);
  if (braceStart < 0) {
    throw new Error(`未找到函数体: ${marker}`);
  }
  return extractBalancedBlock(sourceCode, braceStart, "{", "}");
}

function collectProductionMockOnlyUsageFailures() {
  const failures = [];
  const forbiddenCallPatterns = [
    {
      pattern: /\binvokeMockOnly\s*\(/,
      token: "invokeMockOnly(",
      message: "生产源码不能调用测试 mock invoke 入口",
    },
    {
      pattern: /\bmockCommand\s*\(/,
      token: "mockCommand(",
      message: "生产源码不能注册 renderer mock command",
    },
    {
      pattern: /\bclearMocks\s*\(/,
      token: "clearMocks(",
      message: "生产源码不能清理测试 mock command",
    },
    {
      pattern: /\binvokeExplicitMock\s*\(/,
      token: "invokeExplicitMock(",
      message: "生产源码不能调用显式 renderer mock fallback",
    },
    {
      pattern: /\blistenExplicitMock\s*\(/,
      token: "listenExplicitMock(",
      message: "生产源码不能调用显式 renderer event mock fallback",
    },
  ];
  const forbiddenMockOnlyImports = [
    "invokeMockOnly",
    "mockCommand",
    "clearMocks",
  ];

  for (const root of productionRuntimeRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    for (const relativePath of walkDirectory(absoluteRoot)) {
      if (isAllowedTestMockFixtureSource(relativePath)) {
        continue;
      }

      const sourceCode = readSource(relativePath);
      if (
        /from\s+["'`](?:@\/lib\/dev-bridge\/explicitMockFallback|\.{1,2}\/[^"'`]*explicitMockFallback|\.\/explicitMockFallback)["'`]/.test(
          sourceCode,
        )
      ) {
        failures.push({
          file: relativePath,
          message: "生产源码不能导入显式 renderer mock fallback",
          token: "explicitMockFallback",
        });
      }

      if (
        /from\s+["'`](?:\.\/__tests__\/testFixtures|\.\/testFixtures|\.{1,2}\/[^"'`]*\/testFixtures)["'`]/.test(
          sourceCode,
        )
      ) {
        failures.push({
          file: relativePath,
          message: "生产源码不能导入 Agent App mock SDK 测试夹具",
          token: "testFixtures",
        });
      }

      if (
        /from\s+["'`](?:\.\/MockCapabilityHost|\.\/mockCapabilityProfile|\.{1,2}\/[^"'`]*(?:MockCapabilityHost|mockCapabilityProfile))["'`]/.test(
          sourceCode,
        )
      ) {
        failures.push({
          file: relativePath,
          message: "生产源码不能导入 Agent App mock SDK host/profile",
          token: "MockCapabilityHost/mockCapabilityProfile",
        });
      }

      const desktopHostCoreImportPattern =
        /import\s+\{([^}]*)\}\s+from\s+["'`](?:@\/lib\/desktop-host\/core|\.\.?\/[^"'`]*desktop-host\/core|\.\/core)["'`]/g;
      for (const importMatch of sourceCode.matchAll(
        desktopHostCoreImportPattern,
      )) {
        const namedImports = importMatch[1]
          .split(",")
          .map((item) =>
            item
              .trim()
              .split(/\s+as\s+/)[0]
              ?.trim(),
          )
          .filter(Boolean);
        for (const importName of namedImports) {
          if (forbiddenMockOnlyImports.includes(importName)) {
            failures.push({
              file: relativePath,
              message: "生产源码不能导入 desktop-host 测试 mock 入口",
              token: importName,
            });
          }
        }
      }

      for (const rule of forbiddenCallPatterns) {
        if (rule.pattern.test(sourceCode)) {
          failures.push({
            file: relativePath,
            message: rule.message,
            token: rule.token,
          });
        }
      }
    }
  }

  return failures;
}

function collectProductionBridgeGuardFailures() {
  const failures = [];

  const safeInvokePath = "src/lib/dev-bridge/safeInvoke.ts";
  const safeInvokeSource = readSource(safeInvokePath);
  addForbiddenSubstringFailures(failures, safeInvokePath, safeInvokeSource, [
    {
      substring: "@/lib/desktop-host/api",
      message: "safeInvoke 不能再导入 legacy desktop-host api",
    },
    {
      substring: "./explicitMockFallback",
      message: "safeInvoke 不能再导入显式 renderer mock fallback",
    },
    {
      substring: "invokeExplicitMock",
      message: "safeInvoke 不能再调用显式 invoke mock",
    },
    {
      substring: "listenExplicitMock",
      message: "safeInvoke 不能再调用显式 event mock",
    },
    {
      substring: "getLegacyDesktopHostGlobal",
      message: "safeInvoke 不能再读取 legacy Tauri 全局对象",
    },
    {
      substring: "hasDesktopHostInvokeCapability",
      message: "safeInvoke 不能再探测 legacy Tauri invoke 能力",
    },
    {
      substring: "hasDesktopHostRuntimeMarkers",
      message: "safeInvoke 不能再依赖 legacy Tauri runtime marker",
    },
    {
      substring: "shouldPreferMockInBrowser",
      message: "safeInvoke 不能再按命令优先走 browser mock",
    },
    {
      substring: "shouldDisallowMockFallbackInBrowser",
      message: "safeInvoke 不应再保留 mock fallback 分流",
    },
    {
      substring: "fallback-invoke",
      message: "safeInvoke trace 不能再出现 fallback-invoke transport",
    },
    {
      substring: "legacy-ipc",
      message: "safeInvoke trace 不能再出现 legacy-ipc transport",
    },
  ]);

  const desktopHostPath = "src/lib/desktop-host/core.ts";
  const desktopHostSource = readSource(desktopHostPath);
  const invokeBody = extractNamedFunctionBody(
    desktopHostSource,
    "export async function invoke<T = any>",
  );
  addForbiddenSubstringFailures(failures, desktopHostPath, invokeBody, [
    {
      substring: "invokeDefaultMock",
      message: "生产 invoke 不能回退 invokeDefaultMock",
    },
    {
      substring: "loadDefaultMocks",
      message: "生产 invoke 不能加载 default mocks",
    },
    {
      substring: "mockCommands",
      message: "生产 invoke 不能读取测试 mockCommands",
    },
    {
      substring: "invokeMockOnly",
      message: "生产 invoke 不能委托测试夹具入口",
    },
  ]);
  if (!invokeBody.includes("getElectronHostBridge()")) {
    failures.push({
      file: desktopHostPath,
      message: "生产 invoke 必须优先检查 Electron Desktop Host IPC",
      token: "getElectronHostBridge()",
    });
  }
  if (!invokeBody.includes("invokeViaHttp<T>")) {
    failures.push({
      file: desktopHostPath,
      message: "生产 invoke 仅允许在 DevBridge 可用时走 HTTP bridge 诊断通道",
      token: "invokeViaHttp<T>",
    });
  }
  if (!invokeBody.includes("throw new Error(")) {
    failures.push({
      file: desktopHostPath,
      message: "生产 invoke 缺少无真实通道时的 fail-closed 错误",
      token: "throw new Error(",
    });
  }

  const appServerHostPath = "electron/appServerHost.ts";
  const appServerHostSource = readSource(appServerHostPath);
  if (/backendMode:\s*["'`]mock["'`]/.test(appServerHostSource)) {
    failures.push({
      file: appServerHostPath,
      message: "Electron App Server host 不能配置 mock backend",
      token: 'backendMode: "mock"',
    });
  }
  const resolveBackendModeBody = extractNamedFunctionBody(
    appServerHostSource,
    "function resolveBackendMode",
  );
  if (
    !resolveBackendModeBody.includes('normalized === "mock"') ||
    !resolveBackendModeBody.includes("throw new Error(")
  ) {
    failures.push({
      file: appServerHostPath,
      message: "APP_SERVER_BACKEND_MODE=mock 必须显式失败",
      token: 'normalized === "mock"',
    });
  }
  const runtimeBackendLaunchBody = extractNamedFunctionBody(
    appServerHostSource,
    "function resolveRuntimeBackendLaunchOptions",
  );
  for (const snippet of [
    "process.env.APP_SERVER_BACKEND_COMMAND?.trim()",
    "parseBackendArgs(process.env.APP_SERVER_BACKEND_ARGS)",
    "parsePositiveInteger(",
  ]) {
    if (!runtimeBackendLaunchBody.includes(snippet)) {
      failures.push({
        file: appServerHostPath,
        message: "Electron App Server host 必须保留 external backend env 投影",
        token: snippet,
      });
    }
  }
  const runtimeRequestTimeoutBody = extractNamedFunctionBody(
    appServerHostSource,
    "function resolveAppServerRequestTimeoutMs",
  );
  for (const snippet of [
    "method !== APP_SERVER_TURN_START_METHOD",
    "process.env.APP_SERVER_BACKEND_TIMEOUT_MS",
    "APP_SERVER_BACKEND_TIMEOUT_GRACE_MS",
    "DEFAULT_APP_SERVER_REQUEST_TIMEOUT_MS",
  ]) {
    if (!runtimeRequestTimeoutBody.includes(snippet)) {
      failures.push({
        file: appServerHostPath,
        message:
          "Electron App Server host 必须让长回合请求等待预算跟随 external backend timeout",
        token: snippet,
      });
    }
  }

  const devSidecarPath = "scripts/lib/electron-dev-sidecar.mjs";
  const devSidecarSource = readSource(devSidecarPath);
  for (const snippet of [
    "resolveDevAppServerBackendEnv",
    'defaultMode = "runtime"',
    "APP_SERVER_BACKEND_MODE: defaultMode",
    "APP_SERVER_BACKEND_MODE: requestedMode",
    'APP_SERVER_BACKEND_MODE: "external"',
    "APP_SERVER_BACKEND_COMMAND",
  ]) {
    if (!devSidecarSource.includes(snippet)) {
      failures.push({
        file: devSidecarPath,
        message:
          "Electron dev 必须默认接入 App Server runtime backend，并只保留显式 external override",
        token: snippet,
      });
    }
  }
  for (const token of [
    "appServerAgentBackendBinaryName",
    "localAppServerAgentBackendBinaryPath",
    "resolveDevAppServerAgentBackendBinary",
    "shouldUseDevAppServerExternalBackend",
    "app-server-agent-backend",
  ]) {
    if (devSidecarSource.includes(token)) {
      failures.push({
        file: devSidecarPath,
        message: "Electron dev 不能继续默认解析或构建旧 external agent backend",
        token,
      });
    }
  }
  if (/APP_SERVER_BACKEND_MODE:\s*["'`]mock["'`]/.test(devSidecarSource)) {
    failures.push({
      file: devSidecarPath,
      message: "Electron dev 不能注入 mock App Server backend",
      token: 'APP_SERVER_BACKEND_MODE: "mock"',
    });
  }

  const electronHostCommandsPath = "electron/hostCommands.ts";
  const electronHostCommandsSource = readSource(electronHostCommandsPath);
  if (electronHostCommandsSource.includes('"aster_compat"')) {
    failures.push({
      file: electronHostCommandsPath,
      message: "Electron 设置页诊断 facade 不能恢复 legacy Aster 浏览器后端",
      token: '"aster_compat"',
    });
  }
  if (electronHostCommandsSource.includes("auto_fallback: true")) {
    failures.push({
      file: electronHostCommandsPath,
      message: "Electron 设置页诊断 facade 不能默认启用浏览器后端自动回退",
      token: "auto_fallback: true",
    });
  }
  for (const command of electronDiagnosticFacadeCommands) {
    if (!electronHostCommandsSource.includes(`"${command}"`)) {
      failures.push({
        file: electronHostCommandsPath,
        message: "设置页 Electron 诊断命令缺少 host facade 承接",
        token: command,
      });
    }
    const diagnosticMetaPattern = new RegExp(
      `#diagnosticMeta\\([\\s\\S]*?["'\`]${escapeRegExp(command)}["'\`][\\s\\S]*?\\)`,
    );
    const emptyDiagnosticListPattern = new RegExp(
      `#emptyDiagnosticList\\([\\s\\S]*?["'\`]${escapeRegExp(command)}["'\`][\\s\\S]*?\\)`,
    );
    const hasDiagnosticProjection =
      diagnosticMetaPattern.test(electronHostCommandsSource) ||
      emptyDiagnosticListPattern.test(electronHostCommandsSource);
    if (!hasDiagnosticProjection) {
      failures.push({
        file: electronHostCommandsPath,
        message:
          "设置页 Electron 诊断命令必须显式标注 electron-host-diagnostic degraded",
        token: command,
      });
    }
  }

  const runElectronDevPath = "scripts/electron/run-dev.mjs";
  const runElectronDevSource = readSource(runElectronDevPath);
  for (const snippet of ["resolveDevAppServerBackendEnv"]) {
    if (!runElectronDevSource.includes(snippet)) {
      failures.push({
        file: runElectronDevPath,
        message: "Electron dev 启动必须注入 App Server runtime backend env",
        token: snippet,
      });
    }
  }
  for (const token of [
    "resolveDevAppServerAgentBackendBinary",
    "shouldUseDevAppServerExternalBackend",
    "backendCommand: appServerAgentBackendBin",
  ]) {
    if (runElectronDevSource.includes(token)) {
      failures.push({
        file: runElectronDevPath,
        message: "Electron dev 启动不能再自动接旧 external agent backend",
        token,
      });
    }
  }

  for (const smokePath of [
    "scripts/app-server/stdio-smoke.mjs",
    "scripts/app-server/sidecar-lifecycle-smoke.mjs",
  ]) {
    const smokeSource = readSource(smokePath);
    if (/backendMode:\s*["'`]mock["'`]/.test(smokeSource)) {
      failures.push({
        file: smokePath,
        message: "App Server smoke 不能用 mock backend 伪造 turn 成功",
        token: 'backendMode: "mock"',
      });
    }
  }

  failures.push(...collectProductionMockOnlyUsageFailures());

  const explicitMockFallbackPath = "src/lib/dev-bridge/explicitMockFallback.ts";
  const explicitMockFallbackSource = readSource(explicitMockFallbackPath);
  for (const snippet of [
    "assertExplicitMockFallbackTestEnvironment",
    'import.meta.env?.MODE === "test"',
    "invokeExplicitMock",
    "listenExplicitMock",
  ]) {
    if (!explicitMockFallbackSource.includes(snippet)) {
      failures.push({
        file: explicitMockFallbackPath,
        message: "显式 renderer mock fallback 必须只允许测试环境使用",
        token: snippet,
      });
    }
  }

  const agentAppFeatureFlagPath = "src/features/agent-app/featureFlag.ts";
  const agentAppFeatureFlagSource = readSource(agentAppFeatureFlagPath);
  addRequiredSubstringFailures(
    failures,
    agentAppFeatureFlagPath,
    agentAppFeatureFlagSource,
    [
      {
        substring: "function isTestEnvironment()",
        message: "Agent App mock SDK flag 必须只允许测试环境启用",
      },
      {
        substring: "!import.meta.env?.PROD",
        message: "Agent App mock SDK flag 必须在生产构建中硬关闭",
      },
      {
        substring: 'import.meta.env?.MODE === "test"',
        message: "Agent App mock SDK flag 只能接受测试 mode",
      },
      {
        substring: "import.meta.env?.VITEST",
        message: "Agent App mock SDK flag 只能接受 Vitest 测试夹具",
      },
      {
        substring: "const mockSdkEnabled = isTestEnvironment()",
        message:
          "Agent App mockSdkEnabled 不能由生产 env/localStorage 直接打开",
      },
    ],
  );

  const agentAppMockEnvironmentPath =
    "src/features/agent-app/sdk/mockEnvironment.ts";
  const agentAppMockEnvironmentSource = readSource(agentAppMockEnvironmentPath);
  addRequiredSubstringFailures(
    failures,
    agentAppMockEnvironmentPath,
    agentAppMockEnvironmentSource,
    [
      {
        substring: "assertTestMockSdkEnvironment",
        message: "Agent App mock SDK 必须有统一测试环境断言",
      },
      {
        substring: "!import.meta.env?.PROD",
        message: "Agent App mock SDK 断言必须在生产构建中硬关闭",
      },
      {
        substring:
          "生产路径必须进入 Electron Desktop Host IPC / App Server JSON-RPC",
        message: "Agent App mock SDK 非测试环境必须说明真实生产主链",
      },
    ],
  );

  for (const [mockPath, snippet] of [
    [
      "src/features/agent-app/sdk/mockCapabilityProfile.ts",
      'assertTestMockSdkEnvironment("buildMockCapabilityProfile")',
    ],
    [
      "src/features/agent-app/sdk/MockCapabilityHost.ts",
      'assertTestMockSdkEnvironment("MockCapabilityHost")',
    ],
    [
      "src/features/agent-app/sdk/__tests__/testFixtures.ts",
      'assertTestMockSdkEnvironment("createMockLimeCapabilityTransport")',
    ],
  ]) {
    const mockSource = readSource(mockPath);
    addRequiredSubstringFailures(failures, mockPath, mockSource, [
      {
        substring: snippet,
        message: "Agent App mock SDK 出口必须只允许测试环境使用",
      },
    ]);
  }

  const agentAppSdkPublicPaths = [
    "src/features/agent-app/sdk/index.ts",
    "src/features/agent-app/index.ts",
    "src/features/agent-app/sdk/capabilityContract.ts",
    "src/features/agent-app/sdk/index.d.ts",
    "src/features/agent-app/sdk/capabilityContract.d.ts",
  ];
  for (const sdkPath of agentAppSdkPublicPaths) {
    const sdkSource = readSource(sdkPath);
    addForbiddenSubstringFailures(failures, sdkPath, sdkSource, [
      {
        substring: "createMockLimeCapabilityTransport",
        message: "Agent App public SDK / contract 不能导出 mock transport",
      },
      {
        substring: "MockCapabilityHost",
        message: "Agent App public SDK 不能导出 mock host",
      },
      {
        substring: "buildMockCapabilityProfile",
        message: "Agent App public SDK 不能导出 mock capability profile",
      },
      {
        substring: "LimeCapabilityMock",
        message: "Agent App public SDK / contract 不能导出 mock handler 类型",
      },
    ]);
  }

  return failures;
}

function collectRetiredFileBrowserFacadeSourceFailures() {
  const failures = [];
  const restrictedSources = [
    {
      path: "src/lib/desktop-host/fileSystemMocks.ts",
      message:
        "已迁到 App Server fileSystem/* 的旧文件浏览 facade 命令不能继续保留 desktop-host mock fixture",
    },
    {
      path: "lime-rs/src/app/runner.rs",
      message:
        "已迁到 App Server fileSystem/* 的旧文件浏览 facade 命令不能回到 legacy Tauri generate_handler",
    },
    {
      path: "lime-rs/src/dev_bridge/dispatcher/files.rs",
      message:
        "已迁到 App Server fileSystem/* 的旧文件浏览 facade 命令不能回到 Rust DevBridge dispatcher",
    },
    {
      path: "lime-rs/src/services/file_browser_service.rs",
      message:
        "已迁到 App Server fileSystem/* 的旧文件浏览 facade 命令不能回到 Tauri command wrapper",
    },
    {
      path: "lime-rs/crates/services/src/file_browser_service.rs",
      message:
        "已迁到 App Server fileSystem/* 的旧文件浏览 facade 命令不能回到 services compat wrapper",
      commands: ["list_dir", "read_file_preview_cmd"],
    },
  ];

  for (const source of restrictedSources) {
    const sourceCode = readProductionSourceForGuard(source.path);
    const commands = source.commands ?? retiredFileBrowserFacadeCommands;
    for (const command of commands) {
      if (hasStandaloneIdentifier(sourceCode, command)) {
        failures.push({
          file: source.path,
          message: source.message,
          token: command,
        });
      }
    }
  }

  return failures;
}

function collectRetiredAutomationFacadeSourceFailures() {
  const failures = [];
  const restrictedSources = [
    {
      path: "src/lib/dev-bridge/commandPolicy.ts",
      message:
        "已迁到 App Server automation* 的旧自动化命令不能继续作为 DevBridge truth command",
    },
    {
      path: "src/lib/dev-bridge/mockPriorityCommands.ts",
      message:
        "已迁到 App Server automation* 的旧自动化命令不能继续作为 mock priority command",
    },
    {
      path: "lime-rs/src/app/runner.rs",
      message:
        "已迁到 App Server automation* 的旧自动化命令不能回到 legacy Tauri generate_handler",
    },
    {
      path: "lime-rs/src/commands/mod.rs",
      message:
        "已迁到 App Server automation* 的旧自动化命令不能回到 legacy Tauri command module",
    },
    {
      path: "lime-rs/src/dev_bridge/dispatcher.rs",
      message:
        "已迁到 App Server automation* 的旧自动化命令不能回到 Rust DevBridge dispatcher",
    },
  ];

  for (const source of restrictedSources) {
    const sourceCode = readProductionSourceForGuard(source.path);
    for (const command of retiredAutomationFacadeCommands) {
      if (hasStandaloneIdentifier(sourceCode, command)) {
        failures.push({
          file: source.path,
          message: source.message,
          token: command,
        });
      }
    }
  }

  return failures;
}

function collectRetiredApiKeyProviderFacadeSourceFailures() {
  const failures = [];
  const restrictedSources = [
    {
      path: "src/lib/dev-bridge/commandPolicy.ts",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能继续作为 DevBridge truth command",
    },
    {
      path: "src/lib/dev-bridge/mockPriorityCommands.ts",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能继续作为 mock priority command",
    },
    {
      path: "lime-rs/src/app/runner.rs",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到 legacy Tauri generate_handler",
    },
    {
      path: "lime-rs/src/commands/mod.rs",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到 legacy Tauri command module",
    },
    {
      path: "lime-rs/src/dev_bridge/dispatcher.rs",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到 Rust DevBridge dispatcher",
    },
    {
      path: "lime-rs/src/dev_bridge/dispatcher/providers.rs",
      message:
        "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到 Rust DevBridge provider dispatcher",
    },
  ];

  for (const source of restrictedSources) {
    const sourceCode = readProductionSourceForGuard(source.path);
    for (const command of retiredApiKeyProviderFacadeCommands) {
      if (hasStandaloneIdentifier(sourceCode, command)) {
        failures.push({
          file: source.path,
          message: source.message,
          token: command,
        });
      }
    }
  }

  return failures;
}

function collectCurrentFileBrowserDesktopHostShellSourceFailures() {
  const failures = [];
  const restrictedSources = [
    {
      path: "src/lib/desktop-host/fileSystemMocks.ts",
      message:
        "已迁到 Electron Desktop Host 的文件浏览壳命令不能继续保留 desktop-host mock fixture",
    },
    {
      path: "src/lib/dev-bridge/commandPolicy.ts",
      message:
        "已迁到 Electron Desktop Host 的文件浏览壳命令不能继续作为 DevBridge truth command",
    },
    {
      path: "lime-rs/src/app/runner.rs",
      message:
        "已迁到 Electron Desktop Host 的文件浏览壳命令不能回到 legacy Tauri generate_handler",
    },
    {
      path: "lime-rs/src/dev_bridge/dispatcher/files.rs",
      message:
        "已迁到 Electron Desktop Host 的文件浏览壳命令不能回到 Rust DevBridge dispatcher",
    },
    {
      path: "lime-rs/src/services/file_browser_service.rs",
      message:
        "已迁到 Electron Desktop Host 的文件浏览壳命令不能回到 Tauri command wrapper",
    },
  ];

  for (const source of restrictedSources) {
    const sourceCode = readProductionSourceForGuard(source.path);
    for (const command of currentFileBrowserDesktopHostShellCommands) {
      if (hasStandaloneIdentifier(sourceCode, command)) {
        failures.push({
          file: source.path,
          message: source.message,
          token: command,
        });
      }
    }
  }

  return failures;
}

function collectRetiredTauriGenerateHandlerFailures() {
  const failures = [];
  const source = {
    path: "lime-rs/src/app/runner.rs",
    message:
      "已撤注册的 legacy Tauri command 不能回到 generate_handler；业务能力必须走 App Server current，桌面壳能力必须走 Electron Desktop Host current",
  };
  const sourceCode = readProductionSourceForGuard(source.path);
  for (const command of retiredTauriGenerateHandlerCommands) {
    if (hasTauriCommandRegistration(sourceCode, command)) {
      failures.push({
        file: source.path,
        message: source.message,
        token: command,
      });
    }
  }

  return failures;
}

function collectRetiredTauriCommandModuleFailures() {
  const failures = [];
  const source = {
    path: "lime-rs/src/commands/mod.rs",
    message:
      "已撤注册的 legacy Tauri command module 不能回到 commands/mod.rs；旧 wrapper 文件只能等待确认后物理删除或登记 blocker",
  };
  const sourceCode = readProductionSourceForGuard(source.path);
  for (const moduleName of retiredTauriCommandModules) {
    if (hasStandaloneIdentifier(sourceCode, moduleName)) {
      failures.push({
        file: source.path,
        message: source.message,
        token: moduleName,
      });
    }
  }

  return failures;
}

function printGuardFailures(title, failures) {
  console.error(`\n## ${title}`);
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`);
    console.error(`  - ${failure.token}`);
  }
}

function main() {
  const frontendUsage = collectFrontendCommandUsage();
  const agentRuntimeSchemaUsage = collectAgentRuntimeSchemaUsage();
  for (const [command, files] of agentRuntimeSchemaUsage.entries()) {
    for (const file of files) {
      addUsage(frontendUsage, command, file);
    }
  }
  const frontendCommands = new Set(frontendUsage.keys());
  const registeredCommands = collectElectronHostCommands();
  const mockPriorityCommands = collectMockPriorityCommands();
  const bridgeTruthCommands = collectBridgeTruthCommands();
  const agentCommandCatalog = readAgentCommandCatalog();
  const productionBridgeGuardFailures = collectProductionBridgeGuardFailures();
  const retiredFileBrowserFacadeSourceFailures =
    collectRetiredFileBrowserFacadeSourceFailures();
  const retiredAutomationFacadeSourceFailures =
    collectRetiredAutomationFacadeSourceFailures();
  const retiredApiKeyProviderFacadeSourceFailures =
    collectRetiredApiKeyProviderFacadeSourceFailures();
  const currentFileBrowserDesktopHostShellSourceFailures =
    collectCurrentFileBrowserDesktopHostShellSourceFailures();
  const retiredTauriGenerateHandlerFailures =
    collectRetiredTauriGenerateHandlerFailures();
  const retiredTauriCommandModuleFailures =
    collectRetiredTauriCommandModuleFailures();

  const deprecatedCommands = new Set(
    Object.keys(agentCommandCatalog.deprecatedCommandReplacements ?? {}),
  );
  const runtimeGatewayCommands = new Set(
    agentCommandCatalog.runtimeGatewayCommands ?? [],
  );
  const capabilityDraftCommands = new Set(
    agentCommandCatalog.capabilityDraftCommands ?? [],
  );

  const deferredCommands = new Set(knownDeferredRegistrationReasons.keys());
  const currentDeferredConflicts = new Set(
    [...currentElectronHostRequiredCommands].filter((command) =>
      deferredCommands.has(command),
    ),
  );

  const missingCurrentRegistrations = new Set(
    [...currentElectronHostRequiredCommands].filter(
      (command) => !registeredCommands.has(command),
    ),
  );
  const missingDevBridgeTruthCommands = new Set(
    [...currentDevBridgeTruthRequiredCommands].filter(
      (command) => !bridgeTruthCommands.has(command),
    ),
  );
  const deprecatedCommandsStillUsed = new Set(
    [...frontendCommands].filter((command) => deprecatedCommands.has(command)),
  );
  const retiredFileBrowserFacadeLeaks = new Set(
    [...retiredFileBrowserFacadeCommands].filter(
      (command) =>
        registeredCommands.has(command) ||
        bridgeTruthCommands.has(command) ||
        runtimeGatewayCommands.has(command) ||
        capabilityDraftCommands.has(command),
    ),
  );
  const retiredAutomationFacadeLeaks = new Set(
    [...retiredAutomationFacadeCommands].filter(
      (command) =>
        registeredCommands.has(command) ||
        bridgeTruthCommands.has(command) ||
        mockPriorityCommands.has(command) ||
        runtimeGatewayCommands.has(command) ||
        capabilityDraftCommands.has(command),
    ),
  );
  const retiredApiKeyProviderFacadeLeaks = new Set(
    [...retiredApiKeyProviderFacadeCommands].filter(
      (command) =>
        registeredCommands.has(command) ||
        bridgeTruthCommands.has(command) ||
        mockPriorityCommands.has(command) ||
        runtimeGatewayCommands.has(command) ||
        capabilityDraftCommands.has(command),
    ),
  );
  const retiredAgentAppPackageFacadeLeaks = new Set(
    [...retiredAgentAppPackageFacadeCommands].filter(
      (command) =>
        registeredCommands.has(command) ||
        bridgeTruthCommands.has(command) ||
        mockPriorityCommands.has(command) ||
        runtimeGatewayCommands.has(command) ||
        capabilityDraftCommands.has(command),
    ),
  );
  const currentFileBrowserDesktopHostShellBridgeLeaks = new Set(
    [...currentFileBrowserDesktopHostShellCommands].filter(
      (command) =>
        bridgeTruthCommands.has(command) ||
        runtimeGatewayCommands.has(command) ||
        capabilityDraftCommands.has(command),
    ),
  );
  const runtimeGatewayMissingRegistrations = new Set(
    [...runtimeGatewayCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );
  const unclassifiedRuntimeGatewayCommands = new Set(
    [...runtimeGatewayCommands].filter(
      (command) =>
        !currentElectronHostRequiredCommands.has(command) &&
        !deferredCommands.has(command),
    ),
  );
  const capabilityDraftMissingRegistrations = new Set(
    [...capabilityDraftCommands].filter(
      (command) =>
        !registeredCommands.has(command) && !deferredCommands.has(command),
    ),
  );

  console.log("[command-contracts] frontend commands:", frontendCommands.size);
  console.log(
    "[command-contracts] Electron host commands:",
    registeredCommands.size,
  );
  console.log(
    "[command-contracts] mock priority commands:",
    mockPriorityCommands.size,
  );
  console.log(
    "[command-contracts] DevBridge truth commands:",
    bridgeTruthCommands.size,
  );

  if (knownDeferredRegistrationReasons.size > 0) {
    console.log("\n[command-contracts] 已登记的延期命令：");
    for (const command of sortCommands(
      knownDeferredRegistrationReasons.keys(),
    )) {
      console.log(`- ${command}`);
      console.log(`  ${knownDeferredRegistrationReasons.get(command)}`);
    }
  }

  let hasError = false;

  if (currentDeferredConflicts.size > 0) {
    hasError = true;
    printCommandGroup(
      "命令不能同时标记为 current 与 compat/deferred",
      currentDeferredConflicts,
    );
  }

  if (missingCurrentRegistrations.size > 0) {
    hasError = true;
    printCommandGroup(
      "current Electron/App Server 命令缺少 Electron host 承接",
      missingCurrentRegistrations,
      frontendUsage,
    );
  }

  if (missingDevBridgeTruthCommands.size > 0) {
    hasError = true;
    printCommandGroup(
      "current App Server 数据面命令缺少 DevBridge truth 分类",
      missingDevBridgeTruthCommands,
      frontendUsage,
    );
  }

  if (productionBridgeGuardFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "生产桥接路径不能回退 legacy Tauri / renderer mock / mock backend",
      productionBridgeGuardFailures,
    );
  }

  if (deprecatedCommandsStillUsed.size > 0) {
    hasError = true;
    printCommandGroup(
      "前端仍在调用的废弃命令",
      deprecatedCommandsStillUsed,
      frontendUsage,
    );
  }

  if (retiredFileBrowserFacadeLeaks.size > 0) {
    hasError = true;
    printCommandGroup(
      "已迁到 App Server fileSystem/* 的旧文件浏览命令不能回到 Electron Host 或 DevBridge truth surface",
      retiredFileBrowserFacadeLeaks,
    );
  }

  if (retiredFileBrowserFacadeSourceFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已迁到 App Server fileSystem/* 的旧文件浏览命令不能回到旧客户端源码",
      retiredFileBrowserFacadeSourceFailures,
    );
  }

  if (retiredAutomationFacadeLeaks.size > 0) {
    hasError = true;
    printCommandGroup(
      "已迁到 App Server automation* 的旧自动化命令不能回到 Electron Host、DevBridge truth、mock priority 或 runtime surface",
      retiredAutomationFacadeLeaks,
    );
  }

  if (retiredAutomationFacadeSourceFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已迁到 App Server automation* 的旧自动化命令不能回到旧客户端源码",
      retiredAutomationFacadeSourceFailures,
    );
  }

  if (retiredApiKeyProviderFacadeLeaks.size > 0) {
    hasError = true;
    printCommandGroup(
      "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到 Electron Host、DevBridge truth、mock priority 或 runtime surface",
      retiredApiKeyProviderFacadeLeaks,
    );
  }

  if (retiredApiKeyProviderFacadeSourceFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已迁到 App Server modelProvider/* 的旧 Provider 命令不能回到旧客户端源码",
      retiredApiKeyProviderFacadeSourceFailures,
    );
  }

  if (retiredAgentAppPackageFacadeLeaks.size > 0) {
    hasError = true;
    printCommandGroup(
      "已迁到 App Server agentApp* 的旧 Agent App lifecycle 命令不能回到 Electron Host、DevBridge truth、mock priority 或 runtime surface",
      retiredAgentAppPackageFacadeLeaks,
    );
  }

  if (currentFileBrowserDesktopHostShellBridgeLeaks.size > 0) {
    hasError = true;
    printCommandGroup(
      "已迁到 Electron Desktop Host 的文件浏览壳命令不能回到 DevBridge truth 或 runtime gateway surface",
      currentFileBrowserDesktopHostShellBridgeLeaks,
    );
  }

  if (currentFileBrowserDesktopHostShellSourceFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已迁到 Electron Desktop Host 的文件浏览壳命令不能回到旧客户端源码",
      currentFileBrowserDesktopHostShellSourceFailures,
    );
  }

  if (retiredTauriGenerateHandlerFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已撤注册的 legacy Tauri command 不能回到 runner generate_handler",
      retiredTauriGenerateHandlerFailures,
    );
  }

  if (retiredTauriCommandModuleFailures.length > 0) {
    hasError = true;
    printGuardFailures(
      "已撤注册的 legacy Tauri command module 不能回到 commands/mod.rs",
      retiredTauriCommandModuleFailures,
    );
  }

  if (runtimeGatewayMissingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup(
      "runtime gateway 命令缺少 Electron host 承接",
      runtimeGatewayMissingRegistrations,
    );
  }

  if (unclassifiedRuntimeGatewayCommands.size > 0) {
    hasError = true;
    printCommandGroup(
      "runtime gateway 命令未分类为 current 或 compat/deferred",
      unclassifiedRuntimeGatewayCommands,
    );
  }

  if (capabilityDraftMissingRegistrations.size > 0) {
    hasError = true;
    printCommandGroup(
      "capability draft 命令缺少 Electron host 承接",
      capabilityDraftMissingRegistrations,
    );
  }

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log("\n[command-contracts] 所有命令契约检查通过。");
}

main();
