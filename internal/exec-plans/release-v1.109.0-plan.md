# Lime v1.109.0 发布执行计划

状态：ready-for-confirmation
日期：2026-07-22
目标版本：`1.109.0`
目标 tag：`v1.109.0`

## 主目标

把 `v1.108.0` 后当前工作树中的 Thread Goal、public thread fork/delete、typed reverse server request、Provider route/cache、MCP runtime、Plugin worker、协议客户端、GUI、测试和架构文档作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送与远端复核。

## 当前阶段与下一刀

- 当前阶段：版本、发布说明与发布门禁已完成，release candidate 已冻结并等待 Git 写操作确认。
- 下一刀：取得危险操作确认后，纳入全部候选并排除根目录 `interrupted`，连续完成 release commit、tag、main/tag 推送与远端复核。

## Release Candidate

- 基线：`v1.108.0`；任务开始时 `main`、`origin/main` 与该 tag 指向 `47f5cf4a7`，目标 tag 本地和远端均不存在。
- `release metadata`：根应用、CLI npm package、Rust workspace/Cargo lock 版本，双语 release notes，本计划与执行计划索引。
- `candidate changes`：任务开始时工作树中的 current 产品、测试、schema、生成类型、package client、脚本、架构与执行计划改动，以及门禁所需的最小发布修复。
- `excluded changes`：根目录空文件 `interrupted`，属于本地中断残留，不进入产品候选；不删除该用户文件。

## 窄写集与避让

发布准备只写版本事实源、双语 release notes、本计划、执行计划索引，以及删除 `chatLayoutVisibility.ts` 中已确认的临时调试日志。其余业务改动只审阅、验证和纳入候选；若门禁暴露缺陷，先定位 current owner，再声明最小修复写集。

## 退出条件

1. 所有版本事实源同步为 `1.109.0`，双语 release notes 采用当前版本单页。
2. `npm run verify:app-version` 与 `npm run typecheck` 通过。
3. 协议与 bridge 改动通过 `npm run test:contracts`；Runtime/Agent/MCP/Provider 改动通过风险匹配的 Rust related tests。
4. `npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke` 通过，或明确记录可复现的环境限制与阻塞。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md` 并完成单轨边界确认。
6. staged 集覆盖全部 release metadata 与 candidate changes，只排除已声明的 `interrupted`。
7. 获得危险操作确认后，连续完成 `git add`、`git commit -m "Release v1.109.0"`、`git tag v1.109.0`、`git push origin main`、`git push origin v1.109.0`，并复核本地与远端 tag。

## 验证记录

- `npm run verify:app-version`：通过，根应用、CLI npm package 与 Rust workspace 均为 `1.109.0`。
- `npm run typecheck`：通过，满足发布硬门禁。
- `npx vitest run "src/features/plugin/runtime/agentRuntimeCapabilityHost.test.ts"`：通过，`13/13`。
- `npm run test:contracts`：通过；`773` 个生成协议类型无漂移，App Server client `300` checks 通过，Electron command/catalog、生产 mock=0、scripts、release 与 docs guard 均通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib repairable_child_event_log_tail_does_not_block_parent_wait -- --nocapture`：通过，`1/1`；验证 WaitAgent 在消费已有 terminal mailbox 前修复 direct-child EventLog 可修复尾部。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib`：通过，`1462/1462`。
- `npm run test:rust:related -- "lime-rs/Cargo.toml"`：通过；workspace manifest 触达 workspace 边界，全部 workspace `--lib` 测试通过，仅保留测试自身声明的 live/provider/沙箱环境 ignored 项。
- `npm run smoke:agent-runtime-current-fixture`：通过；真实 Electron fixture Gate B 覆盖 Claw、coding workbench、图片任务、审批、计划、Skills、MCP、媒体与文章工作区，`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；隐藏窗口的真实 Electron fixture Gate B 覆盖 renderer、preload/IPC、App Server sidecar `1.109.0`、Claw shell、reload、记忆设置与 evidence。Vite/Browserslist 和 Electron `console-message` deprecation 为非阻塞 warning。
- `npm run governance:legacy-report`：通过；扫描 `2386` 个文件，分类漂移候选 `0`、边界违规 `0`。
- `git diff --check`：最终候选复核通过。
- 候选统计：最终暂存 `276` 个路径（`20663` additions / `7128` deletions）；仅排除根目录 0 字节 `interrupted`，目标 tag 本地与远端仍不存在。

## 架构确认

- 影响：重大。候选涉及 App Server v2 protocol、RuntimeCore、Thread/Turn/Item history、Goal、MCP runtime、Provider route、Electron bridge 与 Renderer gateway。
- 架构事实源：`internal/aiprompts/architecture.md` 已包含本轮 public fork、canonical history、typed request 和 MCP provenance 边界改动，发布门禁后复核。
- 责任人：root（release owner，v1.109.0）。
- 日期：2026-07-22。
- 确认状态：已确认。架构事实源与唯一产品链保持一致；本轮没有引入第二套 Electron 后端、provider owner、tool owner 或兼容业务路径。

## 分类与剩余限制

- `current`：App Server v2 Thread/Turn/Item、Thread Goal、public fork/delete、typed reverse server request、credential-scoped Provider metadata、MCP snapshot/environment/lifecycle、Plugin worker current bridge。
- `compat`：无 lineage 的 legacy compaction summary 仅保留明确 fail-safe；本轮不扩展。
- `deprecated`：旧 `agentSession/action/{replay,respond}` 与 `agentSession/runtimeEvents/append` 尚未完全删除，继续迁出，不得承接新功能。
- `dead / deleted / forbidden-to-restore`：`agentSession/delete`、raw EventLog history copy、provider-name protocol inference、cwd-derived MCP environment identity 与 metadata-routed waiter lookup。
- 平台限制：Windows 真实 Electron 与打包产物门禁尚未执行，不伪造平台证据。

当前 release candidate 完成度：`90%`；剩余仅为经确认后的 commit、tag、push 与远端复核。整个 Codex v1 对齐完成度：约 `40%`。
