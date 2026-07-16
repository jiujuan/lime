# Lime v1.105.0 发布执行计划

状态：validated / awaiting-git-confirmation
日期：2026-07-16
目标版本：`1.105.0`
目标 tag：`v1.105.0`

## 目标

将 `v1.104.0` 后当前工作树中的 unified exec、Multi-Agent、Codex 导入、Provider、GUI、测试与治理改动作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.104.0`；任务开始时 `main`、`origin/main` 与该 tag 指向同一提交，目标 tag 在本地与远端均不存在。
- 用户确认范围：最终工作树中的 401 个修改、77 个删除和 46 个未跟踪源码、测试、schema、脚本、文档与 evidence 路径全部进入本次发布，共 524 个路径，无排除项。
- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md` 与本计划。
- `candidate changes`：unified exec/PTY/execution process、AgentControl fork/crash commit、canonical conversation import、provider SSE、Agent GUI current owner、DeepSWE/project Gate harness、schema/client、测试、文档与治理删除。
- `excluded changes`：无。

## 窄写集与避让

本发布任务更新 7 个 release metadata / execution record 文件，并在发布门禁中对 queued-only active identity、Agent Runtime `FinishReason` import、Renderer read-model status import、approval fixture terminal predicate 与 execution process terminal wait 做最小根因修复。其余候选文件只读核对、运行验证并原样纳入，不覆盖无关并行实现。

## 退出条件

1. 所有版本事实源为 `1.105.0`，`npm run verify:app-version` 通过，旧版本只允许出现在 release comparison 和历史文档上下文。
2. 双语 release notes 采用当前版本单页，准确覆盖本次 unified exec、Multi-Agent、Codex 导入、Provider、GUI 与验证基础设施改动。
3. `npm run typecheck` 通过；按候选风险执行 `npm run test:contracts`、`npm run test:rust:changed`、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，没有未说明的排除项。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`；仍在推进的 Codex 导入和项目 Gate 状态不得在 release notes 中误写为已完成。
6. 获得危险操作确认后，连续完成 `git commit`、`git tag v1.105.0`、`git push origin main`、`git push origin v1.105.0`，并复核本地与远端 tag。

## 当前状态

- 用户已明确确认当前工作树全部改动进入 `v1.105.0`，包括仍在推进的 Codex 导入与项目 Gate 工作，无排除项。
- `HEAD`、`origin/main` 与 `v1.104.0` 一致；`v1.105.0` 本地/远端 tag 均不存在。
- release metadata 已更新，发布门禁已通过；staging 与 Git 发布操作待危险确认。

## 验证记录

- `npm run verify:app-version`：通过，根应用、CLI npm package、Rust workspace、sidecar manifest 一致为 `1.105.0`。
- `npm run typecheck`：通过；门禁期间发现并修复 Renderer read-model projection 缺失的 type-only import。
- `npm run test:contracts`：通过；697 个 protocol types 无漂移，App Server client 290 checks，command / harness / modality / scripts / Electron release workflow / docs boundary 全部通过。
- `npm run test:rust:changed`：因 workspace manifest / lockfile 触达扩大为 `cargo test --lib --workspace`，最终通过；包含 Agent Protocol 29、Agent Runtime 117、App Server 1149、Tool Runtime 246 等测试。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`：通过；修复 provider turn 新增 `FinishReason` 映射时遗漏的 import。
- queued / active 定向 Rust 回归：`active_turn_id_from_stored_turns_uses_latest_executing_turn` 与 `queued_turn_keeps_thread_running_without_becoming_active` 通过，queued-only 线程保持 running 但不再回填 active identity。
- execution process JSON-RPC terminal 回归连续运行 10 次通过；测试改为等待真实 `exited` predicate，消除 stdout 先于终态提交的负载竞态。
- Renderer read-model / stream / workspace 定向回归共 45 项通过；`appServerReadModelProjection` 修复后 9 项再次通过。
- approval fixture wait / guard 65 项通过；`approval-request-resume` 唯一前缀 Gate B 通过，首轮 compact record 与第二轮 session cache 均稳定可见。
- `inputbar-pending-steer-pop-front-resume` 唯一前缀 Gate B 通过：真实 Electron、preload/IPC、App Server JSON-RPC、queued promote/cancel/resume/read model 与 GUI input ready 全部成立，无 console / page / invoke error、legacy 命中或 mock fallback。
- `npm run smoke:agent-runtime-current-fixture`：完整通过，覆盖 history/cache、coding、image、cancel/continue、四类 approval、rich restore、multi queue、pop-front resume、Plan、Skills、MCP、Expert 与 Content Factory；`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；production renderer、Electron main/preload、App Server `1.105.0` sidecar、Claw shell reload 与 memory settings 完成，evidence run=`standalone-shell-01-20260716033513-36687`。
- `git diff --check`：通过。

## 架构确认

- 影响：重大。候选新增 unified exec/execution process、Multi-Agent fork/crash commit，并把 Codex import 从 imported runtime-event 双轨迁向 canonical Thread/Turn/Item。
- 架构图/文字边界：`internal/aiprompts/architecture.md` 已随候选同步 current owner、依赖方向、canonical import 与 crash commit。
- 架构图确认：已复核。`internal/aiprompts/architecture.md` 覆盖本候选的 current owner 与依赖方向；门禁根因修复未新增 public boundary 或第二套 owner。Codex import 与项目 Gate 仍为 active follow-on，不在本版本中宣称全量验收完成。
- 责任人：release owner（v1.105.0）。
- 日期：2026-07-16。

当前完成度：`95%`。下一刀：取得 Git 危险操作确认后，连续完成 `git add -A`、release commit、tag、main/tag 推送与远端复核。
