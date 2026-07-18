# Lime v1.107.0 发布执行计划

状态：ready-to-rerun-release
日期：2026-07-18
目标版本：`1.107.0`
目标 tag：`v1.107.0`

## 目标

将 `v1.106.0` 后当前工作树中的 Electron 更新链、Windows Squirrel 发布验证、Agent canonical projection、Codex 导入、Settings/Browser Runtime、首页皮肤、GUI timeline、质量脚本与治理文档改动作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.106.0`；任务开始时 `main`、`origin/main` 与该 tag 指向同一提交，目标 tag 在本地不存在。
- 初始候选盘点包含 213 个已跟踪改动和 72 个未跟踪文件，共 285 个候选路径；本轮追加 Windows Squirrel N-1 导航竞态修复、Release sherpa-onnx 预编译库预热、回归测试及首页皮肤资源，仍无排除项。
- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md` 与本计划。
- `candidate changes`：当前工作树全部产品、测试、脚本、schema、资源、治理和文档改动，无排除项。
- `excluded changes`：无。

## 窄写集与避让

本发布任务只新增/更新上述 release metadata 与执行记录文件，不重写其余脏工作树中的候选实现，不覆盖并行工作结果。若门禁发现产品缺陷，只在确认根因后修改对应 current owner，并把新增写集和验证记录回本计划。

## 退出条件

1. 所有版本事实源为 `1.107.0`，`npm run verify:app-version` 通过；旧版本只允许出现在 release comparison、历史计划和变更上下文。
2. 双语 release notes 采用当前版本单页，覆盖 Electron 更新、Windows Squirrel、Agent/导入 canonical projection、Settings/Browser Runtime、首页皮肤、GUI 与质量治理。
3. `npm run typecheck` 通过；按候选风险执行 `npm run test:contracts`、`npm run test:rust:changed`、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`，并补充 Windows Squirrel RC 定向回归。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，没有未说明的排除项。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`，release owner 完成架构边界复核。
6. 获得危险操作确认后，连续完成 `git add -A`、`git commit -m "Release v1.107.0"`、`git tag v1.107.0`、`git push origin main`、`git push origin v1.107.0`，并复核本地与远端 tag。

## 当前状态

- Release candidate 已冻结，纳入当前全部候选路径，无排除项；用户已明确要求覆盖 `v1.107.0` 并递交全部当前改动。
- 版本事实源与双语 release notes 已更新，并补记 Windows startup-page navigation race hotfix。
- 首轮覆盖提交 `7fb666415` 已完成并推送；Release workflow `29631194668` 因三平台构建时缺少 sherpa-onnx 预编译库失败，未进入 Windows N-1 smoke。
- 已加入 Release 与 Quality/Windows smoke 构建前按目标显式准备 sherpa-onnx 运行库的 workflow guard；同时纳入 provider SSE usage trailer、thinking 修订快照去重、首页层级/皮肤布局和 Claw 路由草稿清理修复，待覆盖提交、tag 和 workflow。

## 验证记录

- `npm run verify:app-version`：通过，版本事实源一致为 `1.107.0`。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 704 个无漂移，App Server client 291 checks，Electron host 93 commands，mock priority 0，modality/scripts/release/docs boundary 全绿。
- `npm run test:rust:changed`：通过；workspace 全量 lib tests，App Server 1183、Agent Runtime 121、Tool Runtime 247 及其余受影响 crate 全部通过；首次运行的 1 个过时顺序断言已修正并定向复测通过。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 Agent history/cache、Claw GUI、coding workbench、图片/媒体、approval、Inputbar queue、Plan、Skills/MCP、Expert Skills 与 Content Factory，`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；renderer、Desktop Host、preload、App Server sidecar、Workbench、Memory Settings 与 reload 主路径可用，报告 `appserver.v0 / 1.107.0`。
- `git diff --check`：通过。
- `npx vitest run scripts/electron/windows-squirrel-rc-smoke.test.mjs scripts/electron/release-workflow-guard.test.mjs scripts/electron/current-entrypoints.test.mjs`：通过，3 files / 52 tests。
- 更新 workflow 后 `npx vitest run scripts/electron/release-workflow-guard.test.mjs scripts/electron/windows-squirrel-rc-smoke.test.mjs scripts/electron/current-entrypoints.test.mjs src/components/agent/chat/components/EmptyStateLayout.test.tsx src/components/agent/chat/components/homeSkinPresentation.test.ts`：通过，5 files / 62 tests。
- 两个 Windows Squirrel 修改脚本 `node --check`：通过。
- 首轮远端 Release `29631194668`：失败于三平台 `app-server` 链接；Windows `sherpa-onnx-c-api.lib` 缺失，macOS `sherpa-onnx-c-api` 共享库目录缺失，未执行 N-1。
- 第二轮 `29631571374` 与第三轮 `29631599498` 在新增预热步骤解压阶段暴露 Windows Git Bash 驱动器路径解析错误；已改为 basename + workspace cwd，补充跨平台回归。
- 本轮同时纳入 provider SSE `finish_reason` 终止修复与 revised thinking snapshot 去重；Rust related 矩阵 1182 项通过、1 项既有 app-server 时序断言失败，需单独复核。
- 本轮工作树追加差异的定向验证：`npm run verify:app-version`、`npm run typecheck`、`git diff --check` 通过；6 个前端 Vitest 文件 61 项通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib current_client` 45 项通过。
- 远端 Quality `29633271523` 的失败证据：Vitest layer budget 36/30（既有仓库基线）、GUI smoke 与 Rust Full 均因 CI sherpa-onnx 预编译库未准备而链接失败；新 SHA `46f445588` 已验证 GUI smoke 预热成功，Rust Full 仍缺该步骤，已追加同样的目标预热并待下一 SHA 复验。
- Quality `29635195772` 已证明 sherpa 预热修复有效：GUI smoke 通过，Rust workspace 编译并通过 1183 项；剩余 Rust 失败来自 `host_boundary_guard` 检出单元测试 fixture 中的 `electron` 字面量，已改为中性 host fixture 并在本地复测 2 项守卫通过。
- Release `29635584989` 已越过 Windows 构建、资源校验、staging 和 N-1 下载，真实 N-1 smoke 暴露安装器父进程退出后 `Update.exe` 仍持有 Squirrel 单实例锁；结构化错误为 `AutoUpdater process with arguments --checkForUpdate,... is already running`。RC helper 现按完整 executable path 等待安装器遗留 updater 退出后才启动 N-1 应用，55 项 Electron/Release 定向回归通过。
- Release `29636439016` 证明外部 `Update.exe` 等待仍不足以消除重复检查：`v1.106.0` 没有候选版本已加入的下载中去重保护，RC harness 的手动检查会与 N-1 App Sidebar 自动检查竞争并再次触发 native updater。harness 现只等待并观察 N-1 自动检查 session，禁止主动调用 `check_for_updates`；真实 Windows 终态待下一次 Release 验证。
- 真实 Windows packaged L8/N-1 验证：待路径修复后的远端 Release workflow 执行；本机为 macOS，无法代替 Windows 证据。

## 架构确认

- 影响：重大。候选涉及 Electron Desktop Host/update、App Server canonical read model、Agent/Thread/Turn/Item projection、Browser Runtime 与 GUI 皮肤/设置主链。
- 架构图/文字边界：`internal/aiprompts/architecture.md` 已在候选中同步；发布 owner 需在门禁完成后复核 current 单轨边界。
- 责任人：release owner（v1.107.0）。
- 日期：2026-07-18。

当前完成度：`97%`。下一刀：提交 Squirrel updater quiescence 修复，覆盖 `v1.107.0` 到最终 SHA，再监控三平台构建和 Windows N-1 终态。
