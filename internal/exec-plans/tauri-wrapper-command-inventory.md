# Tauri wrapper command inventory

生成时间：2026-06-08 CST  
状态：`snapshot_current_dirty_worktree`  
关联队列：`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`

## 口径

- 本报告是机械扫描快照，用于多进程拆分清理，不是最终删除裁决。
- `low-reference` / `devbridge-only` 只能作为候选信号；删除前仍需核对前端网关、Electron Host / App Server、legacy runner、`agentCommandCatalog`、mock 与契约测试。
- 当前工作树存在大量并行脏写集，本报告避免触碰 `runner.rs`、`commandPolicy.ts`、`agentCommandCatalog.json` 和 App Server protocol。
- `lime-rs/src/commands/**` 是旧 Tauri command wrapper 删除清理区，不再承接新的业务逻辑、API adapter、runtime 分支、领域服务实现、compat wrapper 或退场 stub；下表中的文件只代表待删除 surface，不是新增落点，也不是退场包装落点。

## 总量

| Surface                             | Count | 说明                                 |
| ----------------------------------- | ----: | ------------------------------------ |
| Rust `#[tauri::command]`            |   490 | 74 个文件                            |
| `tauri::generate_handler!` 注册     |   513 | 仅统计 handler 列表最后一级函数名    |
| DevBridge dispatcher 字符串命令     |   147 | 17 个 dispatcher 文件                |
| 前端直接 `safeInvoke/invoke` 字符串 |    27 | 9 个前端文件；动态常量另见 API token |
| `src/lib/api` 命令名 token          |  1062 | 用于补足动态 `safeInvoke(command)`   |
| App Server JSON-RPC method          |    93 | protocol 源码字符串扫描              |

## 高密度旧 wrapper 文件

| Count | File                                                              | 推荐拆分                                     |
| ----: | ----------------------------------------------------------------- | -------------------------------------------- |
|    29 | `lime-rs/src/commands/webview_cmd.rs`                             | Desktop Host / Browser Runtime               |
|    28 | `lime-rs/src/commands/skill_cmd.rs`                               | Skills / marketplace / execution 分拆        |
|    21 | `lime-rs/src/commands/aster_agent_cmd/command_api/runtime_api.rs` | Agent Runtime 主链，最后处理                 |
|    19 | `lime-rs/src/commands/mcp_cmd.rs`                                 | App Server MCP current                       |
|    16 | `lime-rs/src/commands/config_cmd.rs`                              | Config / Desktop Host shell split            |
|    16 | `lime-rs/src/commands/machine_id_cmd.rs`                          | Machine identity / diagnostics split         |
|    15 | `lime-rs/src/commands/memory_management_cmd.rs`                   | Memory App Server current                    |
|    15 | `lime-rs/src/commands/workspace_cmd.rs`                           | Workspace App Server current                 |
|    14 | `lime-rs/src/commands/model_registry_cmd.rs`                      | Model Provider current                       |
|    14 | `lime-rs/src/commands/session_files_cmd.rs`                       | Session files App Server current             |
|    13 | `lime-rs/src/commands/memory_cmd.rs`                              | Memory App Server current                    |
|    12 | `lime-rs/src/commands/agent_app_cmd.rs`                           | Agent App current / Desktop Host shell split |
|    12 | `lime-rs/src/commands/site_capability_cmd.rs`                     | Site capability current                      |
|    10 | `lime-rs/src/commands/browser_connector_cmd.rs`                   | Desktop Host / Browser Runtime               |
|    10 | `lime-rs/src/commands/telemetry_cmd.rs`                           | Telemetry / App Server split                 |
|     9 | `lime-rs/src/commands/gateway_tunnel_cmd.rs`                      | Gateway channel / tunnel split               |
|     9 | `lime-rs/src/commands/material_cmd.rs`                            | Materials / project resources                |
|     9 | `lime-rs/src/commands/models_cmd.rs`                              | Model Provider current                       |
|     9 | `lime-rs/src/commands/persona_cmd.rs`                             | Persona / project memory split               |
|     9 | `lime-rs/src/commands/prompt_cmd.rs`                              | Prompt service split                         |

## DevBridge 热点

| Count | File                                                     | 清理口径                         |
| ----: | -------------------------------------------------------- | -------------------------------- |
|    31 | `lime-rs/src/dev_bridge/dispatcher/agent_sessions.rs`    | Agent Runtime 高风险，最后处理   |
|    22 | `lime-rs/src/dev_bridge/dispatcher/skills.rs`            | Skills 高风险，单进程处理        |
|    22 | `lime-rs/src/dev_bridge/dispatcher/voice.rs`             | Voice split                      |
|    14 | `lime-rs/src/dev_bridge/dispatcher/browser/runtime.rs`   | Browser Runtime current gateway  |
|     8 | `lime-rs/src/dev_bridge/dispatcher/agent_apps.rs`        | Agent App current gateway        |
|     7 | `lime-rs/src/dev_bridge/dispatcher/browser/sessions.rs`  | Browser Runtime current gateway  |
|     7 | `lime-rs/src/dev_bridge/dispatcher/capability_drafts.rs` | Capability Draft current gateway |
|     7 | `lime-rs/src/dev_bridge/dispatcher/files.rs`             | File / layered design gateway    |
|     7 | `lime-rs/src/dev_bridge/dispatcher/knowledge.rs`         | Knowledge App Server current     |
|     4 | `lime-rs/src/dev_bridge/dispatcher/browser/bridge.rs`    | Browser Runtime current gateway  |
|     4 | `lime-rs/src/dev_bridge/dispatcher/providers.rs`         | Provider current gateway         |
|     3 | `lime-rs/src/dev_bridge/dispatcher/app_runtime.rs`       | Config / diagnostics split       |
|     3 | `lime-rs/src/dev_bridge/dispatcher/browser/cdp.rs`       | Browser Runtime current gateway  |
|     3 | `lime-rs/src/dev_bridge/dispatcher/models.rs`            | 已在 Q3A 处理中                  |
|     3 | `lime-rs/src/dev_bridge/dispatcher/project_resources.rs` | 已在 Q3B blocked                 |
|     1 | `lime-rs/src/dev_bridge/dispatcher/memory.rs`            | Memory current gateway           |
|     1 | `lime-rs/src/dev_bridge/dispatcher/runtime_queries.rs`   | Runtime query current gateway    |

## 低引用候选

这些命令当前在扫描范围内只出现在少量 Rust 文件，且没有命中前端直接调用、`src/lib/api` 命令 token 或 DevBridge dispatcher。它们适合作为后续 `TW-Q2-DEAD-NAMES` 子任务，但必须等共享写集释放后再删 runner / catalog。

| Command                          | Occurrence files                                                                    | 下一步                                               |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `add_model_to_provider`          | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/models_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `add_provider`                   | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/models_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `check_codex_cli_status`         | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/external_tools_cmd.rs`         | 核对产品入口后拆独立删除任务                         |
| `create_a2ui_form`               | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/a2ui_form_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `create_persona`                 | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/persona_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `create_webview_panel`           | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/webview_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `delete_a2ui_form`               | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/a2ui_form_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `delete_avatar`                  | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/file_upload_cmd.rs`            | 核对产品入口后拆独立删除任务                         |
| `delete_persona`                 | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/persona_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `execute_ecommerce_review_reply` | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/ecommerce_review_reply_cmd.rs` | 核对产品入口后拆独立删除任务                         |
| `export_bundle`                  | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `export_config`                  | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `export_config_yaml`             | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `fetch_provider_models_from_api` | `scripts/check-command-contracts.mjs`                                               | 2026-06-08 已删旧 Tauri helper；只保留 retired guard |
| `focus_webview_panel`            | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/webview_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `get_a2ui_form`                  | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/a2ui_form_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_a2ui_forms_by_message`      | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/a2ui_form_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_a2ui_forms_by_session`      | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/a2ui_form_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_all_provider_models`        | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/models_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_auto_launch_status`         | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_available_voices`           | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/voice_test_cmd.rs`             | 核对产品入口后拆独立删除任务                         |
| `get_config_dir_path`            | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_config_paths`               | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_config_status`              | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_default_persona`            | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/persona_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `get_external_tools`             | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/external_tools_cmd.rs`         | 核对产品入口后拆独立删除任务                         |
| `get_material`                   | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/material_cmd.rs`               | 核对产品入口后拆独立删除任务                         |
| `get_materials_content`          | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/material_cmd.rs`               | 核对产品入口后拆独立删除任务                         |
| `get_memory_feedback_stats`      | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/memory_feedback_cmd.rs`        | 核对产品入口后拆独立删除任务                         |
| `get_models_config`              | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/models_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_persona`                    | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/persona_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `get_project_context`            | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/workspace_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_provider_models`            | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/models_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_relay_info`                 | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/connect_cmd.rs`                | 核对产品入口后拆独立删除任务                         |
| `get_sysinfo`                    | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/services/sysinfo_service.rs`            | 核对产品入口后拆独立删除任务                         |
| `get_telegram_remote_status`     | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/telegram_remote_cmd.rs`        | 核对产品入口后拆独立删除任务                         |
| `get_tool_versions`              | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/config_cmd.rs`                 | 核对产品入口后拆独立删除任务                         |
| `get_websocket_connections`      | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/websocket_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_websocket_status`           | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/websocket_cmd.rs`              | 核对产品入口后拆独立删除任务                         |
| `get_webview_panels`             | `lime-rs/src/app/runner.rs`<br>`lime-rs/src/commands/webview_cmd.rs`                | 核对产品入口后拆独立删除任务                         |

## 需要优先解释的漂移

| Signal                       | Command / group                  | 说明                                                                               |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| tauri-command-not-registered | `knowledge_compile_pack`         | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_get_pack`             | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_import_source`        | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_list_packs`           | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_resolve_context`      | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_set_default_pack`     | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_update_pack_status`   | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| tauri-command-not-registered | `knowledge_validate_context_run` | Rust 命令定义未进入当前 runner 注册；确认是否测试专用、遗漏注册或可删。            |
| devbridge-only               | `get_models`                     | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_compile_pack`         | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_get_pack`             | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_import_source`        | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_resolve_context`      | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_set_default_pack`     | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_update_pack_status`   | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |
| devbridge-only               | `knowledge_validate_context_run` | 只在 DevBridge 字符串分发出现；若 App Server method 已覆盖，可删 dispatcher 分支。 |

## 前端仍可见的 legacy Rust 命令名

这些命令仍出现在前端直接调用或 API 网关 token 中，不应快删；要按 current 主链迁完后再撤 Rust wrapper。

| Source                   | Commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| direct safeInvoke/invoke | `agent_app_launch_shell`, `agent_runtime_get_tool_inventory`, `agent_runtime_list_sessions`, `agent_runtime_save_review_decision`, `companion_get_pet_status`, `complete_audio_generation_task_artifact`, `create_audio_generation_task_artifact`, `execution_run_get_general_workbench_state`, `get_config`, `get_media_task_artifact`, `get_or_create_default_project`, `list_media_task_artifacts`, `open_external_url`, `report_frontend_debug_log`, `save_config`, `update_provider_env_vars`, `workspace_get_projects_root`, `workspace_list`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| src/lib/api token        | `add_mcp_server`, `add_skill_repo`, `agent_app_fetch_cloud_package`, `agent_app_get_ui_runtime_status`, `agent_app_inspect_local_package`, `agent_app_launch_shell`, `agent_app_list_installed`, `agent_app_runtime_cancel_task`, `agent_app_runtime_get_task`, `agent_app_runtime_start_task`, `agent_app_runtime_submit_host_response`, `agent_app_save_installed_state`, `agent_app_select_directory`, `agent_app_set_disabled`, `agent_app_start_ui_runtime`, `agent_app_stop_ui_runtime`, `agent_app_uninstall`, `agent_app_uninstall_rehearsal`, `agent_get_process_status`, `agent_runtime_audit_objective`, `agent_runtime_clear_objective`, `agent_runtime_close_subagent`, `agent_runtime_compact_session`, `agent_runtime_continue_objective`, `agent_runtime_create_session`, `agent_runtime_delete_session`, `agent_runtime_diff_file_checkpoint`, `agent_runtime_export_analysis_handoff`, `agent_runtime_export_evidence_pack`, `agent_runtime_export_handoff_bundle`, `agent_runtime_export_replay_case`, `agent_runtime_export_review_decision_template`, `agent_runtime_get_file_checkpoint`, `agent_runtime_get_objective`, `agent_runtime_get_session`, `agent_runtime_get_thread_read`, `agent_runtime_get_tool_inventory`, `agent_runtime_interrupt_turn`, `agent_runtime_list_file_checkpoints`, `agent_runtime_list_sessions`, `agent_runtime_list_workspace_skill_bindings`, `agent_runtime_promote_queued_turn`, `agent_runtime_remove_queued_turn`, `agent_runtime_replay_request`, `agent_runtime_respond_action`, `agent_runtime_restore_file_checkpoint`, `agent_runtime_resume_subagent`, `agent_runtime_resume_thread`, `agent_runtime_save_review_decision`, `agent_runtime_send_subagent_input`, `agent_runtime_set_objective`, `agent_runtime_spawn_subagent`, `agent_runtime_submit_turn`, `agent_runtime_update_objective_status`, `agent_runtime_update_session`, `agent_runtime_wait_subagents`, `agent_start_process`, `agent_stop_process`, `analyze_layered_design_flat_image`, `aster_agent_configure_provider`, `aster_agent_init`, `aster_agent_status`, `cancel_media_task_artifact`, `cancel_video_generation_task`, `capability_draft_create`, `capability_draft_execute_controlled_get`, `capability_draft_get`, `capability_draft_list`, `capability_draft_register`, `capability_draft_submit_approval_session_inputs`, `capability_draft_verify`, `character_create`, `character_delete`, `character_get`, `character_list`, `character_update`, `clear_diagnostic_log_history`, `clear_logs`, `companion_get_pet_status`, `companion_launch_pet` |

## 推荐并行切片

1. `TW-Q2-LOW-REFERENCE`：从低引用候选里每次认领 1-3 个命令；写集必须包含 runner / Rust wrapper / catalog / mock，当前共享热区未释放前只读。
2. `TW-Q3-DEVBRIDGE-ONLY`：优先删 `devbridge-only` 且 App Server method 已覆盖的 dispatcher 分支；不要动 Agent Runtime。
3. `TW-Q4-DESKTOP-HOST-SHELL`：`open_external_url`、窗口、更新、系统打开等纯壳能力只迁 Electron Host，不进 App Server。
4. `TW-Q5-APP-SERVER-READS`：Workspace / Knowledge / Model / Session files 读链按 App Server method 逐条撤 Tauri wrapper。
