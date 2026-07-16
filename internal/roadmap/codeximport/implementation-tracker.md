---
title: Codex 对话兼容实施跟踪
status: active
owner: app-server-runtime
updated: 2026-07-15
---

# 实施跟踪

## 当前阶段

主目标：用 Codex canonical Thread / Turn / Item 语义重建历史，并让导入后续聊进入 Lime
current tool executor。

当前阶段：`S2 canonical decoder 收口`。

下一刀：删除 `ImportedRuntimeEvent/ImportedToolDraft -> tool_lowering` 双重转换，让 rollout
adapter 直接产出 canonical item history；随后补导入续聊与普通对话工具同构守卫。

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

| ID | 工作项 | 状态 | 退出条件 |
| --- | --- | --- | --- |
| CCI-001 | 重置路线图与架构事实源 | completed | README、PRD、tracker、exec plan、architecture 同步 |
| CCI-002 | Codex rollout canonical decoder | in_progress | 主要 persisted item 直接映射为 canonical item，无 imported draft |
| CCI-003 | ThreadStore / ProjectionStore 原子导入 | pending | EventLog -> ThreadStore -> projection 顺序与普通历史一致 |
| CCI-004 | imported runtime sidecar 退场 | completed | 已删除 projection budget、sidecar、method/schema/client 与详情面板 |
| CCI-005 | GUI 单轨 | in_progress | 已删除详情面板和旧命令标题；继续清 source-driven 分组 |
| CCI-006 | live tool continuation | pending | provider fixture 从导入 session 触发真实 command/tool terminal item |
| CCI-007 | Gate B 与大样本 | pending | Electron click-through、real sample、多视口、零 console/bridge error |
| CCI-008 | dead surface guard | pending | retired names 只允许负向测试/历史 evidence |

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
npm run smoke:local-history-import-real-sample-visual-audit -- --timeout-ms 240000
npm run verify:gui-smoke
npm run governance:legacy-report
```

真实 tool continuation 还必须使用 runtime provider fixture；external backend 只能证明 GUI、
Electron IPC 与 App Server read model，不能证明 provider/tool loop。

导入来源 runtime 的 `provider_name/model_name` 只表示来源上下文。
续聊 submit op 必须继续提交用户当前选择的 provider/model，并进入 current provider/tool loop。
