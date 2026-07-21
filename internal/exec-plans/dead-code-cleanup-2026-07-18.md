# Dead Code 持续清理计划

## 目标

持续删除已脱离产品入口、构建消费链或唯一事实源的代码；不保留无外部兼容负担的 fail-closed 空壳、转发 helper、重复 UI 壳和历史类型目录。

正式分类遵循 `internal/aiprompts/governance.md`。Knip、`zero-inbound` 和热力图只提供候选信号，必须结合全文引用、构建入口、current owner 与定向测试后才能判定 `dead`。

## 协作边界

- 并行脏热区（只读）：`src/components/agent/chat/**`、`src/lib/api/agentRuntime/**`、`internal/exec-plans/claw-streaming-rendering-codex-refactor-plan.md`。
- 本轮实际写集：本计划、各批表格所列的 `dead` 文件、随删除必要收口的 current owner/README/i18n patch、命令合同与 legacy surface guard。
- 不触碰：Electron Host、App Server protocol/runtime/client、Rust runtime、DevBridge command policy 与正在修改的 Agent streaming/task center 文件。

## 第一批候选

| Surface                  | 候选文件                                                                                                                   | 证据                                                                                                              | 分类 / current owner                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Image Search 前端空壳    | `src/lib/api/imageSearch.ts`、`imageSearch.test.ts`、`imageSearch.diagnostic.test.ts`                                      | production Knip 未使用；全文扫描只有自身测试；既有迁移计划确认无 App Server owner、旧 Tauri facade 已退役         | `dead`；独立 `lime_search_web_images` Agent tool 不受影响     |
| 外链重复 helper          | `src/lib/openUrl.ts`、`openUrl.test.ts`                                                                                    | production Knip 未使用；生产调用已直接收敛到 `src/lib/api/externalUrl.ts`                                         | `dead`；`externalUrl.ts` 为 `current`                         |
| SceneApp context overlay | `src/lib/context-layer/index.ts`、`types.ts`                                                                               | production Knip 未使用；全文扫描无消费者；类型仍携带已退役 `SceneAppContextOverlay`                               | `dead`；不得恢复 SceneApp 平行事实源                          |
| Compact right panel 旧壳 | `src/lib/compactRightPanelEvents.ts`、`src/components/ui/compact-right-dock-button.tsx`、`compact-right-drawer-header.tsx` | production Knip 未使用；全文扫描只有文件自身                                                                      | `dead`；右侧工作区继续由现役 workspace/right surface 组件承接 |
| 通用 ArtifactFrame 旧壳  | `src/components/agent/chat/components/ArtifactFrame.tsx`                                                                   | production Knip 未使用；无 import；Artifact 展示已由 `artifactFrameRegistry.ts` + `ArticleArtifactFrame.tsx` 消费 | `dead`；registry / renderer 为 `current`                      |

## 执行步骤

- [x] 运行 `npm run governance:legacy-report`，当前零引用候选、分类漂移和边界违规均为 `0`。
- [x] 生成项目热力图与治理图到 `tmp/project-heatmap*`；结果因当前 Git churn 不可用且包含本地 `.lime` 证据目录，只作弱证据。
- [x] 运行 production Knip 并对第一批候选逐项全文复核。
- [x] 获得删除确认后，物理删除第一批 `dead` 文件。
- [x] 将 `imageSearch.current-boundary.test.ts` 从“保留 fail-closed 空壳”改为“文件不得恢复”的负向守卫。
- [x] 在 legacy surface catalog 增加本批文件的路径回流守卫。
- [x] 运行相关定向测试、`npm run test:contracts`、`npm run governance:legacy-report`、`git diff --check`。

### 第一批验证证据

- `npx vitest run "src/lib/api/imageSearch.current-boundary.test.ts" "src/lib/governance/legacySurfaceCatalog.test.ts" --silent=passed-only --disableConsoleIntercept`：2 files / 212 tests 通过。
- `npm run typecheck`：renderer 与 node TypeScript project 均通过；删除目标无隐藏静态消费者。
- `npm run governance:legacy-report`：5 组新增 surface 均为 `dead / 已删除 / 无引用`；零引用候选、分类漂移、边界违规均为 0。
- `npm run test:contracts`：protocol 生成无漂移，App Server client 291 checks、command/contracts、modality、scripts、Electron release、cleanup report 与 docs boundary 全部通过。
- production Knip 复扫：8 个已删生产路径命中为空数组。
- 第一批 diff：611 行删除、88 行 guard/test 新增，净减少 523 行；其中 11 个物理删除文件共 602 行。

## 第二批候选

| Surface                         | 候选文件 / 改动                                                                                                                                                    | 证据                                                                                                                           | 分类 / current owner                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Artifact fenced response parser | 删除 `src/lib/artifact/parser.ts`、`parser.test.ts`，更新两份 Artifact README                                                                                      | 829 行实现和测试只互相消费；生产链无 `ArtifactParser`、artifact fence 或 `serializeArtifact` 调用                              | `dead`；结构化 artifact 由 App Server item/artifact payload、`artifact-document` 与 renderer registry 承接 |
| 静态 System Provider 预设       | 删除 `src/lib/config/README.md`、`providers.ts`、`providers.test.ts`；让 icon test 只验证自身映射一致性                                                            | 1006 行配置和自测无生产消费者；现役 Provider catalog 明确经 `src/lib/api/apiKeyProvider.ts -> modelProvider/catalog/list` 读取 | `dead`；App Server catalog 为 `current`                                                                    |
| 旧 Voice preview / 设置组件     | 删除 `src/lib/voiceLivePreview.ts`、对应测试、`MicrophoneTest.tsx`、`VolumeWaveform.tsx`，更新 Voice README；移除 `asrProvider.listAudioDevices` 及其正向测试/守卫 | 组件无页面入口；preview helper 只被自身测试使用；录音主链已直接由 `useInputbarDictation` 使用 renderer `getUserMedia`          | `dead`；Inputbar dictation + App Server transcription 为 `current`                                         |
| Relay registry 禁用 Hook        | 删除 `src/hooks/useRelayRegistry.ts`，清理 legacy i18n patch 中对应 4 个旧文案                                                                                     | Hook 无消费者且只返回空列表/禁用错误；Connect deep link 已按需经 App Server 解析 registry                                      | `dead`；`useDeepLink -> src/lib/api/connect.ts -> App Server` 为 `current`                                 |

第二批已完成物理删除与 owner 收口；`asrProvider`、icon test、README、legacy i18n patch 与边界测试只做随删除必要的收口，未新增 compat。

- [x] 对第二批候选完成 production Knip、全文引用和 current owner 复核。
- [x] 获得删除确认后，物理删除 10 个 `dead` 文件并同步收口现役 owner。
- [x] 删除旧正向测试，将 Artifact parser、静态 Provider catalog、Voice preview/device UI 和 Relay registry Hook 合并到 owner 级负向回流守卫。
- [x] 运行 Artifact、Provider、Voice、Connect 相关定向测试，并按 API/GUI 风险扩大到 contracts 与 GUI smoke。

### 第二批验证证据

- owner 级定向 Vitest：10 files / 280 tests 通过，覆盖 Artifact、Provider icon、ASR/Voice、Connect 与 legacy surface guard。
- 定向 ESLint：`asrProvider`、Provider icon 与 legacy surface guard 相关现存 TypeScript 文件全部通过。
- `npm run test:contracts`：protocol 生成无漂移，App Server client 291 checks、command/contracts、modality、scripts、Electron release、cleanup report 与 docs boundary 全部通过。
- `npm run verify:gui-smoke`：真实 Electron Desktop Host、preload/IPC、App Server sidecar、Renderer 与用户可见 workspace 准备态通过；Gate B evidence 为 `.lime/qc/project-gates/standalone-shell-01-20260718140542-60846/shell-01-electron-smoke/summary.json`。
- `npm run governance:legacy-report`：4 组新增 surface 均为 `dead / 已删除 / 无引用`；零引用候选、分类漂移、边界违规均为 0。
- production Knip 复扫：6 个已删生产路径命中为空数组；10 个目标物理路径均不存在。
- JSON 解析、`git diff --check` 均通过。第二批 diff 为 221 行新增、2547 行删除，净减少 2326 行；其中 10 个物理删除文件共 2263 行。
- `npm run typecheck`：全量 renderer typecheck 仍被并行脏热区 `src/components/agent/chat/AgentChatWorkspace.tsx:1241` 的 `string | null` 类型错误阻塞，因 `&&` 短路未继续到 node project；本计划不接管该文件。`npm run verify:gui-smoke` 内含的 `typecheck:electron` 独立通过。

## 第三批候选

| Surface                                 | 候选文件 / 改动                                                                                                                                                   | 证据                                                                                                                     | 分类 / current owner                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 已退路由的 Hotkeys 设置页               | 删除 `src/components/settings-v2/general/hotkeys/**`，移除 `SettingsTabs.Hotkeys`、对应负向 fallback 测试、quality planner 路径与五语言 `settings.hotkeys.*` 资源 | `SETTINGS_GROUPS`、Settings layout preload/render switch 和 Sidebar 均无 Hotkeys；唯一 enum 消费是“不得出现”测试         | `dead`；各工作区现役快捷键定义由所属组件直接持有                   |
| 共享 Shortcut 编辑器旧组件              | 删除 `src/components/settings-v2/shared/ShortcutSettings.tsx` 与自身测试，清五语言 `common.shortcutSettings.*` 资源                                               | production Knip 和全文扫描都只有自身测试/资源                                                                            | `dead`；无 current 页面需要快捷键录制 UI                           |
| Renderer Hotkey / Voice shortcut facade | 删除 `src/lib/api/hotkeys.ts`、`voiceShortcutEvents.ts` 与自身测试                                                                                                | 两个 facade 无生产消费者；`voice-start-recording` / `voice-stop-recording` 在 Electron 与 Renderer 均无 emitter/listener | `dead`；Inputbar dictation 的显式录音交互为 `current`              |
| 专用 Hotkey Electron 命令               | 从 IPC/Host/SystemUtilityHost/contract/tests 移除 `get_voice_shortcut_runtime_status` 与 `validate_shortcut`                                                      | 两条命令只服务已无入口的 Renderer facade；没有其他调用方                                                                 | `dead`；通用 `globalShortcut` test/plugin fixture 边界不在本批修改 |

第三批已物理删除 10 个源码/自测文件共 1554 行，清理 5 locale 共 320 条只服务已退页面/组件的 i18n key。该批触及 Electron 命令合同，已完成 `npm run test:contracts` 与相关 Electron tests。

- [x] 对第三批完成 Settings 路由、Renderer facade、Electron 命令和事件 emitter/listener 全链盘点。
- [x] 获得删除确认后，物理删除页面/组件/facade并同步命令合同、枚举与 i18n。
- [x] 为两条 retired Hotkey 命令与已删 Settings 路径补 legacy 回流守卫；仅保留 `voiceMocks.test.ts` / `core.unhandled-mock.test.ts` 的 test-only fail-closed 证据。
- [x] 运行 Settings/Host/i18n 定向测试、contracts、治理扫描与 GUI smoke。

### 第三批验证证据

- 定向 Vitest：12 files / 360 tests 通过，覆盖 Settings layout/category、i18n loader/type、Electron SystemUtility/Host/IPC、desktop-host fail-closed、quality planner 与 governance catalog。
- `npm run test:contracts`：protocol 生成无漂移，App Server client 291 checks；命令计数收敛为 frontend 30 / Electron host 91 / mock priority 0 / DevBridge truth 16，其余 modality、scripts、release、cleanup 与 docs guard 均通过。
- `npm run verify:gui-smoke`：真实 Electron Desktop Host、preload/IPC、App Server sidecar、Renderer、Claw workspace reload 与 Memory settings ready 通过；Gate B evidence 为 `.lime/qc/project-gates/standalone-shell-01-20260718144759-97071/shell-01-electron-smoke/summary.json`。
- `npm run governance:legacy-report`：零引用候选、分类漂移、边界违规均为 0；新增 Hotkeys 页面、Shortcut 编辑器、Renderer facade 与两条命令均为 `dead / 已删除 / 受控负向守卫`。
- production Knip 复扫：7 个已删生产路径命中为空数组；10 个源码目标物理路径均不存在；五语言 `common.shortcutSettings.*` / `settings.hotkeys.*` key 全部清除。
- 定向 ESLint、Prettier、JSON 解析、`git diff --check` 均通过。
- `npm run typecheck`：全量 renderer typecheck 仍被并行脏热区 `src/components/agent/chat/workspace/useAgentChatWorkspaceArtifactInteractionRuntime.ts:39` 的 `import type` 误用阻塞，本计划不接管该文件；Electron `typecheck:electron` 已在 GUI smoke 中独立通过。

## 退出条件

第一至第六批文件全部物理删除；production Knip 不再报告这些路径；Image Search、SceneApp context overlay、compact-right 旧壳、重复外链 helper、通用 ArtifactFrame、Artifact parser、静态 Provider catalog、Voice preview/device UI、Relay registry Hook、Hotkeys 设置页、Shortcut 编辑器、Renderer hotkey/voice facade、两条专用 Electron 命令、Agent Chat subagents ViewModel、Workspace article workflow read model、article editor orchestration model、Rust runtime queue/queued turn/runtime support、App Server runtime registry 与 Plugin HostDrawer 本地 fallback 均已下线并有负向守卫。定向测试、治理与 Rust related 检查通过；合同与最新 GUI smoke 仍需等待隔壁 `internal/refactor/v1` 写集收敛后复跑。

## 后续候选

当前没有可直接接管的新 `dead` surface；已确认的 Agent Chat、Rust runtime 与 Plugin Host fallback 候选均已删除并有回流守卫。下一轮只在治理报告出现其他候选且 current owner、旁路引用和写集边界均明确时继续，不凭单一 Knip 信号夹写。

### 第四批候选审计与收口（2026-07-18 续调）

- production Knip 未报告新的未使用生产文件；治理目录中的其余 `dead-candidate` 主要是路径已删除后的负向文字守卫。
- `SkillExecutionDialog` / `useSkillExecution` 已在当前 Git 树中物理不存在，`check-app-server-client-contract.mjs` 只保留不回流的退役文件守卫；不重复删除。
- `settings-update-notification-compat-export`、旧 LanguageSelector、ChannelsDebugWorkbench 旧表单、独立 video/image/tools/terminal 页面与 desktop-host legacy barrel 当前均未命中实际旧实现，仅保留现有治理扫描证据。
- 写集释放后完成第四批物理删除：`agentUiSubagentsViewModel.ts` 及测试、`useWorkspaceArticleWorkflowReadModel.ts` 及测试、`workspaceArticleEditorOrchestrationModel.ts` 及单元测试，共 6 个文件、2388 行。删除前按导出符号和全文引用复核，三组文件均无生产入口，仅自身测试或 boundary evidence 引用。
- 在 `legacySurfaceCatalog` 与对应测试中补入 `agent-ui-subagents-view-model-surface`、`workspace-article-workflow-read-model-surface`、`workspace-article-editor-orchestration-model-surface` 三组路径回流守卫；不新增 compat 或 fallback。

### 第四批验证证据

- `npx vitest run "src/lib/governance/legacySurfaceCatalog.test.ts"`：1 file / 212 tests 通过。
- `npm run governance:legacy-report`：零引用候选、零分类漂移、零边界违规；第四批三组 surface 均为 `dead / 已删除 / 受控负向守卫`。
- `npm run test:contracts`：协议无漂移，App Server client 291 checks；frontend 30 / Electron host 91。
- production Knip 复扫：`reportedFileCount: 0`，第四批目标路径命中为空。
- 定向 ESLint、Prettier、JSON parse、`git diff --check` 均通过。
- `npm run verify:gui-smoke`：真实 Electron Desktop Host、preload/IPC、App Server sidecar、Renderer 与用户可见 workspace smoke 通过；Gate B evidence 为 `.lime/qc/project-gates/standalone-shell-01-20260718151721-46205/shell-01-electron-smoke/summary.json`。
- 第四批 diff：6 个物理删除文件共 2388 行；新增 3 组治理路径回流守卫及测试覆盖。

### 第五批只读复核（2026-07-18 续调）

- `npm run governance:legacy-report`：扫描 2381 个源码文件与 1466 个测试文件，零引用候选、零分类漂移、零边界违规。
- `npm run governance:scripts`：root/一级目录冻结基线通过，`retiredRoot=0`、`retiredDirs=0`、`untrackedRoot=0`、`untrackedDirs=0`。
- 直接运行 `npx knip --production` 未指定仓库 Knip 配置，结果将所有入口/导出及大量类型列为 issue，不能作为删除证据；本轮不据此删除文件。治理图默认 `knip.governance.json` 当前不存在，因此只认全文引用、目录规则和 current owner 复核。
- Rust session loop 迁移 owner 已明确并完成收口：上述 7 个旧文件共删除 1664 行，生产调用已迁移到 `agent_runtime::session_loop::RuntimeSessionRegistry` / `RuntimeSessionInputHandle`；`legacySurfaceCatalog` 已新增 3 组 `dead` 路径回流守卫。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_loop`：2 项 session loop 定向测试通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -p app-server`：通过；仅保留既有 `stage_agent_control_spawn` 未使用警告，不影响本批删除。
- `npm run test:contracts`：协议无漂移，App Server client 291 checks；frontend 30 / Electron host 91，脚本、模态、发布、清理和 docs 门禁通过。
- `npm run verify:gui-smoke`：真实 Electron Desktop Host、preload/IPC、App Server JSON-RPC、Renderer reload 与 Memory settings ready 通过；Gate B-F evidence 为 `.lime/qc/project-gates/standalone-shell-01-20260718153427-23370/shell-01-electron-smoke/summary.json`，21/21 assertions 通过，0 console/page/bridge/legacy/mock errors。
- 44 个当前 Git 删除文件均已被 catalog 目标覆盖，未发现未设守卫的物理删除路径；治理单测 213 项通过，`git diff --check` 通过。
- 第五批退出条件已满足；当前 Git 删除文件均已被 `legacySurfaceCatalog` 的 `dead` 守卫覆盖，没有新的可安全接管 dead surface。

### 第六批只读审计（2026-07-18 续调）

- 依赖图与全文复核确认 `src/features/plugin/ui/AgentRunHostDrawerFallback.tsx` 无生产 import、无动态入口；其导出 `AgentRunFactRail` / `AgentRunLocalProcessFallback` 已由 `AgentRunProjectionPanel` current owner 替代。
- `AgentRunHostDrawer.tsx` 已有 `plugin-host-drawer-local-process-fallback` 负向守卫，生产主路径始终渲染标准 projection；路线图 `internal/roadmap/agentworkbench/task-board.md` 明确要求该文件物理删除前取得单独确认。
- Plugin Host current owner 定向回归：4 files / 24 tests 通过（HostDrawer boundary、AgentRunProjectionPanel、PluginRuntimePage agent-run 与 host-bridge）。
- 已获得单独确认并物理删除 `AgentRunHostDrawerFallback.tsx`；旧边界测试已改为文件不存在的负向断言，`legacySurfaceCatalog` 新增 `plugin-host-drawer-fallback-module-surface` 文件级回流守卫。
- 删除后 Plugin Host/Projection 定向回归：5 files / 238 tests 通过；定向 ESLint、JSON 解析与 `git diff --check` 通过。
- `npm run governance:legacy-report`：零引用候选、零分类漂移、零边界违规；目标文件状态为 `dead / 已删除`。
- `npm run test:contracts` 未通过，阻塞来自隔壁 `internal/refactor/v1` 共享 protocol 写集：`generate-protocol-types.mjs` 报 `method_names.rs` 缺少 6 个既有 `agentSession/*` 常量；本轮不修改隔壁 protocol/manifest。
- `npm run verify:gui-smoke` 首次等待共享 Rust artifact lock 后完成真实 Electron、preload/IPC、App Server JSON-RPC、Renderer reload 与 Memory settings ready，但在 21 项断言中仅 `noConsoleErrors` 失败（20/21 通过）；summary 为 `.lime/qc/project-gates/standalone-shell-01-20260718160517-64526/shell-01-electron-smoke/summary.json`。其余 page、IPC、legacy、mock 与 renderer crash 计数均为 0，未发现本轮 Plugin Host 删除相关证据。
- 复跑 `ELECTRON_ENABLE_LOGGING=1 npm run verify:gui-smoke` 未能进入 Electron：隔壁 transport 写集使 `app-server` 编译失败，`crates/app-server/src/main.rs:47` 仍调用不存在的 `AppServerTransport::from_listen_url_with_base`（当前仅有 `from_listen_url`），并连带触发 `E0282` 类型推导错误。本轮不修改 `internal/refactor/v1`、`app-server` 或 `app-server-transport`。
- 隔壁补回 transport 后，`npm run test:contracts` 仍在 `check:protocol-types` 稳定失败：`method_names.rs` 缺少 `agentSession/list`、`agentSession/read`、`agentSession/start`、`agentSession/thread/resume`、`agentSession/turn/cancel`、`agentSession/turn/start` 六个 manifest 常量；本轮不恢复旧常量或新增 compat wrapper。
- 再次运行 `ELECTRON_ENABLE_LOGGING=1 npm run verify:gui-smoke` 已完成真实 Electron、preload/IPC、App Server sidecar、Renderer reload 与 Memory settings ready，但 21 项断言仍为 20/21，仅 `noConsoleErrors` 失败。logging 定位到 Renderer 请求仍发送 `agentSession/list`，App Server 返回 `method not found: agentSession/list`；summary 为 `.lime/qc/project-gates/standalone-shell-01-20260718162422-74488/shell-01-electron-smoke/summary.json`。其余 page、IPC、legacy、mock、crash 与 load error 计数均为 0，说明失败属于隔壁 v1 协议迁移未完成，不属于本轮 Plugin Host 删除。
- 隔壁 transport 变更后重新运行 `npm run governance:legacy-report`：扫描 2384 个源码文件、1466 个测试文件与 1140 个 Rust 文件，零引用候选、零分类漂移、零边界违规；`npx vitest run` 的 catalog + Plugin Host/Projection 定向组为 4 files / 247 tests 通过，`git diff --check` 通过。
- 本轮仍未触碰 `internal/refactor/v1`、Agent Chat runtime 或 Plugin current owner，仅删除已获确认的 deprecated residual。

### 第七批 dead DAO 清理（2026-07-19）

- 只读盘点确认 `lime-rs/crates/core/src/database/dao/a2ui_form_dao.rs` 中的 `A2UIFormDao`、`CreateA2UIFormRequest`、`UpdateFormDataRequest` 与错误类型仅被自身文件使用，`dao/mod.rs` 只有一个导出；生产 Rust、Electron、Renderer 和脚本无调用。
- `core/src/database/schema.rs` 的 `drop_retired_agent_runtime_tables` 已将 `a2ui_forms` 及其索引列为 retired 并在启动时清理，当前 schema 不再创建该表；前端 A2UI projection/runtime 不依赖该 DB DAO。
- 按无兼容约束物理删除 `a2ui_form_dao.rs`，移除 `dao/mod.rs` 导出；不删除 schema retired cleanup，也不触碰前端 A2UI current owner。
- 分类：`A2UIFormDao`/旧 DB 表单读写面 = `dead / deleted / forbidden-to-restore`；前端 A2UI action-request / workspace projection = `current`；schema cleanup = `current migration boundary`；无 `compat` 或 `deprecated` wrapper。
- 验证：exact `rg` 引用扫描返回零命中；`cargo test -p lime-core --lib` 通过（675/675）；`git diff --check` 通过。治理扫描待本轮工作树稳定后复跑。
