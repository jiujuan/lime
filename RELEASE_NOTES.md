## Lime v1.42.0

发布日期：`2026-05-18`
递交范围：当前完整 worktree，包含 tracked 与新增文件；本次补齐版本事实源、Agent App Runtime / A2UI / ToolRuntime 主线、release note 当前事实源与发布前校验结论。

> 发布说明：上一版 release tag 为 `v1.41.0`。本版升级到 `v1.42.0`，并继续按 current release note 口径清理旧历史堆叠内容：`RELEASE_NOTES.md` 只保留当前版本说明，旧 v1.41.0 / v1.40.0 发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.41.0` 升级到 `1.42.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Agent App Runtime facade 继续拆分并收敛到 current 命令主链，补齐 `start_task`、`cancel_task`、`task_snapshot`、`host_response`、`tool_execution` 与公共模块边界，降低单文件命令膨胀和 mock / bridge 漂移风险。
- Agent App ToolRuntime 执行门进入主线：新增 Agent App tool execution、connector tools、Cloud overlay outbox、fixture adapter、readiness 与 sanitize 逻辑，让 App 能通过 runtime tool surface 走真实执行门而不是只停在 GUI / mock 投影。
- 新增 `packages/agent-app-runtime` 包与 public projection export 测试，沉淀 Agent App Runtime SDK 的 package-side 类型、构建和导出边界。
- Agent UI / A2UI 投影继续补齐：新增 Agent run projection state、projection bridge、view model、runtime panel、thinking block 与 MessageList runtime status 回归，减少 streaming、pending task、A2UI 卡片与运行态展示之间的断层。
- 原生工具面新增 `view_image`，把本地图片作为模型可见 image content 传递，避免 `Read` 将图片 base64 塞进文本输出；compact 工具面同步把 `view_image` 作为本地核心工具白名单，保持 provider broker surface 有界。
- Runtime evidence / observability / projection 继续收敛，补齐 Evidence Pack、projection summary、runtime status、request/turn 关联与相关 Rust 回归。
- Agent Apps 正式页面与 smoke 扩展到 Cloud install review、registration blocker、issue count、runtime surface、Host response、uninstall rehearsal、content factory flow 与 connector outbox，正式入口不再只依赖 Lab 路径证据。
- 新增 Agent Runtime benchmark scaffold，覆盖 tool approval / sandbox boundary 数据集，为后续运行时质量评估提供 versioned artifact。

### 用户可见更新

- `Agent Apps` 页面展示 Cloud app、安装审查、加载问题数量和忙碌态更稳定，避免 issue 信息只存在于内部日志。
- Agent App Runtime 页面和 Host drawer 可展示更完整的 task lifecycle、Host response、runtime process、projection panel 和 tool execution 反馈。
- 聊天主工作区补齐 A2UI task card、pending panel、runtime status line、thinking block 与 streaming renderer 的用户可见状态，减少任务执行中“无反馈 / 状态跳变”的体验。
- A2UI 基础组件统一布局 token、renderer token、task card / task form token，并补齐表单控件、音视频、按钮、列表、弹窗、tabs、文本等稳定回归。
- Skills 工作台与导航回归更新，保证 Agent App / Skills / Workspace 主路径入口与 current navigation 事实源一致。
- 新增或改动的 Agent 用户可见文案已同步 Lime current 五语言 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。

### 开发者与治理更新

- `eslint.config.js` 忽略生成的 `*.d.ts`，避免 public type artifact 被当作源码 lint；`.gitignore` 同步当前产物边界。
- `scripts/agent-app-package-handoff-check.mjs`、`scripts/lib/agent-app-package-handoff-core.mjs` 与对应测试继续补齐 package handoff gate；新增 connector outbox smoke、content factory flow、QC benchmark plan / compare 脚本。
- `src-tauri/crates/aster-rust/crates/aster/src/tools/view_image.rs` 新增 `ViewImageTool`，并在 provider format 中补齐 OpenAI Responses / Anthropic 图片工具结果格式回归。
- `src-tauri/crates/agent/src/tools/skill_tool_gate.rs` 与 runtime turn metadata 补齐 SkillTool gate / workspace skill runtime enable 的裁剪边界，避免 runtime enable 绕过 allowlist。
- `src/lib/dev-bridge/http-client.ts` 与 `mockPriorityCommands.ts` 补齐 Agent App Runtime current 命令 mock / bridge 覆盖，降低浏览器模式与真实 Tauri 命令漂移。
- `docs/roadmap/agentapp/`、`docs/roadmap/agentruntime/`、`docs/aiprompts/design-language.md` 与 `docs/aiprompts/quality-workflow.md` 同步 P18.7、AgentRuntime completion audit、Host Agent Run UI SDK、AgentUI adoption gap 与 ToolRuntime execution gate 事实源。
- `RELEASE_NOTES.md` 删除旧版本正文堆叠，只保留 `v1.42.0` 当前发布说明。

### 当前校验状态

- `npm run verify:app-version`：已通过，版本一致性为 `1.42.0`。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：已执行；`cargo fmt --manifest-path "src-tauri/Cargo.toml" --all -- --check` 已通过。
- `cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets --all-features -- -D warnings`：已通过；首次临时 target 构建失败属于构建环境 / 并发产物问题，复跑通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml" compact_tool_surface_should_bound_provider_tools_in_runtime_crate`：已通过，确认 compact provider tool surface 包含 `view_image` 后仍保持有界。
- `cargo test --manifest-path "src-tauri/Cargo.toml"`：已通过；主库 `1379 passed / 1 ignored`，集成测试通过，真实联网测试按环境变量保持 ignored。
- `npm run lint`：已通过。
- `npm test`：已通过；`run-vitest-smart` 全部 `58/58` 批次通过。
- `npm run test:contracts`：已通过，覆盖 agent runtime client 生成检查、命令契约、harness 契约、modality runtime contract 与 cleanup report contract。
- `git diff --check`：已通过。

---

**完整变更**: `v1.41.0` -> `v1.42.0`
