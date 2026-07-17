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

| ID      | 工作项                                 | 状态      | 退出条件                                                                                        |
| ------- | -------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| CCI-001 | 重置路线图与架构事实源                 | completed | README、PRD、tracker、exec plan、architecture 同步                                              |
| CCI-002 | Codex rollout canonical decoder        | completed | 主要 persisted item 直接映射为 canonical item，无 imported runtime wire                         |
| CCI-003 | ThreadStore / ProjectionStore 原子导入 | completed | EventLog -> ThreadStore -> projection 顺序与普通历史一致，失败回滚有回归                        |
| CCI-004 | imported runtime sidecar 退场          | completed | 已删除 projection budget、sidecar、method/schema/client 与详情面板                              |
| CCI-005 | GUI 单轨                               | completed | 历史 command/tool/patch/search/approval 复用普通 Item renderer，旧 imported-only 文案无正向路径 |
| CCI-006 | live tool continuation                 | completed | provider fixture 从普通/导入 session 触发同构 command/tool terminal item                        |
| CCI-007 | Gate B 与大样本                        | completed | Electron click-through、真实有界样本、多视口、零 console/bridge error；后台 job 承接超大样本    |
| CCI-008 | dead surface guard                     | completed | retired names 只允许负向测试/历史 evidence，governance 扫描零违规                               |
| CCI-009 | 响应式 GUI 单轨                        | completed | 宽容器分栏；compact/narrow 聊天优先单面板；断点不重挂载消息树；真实 Electron 无控件重叠         |
| CCI-010 | 超大 rollout 后台导入                  | completed | commit-start 快速返回；job/read 可观测阶段与 terminal；40 turns / 1,200 commands 压力回归       |

## 2026-07-17 验证记录

- `npm run test:rust:related -- "lime-rs/crates/app-server/src/runtime/conversation_import"`：app-server 1181/1181。
- `npx vitest run "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" "src/components/workspace/layout/LayoutTransition.test.tsx" "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx"`：26/26。
- `npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-v30`：Gate B 通过；15 items / 4 messages；desktop / compact / narrow；六类文件预览；同 session 续聊；模式控件零重叠。
- `npm run smoke:local-history-import-real-sample-visual-audit -- --timeout-ms 240000 --prefix local-history-import-real-sample-visual-audit-v4 ...`：默认预算 Gate B 通过，5 个 turn 组 / 10 条消息 / 346 个 tool row / 10 个文件产物 / 9 组视觉审计。
- `npm run test:contracts`（291 checks）、`npm run smoke:agent-runtime-current-fixture`、`npm run governance:legacy-report`、`npm run governance:scripts`、`npm run verify:gui-smoke`：通过。
- 后台导入 gateway / View Model / DOM、Codex import fidelity matrix、click-through guard 与真实样本 visual-audit guard：46/46；矩阵行按 Markdown 首列结构匹配，并直接绑定 current job/read、进度 surface 与 GUI 可见文本泄漏守卫。
- `npm run docs:boundary`：通过；路线图、架构与执行计划仍保持 current owner 边界。
- `conversationImport/thread/commit -> conversationImport/job/read` public JSON-RPC 集成通过；后台 job RuntimeCore 单元 2/2，多 turn 压力回归 40 turns / 1,200 commands、5.59 秒完成、进度 40/40。
- `codex-import-click-through-background-v1` 与 `local-history-import-real-sample-background-v1` Gate B 通过；trace 消费 `job/read`，真实样本最终 434 canonical items、346 tool rows、10 file artifacts，9 组视觉审计与 console error 0。

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
