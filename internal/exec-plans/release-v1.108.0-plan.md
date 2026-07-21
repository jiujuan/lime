# Lime v1.108.0 发布执行计划

状态：ready-for-release-confirmation
日期：2026-07-21
目标版本：`1.108.0`
目标 tag：`v1.108.0`

## 主目标

把 `v1.107.0` 后当前工作树中的 RuntimeCore、App Server v2 Thread/Turn/Item 协议、Electron Desktop Host、Renderer projection、Settings、Agent/Plugin runtime、存储迁移、测试与治理改动作为单一 release candidate，先取得匹配风险的 Gate A 与 Gate B 证据，再完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## 当前阶段与下一刀

- 当前阶段：门禁与最终候选冻结完成，等待 Git 发布危险操作确认。
- Gate A 已按 `internal/refactor/v1/05-verification-and-guardrails.md` 完成；Gate B 已取得真实 Electron、preload/IPC、App Server JSON-RPC、runtime/read model 与 GUI 终态证据。
- 中间双 snapshot `20260721T070423Z-f386c2223f73` 已稳定覆盖 1321 个路径和 34 个 P0/P1 surface；发现根目录 `interrupted` 被计入后，最终 snapshot 必须显式 `--exclude interrupted`，不删除用户文件。
- 下一刀：按最终 candidate 路径集执行 `git add`（继续排除 `interrupted`），复核 staged diff 后连续完成 release commit、tag、main/tag 推送与远端 tag 检查。

## Release Candidate

- 基线：`v1.107.0`；任务开始时 `main`、`origin/main` 与该 tag 指向 `b17977625`，目标 tag 本地不存在。
- `release metadata`：版本事实源、双语 release notes、本计划与执行计划索引。
- `candidate changes`：当前工作树中的产品、测试、脚本、schema、生成物、资源、治理和文档改动；协议生成物必须与 schema 同步。
- `excluded changes`：根目录空文件 `interrupted`，属于本地中断残留，不进入产品候选；不删除该用户文件。

## 窄写集与避让

发布准备只写版本事实源、双语 release notes、本计划、执行计划索引及门禁要求的生成物。若 Gate 暴露产品缺陷，先定位 current owner，再追加最小修复写集；不覆盖未知并行改动，不清理用户本地文件。

## 退出条件

1. Gate A 证明 v2 typed schema、App Server request/notification、canonical Thread/Turn/Item projection、分页与 cold read；Content Factory Renderer projection/fixture guard 作为补充证据，不扩张为 Electron 主链。
2. Gate B 证明真实 Electron、preload/IPC、`app_server_handle_json_lines`、current App Server method、runtime/read model 与 GUI 可见终态，生产 mock fallback 为零。
3. `npm run verify:app-version`、`npm run typecheck`、`npm run test:contracts`、`npm run smoke:agent-runtime-current-fixture`、`npm run verify:gui-smoke` 与 `git diff --check` 通过；按实际缺陷补定向回归。
4. 所有版本事实源同步为 `1.108.0`，双语 release notes 采用当前版本单页；候选 snapshot 在版本和说明更新后重新冻结并保持稳定。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`，发布前完成架构边界复核。
6. staged 集覆盖全部 release metadata 与 candidate changes，仅排除已声明的 `interrupted`。
7. 获得危险操作确认后，连续完成 `git add`、`git commit -m "Release v1.108.0"`、`git tag v1.108.0`、`git push origin main`、`git push origin v1.108.0`，并复核本地与远端 tag。

## 验证记录

- `npm run test:contracts`：通过；770 个协议类型无漂移、299 个 App Server client checks，Electron command/catalog、mock=0、scripts/release/docs guard 全绿。
- `npm run test:rust:related -- lime-rs/crates/app-server lime-rs/crates/agent-protocol lime-rs/crates/thread-store`：通过；App Server 1419/1419、agent-protocol 34/34、thread-store 28/28，完整反向依赖闭包全绿。
- `npm run governance:legacy-report`：通过；扫描 2383 个产品文件与 1172 个 Rust 文件，零分类漂移、零边界违规。
- `npx vitest run src/lib/api/agentRuntime/appServerCanonicalThreadProjection.test.ts scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs`：76/76，通过 Content Factory Gate A projection 与 fixture guard。
- `npm run verify:app-version`、`npm run typecheck`、`cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib`、`git diff --check`：通过；App Server 编译零 warning。
- `npm run bridge:health -- --timeout-ms 120000`：通过，42ms 返回 `status=ok`。
- `npm run verify:gui-smoke`：通过；evidence `standalone-shell-01-20260721063158-62100`，真实 Electron/preload/IPC、33 次 `app_server_handle_json_lines`、21/21 assertions、legacy/mock/console/page/invoke error 均为 0。
- `npm run smoke:agent-runtime-current-fixture`：通过；history、stream terminal、首页热路径、Coding Workbench、图片、cancel/continue、approval、Plan、Skills、MCP、media、Expert Plaza/Panel 和 Content Factory 全绿，`liveProviderUsed=false`。
- Content Factory Gate B R5：`.lime/qc/gui-evidence/claw-chat-current-fixture/release-v1.108.0-20260721-content-factory-v2-r5-summary.json`，70/70 assertions，动态 canonical session/thread identity、Article Editor、编辑、reload、artifact/read model 和 workflow 控制通过，console/page error 为 0。
- 中间正式双 snapshot：`20260721T070423Z-f386c2223f73` 稳定，Codex reference `9970cd706fc4f25bbb97b42f4b68d993dabe91e2`，34 个 surface contract 与 tracker `ready-for-gate` 一致；因后续发布文档更新且需排除 `interrupted`，不得作为最终发布 snapshot。
- 最终双 snapshot 已在 `--exclude interrupted` 下稳定生成，并由 `--verify-candidate` 独立复核为 `status=match`；1320 个 candidate paths、product/git diff/head/changed paths/excludes 全部一致，无 added/removed drift。具体 run-id 与 digest 以 `.lime/qc/project-gates/` 下最新 candidate JSON 为本地 evidence，不写入本计划以避免 candidate 自引用漂移。

## 架构确认

- 影响：重大。候选涉及 App Server v2 协议、RuntimeCore、Thread/Turn/Item read model、Electron bridge 和 Renderer projection。
- 架构事实源：`internal/aiprompts/architecture.md` 已同步唯一 Agent 产品链、Codex import canonical owner、FileChange batch 与 v2 resume 边界。
- 责任人：root（release owner，v1.108.0）。
- 日期：2026-07-21。
- 确认：已核对 Renderer -> Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item -> GUI 单轨；本次 Gate A/B 通过不代表 `internal/refactor/v1` 整体完成，v1 对齐仍约 40%。

## 分类与剩余限制

- `current`：App Server v2 Thread/Turn/Item、RuntimeCore、ThreadStore/ProjectionStore、model-provider、tool-runtime、Electron Desktop Host bridge、Renderer canonical projection、Content Factory v2 identity/read model。
- `compat`：仅保留外部/迁移边界声明的受控适配；本轮未新增 compat。
- `deprecated`：受治理目录约束的旧迁移/diagnostic 边界，只允许继续迁出。
- `dead / deleted / forbidden-to-restore`：旧 `file_artifact` display shape、已退役 `agentSession` lifecycle、runtime queue、imported sidecar、重复 provider owner、Settings Hotkeys/Shortcut UI 与生产 mock fallback。
- 未验证：Windows 真实 Electron 与打包产物 Gate B-P；本次 macOS source-built release 不伪造该平台证据。
- 未完成：commit、tag、push 和远端 tag 复核，等待危险操作确认。

当前 release candidate 完成度：`95%`；整个 Codex v1 对齐完成度：约 `40%`。
