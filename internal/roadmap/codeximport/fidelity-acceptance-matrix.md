---
title: Codex 导入 Fidelity 验收矩阵
status: current
owner: app-server-runtime
updated: 2026-06-18
---

# Codex 导入 Fidelity 验收矩阵

本文件固定 Codex-first 导入的全量验收口径：哪些来源细节已经进入 Lime current 主链，哪些只保留 provenance，哪些仍是后续扩展。它不是新的实现计划，而是 `implementation-tracker.md`、PRD、Rust 定向测试和 Electron GUI smoke 的索引。

## 当前事实源

```text
Codex state_*.sqlite / session_index.jsonl / rollout JSONL
  -> App Server conversationImport/source/scan
  -> App Server conversationImport/thread/preview
  -> App Server conversationImport/thread/commit
  -> RuntimeCore StoredSession + AgentEvent
  -> agentSession/read + conversationImport/thread/runtimeEvents/read
  -> Agent UI projection + Preview Artifact Contract
  -> evidence/export / replay current 主链
```

`current` 只允许继续向 App Server JSON-RPC、RuntimeCore、Agent UI projection 和 Preview Artifact Contract 收敛。Renderer 不直接扫描 `.codex`；Electron Desktop Host 只负责桌面桥接；旧 Tauri / `lime-rs/src/**` / 旧 `agent_runtime_*` 不作为新增能力落点。

## 验收矩阵

| 能力 | Codex 来源 | Lime current 投影 | 状态 | 必须守住的证据 |
| --- | --- | --- | --- | --- |
| source discovery | `state_5.sqlite`、最新 `state_*.sqlite`、`session_index.jsonl`、active / archived sessions | `conversationImport/source/scan` | current | `path_resolution.rs`、`security.rs`、`smoke:codex-import-content-studio` |
| rollout path repair | DB stale `rollout_path`、`sessions` / `archived_sessions`、`.jsonl.zst` | Codex adapter 只读解析 | current | `previews_archived_codex_thread_from_archived_sessions_when_db_path_is_stale`、`previews_and_commits_compressed_codex_rollout` |
| message ordering | `event_msg.user_message`、`response_item.message(role=user)`、`event_msg.agent_message`、`response_item.message(role=assistant)`、`phase=commentary/final` | `AgentInput`、`message.delta`、`detail.items`、assistant inline content parts | current | `commit_merges_duplicate_user_messages_when_response_item_precedes_event_msg`、`commit_preserves_imported_assistant_message_order_between_runtime_events`、真实长样本 visual audit |
| attachments | `event_msg.images/local_images`、`response_item.input_image`、data URL / local image ref | `AgentAttachment`、`Message.images`、`source=session_file` preview artifact | current | `smoke:codex-import-content-studio` 多模态统计、click-through fixture 图片预览 |
| reasoning | `response_item.reasoning`、导入来源 thinking | inline `thinking` content part，导入来源默认可见，普通非导入 reasoning 仍按安全策略折叠 | current | `messageListTimelineContentParts.unit.test.ts`、`StreamingRenderer.test.tsx`、click-through `hasReasoningVisible` |
| shell command | `exec_command`、`function_call(name=exec_command)`、command output | `tool.*` + `command.started/output/exited` + `command_execution` item | current | `commit_preserves_codex_tool_command_and_patch_timeline`、真实长样本 `hasCommandRecordVisible` |
| file read preview | `read_file` tool arguments / output | `thread_read.tool_calls.arguments.path` + `inline-tool-open-file` + Preview Artifact Contract | current | `read_session_merges_tool_started_arguments_into_completed_tool_calls`、click-through `openedAllImportedPreviewArtifacts` |
| Markdown / HTML / DOCX / image preview | `read_file` + imported attachments | source-backed preview artifact，Workbench selection key `artifact:<id>` | current | `codex-import-click-through-fixture-smoke` 覆盖 Markdown、HTML iframe、DOCX 文本抽取和图片预览 |
| patch | `patch_apply_begin/end`、paths、可选 diff metadata | `patch.started/applied/failed` + `patch` item；只有 paths 时展示路径级 file changes，不伪造 diff | current | `commit_preserves_codex_tool_command_and_patch_timeline`、`hasPatchText` GUI smoke |
| approval | `exec_approval_request`、`apply_patch_approval_request` | imported read-only `action.required/action.resolved`，不触发真实审批 | current | `hasApprovalText` GUI smoke、`approval_request` item 断言 |
| web search | `web_search_call`、`web_search_end`、`tool_search` | `tool.*` / `web_search` item，来源 query 可进入 task rail 摘要 | current | `hasSearchEvidence` GUI smoke、runtime event mapping tests |
| MCP / dynamic / view image / image generation | `mcp_tool_call_*`、`dynamic_tool_call_*`、`view_image_tool_call`、`image_generation_*` | 复用现有 `tool_call` / `context` / `reasoning` / detail panel 语义卡片；不是另建专属 transcript UI | current | `commit_projects_codex_runtime_specialized_items_into_existing_timeline_types`、`ImportedRuntimeEventDetailPanel.test.tsx` |
| plan | `update_plan` tool、`item_completed(type=Plan)` | `plan.final` + `detail.items[type=plan]` + `<proposed_plan>` + 任务轨结构化步骤 | current | `commit_preserves_imported_update_plan_timeline_item`、`commit_preserves_imported_completed_plan_item` |
| context / review / subagent / collab | `context_compacted`、`entered_review_mode`、`subagent_activity`、collab spawn begin/end | `context_compaction`、`reasoning`、`subagent_activity`、完整记录下钻 | current | `commit_projects_codex_runtime_specialized_items_into_existing_timeline_types`、runtime detail drilldown guard |
| incomplete lifecycle | 未闭合 tool / command / patch lifecycle | `completed + importedIncomplete=true + failureCategory=incomplete_import`，GUI 不显示为当前执行失败 | current | `commit_closes_incomplete_imported_lifecycles_without_failed_timeline_items` |
| high-volume rollout | 上千 tool / command event | 完整 normalized events 写入 import sidecar；默认 projection 有承载窗口；完整记录分页读取 | current | `commit_preserves_high_volume_codex_tool_events_with_bounded_default_projection`、`conversationImport/thread/runtimeEvents/read`、真实大样本 visual audit |
| runtime detail drilldown | 默认窗口外的完整导入事件 | Task Center 来源区 `imported-runtime-detail-*` 语义卡片、facts、payload preview | current | `local-history-import-real-sample-visual-audit-smoke.test.mjs`、`ImportedRuntimeEventDetailPanel.test.tsx` |
| continue same session | 导入后的新 turn | `agentSession/turn/start` current 主链，继承导入 cwd / imported metadata，但 provider/model 使用 Lime 当前选择 | current | `codex-import-click-through-electron-fixture` backend ledger、`codex-import-continuation-fixture` |
| evidence / replay | 导入 session business object、runtime event metadata、item provenance | `evidence/export` / replay 使用 Lime canonical events，带 source provenance | current | `imported_codex_thread_exports_evidence_with_source_provenance` |
| privacy / source leak boundary | source path、thread id、raw event 字段、敏感文件路径 | denylist + source root guard + GUI visible text leak guard + evidence 摘要化 | current | `security.rs`、`local-history-import-visual-audit`、`local-history-import-real-sample-visual-audit` |
| non-Codex importer | `claude_code` / future clients | 同一 adapter contract，当前返回 unsupported，不污染 Codex-first schema | compat / deferred | `scan unsupported` 分支；不阻塞 Codex-first 全量产品化 |

## 当前不宣称完成的范围

这些不是 Codex-first 主链阻塞项，但不能在汇报里包装成已完成：

1. PDF、Excel、PPT 已有统一 Preview Artifact `system_open` 兜底，音频、视频、URL、database_record 已有 contract 守卫；但 PDF / Office 内嵌文本抽取、URL 快照内容抓取、数据库记录详情的业务级 renderer 仍按 `internal/roadmap/artifacts/roadmap.md` P4 推进。
2. Claude Code importer 只保留 adapter 合同，尚未进入产品化导入。
3. 导入数据的用户级“彻底删除 / 导出后删除 / 保留策略”还需要独立产品规则和存储清理守卫。
4. 所有未来 Codex 新事件类型默认先进入 unsupported / provenance-only，再补 mapper 与矩阵行；不得静默丢弃。

## 机械守卫

最低守卫入口：

```bash
npx vitest run "scripts/electron/codex-import-fidelity-acceptance-matrix.test.mjs" --silent=passed-only --disableConsoleIntercept
```

本守卫只读路线图、Rust 定向测试和 Electron smoke surface，证明矩阵没有漂成散文。它不能替代真实 GUI smoke；涉及 GUI 展示或 Preview Artifact 交付时仍需复跑：

```bash
npm run smoke:codex-import-click-through-electron-fixture -- --app-url "http://127.0.0.1:1420/" --timeout-ms 180000
npm run smoke:local-history-import-real-sample-visual-audit -- --app-url "http://127.0.0.1:1420/" --timeout-ms 240000
```
