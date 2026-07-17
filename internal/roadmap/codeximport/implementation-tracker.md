---
title: Codex 对话兼容实施跟踪
status: active
owner: app-server-runtime
updated: 2026-07-17
---

# 实施跟踪

## 当前阶段

主目标：用 Codex canonical Thread / Turn / Item 语义重建历史，并让导入后续聊进入 Lime
current tool executor。

当前阶段：`S4 验证与架构确认`。

完成度：`99%`。导入 fidelity、普通/导入续聊同构、GUI 单轨、响应式单面板、有界真实样本 Gate B 与超大 rollout 后台导入均已完成；剩余为责任开发者架构确认。

下一刀：由责任开发者完成架构确认；随后在 Windows runner 补路径与压缩历史的真实 Electron 证据。本机不伪造 Windows 平台证据。

## 写集

- `internal/roadmap/codeximport/**`
- `internal/exec-plans/codex-conversation-compat-refactor-plan.md`
- `internal/aiprompts/architecture.md`
- `lime-rs/crates/app-server/src/runtime/conversation_import/**`
- 必要的 `app-server-protocol` / generated client schema
- imported-only Renderer projection、i18n 与定向测试
- 既有 Codex import fixture/smoke；不新增平级根脚本目录

当前工作树存在其他 Agent Runtime / multi-agent 改动。本任务不覆盖这些改动；若必须触碰
同一文件，只追加本任务最小差异并复核 `git diff`。

## 状态

| ID      | 工作项                                 | 状态      | 退出条件                                                                                                                                   |
| ------- | -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CCI-001 | 重置路线图与架构事实源                 | completed | README、PRD、tracker、exec plan、architecture 同步                                                                                         |
| CCI-002 | Codex rollout canonical decoder        | completed | 主要 persisted item 直接映射为 canonical item，无 imported runtime wire                                                                    |
| CCI-003 | ThreadStore / ProjectionStore 原子导入 | completed | EventLog -> ThreadStore -> projection 顺序与普通历史一致，失败回滚有回归                                                                   |
| CCI-004 | imported runtime sidecar 退场          | completed | 已删除 projection budget、sidecar、method/schema/client 与详情面板                                                                         |
| CCI-005 | GUI 单轨                               | completed | active turn 复用普通 operational renderer；terminal 历史只投影 final/附件/文件产物变更/处理时长，旧 imported-only 与历史展开路径无正向入口 |
| CCI-006 | live tool continuation                 | completed | provider fixture 从普通/导入 session 触发同构 command/tool terminal item                                                                   |
| CCI-007 | Gate B 与大样本                        | completed | Electron click-through、真实有界样本、多视口、零 console/bridge error；后台 job 承接超大样本                                               |
| CCI-008 | dead surface guard                     | completed | retired names 只允许负向测试/历史 evidence，governance 扫描零违规                                                                          |
| CCI-009 | 响应式 GUI 单轨                        | completed | 宽容器分栏；compact/narrow 聊天优先单面板；断点不重挂载消息树；历史 operational DOM 为 0；真实 Electron 无控件重叠                         |
| CCI-010 | 超大 rollout 后台导入                  | completed | commit-start 快速返回；job/read 可观测阶段与 terminal；40 turns / 1,200 commands 压力回归                                                  |
| CCI-011 | 后台关闭与重附着                       | completed | 批量 job 先启动；关闭只终止 Renderer observer；按 importJobId 重附着；Gate B 单次 commit                                                   |

## 2026-07-17 验证记录

- `npm run test:rust:related -- "lime-rs/crates/app-server/src/runtime/conversation_import"`：app-server 1181/1181。
- `npx vitest run "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" "src/components/workspace/layout/LayoutTransition.test.tsx" "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx"`：26/26。
- `npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-v30`：Gate B 通过；15 items / 4 messages；desktop / compact / narrow；六类文件预览；同 session 续聊；模式控件零重叠。
- `npm run smoke:local-history-import-real-sample-visual-audit -- --timeout-ms 240000 --prefix local-history-import-real-sample-visual-audit-v4 ...`：默认预算 Gate B 通过，5 个 turn 组 / 10 条消息 / 346 个 tool row / 10 个文件产物 / 9 组视觉审计。
- `npm run test:contracts`（291 checks）、`npm run smoke:agent-runtime-current-fixture`、`npm run governance:legacy-report`、`npm run governance:scripts`、`npm run verify:gui-smoke`：通过。
- 后台导入 gateway / View Model / DOM、Codex import fidelity matrix、click-through guard 与真实样本 visual-audit guard：47/47；矩阵行按 Markdown 首列结构匹配，并直接绑定 current job/read、可关闭进度、重新附着与 GUI 可见文本泄漏守卫。
- `npm run docs:boundary`：通过；路线图、架构与执行计划仍保持 current owner 边界。
- `conversationImport/thread/commit -> conversationImport/job/read` public JSON-RPC 集成通过；后台 job RuntimeCore 单元 2/2，多 turn 压力回归 40 turns / 1,200 commands、5.59 秒完成、进度 40/40。
- `codex-import-click-through-background-v1` 与 `local-history-import-real-sample-background-v1` Gate B 通过；trace 消费 `job/read`，真实样本最终 434 canonical items、346 tool rows、10 file artifacts，9 组视觉审计与 console error 0。
- `codex-import-click-through-background-resume-v1` Gate B 通过；批量确认先启动 job，关闭弹窗只 abort Renderer observer，重开后 `importing` 会话优先选中并按 `importJobId -> job/read` 重新附着；闭环只有 1 次 `thread/commit` / 1 次 `job/read`，最终 195 canonical items / 4 messages、三视口审计、同 session 续聊与 console error 0。
- 2026-07-17 历史终态 GUI 语义收口：删除历史“点击展开 operational details”测试和 helper；真实 Electron approval allow/decline/cancel 三分支通过，terminal 审批 canonical item 仍在 read model，GUI 只保留不可交互历史摘要；`toolCallRowCount=0`、`operationalTimelineDetailsCount=0`、`deferredHistoricalPreviewCount=0` 成为真实样本门禁。
- 2026-07-17 大样本性能与列表错误收口：最初的真实 28 回合样本在 `commit-selected-thread` 后因单个 imported tool item 内嵌完整 `structuredContent` 导致 renderer/App Server 页面关闭；事件 JSONL 约 88 MB、projection SQLite 约 150 MB。Codex 导入工具结果现在保留 text/error/duration/outputRef 等历史摘要，去掉只在运行态有价值的原始结构化 payload；`read_file` 仍保留完整文件内容用于 artifact 预览，但移除 `file.changed` 中重复的 `previousContent`。同样本最终事件 JSONL 约 30 MB、projection SQLite 约 34 MB，导入、`agentSession/read`、reload、侧边栏列表重载均完成，console error 为 0。
- 最新 Gate B 证据：`local-history-import-real-sample-final-summary.json`，28 turns、618 canonical items（443 tool_call、39 file_artifact、3 context_compaction）、28 user messages、18 canonical assistant messages、14 attachments；desktop/compact/narrow 各 top/middle/bottom 视觉审计通过。长历史审计按虚拟化窗口断言滚动可达性，短历史仍保持 canonical 数量精确断言。
- 2026-07-17 本轮回归：历史 hydration 中同一 canonical turn 的非 timeline-owner assistant 曾绕过终态过滤，真实 click-through 挂载 187 个 `tool-call-row`；修复为从整个 message group 继承 turn 终态，并补回归测试。当前证据 `codex-import-click-through-fixture-summary.json`：`backgroundImportResume.started/closed/reattached=true`、`commitRequestCount=1`、历史 `operationalDetailRowCount=0`、`historicalOperationalDetailsHidden=true`、console error 为空。
- 2026-07-17 续接协议回归：`codex-import-continuation-fixture` 已从同步 `commit.session` 迁到 `thread/commit -> job/read -> job.result.session`；真实 Electron runtime provider fixture 通过，导入/普通会话均产生 4 次 provider 请求，`commandShapesIsomorphic=true` 且 `providerRequestsAfterCommit=0`。
- 2026-07-17 真实大样本回归：`local-history-import-real-sample-visual-audit-summary.json` 选中 1,500 行预算内的真实 Codex rollout，预估 785 canonical items / 5 turns；desktop/compact/narrow × top/middle/bottom 共 9 组审计全部通过，最大消息滚动范围约 9.8k-12.3k px，所有组合 `toolCallRowCount=0`、`operationalTimelineDetailsCount=0`、console error 为空。审计 helper 已按 timeline item 数量识别虚拟化窗口，避免 1 turn/785 items 被错误要求一次性挂载全部消息。
- 2026-07-17 最低门禁收尾：`npm run test:contracts` 291 checks、`npm run verify:gui-smoke`、imported projection 定向测试 15/15、real-sample visual-audit guard 8/8、Codex continuation guard 4/4 均通过。

## 已推翻的旧结论

2026-06-17 至 2026-06-23 的进度记录证明旧方案能扫描、预览和展示数据，但不能证明
Codex 架构兼容或 tool execution 语义正确。以下旧验收不再有效：

- 把 `ImportedRuntimeEvent` 成功投影为 generic tool 卡视为完整 fidelity。
- 以“导入的命令记录”可见作为 command/tool 验收。
- external backend 返回一段 follow-up 文本即视为真实 tool continuation。
- materialized window + imported runtime sidecar 作为第二套完整历史详情。

历史文档 [progress-2026-06-17-sidebar-menu-split.md](progress-2026-06-17-sidebar-menu-split.md)
保留为 evidence，不是 current owner。

## 最低验证

```bash
npm run test:rust:related -- lime-rs/crates/app-server/src/runtime/conversation_import
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000
npm run smoke:local-history-import-real-sample-visual-audit -- --timeout-ms 240000 --max-source-lines 5000 --max-source-messages 200 --max-source-items 1200
npm run verify:gui-smoke
npm run governance:legacy-report
```

真实 tool continuation 还必须使用 runtime provider fixture；external backend 只能证明 GUI、
Electron IPC 与 App Server read model，不能证明 provider/tool loop。

导入来源 runtime 的 `provider_name/model_name` 只表示来源上下文。
续聊 submit op 必须继续提交用户当前选择的 provider/model，并进入 current provider/tool loop。
