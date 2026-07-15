# Lime v1.104.0 发布执行计划

状态：release-ready / gates-passed / awaiting-publication-authorization
日期：2026-07-15
目标版本：`1.104.0`
目标 tag：`v1.104.0`

## 目标

将 `v1.103.0` 后当前工作树中的 Refactor V2 Agent 主链收口作为单一 release candidate，完成版本事实源、双语 release notes、发布门禁、release commit、tag、main/tag 推送和远端复核。

## Release Candidate

- 基线：`v1.103.0`；任务开始时 `main`、`origin/main` 与该 tag 指向同一提交，目标 tag 在本地与远端均不存在。
- 用户确认范围：任务开始时工作树中的 336 个已跟踪改动和 82 个未跟踪源码、测试、schema、脚本、文档与 evidence 路径全部进入本次发布，无排除项。
- `release metadata`：`package.json`、`packages/lime-cli-npm/package.json`、`lime-rs/Cargo.toml`、`lime-rs/Cargo.lock`、`RELEASE_NOTES.md`、`RELEASE_NOTES.en.md` 与本计划。
- `candidate changes`：canonical Message/Reasoning/Plan lifecycle、typed AgentMessage content parts、ThreadStore ordinal 与 projection fail-closed、AgentSession current presentation、provider 双代数删除、Approval typed response、AgentControl effective route/visible DOM、MCP elicitation capability、GUI current owner/i18n、Runtime/GUI fixture 与治理 evidence。
- 用户确认后并行 owner 完成的 S4ag-S4ak current 收口也进入本次 release candidate；没有覆盖或排除其写集。
- 最终候选冻结为 472 个路径：336 个修改、42 个删除、94 个新增源码、测试、schema、脚本、文档、evidence 与 release metadata 路径。
- `excluded changes`：无。

## 窄写集与避让

本发布任务只修改 7 个 release metadata / execution record 文件。其余候选文件只读核对、运行验证并原样纳入；不夹写既有 Agent Runtime、App Server、Renderer、协议、脚本、测试和 roadmap 实现。

## 退出条件

1. 所有版本事实源为 `1.104.0`，`npm run verify:app-version` 通过，旧版本只允许出现在 release comparison 和历史文档上下文。
2. 双语 release notes 采用当前版本单页，准确覆盖本次 canonical lifecycle、ThreadStore、provider、Approval、GUI/i18n、fixture 与治理收口。
3. `npm run typecheck` 通过；按候选风险执行 `npm run test:contracts`、`npm run test:rust:changed`、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`。
4. `git diff --check` 通过；staged 集覆盖全部 release metadata 与 candidate changes，没有未说明的排除项。
5. 重大架构改动已同步 `internal/aiprompts/architecture.md`，并在本计划记录架构影响、图示/文字边界、责任人与日期。
6. 获得危险操作确认后，连续完成 `git commit`、`git tag v1.104.0`、`git push origin main`、`git push origin v1.104.0`，并复核本地与远端 tag。

## 当前状态

- 用户已明确确认当前工作树全部改动进入 `v1.104.0`，无排除项。
- `HEAD`、`origin/main` 与 `v1.103.0` 一致；`v1.104.0` 本地/远端 tag 均不存在。
- release metadata 已完成，所有发布门禁通过；staging 与发布 Git 写操作待执行。

## 验证记录

- `npm run verify:app-version`：通过，版本一致为 `1.104.0`。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过；protocol types 700/0 drift、App Server client 288 checks、command、Harness、modality、scripts、Electron release workflow、cleanup 与 docs boundary 全部通过。
- 最终快照复验的 `npm run typecheck`：通过。
- 最终快照复验的 `npm run test:contracts`：通过；protocol types 700/0 drift、App Server client 288 checks、command、Harness、modality、scripts、Electron release workflow、cleanup 与 docs boundary 全部通过。
- `npm run governance:legacy-report`：通过；零引用候选 `0`、分类漂移 `0`、边界违规 `0`。
- `npm run test:rust:changed`：通过；因 workspace manifest/version 变更按 runner 规则扩大为 workspace library tests。App Server 1124/1124、Agent Runtime 117/117、MCP 140/140、Model Provider 126/126、Tool Runtime 251/251 等全部通过；有 4 条 App Server test-only unused/dead-code warning，联网或沙箱限制用例保持明确 ignored。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 history/cache、stream terminal、Electron fixture guard、首页、Coding、媒体、Approval、Inputbar queue、Plan、Skills、MCP、Expert 与 Content Factory current 链，`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过；renderer、Electron main/preload、真实 App Server sidecar `1.104.0`、Claw workbench 与 memory settings 就绪。
- S4al AgentControl cold-restart visible-DOM Gate B：通过；真实关闭并重启 Electron/App Server 后六个 Tool、SubAgent activity 与 child Thread identity 完全稳定，`agentSession/read`/`thread/list` 均走 `electron-ipc/success`，console/invoke error 0。
- S5ag workspace command wiring：通过；最终 `AgentChatWorkspace` 只组合 current owner 返回值，command scope 复用既有 runtime hooks，`npm run typecheck` 与 `npm run verify:gui-smoke` 针对最终快照通过。
- S4ah AgentControl visible-DOM Gate B：28/28 assertions，六个 AgentControl Tool row completed/visible，三类 activity 可见，console/invoke error 0。
- S4ak MCP elicitation Gate B：通过；runtime initialize 为 `2025-06-18 + { elicitation: {} }`，management capability absent，表单提交/关闭与最终 read model 完成。

## 架构确认

- 影响：重大。本候选收紧 canonical Message/Reasoning/Plan lifecycle、ThreadStore ordinal/projection、AgentSession presentation 与 provider-neutral algebra owner，并删除旧 fallback、双代数、generic lowering 与 synthetic Team fixture。
- 架构图/文字边界：`internal/aiprompts/architecture.md` 已随候选同步更新 current owner、EventLog-first fail-closed 顺序、typed content parts 与 dead/forbidden-to-restore 路径。
- 架构图确认：已确认 current owner、依赖方向和删除分类与本候选一致，不新增第二 runtime、read model、provider algebra 或 mock fallback。
- 责任人：release owner（v1.104.0）。
- 日期：2026-07-15。

当前完成度：`90%`。下一刀：复核最终 staged candidate，取得危险操作确认后执行 release commit、tag、main/tag push 与远端校验。
