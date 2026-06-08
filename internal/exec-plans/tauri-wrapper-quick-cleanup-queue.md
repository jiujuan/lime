# Tauri wrapper 快速清理队列

创建时间：2026-06-08 CST  
状态：`parallel_dispatch_ready`  
关联计划：

- `internal/exec-plans/production-command-current-migration-plan.md`
- `internal/exec-plans/tauri-wrapper-command-inventory.md`
- `internal/roadmap/appserver/frontend-electron-migration.md`

## 目标

把 Tauri -> Electron / App Server 迁移里的低价值旧面先收掉，减少后续主链迁移时的噪音和误判。

排序原则：

1. 从易到难：先清零引用、文档 / smoke 旧词、纯测试夹具、已 current 覆盖的 dispatcher 分支；再动跨四侧协议和运行时主链。
2. 从不重要到重要：先处理不影响 Agent 主链的旧产品面、诊断面、低频壳能力；最后处理 MCP、Workspace、Knowledge、Agent Runtime。
3. 不把所有旧命令一比一迁到 App Server。业务事实源进 App Server；窗口、shell、录音设备、CDP、系统打开等进 Electron Desktop Host；无产品入口的旧面直接判 `dead`。

当前基线：

- Rust `#[tauri::command]`：当前快照约 490 个，分布在 74 个文件。
- `lime-rs/src/app/runner.rs` `generate_handler!`：当前快照约 513 个注册。
- Rust `DevBridge dispatcher`：约 147 个字符串命令，分布在 17 个 dispatcher 文件。
- 工作树已有大量共享脏写集；执行本队列前必须先重新做只读基线并认领窄写集。

硬边界：

- `lime-rs/src/commands/**` 是旧 Tauri command wrapper 删除清理区，不再落新的业务逻辑、API adapter、runtime 分支、领域服务实现、compat wrapper 或退场 stub。
- 该目录只允许做旧 wrapper 删除、撤 runner / DevBridge dispatcher / catalog / mock 注册后的机械编译修复，或记录无法删除的 blocker。
- 新 Rust 后端能力必须落到 App Server crates / RuntimeCore / services 等 current 事实源；桌面壳能力落到 Electron Desktop Host。
- 任一子任务若发现必须在 `lime-rs/src/commands/**` 新增逻辑、保留 stub 或新增薄委托，默认判定为任务拆分错误，应改为迁 App Server / Electron Host、直接撤旧注册，或只登记 blocker。

## 多进程分配规则

本文件用于多个进程并行认领清理任务。每个进程启动后只做一件事：选一个未认领 Task ID，追加认领记录，然后只修改自己声明的写集。

启动协议：

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --cached --name-only
```

认领规则：

- 一个进程一次只认领一个 Task ID。
- 没有在本文件追加认领记录的进程，只能只读调研，不能写代码。
- 认领记录只能追加，不能改写别的进程已有记录。
- 发现目标文件已被其它进程修改，立即放弃该 Task ID，改选其它未冲突任务。
- 触碰 `runner.rs`、`dev_bridge/dispatcher.rs`、`commandPolicy.ts`、`agentCommandCatalog.json`、`scripts/check-*-contract.mjs` 时，默认视为共享写集，不能和其它任务夹写。
- 删除文件、批量迁移或大范围格式化必须单独确认；本队列优先做小额清理。

认领记录模板：

```text
- 2026-06-08 <进程名> <Task ID> 认领
  - 写集：<精确文件列表>
  - 只读参考：<文件或目录>
  - 避让：<当前不得触碰的共享文件>
  - 目标：<本轮最小闭环>
  - 验证：<命令列表>
  - 启动基线：<git status 摘要>
  - 状态：claimed | in_progress | blocked_conflict | ready_for_review | done | abandoned
```

完成记录模板：

```text
- 2026-06-08 <进程名> <Task ID> 完成
  - 清理结果：<deleted | removed-from-runner | removed-from-devbridge | guard-added | compat-delegates-only>
  - 旧入口搜索：<rg 命令与结论>
  - 验证结果：<命令与结果>
  - 剩余阻塞：<无 / 具体文件与原因>
```

## 快速分配表

| Task ID                                  | 优先级 | 可并行性                   | 难度   | 重要性 | 推荐写集                                                                          | 避让写集                                       | 目标                                                        |
| ---------------------------------------- | ------ | -------------------------- | ------ | ------ | --------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| TW-Q0-INVENTORY                          | 1      | 可单独并行                 | 低     | 低     | 新增 inventory 报告或治理测试                                                     | `runner.rs`、App Server protocol 热区          | 输出机械 command 对照，给后续进程减少重复扫描               |
| TW-Q1-DOCS-SMOKE                         | 2      | 可并行                     | 低     | 低     | `internal/**`、`scripts/electron/current-docs-guard.test.mjs`、相关 smoke fixture | App Server protocol、Rust commands             | 清 current 文档 / smoke 里的旧 Tauri 证据                   |
| TW-Q2-DEAD-NAMES                         | 3      | 可并行调研，写入需拆子任务 | 低到中 | 低     | 旧命令所在前端 / mock / runner / dispatcher 精确文件                              | 当前已脏共享文件                               | 清零引用或已下线旧命令族                                    |
| TW-Q3A-DEVBRIDGE-MODELS                  | 4      | 可并行                     | 中     | 低     | `lime-rs/src/dev_bridge/dispatcher/models.rs`、必要 guard                         | `commandPolicy.ts` 若已被占用                  | 清 models dispatcher 已 current 分支                        |
| TW-Q3B-DEVBRIDGE-PROJECT-RESOURCES       | 4      | 可并行                     | 中     | 低     | `lime-rs/src/dev_bridge/dispatcher/project_resources.rs`、必要 guard              | `commandPolicy.ts` 若已被占用                  | 清 materials / project resources dispatcher 已 current 分支 |
| TW-Q3C-DEVBRIDGE-APP-RUNTIME             | 4      | 可并行                     | 中     | 低到中 | `lime-rs/src/dev_bridge/dispatcher/app_runtime.rs`、必要 guard                    | config / logs 共享写集                         | 清 config / diagnostics 旧 dispatcher 分支                  |
| TW-Q4A-WINDOW-SHELL                      | 5      | 需避开 Electron host 热区  | 中     | 低到中 | `window_cmd.rs`、Electron window API / tests                                      | `electron/hostCommands.ts` 若已被占用          | 把窗口壳能力收回 Electron Host                              |
| TW-Q4B-EXTERNAL-TOOLS-SHELL              | 5      | 可并行                     | 中     | 低到中 | `external_tools_cmd.rs`、`src/lib/api/externalUrl.ts`、Electron shell tests       | App Server protocol                            | 清外部打开 / CLI login shell wrapper                        |
| TW-Q5A-KNOWLEDGE-READ                    | 6      | 当前易冲突                 | 中     | 中     | `knowledge_cmd.rs`、knowledge API / tests / mocks                                 | `local_data_source.rs`、protocol 热区若未释放  | 清已 current 的 knowledge 读链旧入口                        |
| TW-Q5B-MODEL-READ                        | 6      | 可并行                     | 中     | 中     | `model_registry_cmd.rs`、models API / mocks / dispatcher                          | `commandPolicy.ts` 若已被占用                  | 清 model registry 读链旧入口                                |
| TW-Q5C-AGENT-APP-READ                    | 6      | 当前易冲突                 | 中     | 中     | `agent_app_cmd.rs`、Agent Apps API / UI tests                                     | Agent Apps 页面热区若未释放                    | 清 Agent App installed / UI runtime 读链残留                |
| TW-Q6-SESSION-FILES                      | 7      | 可并行但需 App Server 判断 | 中     | 中     | `session_files_cmd.rs`、session files API / mocks                                 | App Server protocol 热区                       | 清 session file 读写残留                                    |
| TW-Q7-CONFIG-LOGS-DIAG                   | 8      | 可并行拆分                 | 中     | 中     | config / logs / diagnostics API 与 Rust wrapper                                   | `app/commands/config.rs` 若被占用              | 拆分配置、日志、诊断 current owner                          |
| TW-Q8-BROWSER-WEBVIEW                    | 9      | 建议单进程                 | 中到高 | 中     | `webview_cmd.rs`、browser dispatcher、`src/lib/webview-api.ts`                    | Electron host 热区                             | 清 Browser / Webview / CDP / Profile wrapper                |
| TW-Q9-VOICE-ASR                          | 10     | 可并行                     | 中到高 | 中到高 | voice / ASR API、dispatcher voice、desktop-host voice mocks                       | 录音设备 / Electron host 热区                  | 拆分录音设备与 ASR service current owner                    |
| TW-Q10-SKILLS                            | 11     | 建议单进程                 | 高     | 中到高 | `skill_cmd.rs`、`dispatcher/skills.rs`、skills API / mocks                        | Agent Runtime tool runtime                     | 清 Skill catalog / package / marketplace wrapper            |
| TW-Q11-MCP                               | 12     | 当前易冲突                 | 高     | 高     | `mcp_cmd.rs`、MCP API / App Server protocol / tests                               | App Server protocol 热区                       | 完成 MCP current 化并撤旧 wrapper                           |
| TW-Q12-KNOWLEDGE-WORKSPACE-CONTENT-WRITE | 13     | 建议单进程                 | 高     | 高     | knowledge / workspace / content API、Rust wrappers、App Server protocol           | App Server protocol 热区                       | 迁写链并清旧入口                                            |
| TW-Q13-MEMORY                            | 14     | 建议单进程                 | 高     | 高     | memory / unifiedMemory / memoryRuntime API 与 Rust wrappers                       | RuntimeCore / workspace 文件系统热区           | 迁 Memory / Unified Memory / Project Memory                 |
| TW-Q14-AGENT-APP-RUNTIME                 | 15     | 当前易冲突                 | 高     | 高     | agent app runtime API、Rust wrappers、Agent Apps UI                               | Agent Apps 页面热区                            | 迁 Agent App task / UI runtime 旧 facade                    |
| TW-Q15-AGENT-RUNTIME                     | 16     | 不建议作为快速清理并行项   | 最高   | 最高   | App Server runtime、agentRuntime clients、Aster runtime core                      | `runtime_turn/**`、tool runtime、protocol 热区 | 逐条迁 Agent Runtime residual                               |

推荐并行启动方式：

- 第一批：`TW-Q1-DOCS-SMOKE`、`TW-Q2-DEAD-NAMES`、`TW-Q3A-DEVBRIDGE-MODELS`、`TW-Q3B-DEVBRIDGE-PROJECT-RESOURCES`。
- 第二批：`TW-Q4B-EXTERNAL-TOOLS-SHELL`、`TW-Q5B-MODEL-READ`、`TW-Q6-SESSION-FILES`、`TW-Q9-VOICE-ASR`。
- 第三批：`TW-Q8-BROWSER-WEBVIEW`、`TW-Q10-SKILLS`、`TW-Q11-MCP`、`TW-Q12-KNOWLEDGE-WORKSPACE-CONTENT-WRITE`。
- 最后处理：`TW-Q15-AGENT-RUNTIME`，它是主线迁移，不是快速清理。

## 认领记录

- 2026-06-08 Codex TW-Q2-FILE-UPLOAD-WRAPPER 认领
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/file_upload_cmd.rs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`src`、`electron`、`packages`、`scripts`、`internal/exec-plans/production-command-current-migration-plan.md`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：删除已无正向入口的 `upload_avatar` / `delete_avatar` 旧 Tauri wrapper，减少 `lime-rs/src/commands/**` 清理区存量。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`node scripts/check-command-contracts.mjs`
  - 启动基线：工作树已有大量并行脏写集；`runner.rs` / `mod.rs` 为共享脏文件，本轮只删除目标命令注册和模块声明。
  - 状态：done

- 2026-06-08 Codex TW-Q2-FILE-UPLOAD-WRAPPER 完成
  - 清理结果：`deleted`；`lime-rs/src/commands/file_upload_cmd.rs` 已删除，`commands::file_upload_cmd::{upload_avatar, delete_avatar}` 已从 `runner.rs` 注册撤掉，`commands/mod.rs` 已移除模块声明。
  - 旧入口搜索：`rg -n "upload_avatar|delete_avatar|file_upload_cmd|commands::file_upload_cmd|pub mod file_upload_cmd" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 无命中。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；`node scripts/check-command-contracts.mjs` 通过，frontend commands `121`、Electron host commands `100`、mock priority commands `0`、DevBridge truth commands `120`。
  - 剩余阻塞：无；完整 `npm run test:contracts` 可在本轮其它共享写集稳定后复跑。

- 2026-06-08 Codex TW-Q2-PERSONA-WRAPPER 认领
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/persona_cmd.rs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`lime-rs/src/services/runtime_auxiliary_projection_service.rs`、`lime-rs/src/services/runtime_evidence_auxiliary_runtime_service.rs`、`src`、`electron`、`packages`、`scripts`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：删除已退场的项目人设 Tauri command 旧实现，保留 Runtime auxiliary persona projection current 业务语义。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`node scripts/check-command-contracts.mjs`
  - 启动基线：`persona_cmd.rs` 仍为完整旧 DB / Agent 生成 wrapper；前端 / Electron / packages / scripts 无同名正向调用，业务 persona projection 只通过 `auxiliary.generate_persona` route 留在 runtime services。
  - 状态：done

- 2026-06-08 Codex TW-Q2-PERSONA-WRAPPER 完成
  - 清理结果：`deleted`；`lime-rs/src/commands/persona_cmd.rs` 已删除，9 条 `commands::persona_cmd::*` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明。
  - 旧入口搜索：`rg -n "commands::persona_cmd|pub mod persona_cmd|\\b(create_persona|list_personas|get_persona|update_persona|delete_persona|set_default_persona|list_persona_templates|get_default_persona|generate_persona)\\b" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 只剩 runtime services 中的 `auxiliary.generate_persona` route / tests，不再有 Tauri command 或前端调用。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；`node scripts/check-command-contracts.mjs` 通过，frontend commands `121`、Electron host commands `100`、mock priority commands `0`、DevBridge truth commands `120`。
  - 剩余阻塞：无；`auxiliary.generate_persona` 是 Runtime evidence / projection current 语义，不属于旧 Tauri command 残留。

- 2026-06-08 Codex TW-Q1-DOCS-SMOKE 认领
  - 写集：`internal/roadmap/agentui/README.md`、`internal/roadmap/agentui/lime-agentui-target-architecture.md`、`internal/roadmap/agentui/lime-agentui-code-map.md`、`internal/roadmap/agentui/lime-agentui-backend-coordination.md`、`internal/roadmap/agentui/lime-agentui-implementation-roadmap.md`、`internal/roadmap/agentui/conversation-projection-implementation-plan.md`、`scripts/electron/current-docs-guard.test.mjs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`internal/roadmap/appserver/frontend-electron-migration.md`、`internal/aiprompts/commands.md`
  - 避让：App Server protocol、Rust commands、`electron/hostCommands.ts`、`electron/ipcChannels.ts`、`lime-rs/src/app/runner.rs`、`lime-rs/src/dev_bridge/dispatcher/**`
  - 目标：清掉 AgentUI current 文档里把旧 Tauri command 当主链证据的表述，并补 current docs guard 防回流。
  - 验证：`node --check "scripts/electron/current-docs-guard.test.mjs"`、`npm test -- "scripts/electron/current-docs-guard.test.mjs"`、定向 `rg`
  - 启动基线：工作树已有大量并行脏写集；本轮目标写集启动时均未被修改。
  - 状态：done

- 2026-06-08 Codex TW-Q1-DOCS-SMOKE 完成
  - 清理结果：`guard-added`；AgentUI current 文档不再把旧 Tauri command / bridge 表述为 current command gateway。
  - 旧入口搜索：`rg -n "Tauri Commands|Tauri Command 层|Tauri command 主入口|RuntimeApi --> Tauri|Api --> Tauri|Tauri --> AgentCrate|Tauri --> Services|任何新增或修改 Tauri command 必须同步四侧|runtime command \\+ DAO|Tauri command / bridge|协议、Tauri command" "internal/roadmap/agentui"` 无命中。
  - 验证结果：`node --check "scripts/electron/current-docs-guard.test.mjs"` 通过；`npm test -- "scripts/electron/current-docs-guard.test.mjs"` 通过，12 tests passed；定向 `git diff --check` 通过。
  - 剩余阻塞：无；`.gitignore` 已补 `!internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`，本文件可被 Git 追踪。

- 2026-06-08 main TW-Q3D-DEVBRIDGE-EMPTY-MODULES 认领
  - 写集：`lime-rs/src/dev_bridge/dispatcher.rs`、`lime-rs/src/dev_bridge/dispatcher/channels.rs`、`lime-rs/src/dev_bridge/dispatcher/companion.rs`、`lime-rs/src/dev_bridge/dispatcher/external_tools.rs`、`lime-rs/src/dev_bridge/dispatcher/tray.rs`
  - 只读参考：`lime-rs/src/dev_bridge/dispatcher/**`
  - 避让：`runner.rs`、App Server protocol、Electron host、Agent Runtime、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：删除只返回 `Ok(None)` 的空 dispatcher 模块，减少 DevBridge 分发噪音。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check "lime-rs/src/dev_bridge/dispatcher.rs"`、`git diff --check -- "lime-rs/src/dev_bridge/dispatcher.rs"`
  - 启动基线：目标空模块未出现在 `git status --short`，`dispatcher.rs` 已有共享脏写集，本轮只移除空模块声明和空调用。
  - 状态：ready_for_review

- 2026-06-08 main TW-Q3D-DEVBRIDGE-EMPTY-MODULES 完成
  - 清理结果：deleted empty dispatcher files；removed-from-devbridge empty route calls。
  - 旧入口搜索：`rg -n "mod (channels|companion|external_tools|tray)|channels::try_handle|companion::try_handle|external_tools::try_handle|tray::try_handle" "lime-rs/src/dev_bridge"` 无命中。
  - 验证结果：`rustfmt --edition 2021 --check "lime-rs/src/dev_bridge/dispatcher.rs"` 通过；`git diff --check -- "lime-rs/src/dev_bridge/dispatcher.rs"` 通过。
  - 剩余阻塞：`lime-rs/src/dev_bridge/dispatcher.rs` 是共享脏文件，后续真实 command 分支清理需要继续按窄写集认领。

- 2026-06-08 subagent-models TW-Q3A-DEVBRIDGE-MODELS blocked_conflict
  - 写集：未写入。
  - 只读结论：`lime-rs/src/dev_bridge/dispatcher/models.rs` 已有 staged 修改，当前只剩 `get_models`、`refresh_model_registry`、`get_model_registry_provider_ids`；`get_model_registry`、`get_model_preferences`、`get_model_sync_state`、`get_all_alias_configs`、`get_provider_alias_config` 已从该 dispatcher 分支移除。
  - 阻塞：`src/lib/dev-bridge/commandPolicy.ts` 和 `src/lib/governance/agentCommandCatalog.json` 均为 `MM`，不能夹写同步 truth / catalog。
  - 验证结果：`git diff --cached --check -- "lime-rs/src/dev_bridge/dispatcher/models.rs"` 通过；`npm run governance:legacy-report` 通过；`npm run test:contracts` 失败于既有 Knowledge / desktop-host guard，不属于本任务写集。

- 2026-06-08 subagent-project-resources TW-Q3B-DEVBRIDGE-PROJECT-RESOURCES blocked_conflict
  - 写集：未写入。
  - 只读结论：`lime-rs/src/dev_bridge/dispatcher/project_resources.rs` 仍有 `list_materials`、`get_material_count`、`upload_material`；`src/lib/api/materials.ts` 仍通过 `safeInvoke(...)` 调这些命令。
  - 阻塞：`project_resources.rs` 已脏，且 `commandPolicy.ts` / `agentCommandCatalog.json` 均为 `MM`，不能夹写。
  - 验证结果：`git diff --check -- "lime-rs/src/dev_bridge/dispatcher/project_resources.rs"` 通过。

- 2026-06-08 main TW-Q0-SHARED-HEATMAP 只读复核
  - 写集：`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读结论：当前 `runner.rs`、`commandPolicy.ts`、`agentCommandCatalog.json`、`scripts/check-command-contracts.mjs` 仍是共享脏写集；多数可疑 Rust command 删除都需要同步这些事实源，不适合作为无人协调的快删项。
  - 低引用候选：`fetch_provider_models_from_api`、`start_telegram_remote`、`stop_telegram_remote`、`get_telegram_remote_status`、`update_last_check_timestamp`、`get_sysinfo` 仅被 `runner.rs` 直接引用，但因 `runner.rs` 当前为 `MM`，本轮不夹写。
  - 结论：后续进程若要继续快清，应优先选新的未脏守卫 / 文档切片，或等待共享写集释放后再处理低引用 command。
  - 状态：ready_for_review

- 2026-06-08 main TW-Q0-INVENTORY 认领
  - 写集：`internal/exec-plans/tauri-wrapper-command-inventory.md`、`.gitignore`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`lime-rs/src/app/runner.rs`、`lime-rs/src/dev_bridge/**`、`lime-rs/src/commands/**`、`src/lib/api/**`、`electron/**`、`packages/app-server-client/**`
  - 避让：`runner.rs`、App Server protocol、Electron host、Agent Runtime、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：落一份机械 inventory 快照，帮助后续进程按命令族拆分清理，不重复扫描。
  - 验证：`rg` 计数复核、`git diff --check`
  - 启动基线：工作树已有大量并行脏写集；本轮只新增 inventory 文档并补 `.gitignore` 白名单。
  - 状态：done

- 2026-06-08 main TW-Q0-INVENTORY 完成
  - 清理结果：`guard-added` / `inventory-added`；新增 `internal/exec-plans/tauri-wrapper-command-inventory.md`，记录 Tauri command、runner、DevBridge、前端 invoke 与 App Server method 的机械对照。
  - 旧入口搜索：`rg -n "#\\[tauri::command" "lime-rs/src" -g "*.rs" | wc -l` 当前为 `490`；inventory 明确 `low-reference` / `devbridge-only` 只是辅助信号，不直接等于 `dead`。
  - 验证结果：`git diff --check -- ".gitignore" ".codex/skills/lime-command-boundary/references/commands.md" "internal/aiprompts/commands.md" "internal/exec-plans/tauri-wrapper-command-inventory.md" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md" "internal/roadmap/agentapp/p17-formal-entry-contract.md" "internal/roadmap/agentapp/p17-lifecycle-cleanup-contract-hardening.md" "internal/roadmap/agentapp/p18-typed-capability-sdk-gate.md" "internal/roadmap/agentapp/p18-7-full-lime-capability-surface.md" "internal/roadmap/agentapp/p17-4-host-bridge-runtime.md" "internal/roadmap/agentui/html-preview-provider-readiness-20260526.md" "internal/roadmap/agentui/lime-agentui-standard-alignment.md"` 通过。
  - 剩余阻塞：真正删除低引用命令仍需等待 `runner.rs`、`commandPolicy.ts`、`agentCommandCatalog.json` 等共享写集释放。

- 2026-06-08 main TW-Q0-COMMANDS-DIR-FREEZE 认领
  - 写集：`AGENTS.md`、`internal/aiprompts/commands.md`、`.codex/skills/lime-command-boundary/references/commands.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`、`internal/exec-plans/tauri-wrapper-command-inventory.md`
  - 只读参考：`AGENTS.md`、`internal/aiprompts/governance.md`
  - 避让：`lime-rs/src/commands/**`、`runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：明确 `lime-rs/src/commands/**` 只作为旧 Tauri wrapper 清理区，不再落新业务逻辑。
  - 验证：`rg` 规则命中、`git diff --check`
  - 启动基线：目标规则文件未出现在 `git status --short`；队列与 inventory 为本轮新增未跟踪文件。
  - 状态：done

- 2026-06-08 main TW-Q0-COMMANDS-DIR-FREEZE 完成
  - 清理结果：`guard-added`；根 `AGENTS.md`、命令边界文档、skill 参考、清理队列和 inventory 均写明 `lime-rs/src/commands/**` 不再承接新逻辑。
  - 旧入口搜索：`rg -n "lime-rs/src/commands/\\*\\*.*清理区|不再承接新的业务逻辑|不再落新的业务逻辑|新增业务逻辑、API adapter" "AGENTS.md" "internal/aiprompts/commands.md" ".codex/skills/lime-command-boundary/references/commands.md" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md" "internal/exec-plans/tauri-wrapper-command-inventory.md"` 命中 9 处。
  - 验证结果：定向 `git diff --check` 通过。
  - 剩余阻塞：仍需后续把现有 wrapper 按领域迁出或删除；本条只封新增方向。

- 2026-06-08 main TW-Q0-COMMANDS-DIR-HARD-FREEZE 完成
  - 写集：`AGENTS.md`、`internal/aiprompts/commands.md`、`.codex/skills/lime-command-boundary/references/commands.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`、`internal/exec-plans/tauri-wrapper-command-inventory.md`
  - 清理结果：`guard-hardened`；`lime-rs/src/commands/**` 规则从“可保留薄委托 / 退场包装”收紧为“只删旧 wrapper、撤注册、做机械编译修复，删不动就登记 blocker”。
  - 旧入口搜索：`rg -n "只允许.*薄|只允许.*stub|只允许.*兼容委托|保留带退出条件|收窄带退出条件|收窄为委托" ...` 无命中；`rg -n "deprecated_.*command|DEPRECATED_.*COMMAND|已退场|legacy Tauri command|退场" "lime-rs/src/commands"` 命中现有 command stub 化 diff，作为后续撤注册 / 删除 blocker，不在本轮夹写。
  - 验证结果：`git diff --check -- "AGENTS.md" "internal/aiprompts/commands.md" ".codex/skills/lime-command-boundary/references/commands.md" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md" "internal/exec-plans/tauri-wrapper-command-inventory.md"` 通过。
  - 剩余阻塞：当前 `lime-rs/src/commands/**` 已有大量并行脏 diff，部分文件被改成 deprecated stub；本轮不夹写这些共享文件，后续应按命令族直接撤 runner / dispatcher / catalog / mock 后删除，而不是继续补 stub。

- 2026-06-08 main TW-Q0-COMMANDS-DIR-STUB-GUARD 认领
  - 写集：`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`lime-rs/src/commands/**`、`internal/aiprompts/commands.md`、`.codex/skills/lime-command-boundary/references/commands.md`
  - 避让：`lime-rs/src/commands/**`、`lime-rs/src/app/runner.rs`、App Server protocol、Electron host、`src/lib/governance/agentCommandCatalog.json`、`src/lib/dev-bridge/commandPolicy.ts`、`internal/roadmap/appserver/**`
  - 目标：补一个不碰共享热区的 guard，把当前已存在的 deprecated/fail-closed command stub 文件登记成待删基线，禁止继续在 `lime-rs/src/commands/**` 新增同类 stub 文件。
  - 验证：`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept`、`npx eslint --max-warnings 0 "src/lib/governance/rustCommandsCurrentBoundary.test.ts"`、`git diff --check`
  - 启动基线：`runner.rs`、`agentCommandCatalog.json`、`commandPolicy.ts`、App Server protocol、Electron host 与 App Server roadmap 文档均为并行脏写集；本轮不夹写。
  - 状态：done

- 2026-06-08 main TW-Q0-COMMANDS-DIR-STUB-GUARD 完成
  - 清理结果：`guard-added`；`rustCommandsCurrentBoundary.test.ts` 现在把当前已出现的 deprecated/fail-closed command stub 文件当作待删上限，允许后续减少，但禁止在 `lime-rs/src/commands/**` 新增同类 stub 文件。
  - 旧入口搜索：`node` 脚本扫描 `lime-rs/src/commands/**/*.rs` 的 `DEPRECATED_*COMMAND` / `deprecated_*command` / `fail-closed 退场面` / `legacy Tauri command` 命中 19 个现有 stub 文件；这些文件仍是后续撤 runner / dispatcher / catalog / mock 后删除的 blocker，不是完成态。
  - 验证结果：`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，4 tests；`npx eslint --max-warnings 0 "src/lib/governance/rustCommandsCurrentBoundary.test.ts"` 通过；`git diff --check` 通过。
  - 剩余阻塞：`runner.rs`、`agentCommandCatalog.json`、`commandPolicy.ts`、App Server protocol、Electron host 与 App Server roadmap 文档仍为并行共享脏写集；本轮未物理删除 command wrapper。

- 2026-06-08 main TW-Q0-COMMAND-SKILL-STUB-RULE 认领
  - 写集：`.codex/skills/lime-command-boundary/references/commands.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`internal/aiprompts/commands.md`
  - 避让：`lime-rs/src/commands/**`、`runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：同步命令边界 skill 参考文件的明确禁止项，避免后续 Agent 从 skill 读取到“只禁止业务逻辑但未禁止 compat wrapper / 退场 stub”的旧口径。
  - 验证：定向 `rg`、`git diff --check`
  - 启动基线：目标 skill 参考文件未出现在 `git status --short`；共享热区仍为并行脏写集。
  - 状态：done

- 2026-06-08 main TW-Q0-COMMAND-SKILL-STUB-RULE 完成
  - 清理结果：`guard-hardened`；`.codex/skills/lime-command-boundary/references/commands.md` 的“明确禁止”段已同步禁止在 `lime-rs/src/commands/**` 新增 compat wrapper / 退场 stub。
  - 旧入口搜索：`rg -n '在 `lime-rs/src/commands/\*\*` 新增业务逻辑' "internal/aiprompts/commands.md" ".codex/skills/lime-command-boundary/references/commands.md"` 两处一致命中。
  - 验证结果：`git diff --check -- ".codex/skills/lime-command-boundary/references/commands.md" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md"` 通过。
  - 剩余阻塞：skill 本体仍需同步 `lime-rs/src/commands/**` 硬禁区，避免只读 `SKILL.md` 的 Agent 漏读 references 后沿旧 compat 口径行动。

- 2026-06-08 main TW-Q0-COMMAND-SKILL-BODY-RULE 认领
  - 写集：`.codex/skills/lime-command-boundary/SKILL.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`.codex/skills/lime-command-boundary/references/commands.md`、`internal/aiprompts/commands.md`
  - 避让：`lime-rs/src/commands/**`、`runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：让 skill 本体直接携带 `lime-rs/src/commands/**` 删除清理区规则，减少后续 Agent 漏读 reference 时继续补 compat wrapper / stub 的风险。
  - 验证：定向 `rg`、`git diff --check`
  - 启动基线：目标 skill 本体未出现在 `git status --short`；共享热区仍为并行脏写集。
  - 状态：done

- 2026-06-08 main TW-Q0-COMMAND-SKILL-BODY-RULE 完成
  - 清理结果：`guard-hardened`；`.codex/skills/lime-command-boundary/SKILL.md` 本体已直接写明 `lime-rs/src/commands/**` 是旧 Tauri wrapper 删除清理区，禁止新增业务逻辑、API adapter、runtime 分支、领域服务实现、compat wrapper 或退场 stub。
  - 旧入口搜索：`rg` 命中 skill 本体、skill reference 和仓库 `internal/aiprompts/commands.md` 的同一硬边界；后续 Agent 即使只读 skill 本体也会看到 `commands/**` 禁区。
  - 验证结果：`git diff --check -- ".codex/skills/lime-command-boundary/SKILL.md" ".codex/skills/lime-command-boundary/references/commands.md" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md"` 通过。
  - 剩余阻塞：这仍是守卫收口，不替代物理删除；当前 `runner.rs` / catalog / commandPolicy / Electron-App Server protocol 热区未释放。

- 2026-06-08 main TW-Q1-AGENTAPP-AGENTUI-DOC-TERMS 认领
  - 写集：`internal/roadmap/agentapp/p17-formal-entry-contract.md`、`internal/roadmap/agentapp/p17-lifecycle-cleanup-contract-hardening.md`、`internal/roadmap/agentapp/p18-typed-capability-sdk-gate.md`、`internal/roadmap/agentapp/p18-7-full-lime-capability-surface.md`、`internal/roadmap/agentapp/p17-4-host-bridge-runtime.md`、`internal/roadmap/agentui/html-preview-provider-readiness-20260526.md`、`internal/roadmap/agentui/lime-agentui-standard-alignment.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`internal/aiprompts/commands.md`、子代理只读文档残留报告
  - 避让：`lime-rs/src/commands/**`、`runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：清掉 Agent App / AgentUI current 计划中把新增能力表述为 Tauri command / Rust registration 的误导，改为 Electron Desktop Host / App Server / legacy facade 边界。
  - 验证：定向 `rg`、`git diff --check`
  - 启动基线：目标 roadmap 文件启动时未出现在 `git status --short`；仅队列和 inventory 为本轮新增未跟踪文件。
  - 状态：done

- 2026-06-08 main TW-Q1-AGENTAPP-AGENTUI-DOC-TERMS 完成
  - 清理结果：`deprecated docs evidence`；P17 / P18 / AgentUI current 语境不再要求新增或修改 Tauri command / Rust registration，统一改成 Electron Desktop Host IPC / App Server JSON-RPC / legacy desktop facade 命令边界；HTML 预览文档把旧 Tauri asset protocol 降级为 deprecated reference。
  - 旧入口搜索：`rg -n "修改 Tauri command|改动 Tauri command|引入或修改 Tauri command|新增 Tauri command|专用 Tauri command|平行 Tauri command|Tauri bridge command|直接 Tauri|Tauri / raw Worker|允许集中调用 Tauri command|在 Tauri 中|Tauri 本地文件预览|Rust 注册" ...` 无命中；剩余 `assetProtocol` / `WebviewWindow` / `convertFileSrc` 仅在 `deprecated reference` 外部依据段落。
  - 验证结果：`node --check "scripts/electron/current-docs-guard.test.mjs"` 通过；`npm test -- "scripts/electron/current-docs-guard.test.mjs"` 通过，12 tests；`npm run governance:legacy-report` 通过，边界违规 0；定向 `git diff --check` 通过。
  - 剩余阻塞：历史实施记录里“未新增 Tauri command”的过去事实仍保留；不作为 current 迁移指引。

- 2026-06-08 main TW-Q1-KNOWLEDGE-RUNTIME-DOC-TERMS 认领
  - 写集：`internal/roadmap/knowledge/prd.md`、`internal/roadmap/agentruntime/test-cases.md`、`internal/roadmap/agentruntime/architecture.md`、`internal/roadmap/agentruntime/implementation-plan.md`、`internal/roadmap/memory/acceptance.md`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`internal/aiprompts/commands.md`、`internal/aiprompts/governance.md`
  - 避让：`lime-rs/src/commands/**`、`runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：清掉 Knowledge / AgentRuntime / Memory current 计划中把命令边界写成 Tauri command / Rust generate_handler / tauri-mock 的误导。
  - 验证：定向 `rg`、`git diff --check`
  - 启动基线：目标 roadmap 文件启动时未出现在 `git status --short`；共享热区仍为 `MM`，本轮不夹写。
  - 状态：done

- 2026-06-08 main TW-Q1-KNOWLEDGE-RUNTIME-DOC-TERMS 完成
  - 清理结果：`deprecated docs evidence`；Knowledge / AgentRuntime / Memory current 规划不再把命令边界描述为新增或验证 Tauri command / Rust `generate_handler` / tauri-mock，而是收敛到 App Server / Electron Host / legacy facade 边界。
  - 旧入口搜索：`rg -n 'Tauri command|Tauri commands|tauri::generate_handler|src/lib/tauri-mock|新增 Tauri command|修改 Tauri|若新增 Tauri|如果新增 Tauri|必须同步.*Tauri|Tauri 壳|Rust `generate_handler`|Rust handler|Rust 注册' "internal/roadmap/knowledge/prd.md" "internal/roadmap/agentruntime/test-cases.md" "internal/roadmap/agentruntime/architecture.md" "internal/roadmap/agentruntime/implementation-plan.md" "internal/roadmap/memory/acceptance.md"` 无命中。
  - 验证结果：定向 `git diff --check` 通过；后续补 `current-docs-guard` / `governance:legacy-report` 结果。
  - 剩余阻塞：其他历史 roadmap 中仍有“未新增 Tauri command”等过去事实记录；本条只清 current 规划 / 测试口径。

## 快速清理通用退出条件

每个条目只有同时满足下列条件，才能从队列中移除：

- `rg` 证明生产入口不再引用旧命令名。
- 对应 `runner.rs` 注册已删除，或有明确 compat 退出条件。
- 对应 `lime-rs/src/dev_bridge/dispatcher/**` 分支已删除，或只剩 test-only / compat delegate。
- `src/lib/dev-bridge/commandPolicy.ts`、`agentCommandCatalog.json`、desktop-host mock / legacy mock 没有把旧命令重新当 current。
- 至少跑最近的 contract / lint / doc check；涉及命令边界时跑 `npm run test:contracts`。

## 队列

### Q0：只读 inventory 与守卫补齐

难度：低  
重要性：低  
分类：`current guard`

可先做：

- 生成并提交一份机械 inventory：`#[tauri::command]`、`runner.rs` 注册、DevBridge dispatcher、前端 `safeInvoke`、Electron Host 白名单、App Server methods 对照。
- 给 `scripts/check-command-contracts.mjs` 或独立治理测试补统计阈值，防止已清命令回流。

为什么先做：

- 不改业务逻辑。
- 能把后续每一刀的删除范围变成可验证事实。

验证：

```bash
node scripts/check-command-contracts.mjs
npm run test:contracts
```

### Q1：文档 / smoke / 测试 fixture 里的旧 Tauri 证据

难度：低  
重要性：低  
分类：`dead / deprecated docs evidence`

候选：

- current 文档中仍把 `tauri dev`、`headless Tauri`、`Tauri GUI smoke` 当可交付证据的残留。
- smoke summary / process owner 里只用于旁路观测的旧 Tauri runtime 字段。
- standalone artifact adapter、旧 package materializer、旧 `src-tauri` 命名 fixture。

执行口径：

- current 文档和 current smoke 只允许写 Electron Desktop Host / App Server。
- 旧 Tauri 只允许出现在 `deprecated` / `dead guard` 语境。

验证：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/electron/current-docs-guard.test.mjs" "scripts/electron/current-entrypoints.test.mjs"
rg -n "tauri dev|headless Tauri|Tauri GUI smoke|src-tauri" "internal" "scripts"
```

### Q2：零引用或已下线产品线的旧命令名

难度：低到中  
重要性：低  
分类：`dead`

优先候选：

- 旧 Plugin / SceneApp 命令族：`plugin_*`、`sceneapp_*`。
- 旧设置页安全 / 性能命令：`get_retry_config`、`update_retry_config`、`get_failover_config`。
- 旧 provider helper：`fetch_provider_models_auto` 等无 current 入口的 helper。
- 已经不在前端 current 入口出现的 demo / diagnostic / one-off command。

执行口径：

- 不迁成 compat。
- 直接删前端入口、runner 注册、DevBridge dispatcher、mock / catalog 残留。
- 如果只剩文档历史记录，不改历史计划正文，只补 current guard。

验证：

```bash
rg -n "<旧命令名>" "src" "electron" "lime-rs/src" "packages" "scripts"
npm run test:contracts
```

### Q3：已 current 覆盖的 DevBridge dispatcher 分支

难度：中  
重要性：低到中  
分类：`deprecated -> dead`

优先候选：

- `lime-rs/src/dev_bridge/dispatcher/models.rs`
  - `get_models`
  - `get_model_registry_provider_ids`
  - `refresh_model_registry`
- `lime-rs/src/dev_bridge/dispatcher/project_resources.rs`
  - `list_materials`
  - `get_material_count`
  - `upload_material`
- `lime-rs/src/dev_bridge/dispatcher/memory.rs`
  - `unified_memory_list`
- `lime-rs/src/dev_bridge/dispatcher/app_runtime.rs`
  - `get_config`
  - `save_config`
  - `get_server_diagnostics`

为什么靠前：

- dispatcher 分支本身不是 current transport。
- 很多分支只是旧 HTTP debug bridge 的命令分发，不应再作为生产事实源。

注意：

- 删除前必须确认 Electron Host / App Server / frontend gateway 已可真实工作。
- 如果命令仍在 `commandPolicy.ts` 的 DevBridge truth 里，要同步移除或改为 deprecated guard。

验证：

```bash
rg -n "<命令名>" "src" "electron" "lime-rs/src/dev_bridge" "lime-rs/src/app/runner.rs" "scripts"
npm run test:contracts
```

### Q4：纯壳能力的旧 Tauri wrapper

难度：中  
重要性：低到中  
分类：`Desktop Host current`

候选：

- `window_cmd.rs`
  - `get_window_size`
  - `set_window_size`
  - `center_window`
  - `toggle_fullscreen`
  - `is_fullscreen`
- `tray_cmd.rs`
  - `sync_tray_model_shortcuts`
- `external_tools_cmd.rs`
  - `open_external_url`
  - `open_codex_cli_login`
  - `open_codex_cli_logout`
- `config_cmd.rs`
  - `open_config_folder`
  - `open_auth_dir`
  - `expand_path`

执行口径：

- 迁到 Electron Desktop Host，不进 App Server。
- 前端入口放在 `src/lib/desktop-host/*` 或对应 `src/lib/api/*`。
- 清理同名 Tauri command、runner 注册和 DevBridge dispatcher。

验证：

```bash
npx vitest run "electron/hostCommands.test.ts" "electron/ipcChannels.test.ts"
npm run test:contracts
```

### Q5：已 current 的读链残留

难度：中  
重要性：中  
分类：`compat / deprecated -> dead`

候选：

- Knowledge 读链：
  - `knowledge_list_packs`
  - `knowledge_get_pack`
- Workspace 读链：
  - `workspace_list`
  - `workspace_get`
  - `workspace_get_default`
  - `workspace_get_projects_root`
- Model registry 读链：
  - `get_model_registry`
  - `get_model_registry_provider_ids`
  - `search_models`
  - `get_models_for_provider`
- Agent App installed / UI runtime 读链：
  - `agent_app_list_installed`
  - `agent_app_get_ui_runtime_status`

为什么排在 Q5：

- 对用户可见，但多为读链，迁移风险低于写链和 runtime 主链。
- 需要同步前端 API、Electron projection、App Server client / protocol、mock 和 runner，不能只删 Rust。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/knowledge.test.ts" "src/lib/api/modelRegistry.test.ts" "src/lib/api/agentApps.test.ts"
```

### Q6：本地文件和 session file 残留

难度：中  
重要性：中  
分类：`current App Server service / Desktop Host shell split`

候选：

- `file_browser_service.rs`
  - `get_file_name`
- `session_files_cmd.rs`
  - `session_files_resolve_file_path`
  - `session_files_save_file`
  - `session_files_read_file`
  - `session_files_list_files`
- DevBridge `dispatcher/files.rs`
  - layered design export / read / OCR 相关旧分支

执行口径：

- 文件 CRUD / session file metadata 进 App Server / services。
- 打开目录、系统 reveal、默认 App 打开归 Electron Host。
- layered design 文件读写若已有 current gateway，应同轮撤 DevBridge 分支。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/session-files.test.ts" "src/lib/api/fileBrowser.test.ts"
```

### Q7：Config / Logs / Diagnostics 残留

难度：中  
重要性：中  
分类：`split: App Server config service / Electron diagnostics`

候选：

- `app/commands/config.rs`
  - `get_config`
  - `save_config`
  - `get_environment_preview`
  - `get_default_provider`
  - `set_default_provider`
- `app/commands/logs.rs`
  - `get_logs`
  - `clear_logs`
  - `report_frontend_crash`
  - `report_frontend_debug_log`
  - `export_support_bundle`
- `app/commands/server.rs`
  - `get_server_diagnostics`

执行口径：

- 配置事实源若属于 runtime / provider，应收进 App Server 或 services。
- 前端 crash/debug/support bundle 更偏 Electron Desktop Host / diagnostic bridge。
- 不允许 DevBridge health / diagnostic 假装 current Electron-host 证据。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/appConfig.test.ts" "src/lib/api/logs.test.ts" "src/lib/api/frontendCrash.test.ts" "src/lib/api/frontendDebug.test.ts"
```

### Q8：Browser / Webview / CDP / Profile

难度：中到高  
重要性：中  
分类：`Desktop Host / Browser Runtime current`

候选大户：

- `webview_cmd.rs`：约 29 个 Tauri command。
- `browser_connector_cmd.rs`：约 10 个。
- `browser_profile_cmd.rs`：约 5 个。
- `browser_environment_cmd.rs`：约 4 个。
- DevBridge browser dispatcher：`browser/runtime.rs`、`browser/sessions.rs`、`browser/cdp.rs`、`browser/bridge.rs`。

执行口径：

- CDP / browser window / profile launch 属于 Electron Desktop Host 或 Browser Runtime，不进 App Server runtime。
- 先清已 current 的 debug / smoke 分支，再迁真实用户入口。
- 浏览器动作审计、session state、event buffer 需要明确 Browser Runtime 事实源，不能用 DevBridge fallback。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/webview-api.test.ts" "src/lib/desktop-host/browserMocks.test.ts"
```

### Q9：Voice / ASR / Recording / Voice Models

难度：中到高  
重要性：中到高  
分类：`split: Desktop Host device / App Server service`

候选：

- DevBridge `dispatcher/voice.rs`：约 22 个命令。
- `voice_model_cmd.rs`
- `voice_test_cmd.rs`
- `asr_cmd.rs`
- recording start / stop / snapshot / segment / status。

执行口径：

- 录音设备、快捷键、系统麦克风权限归 Electron Desktop Host。
- ASR 凭证、模型目录、转写任务可进入 App Server / services。
- 不允许测试 mock 当生产录音通路。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/asrProvider.test.ts" "src/lib/api/voiceModels.test.ts" "src/lib/desktop-host/voiceMocks.test.ts"
```

### Q10：Skills / Skill Package / Marketplace

难度：高  
重要性：中到高  
分类：`App Server service / Desktop Host shell split`

候选大户：

- `skill_cmd.rs`：约 28 个 command。
- DevBridge `dispatcher/skills.rs`：约 22 个 command。
- `skill_exec_cmd.rs`
- `officialSkillMarketplace` 前端 gateway / desktop-host mocks。

执行口径：

- skill catalog / install / package metadata 进 App Server / services。
- reveal、file association、打开本地包归 Electron Desktop Host。
- `execute_skill` 与 Agent Runtime tool chain 相关，不能和 marketplace 管理混在一刀。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/skills.test.ts" "src/lib/api/skill-execution.test.ts" "src/lib/api/officialSkillMarketplace.test.ts"
```

### Q11：MCP 管理与运行命令

难度：高  
重要性：高  
分类：`App Server current`

候选：

- `mcp_cmd.rs`：约 19 个 command。
- CRUD / import / sync / start-stop / tool-call / prompt-get / resource-read。

执行口径：

- 不修回旧 Tauri in-process bridge。
- MCP server config、tool call、prompt/resource 读写都应走 App Server JSON-RPC。
- list/status 已 current 的部分，迁完后同轮撤 Tauri wrapper 和 runner 注册。

验证：

```bash
npm run test:contracts
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server mcp
npx vitest run "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts" "src/hooks/useMcp.test.tsx" "src/hooks/useMcpServers.test.tsx"
```

### Q12：Knowledge / Workspace / Content 写链

难度：高  
重要性：高  
分类：`App Server current`

候选：

- `knowledge_import_source`
- `knowledge_compile_pack`
- `knowledge_set_default_pack`
- `knowledge_update_pack_status`
- `knowledge_resolve_context`
- `workspace_create`
- `workspace_update`
- `workspace_delete`
- `workspace_set_default`
- `content_create`
- `content_update`
- `content_delete`
- `content_reorder`

执行口径：

- 写链必须有真实 App Server method、schema、TS client、front gateway 和 fail-closed 测试。
- 迁完后撤同名 DevBridge dispatcher、runner 注册、Tauri wrapper。
- 不保留新旧两个 service / projection。

验证：

```bash
npm run test:contracts
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server knowledge
npx vitest run "src/lib/api/knowledge.test.ts" "src/lib/api/project.test.ts"
```

### Q13：Memory / Unified Memory / Project Memory

难度：高  
重要性：高  
分类：`App Server current / RuntimeCore support`

候选：

- `memory_cmd.rs`：character / world_building / outline / project memory。
- `memory_management_cmd.rs`：runtime stats / cleanup / scaffold / prefetch。
- `unified_memory_cmd.rs`：CRUD / search / stats / analyze。
- `memory_search_cmd.rs`、`memory_feedback_cmd.rs`。

执行口径：

- runtime memory 与 Agent turn 上下文绑定，不能只迁 UI API。
- CRUD 和 search 可先按 service 分层进 App Server。
- scaffold runtime agents template 涉及 workspace 文件系统，需确认 Desktop Host / App Server 边界。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/memory.test.ts" "src/lib/api/memoryRuntime.test.ts" "src/lib/api/unifiedMemory.test.ts"
```

### Q14：Agent App Runtime / Agent App install

难度：高  
重要性：高  
分类：`App Server current / compat facade`

候选：

- `agent_app_runtime_start_task`
- `agent_app_runtime_get_task`
- `agent_app_runtime_cancel_task`
- `agent_app_runtime_submit_host_response`
- `agent_app_start_ui_runtime`
- `agent_app_stop_ui_runtime`
- `agent_app_launch_shell`
- `agent_app_select_directory`
- install / uninstall / package inspection。

执行口径：

- task lifecycle 进入 App Server runtime / agent app runtime client。
- shell launch / directory picker 归 Electron Desktop Host。
- install/package cloud bootstrap 需要同步前端、App Server client、mock 和 governance catalog。

验证：

```bash
npm run test:contracts
npx vitest run "src/lib/api/agentAppRuntime.test.ts" "src/lib/api/agentApps.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx"
```

### Q15：Agent Runtime residual

难度：最高  
重要性：最高  
分类：`App Server RuntimeCore current`

候选大户：

- `agent_runtime_create_session`
- `agent_runtime_list_sessions`
- `agent_runtime_get_session`
- `agent_runtime_update_session`
- `agent_runtime_submit_turn`
- `agent_runtime_get_thread_read`
- `agent_runtime_respond_action`
- `agent_runtime_export_evidence_pack`
- `agent_runtime_get_tool_inventory`
- `agent_runtime_spawn_subagent`
- checkpoint / handoff / replay / review / queued turn。

执行口径：

- 不能简单删除；必须逐条迁到 App Server JSON-RPC current。
- `runtime_turn/**`、`tool_runtime/**`、DTO、event projection、evidence projection 里的可复用核心先抽到 RuntimeCore / services。
- legacy `agent_runtime_*` 最多保留 thin compat delegate，并写退出条件；不得再承接新业务逻辑。

验证：

```bash
npm run check:agent-runtime-clients
npm run test:contracts
npm run smoke:agent-session-history-electron-fixture -- --timeout-ms 180000
```

## 推荐执行顺序

如果目标是快速减少 Tauri 痕迹，建议按下面顺序开刀：

1. Q0：inventory 和守卫。
2. Q1：文档 / smoke / fixture 旧 Tauri 证据。
3. Q2：零引用 / 已下线旧命令族。
4. Q3：已 current 覆盖的 DevBridge dispatcher 分支。
5. Q4：纯壳能力旧 Tauri wrapper。
6. Q5：已 current 的读链残留。
7. Q6-Q10：按领域分批清中等风险旧面。
8. Q11-Q15：回到 App Server 主链，逐条迁 MCP、Workspace / Knowledge / Memory、Agent Runtime。

不要为了“看起来清得多”优先碰 Q15。Agent Runtime 是主链事实源迁移，不是快速垃圾回收。

## 文档 / 守卫补强记录

- 2026-06-08 Codex TW-Q2-USAGE-STATS-WRAPPER 认领
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/usage_stats_cmd.rs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`src/lib/api/usageStats.ts`、`src/lib/api/usageStats.test.ts`、`packages/app-server-client/src/protocol.ts`、`lime-rs/crates/app-server-protocol/src/protocol/v0.rs`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：删除已由 App Server `usageStats/*` current 主链覆盖的旧 Tauri 使用统计 wrapper，减少 `lime-rs/src/commands/**` 清理区存量。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`npx vitest run "src/lib/api/usageStats.test.ts"`、`node scripts/check-command-contracts.mjs`
  - 启动基线：`usage_stats_cmd.rs` 已是 fail-closed 退场占位；前端 `usageStats.ts` 已通过 App Server client 调用 `usageStats/read`、`usageStats/modelRanking/list`、`usageStats/dailyTrends/list`；`runner.rs` / `mod.rs` 为共享脏文件，本轮只删除 usage stats 注册和模块声明。
  - 状态：done

- 2026-06-08 Codex TW-Q2-VOICE-TEST-WRAPPER 认领
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/voice_test_cmd.rs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`src/lib/api/voiceModels.ts`、`lime-rs/src/commands/voice_model_cmd.rs`、`lime-rs/src/voice/commands.rs`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 目标：删除已无前端 / Electron / packages / scripts 调用的旧 Tauri TTS 测试 wrapper，减少 `lime-rs/src/commands/**` 清理区存量。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`node scripts/check-command-contracts.mjs`
  - 启动基线：`rg` 显示 `test_tts` / `get_available_voices` / `voice_test_cmd` 只剩 Rust module、`runner.rs` 注册和 `commands/mod.rs` 声明；生产语音能力由 Voice / ASR / voice model current 链路承接。
  - 状态：done

- 2026-06-08 Codex TW-Q2-USAGE-STATS-WRAPPER 完成
  - 清理结果：`deleted`；`lime-rs/src/commands/usage_stats_cmd.rs` 已删除，3 条 `commands::usage_stats_cmd::*` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明。
  - 旧入口搜索：`rg -n "usage_stats_cmd|commands::usage_stats_cmd|pub mod usage_stats_cmd|\\b(get_usage_stats|get_model_usage_ranking|get_daily_usage_trends)\\b" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 只剩 Electron Host / IPC current 命令名、前端错误文案和 contract 延期登记，不再有 Rust Tauri wrapper。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`npx vitest run "src/lib/api/usageStats.test.ts"` 通过；`node scripts/check-command-contracts.mjs` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；定向 `git diff --check` 通过。
  - 剩余阻塞：Electron Host 仍保留 `get_usage_stats` / `get_model_usage_ranking` / `get_daily_usage_trends` 作为 current bridge 命令名，前端网关真实调用 App Server `usageStats/*` client；这不是旧 Tauri wrapper 残留。

- 2026-06-08 Codex TW-Q2-VOICE-TEST-WRAPPER 完成
  - 清理结果：`deleted`；`lime-rs/src/commands/voice_test_cmd.rs` 已删除，2 条 `commands::voice_test_cmd::*` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明。
  - 旧入口搜索：`rg -n "\\b(test_tts|get_available_voices|voice_test_cmd|VoiceOption|TtsTestResult)\\b" "src" "electron" "packages" "scripts" "lime-rs/src" --glob "!lime-rs/target/**"` 只剩 `scripts/check-command-contracts.mjs` 的 retired Tauri generate_handler guard 命令名，不再有 Rust Tauri wrapper、runner 注册或前端调用。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`node scripts/check-command-contracts.mjs` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；定向 `git diff --check` 通过。
  - 剩余阻塞：无；生产语音能力继续由 Voice / ASR / voice model current 链路承接。

- 2026-06-08 Codex TW-Q4A-WINDOW-WRAPPER 认领
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/window_cmd.rs`、`src/lib/desktop-host/configSystemMocks.ts`、`src/lib/desktop-host/configSystemMocks.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`electron/hostCommands.ts`、`electron/ipcChannels.ts`、`src/lib/desktop-host/core.test.ts`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`、`scripts/check-command-contracts.mjs`
  - 目标：删除已无前端生产入口的旧 Tauri window control wrapper，并同步撤掉默认 mock 残留。
  - 验证：`rg` 引用搜索、`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`npx vitest run "src/lib/desktop-host/configSystemMocks.test.ts"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`node scripts/check-command-contracts.mjs`
  - 启动基线：`get_window_size` / `set_window_size` / `center_window` / `toggle_fullscreen` / `is_fullscreen` 只剩 Rust fail-closed wrapper、runner 注册和 `configSystemMocks.ts` 默认 mock；未发现前端 / Electron / packages 生产调用。
  - 状态：done

- 2026-06-08 Codex TW-Q4A-WINDOW-WRAPPER 完成
  - 清理结果：`deleted`；`lime-rs/src/commands/window_cmd.rs` 已删除，5 条 `commands::window_cmd::*` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明；`configSystemMocks.ts` 已移除同名默认 mock，并在 `configSystemMocks.test.ts` 增加不应保留 window legacy mock 的断言。
  - 旧入口搜索：`rg -n "window_cmd|commands::window_cmd|pub mod window_cmd|get_window_size|set_window_size|center_window|toggle_fullscreen|is_fullscreen" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 只剩 current window-size option mock 和测试断言，不再有旧 Tauri wrapper、runner 注册或前端生产调用。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`npx vitest run "src/lib/desktop-host/configSystemMocks.test.ts"` 通过；`node scripts/check-command-contracts.mjs` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；定向 `git diff --check` 通过。
  - 剩余阻塞：`get_window_size_options` / `set_window_size_by_option` 等 current window-size option mock 仍在 `configSystemMocks.ts`，不属于本轮删除的旧 Tauri window control wrapper。

- 2026-06-08 Codex TW-Q2-INJECTION-WRAPPER 完成
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/injection_cmd.rs`、`src/lib/desktop-host/configSystemMocks.ts`、`src/lib/desktop-host/configSystemMocks.test.ts`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`scripts/check-command-contracts.mjs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 清理结果：`deleted`；`lime-rs/src/commands/injection_cmd.rs` 已删除，6 条 `commands::injection_cmd::*` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明；`configSystemMocks.ts` 已移除同名默认 mock，并在 `configSystemMocks.test.ts` 增加不应保留 injection legacy mock 的断言。
  - 旧入口搜索：`rg -n "injection_cmd|get_injection_config|set_injection_enabled|get_injection_rules|add_injection_rule|remove_injection_rule|update_injection_rule" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 只剩 `scripts/check-command-contracts.mjs` 的 retired Tauri guard 命令名和 `configSystemMocks.test.ts` 负向断言，不再有 Rust Tauri wrapper、runner 注册或默认 mock。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`npx vitest run "src/lib/desktop-host/configSystemMocks.test.ts" "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，2 files / 11 tests；`node scripts/check-command-contracts.mjs` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；定向 `git diff --check` 通过。
  - 剩余阻塞：无；生产运行时注入继续只允许走 Agent / Skill current 主链，不在 `lime-rs/src/commands/**` 恢复退场 stub。

- 2026-06-08 Codex TW-Q2-ECOMMERCE-REVIEW-REPLY-WRAPPER 完成
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/ecommerce_review_reply_cmd.rs`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`scripts/check-command-contracts.mjs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 避让：Knowledge 写集、Electron host / ipc 共享热区、App Server protocol、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 清理结果：`deleted`；`lime-rs/src/commands/ecommerce_review_reply_cmd.rs` 已删除，`commands::ecommerce_review_reply_cmd::execute_ecommerce_review_reply` runner 注册已撤掉，`commands/mod.rs` 已移除模块声明；`rustCommandsCurrentBoundary.test.ts` 已移除该 stub 白名单和副作用预算，`scripts/check-command-contracts.mjs` 已登记 command / module retired guard。
  - 旧入口搜索：`rg -n "ecommerce_review_reply_cmd|execute_ecommerce_review_reply|ecommerce_review|review_reply" "lime-rs/src" "src" "electron" "packages" "scripts" --glob "!lime-rs/target/**"` 只剩 `scripts/check-command-contracts.mjs` 的 retired Tauri guard 命令名，不再有 Rust Tauri wrapper、runner 注册、前端调用或默认 mock。
  - 验证结果：待重跑 `rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"`、`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts"`、`node scripts/check-command-contracts.mjs`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 与定向 `git diff --check`。
  - 剩余阻塞：无；电商差评回复若未来恢复，必须经 Agent / Skill current 主链，不在 `lime-rs/src/commands/**` 恢复快捷 Tauri wrapper。

- 2026-06-08 Codex TW-Q2-ORPHAN-STUB-FILES 完成
  - 写集：`lime-rs/src/commands/config_cmd.rs`、`lime-rs/src/commands/document_import_cmd.rs`、`lime-rs/src/commands/experimental_cmd.rs`、`lime-rs/src/commands/external_tools_cmd.rs`、`lime-rs/src/commands/image_search_cmd.rs`、`lime-rs/src/commands/image_upload_cmd.rs`、`lime-rs/src/commands/models_cmd.rs`、`lime-rs/src/commands/prompt_cmd.rs`、`lime-rs/src/commands/theme_context_cmd.rs`、`scripts/check-command-contracts.mjs`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 清理结果：`deleted`；上述 9 个已从 `commands/mod.rs` 撤声明、且在 `lime-rs/src` 无正向引用的 orphan 旧 Tauri stub / 退场说明文件已物理删除；`rustCommandsCurrentBoundary.test.ts` 已从 deprecated stub 白名单和副作用预算表移除对应文件，`scripts/check-command-contracts.mjs` 将 `theme_context_cmd` 加入 retired module 回流守卫。
  - 旧入口搜索：`rg -n "config_cmd|document_import_cmd|experimental_cmd|external_tools_cmd|image_search_cmd|image_upload_cmd|models_cmd|prompt_cmd|window_cmd|voice_test_cmd" "lime-rs/src" -g "*.rs"` 无命中；`rg -n "theme_context_cmd|aster_agent_theme_context_search" "lime-rs/src" "scripts/check-command-contracts.mjs" "internal/aiprompts/query-loop.md" -g "!*target*"` 只剩文档历史锚点和 contract 守卫。
  - 验证结果：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept` 通过；`npx eslint --max-warnings 0 "src/lib/governance/rustCommandsCurrentBoundary.test.ts"` 通过；`node scripts/check-command-contracts.mjs` 通过；`git diff --check` 通过。
  - 剩余阻塞：`websocket_cmd.rs` 仍在 `runner.rs` / `commands/mod.rs` 注册入口中；`runner.rs` / `commands/mod.rs` 当前是并行共享写集，释放后可继续删除注册、`WsServiceState` manage、模块声明和文件。`document-export`、`session-files`、`imageSearch` 的前端旧命令名虽已不再有 Rust Tauri wrapper，但仍需要单独迁到真实 current 通道或下线前端入口，不能把 retired guard 当作生产可用证据。

- 2026-06-08 Codex TW-Q5A-KNOWLEDGE-DEAD-FILES 完成
  - 写集：`lime-rs/src/commands/knowledge_cmd.rs`、`lime-rs/src/dev_bridge/dispatcher/knowledge.rs`、`scripts/check-command-contracts.mjs`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 清理结果：`deleted`；`knowledge_cmd.rs` 与 Rust DevBridge `dispatcher/knowledge.rs` 已物理删除。两者此前已不在 `commands/mod.rs` / 主 DevBridge dispatcher 注册入口里，只剩 dead file candidate；Knowledge current 主链继续由 App Server `knowledgePack/*` / `knowledgeContext*` 承接。
  - 旧入口搜索：`rg -n "mod knowledge|knowledge::try_handle|crate::commands::knowledge_cmd|pub mod knowledge_cmd|commands::knowledge_cmd|execute_knowledge_builder_skill|dispatcher/knowledge" "lime-rs/src" "scripts" "src/lib/governance" "internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md" -g "!*target*"` 只剩 `scripts/check-app-server-client-contract.mjs` 的 forbidden snippet 和执行计划记录，不再有 Rust 编译路径引用。
  - 守卫结果：`scripts/check-command-contracts.mjs` 将 `knowledge_cmd` 加入 retired module 回流守卫；`rustCommandsCurrentBoundary.test.ts` 已移除 `knowledge_cmd.rs` 副作用预算，防止旧 Tauri wrapper 重新落回 `lime-rs/src/commands/**`。
  - 验证结果：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；`node scripts/check-command-contracts.mjs` 通过；`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept` 通过。
  - 剩余阻塞：live Builder Skill runtime binding 已迁入 App Server current 侧的工作仍由 App Server / Knowledge 主线跟踪；本刀只删除不再接线的旧 Tauri wrapper / DevBridge 文件，不在 `lime-rs/src/commands/**` 承接新逻辑。

- 2026-06-08 Codex TW-Q0-COMMANDS-DIR-DOCS-BROADCAST 完成
  - 写集：`docs/README.md`、`internal/README.md`、`internal/aiprompts/README.md`、`internal/aiprompts/governance.md`、`internal/aiprompts/quality-workflow.md`、`scripts/electron/current-rules-guard.test.mjs`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 只读参考：`AGENTS.md`、`internal/aiprompts/README.md`、`internal/aiprompts/commands.md`、`internal/roadmap/appserver/**`
  - 避让：Knowledge 写集、`lime-rs/src/commands/**`、`lime-rs/src/app/runner.rs`、App Server protocol、Electron host、`commandPolicy.ts`、`agentCommandCatalog.json`
  - 清理结果：`guard-hardened`；`docs/README.md`、`internal/README.md`、`internal/aiprompts/README.md`、治理文档、质量文档和 `current-rules-guard.test.mjs` 已同步知道 `lime-rs/src/commands/**` 是旧 Tauri wrapper 删除清理区，不再承接业务逻辑、API adapter、runtime 分支、领域 service、compat wrapper 或退场 stub；入口链接只指向已版本化的 `tauri-wrapper-quick-cleanup-queue.md` 与 `tauri-wrapper-command-inventory.md`，不再把被 `.gitignore` 忽略的本地计划当事实源。
  - 旧入口搜索：`rg -n "lime-rs/src/commands/\\*\\*" "docs/README.md" "internal/README.md" "internal/aiprompts/README.md" "internal/aiprompts/governance.md" "internal/aiprompts/quality-workflow.md" "scripts/electron/current-rules-guard.test.mjs"` 命中 6 处。
  - 验证结果：`node --check "scripts/electron/current-rules-guard.test.mjs"` 通过；`npm test -- "scripts/electron/current-rules-guard.test.mjs"` 通过；`npm run docs:boundary` 通过；`npm run test:contracts` 通过；定向 `git diff --check` 通过；2026-06-08 19:57 CST 追加入口后已重跑 `npm run docs:boundary`、`node scripts/check-command-contracts.mjs` 与定向 `git diff --check`，均通过。
  - 剩余阻塞：`.codex/skills/.../references` 与 `internal/exec-plans/rust-commands-current-migration-cleanup-plan.md` 是本地忽略文件，不作为版本化事实源；后续长期规则以 `AGENTS.md`、`internal/README.md`、`internal/aiprompts/*`、`internal/roadmap/appserver/*`、`docs/README.md`、已版本化执行计划和守卫测试为准。

- 2026-06-08 Codex TW-Q2-TELEMETRY-WRAPPER 完成
  - 写集：`lime-rs/src/app/telemetry_state.rs`、`lime-rs/src/app/mod.rs`、`lime-rs/src/app/state.rs`、`lime-rs/src/app/bootstrap.rs`、`lime-rs/src/app/commands/server.rs`、`lime-rs/src/commands/media_task_cmd.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/telemetry_cmd.rs`、`scripts/check-command-contracts.mjs`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 清理结果：`deleted` / `state-moved-out-of-commands`；`TelemetryState` 共享运行期状态已迁到 `lime-rs/src/app/telemetry_state.rs`，server diagnostics、bootstrap、state 初始化与 media task current 链路改读 `crate::app::telemetry_state::TelemetryState`；旧 `lime-rs/src/commands/telemetry_cmd.rs` Tauri fail-closed wrapper 已物理删除，`commands/mod.rs` 已移除 `telemetry_cmd` 声明。
  - 旧入口搜索：`rg -n "telemetry_cmd|commands::telemetry_cmd|get_request_logs|get_request_log_detail|clear_request_logs|get_stats_summary|get_stats_by_provider|get_stats_by_model|get_token_summary|get_token_stats_by_provider|get_token_stats_by_model|get_token_stats_by_day" "lime-rs/src" "src" "electron" "packages" "scripts" -g "*.rs" -g "*.ts" -g "*.tsx" -g "*.mjs" -g "*.json"` 只剩 `scripts/check-command-contracts.mjs` retired guard 和 `configSystemMocks.test.ts` 负向断言，不再有 Rust Tauri wrapper、runner 注册或生产调用。
  - 守卫结果：`rustCommandsCurrentBoundary.test.ts` 已从 deprecated stub 白名单与 commands 副作用预算表移除 `telemetry_cmd.rs`；`scripts/check-command-contracts.mjs` 已将 `telemetry_cmd` 纳入 retired module 回流守卫。
  - 验证结果：`rustfmt --edition 2021 ...` 已格式化目标 Rust 文件；`node scripts/check-command-contracts.mjs` 通过；`npx vitest run "src/lib/governance/rustCommandsCurrentBoundary.test.ts" --silent=passed-only --disableConsoleIntercept` 通过；`npx eslint --max-warnings 0 "scripts/check-command-contracts.mjs" "src/lib/governance/rustCommandsCurrentBoundary.test.ts"` 通过；`npx prettier --check "src/lib/governance/rustCommandsCurrentBoundary.test.ts" "scripts/check-command-contracts.mjs"` 通过。
  - 剩余阻塞：旧 request log / stats / token stats 产品面未在本刀恢复；如果后续需要用户可见统计，只能补 App Server current method / Electron Host current bridge 或下线入口，不能在 `lime-rs/src/commands/**` 恢复 telemetry wrapper / stub。

- 2026-06-08 Codex TW-Q2-A2UI-WEBSOCKET-WRAPPERS 完成
  - 写集：`lime-rs/src/app/runner.rs`、`lime-rs/src/commands/mod.rs`、`lime-rs/src/commands/a2ui_form_cmd.rs`、`lime-rs/src/commands/websocket_cmd.rs`、`scripts/check-command-contracts.mjs`、`src/lib/governance/rustCommandsCurrentBoundary.test.ts`、`internal/exec-plans/tauri-wrapper-quick-cleanup-queue.md`
  - 清理结果：`deleted`；`lime-rs/src/commands/a2ui_form_cmd.rs` 与 `lime-rs/src/commands/websocket_cmd.rs` 已删除，A2UI 七条旧 Tauri DB wrapper 注册、WebSocket 三条旧控制命令注册和 `WsServiceState` manage 已从 `runner.rs` 撤掉，`commands/mod.rs` 已移除两个模块声明。
  - 旧入口搜索：`rg -n "a2ui_form_cmd|commands::a2ui_form_cmd|create_a2ui_form|get_a2ui_form|get_a2ui_forms_by_message|get_a2ui_forms_by_session|save_a2ui_form_data|submit_a2ui_form|delete_a2ui_form|websocket_cmd|commands::websocket_cmd|WsServiceState|get_websocket_status|get_websocket_connections|set_websocket_enabled" "lime-rs/src" "src" "electron" "packages" "scripts" -g "*.rs" -g "*.ts" -g "*.tsx" -g "*.mjs" -g "*.json"` 只剩 `scripts/check-command-contracts.mjs` retired guard，不再有 Rust Tauri wrapper、runner 注册、前端调用、Electron 调用或默认 mock。
  - 守卫结果：`rustCommandsCurrentBoundary.test.ts` 已从 deprecated stub 白名单与 commands 副作用预算表移除 `a2ui_form_cmd.rs` / `websocket_cmd.rs`；`scripts/check-command-contracts.mjs` 已登记 A2UI / WebSocket 旧命令名和模块 retired guard。
  - 验证结果：`rustfmt --edition 2021 --check --config skip_children=true "lime-rs/src/app/runner.rs" "lime-rs/src/commands/mod.rs"` 通过；`npx prettier --check "src/lib/governance/rustCommandsCurrentBoundary.test.ts" "scripts/check-command-contracts.mjs"` 通过。
  - 剩余阻塞：A2UI current 渲染与 action-request 主链仍保留；本刀只删除旧 Tauri DB wrapper，不删除 `lime-rs/crates/core/src/database/dao/a2ui_form_dao.rs` 或 A2UI 前端渲染协议。WebSocket 后续若需要运行时事实，必须回 App Server / channel current 主链，不能恢复本地 Tauri 控制命令。
