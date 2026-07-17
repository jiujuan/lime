# Lime v1.106.0 发布执行计划

状态：validated-awaiting-git-confirmation
日期：2026-07-17
目标版本：`1.106.0`
目标 tag：`v1.106.0`

## 目标

将 `v1.105.0` 后当前工作树中的 Provider transport、多模态、App Server 并发、Codex 导入、Multi-Agent、Agent GUI、Settings Gate 与质量治理改动作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.105.0`；任务开始时 `main`、`origin/main` 与该 tag 指向同一提交，目标 tag 在本地与远端均不存在。
- 任务开始时工作树包含 243 个已跟踪改动和 27 个未跟踪源码、测试、schema、脚本与文档路径，共 270 个候选路径；未发现缓存、凭证、个人环境或临时产物。
- 门禁期间并行 Codex import owner 新增后台 import job、progress/read method、GUI 进度与生成协议工件，Settings / Agent fixture owner 同时扩展 Gate B harness；最终冻结盘点为 285 个已跟踪改动和 48 个未跟踪文件，共 333 个候选路径。
- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md` 与本计划。
- `candidate changes`：Provider Responses WebSocket/HTTP fallback、多模态 input media、App Server dispatcher/stdio concurrency、provider history/compaction、Multi-Agent mailbox lifecycle、Codex canonical import/performance/background job/GUI、Settings Gate A、native executable environment、protocol/client/i18n、测试、文档与治理删除。
- `excluded changes`：无。除 release metadata 外，候选业务文件只读核对、运行验证并原样纳入。

## 窄写集与避让

本发布任务只更新上述 7 个 release metadata / execution record 文件；不重写其余脏工作树中的候选实现，不覆盖并行工作结果。若门禁发现产品缺陷，只在确认根因后修改对应 current owner，并把新增写集和验证记录回本计划。

## 退出条件

1. 所有版本事实源为 `1.106.0`，`npm run verify:app-version` 通过；旧版本只允许出现在 release comparison、历史计划和变更上下文。
2. 双语 release notes 采用当前版本单页，准确覆盖 Provider WebSocket、多模态、App Server 并发、Codex 导入、Multi-Agent、GUI 与质量治理，并明确 Windows/live/eval 和超大 rollout 后续边界。
3. `npm run typecheck` 通过；按候选风险执行 `npm run test:contracts`、`npm run test:rust:changed`、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，没有未说明的排除项。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`；本计划完成 release owner 架构复核，不把仍 active 的项目 Gate、Windows/live/eval 或超大 rollout 后台导入误写为完成。
6. 获得危险操作确认后，连续完成 `git add -A`、`git commit -m "Release v1.106.0"`、`git tag v1.106.0`、`git push origin main`、`git push origin v1.106.0`，并复核本地与远端 tag。

## 当前状态

- release candidate 已冻结，纳入当前全部产品、文档、测试、schema 与脚本改动，无排除项。最终快照为 285 个 tracked、48 个 untracked，共 333 个路径；门禁结束时未发现仍在修改候选源码的测试或构建进程。
- 版本事实源和双语 release notes 已更新，release notes 已纳入后台 import job、GUI progress 与 Settings Gate B 最终行为。
- App Server `conversationImport/thread/commit` -> Renderer gateway -> `conversationImport/job/read` polling -> GUI progress 主链已接通，五语言 progress 文案齐全；gateway、view-model 与 progress component 定向回归 27/27 通过。
- protocol catalog 测试已补入 `METHOD_CONVERSATION_IMPORT_JOB_READ`；定向 catalog 测试和扩大后的 `npm run test:rust:changed` 均通过。
- 冻结摘要排除本发布计划自身后：tracked diff `9a9cd2ea4222703b306080c81ab94636f40694240ece610427e649d2b54673ff`，untracked content `b77e75a24b72546a1f524f641dd8c8aeb6603ba4b51649a57d0303e819fe1352`。最终门禁后复核无业务候选漂移。
- 本地与远端 `v1.106.0` 均不存在；`main`、`origin/main` 仍指向 `v1.105.0` 提交 `a44d88585b7d`。
- Git staging、commit、tag 与 push 尚未执行，等待危险操作确认。

## 验证记录

- `npm run verify:app-version`：最终快照通过，版本事实源一致为 `1.106.0`。
- `npm run typecheck`：最终快照通过。
- `npm run test:contracts`：最终快照通过；704 个 v0 types 无漂移，App Server client 291 checks，Electron Host 93 commands，mock priority 0，modality/scripts/release/docs boundary 全绿。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server`：通过；存在一个后台 import 接入后未使用的同步 commit wrapper warning，由热区 owner 处理。
- conversation import gateway/view-model/progress component 定向回归：27/27 通过；覆盖 start/read job、polling success/failure/timeout/abort、真实 item progress、五语言文案与稳定 progress surface。
- `npm run test:rust:changed`：补齐 protocol catalog 断言后完整通过；workspace 扩大门禁、App Server 1181、Agent Runtime 121、Tool Runtime 246 及其余受影响 crate 均通过。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 history/cache、terminal、审批、rich restore、FIFO queue、Plan、Skills、MCP structured content、media reference、Expert Skills 与 Content Factory；`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；renderer、Desktop Host、preload、App Server sidecar、Workbench、Memory Settings 与 reload 主路径可用，App Server 报告 `appserver.v0` / `1.106.0`。
- `npm run smoke:settings-about-electron-fixture`：通过；Settings About 版本页专项 Gate B 证据已生成。
- `npx prettier --check "RELEASE_NOTES.md" "RELEASE_NOTES.en.md" "internal/exec-plans/release-v1.106.0-plan.md"`：通过。
- `git diff --check`：最终候选快照通过。

## 架构确认

- 影响：重大。候选新增 Provider Responses WebSocket transport、App Server request 并发调度与 Codex import 增量 materialization，并统一 canonical message/media/history projection。
- 架构图/文字边界：`internal/aiprompts/architecture.md` 已随候选同步 App Server dispatcher/stdio、Provider session transport、宿主进程 deadline 与 canonical import/GUI owner。
- 架构图确认：release owner 已复核并确认 Provider transport、App Server dispatcher/stdio serialization、canonical import/background job 与 GUI owner 均符合 current 单轨边界。此确认只允许本候选进入 release evidence，不关闭仍 active 的 Codex import、项目 Gate、Windows 平台证据或 Refactor V2 后续计划。
- 责任人：release owner（v1.106.0）。
- 日期：2026-07-17。

当前完成度：`95%`。下一刀：暂存全部 333 个候选路径并复核 staged 摘要；获得危险操作确认后连续完成 release commit、`v1.106.0` tag、main/tag 推送与远端 tag 复核。
