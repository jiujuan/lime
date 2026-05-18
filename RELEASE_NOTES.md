## Lime v1.44.0

发布日期：`2026-05-19`
递交范围：当前完整 worktree，包含 tracked 与新增文件；本次补齐版本事实源、Agent App v2 / standalone shell / packaging 主线、connector Cloud overlay 外部投递稳定性、release note 当前事实源与发布前校验结论。

> 发布说明：上一版 release note 事实源为 `v1.42.0`。本版升级到 `v1.44.0`，并继续按 current release note 口径清理旧历史堆叠内容：`RELEASE_NOTES.md` 只保留当前版本说明，旧 v1.42.0 及更早发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.42.0` 升级到 `1.44.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Agent App v2 路线图与执行文档落盘到 `docs/roadmap/agentapp/v2/`，补齐 PRD、架构、接口契约、实现计划、代码计划与完成度审计，发布说明继续只保留当前版本事实源。
- Agent App standalone shell 进入 current 主链：新增 shell descriptor、runtime-backed / standalone launch descriptor、隔离策略、内存 launch port、Tauri shell capability 与原生 shell window 服务，避免只停留在 Lab 或浏览器 mock 入口。
- Agent App packaging 主链补齐 package descriptor、artifact builder、release plan、updater manifest、Tauri config materializer / writer、macOS identity 与 native shell registration，支撑 standalone 包装和后续发布证据收集。
- Agent App install mode / runtime profile / architecture guard 完成分层：补齐 install contract normalization、runtime capability matrix、installed runtime profile、import boundary regression 与 shell / package / runtime profile 对外导出。
- Agent App Runtime 与 ToolRuntime 继续收敛到 current 命令主链，`agent_app_select_directory` 与 `agent_app_launch_shell` 已同步前端 API、Rust 命令、DevBridge mock priority 与治理目录册。
- Connector Cloud overlay outbox 补齐 host-managed webhook 外部投递路径，并对 `localhost` / `127.0.0.1` 目标禁用代理，避免本地 release / CI 环境代理把 loopback webhook 错投为 `502`；投递回执继续隐藏 target URL、lease ref 与 credential material。
- Agent App standalone release gate、secret preflight、evidence check、installer verify 与 smoke 脚本继续补齐，为 shell、打包、运行态、连接器 outbox 与 macOS 发布门禁提供可重复证据入口。

### 用户可见更新

- Agent Apps / Runtime 页面可以展示更完整的 standalone shell、install mode、runtime profile、packaging readiness、launch blocker 与 shell runtime 状态。
- 本地 Agent App 目录选择改走 current Tauri 命令 `agent_app_select_directory`，保持 GUI、DevBridge 与 mock 口径一致。
- Agent App shell launch 结果新增 package mount、runtime status、shell window、blocker codes 与启动时间等可解释字段，减少“点击启动但不知道卡在哪”的体验断点。
- Agent App 安装审查、生命周期动作、readiness、schema gate、projection 与 runtime host bridge 的回归继续补齐，降低正式入口与 Lab / mock 行为漂移。
- 新增或改动的 Agent 用户可见文案已同步 Lime current 五语言 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。

### 开发者与治理更新

- `src-tauri/src/services/agent_app_shell_window.rs` 新增 shell window 边界测试，约束 window label、URL、close policy、deep link、菜单命名与 runtime bypass 禁止项。
- `src/features/agent-app/packaging/`、`src/features/agent-app/shell/`、`src/features/agent-app/install-mode/` 与 `src/features/agent-app/runtime-profile/` 新增模块化事实源和对应回归，避免把 packaging / shell / runtime profile 混在单一 UI 层。
- `src/lib/api/agentApps.ts`、`src/lib/dev-bridge/mockPriorityCommands.ts` 与 `src/lib/governance/agentCommandCatalog.json` 同步 shell launch / directory select 命令边界。
- `src/lib/tauri-mock/agentAppMocks.ts` 与 `src/lib/tauri-mock/plugin-dialog.ts` 补齐浏览器模式 mock 和 dialog fallback 回归。
- `src/lib/configEventManager.ts` 补齐订阅代际保护与依赖注入测试隔离，避免 `unsubscribe()` 后仍被进行中的 `safeListen` 回写为已订阅状态。
- `src/components/agent/chat/skill-selection/SkillSelector.test.tsx` 固定 mock `characterMentionPanelLoader`，避免真实 lazy panel 在 Vitest 中引发 act 重叠和超时。
- `scripts/lib/harness-eval-history-record.test.ts` 与 `scripts/lib/harness-eval-history-window.test.ts` 调整超时上限，降低重负载环境下 history 记录 / 窗口测试误报。
- `.github/workflows/agent-app-standalone-release-gate.yml` 新增 standalone release gate，配套 `scripts/agent-app-standalone-release-secret-preflight.mjs`、`scripts/agent-app-standalone-release-evidence-check.mjs` 与 `scripts/agent-app-standalone-installer-verify.mjs`，把 macOS release 前置检查、证据校验和安装产物校验落成可复跑入口。
- `RELEASE_NOTES.md` 删除旧版本正文堆叠，只保留 `v1.44.0` 当前发布说明。

### 当前校验状态

- `npm run verify:app-version`：已通过，版本一致性为 `1.44.0`。
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`：已执行；`cargo fmt --manifest-path "src-tauri/Cargo.toml" --all -- --check` 已通过。
- `cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets --all-features -- -D warnings`：已通过。
- `cargo test --manifest-path "src-tauri/Cargo.toml"`：已通过；主库 `1410 passed / 1 ignored`，集成测试通过，真实联网测试按环境变量保持 ignored。
- `npm run lint`：已通过。
- `npm test`：已通过；`run-vitest-smart` 全部 `59/59` 批次通过。
- `npm run test:contracts`：已通过，覆盖 agent runtime client 生成检查、命令契约、harness 契约、modality runtime contract 与 cleanup report contract。
- `npm run verify:gui-smoke`：已通过；本轮复用已有 headless Tauri / DevBridge，并在 live Claw streaming smoke 中显式使用可用 `LIME_E2E_PROVIDER` / `LIME_E2E_MODEL`。
- `git diff --check`：已通过。

---

**完整变更**: `v1.42.0` -> `v1.44.0`
