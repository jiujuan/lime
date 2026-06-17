---
title: Codex 对话导入实施问题跟踪
status: active
owner: app-server-runtime
updated: 2026-06-17
---

# Codex 对话导入实施问题跟踪

本文件跟踪 Codex 对话导入从 PRD 到落地过程中遇到的架构问题、兼容差距、处理状态和验证入口。目标是让实现过程中的判断沉淀到仓库，而不是只停留在聊天上下文。

## 状态口径

| 状态 | 含义 |
| --- | --- |
| `open` | 已确认存在，尚未处理。 |
| `in_progress` | 正在本轮处理。 |
| `resolved` | 已实现并有定向验证入口。 |
| `deferred` | 不阻塞当前 Codex-first MVP，已明确后续入口。 |
| `blocked` | 需要外部信息或产品决策才能继续。 |

## 当前主线

Codex-first 的导入主线为：

```text
Codex state_*.sqlite / rollout JSONL
  -> App Server conversationImport/source/scan
  -> App Server conversationImport/thread/preview
  -> 用户确认弹窗
  -> App Server conversationImport/thread/commit
  -> RuntimeCore StoredSession + AgentEvent
  -> agentSession/read / evidence/export / replay current 主链
```

首期明确不写回 Codex 原始目录，不新增 renderer 本地扫描，不创建第二套 transcript store。

## 问题清单

| ID | 问题 | 决策 / 处理方式 | 状态 | 验证入口 |
| --- | --- | --- | --- | --- |
| CI-001 | 只读扫描和预览已经可用，但缺少确认后的真正导入写入。 | 已新增 `conversationImport/thread/commit`，写入前强制 `confirmed=true`；UI 弹窗后续只负责拿到用户确认，后端仍 fail closed。 | resolved | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::conversation_import --lib` |
| CI-002 | `conversation_import/mod.rs` 已接近 1000 行，继续追加写入逻辑会违反模块体量边界。 | 已新增 `conversation_import/commit.rs` 承接写入、`conversation_import/tests.rs` 承接测试，并把 Codex state DB / rollout parser 拆到 `conversation_import/codex.rs`；Codex 多模态附件映射继续拆到 `conversation_import/codex/media.rs`，`mod.rs` 只保留 source 分发和 Claude Code unsupported 处理。 | resolved | Rust fmt + 定向测试 |
| CI-003 | Codex rollout 中工具调用、approval、patch、plan、subagent 等事件无法一次性完整映射到 Lime timeline。 | 已对齐 Codex rollout raw event：`function_call/custom_tool_call/tool_search/web_search/mcp_tool_call_end` 映射为 Lime `tool.*`，`exec_command` 同步投影为 `command.*`，`patch_apply_end` 映射为 `patch.applied/failed`，approval request 作为只读 `action.required/action.resolved` 导入；高容量工具事件按线程预算保留代表性 command/tool 轨迹，超预算事件进入 warnings/provenance，避免大 rollout 导入超时。 | resolved | `commit_preserves_codex_tool_command_and_patch_timeline`、`commit_limits_high_volume_codex_tool_events_without_dropping_messages_or_patches`、真实 content-studio smoke |
| CI-004 | Lime 必须导入后可继续对话，不能只是静态历史浏览。 | commit 写入 RuntimeCore `StoredSession` 和标准 `message.created` / `message.delta` / `turn.completed`，导入后继续走 `agentSession/turn/start`。 | resolved | `agentSession/read` messages 断言 |
| CI-005 | Codex `state_*.sqlite` 版本可能变化，当前只按 `state_5.sqlite`/最新 `state_*.sqlite` 与 `threads` 表字段读取。 | 对齐 Codex 当前 `state_5.sqlite` 与 thread inventory 字段；缺表或不可读时 fallback `session_index.jsonl`。 | resolved | 扫描/预览 Rust 测试 |
| CI-006 | Claude Code 需要后续导入，但不是当前架构主参考。 | importer contract 保留 `claude_code` source client；当前返回 unsupported，不污染 Codex-first 主线。 | deferred | scan unsupported 分支 |
| CI-007 | 用户要求导入前确认弹窗。 | 已新增侧边栏 Codex 导入入口与确认弹窗：先 scan/preview，再由用户点击确认后调用 `conversationImport/thread/commit` 且强制传 `confirmed=true`；取消/关闭不提交 commit。 | resolved | `npx vitest run "src/components/AppSidebar.conversations.test.tsx" --silent=passed-only --disableConsoleIntercept` |
| CI-008 | 多模态内容需要按 Codex 历史格式导入，不能只保留统计。 | 已对齐 Codex `event_msg.user_message.images/local_images` 与 `response_item.message.content[].type=input_image`：统一映射为 Lime `AgentAttachment(kind=image)`，保留 `sourceType/codexField/detail/localPath/mediaType` provenance；commit 写入 `AgentInput.attachments`，`agentSession/read` 把用户消息附件投影到 `content` 与 `attachments`。 | resolved | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server conversation_import --lib` |
| CI-009 | Lime 初版 parser 只把 `response_item` 当消息来源，不符合 Codex metadata 提取规则。 | 已对齐 Codex `state/src/extract.rs`：`event_msg.user_message` 是标题/首条用户消息主来源，并按 `USER_MESSAGE_BEGIN` 去前缀；`response_item` 只作为补充，role/text 全局去重。 | resolved | `previews_codex_event_messages_as_primary_codex_history` |
| CI-010 | `AppSidebar.tsx` 已超过体量边界，`AppSidebarConversationShelf.tsx` 接近边界，继续塞导入状态机会恶化架构。 | 本轮只在侧边栏做薄接线，导入流程封装到 `AppSidebarConversationImportDialog.tsx`，并抽出 `AppSidebarConversationEmptyState.tsx` 让 shelf 回到 1000 行内。后续应继续拆 `AppSidebar` 的账号、搜索、邀请、会话导入等 feature controller。 | deferred | 本轮 UI 回归；后续 sidebar split 执行计划 |
| CI-011 | 需要用真实 Codex 项目会话验证导入主链，而不只依赖 fixture。 | 已将 `smoke:codex-import-content-studio` 升级为全量可导入线程 dogfood：通过 App Server sidecar JSON-RPC 只读扫描 `/Users/coso/.codex/state_5.sqlite`，按 `projectPath=/Users/coso/Documents/dev/ai/limecloud/content-studio` 找到 13 条真实可读 Codex 线程，先验证未确认 commit 被拒，再逐条 preview / confirmed commit / `agentSession/read` 校验消息、附件和 provenance；本机 Codex DB 另有 2 条 active stale row，因 rollout 文件不存在不展示为可导入项。 | resolved | `npm run smoke:codex-import-content-studio` |
| CI-012 | Codex 当前 `state_5.sqlite` 已新增 `created_at_ms/updated_at_ms/model/reasoning_effort/git_* / cli_version / first_user_message / preview / thread_source`，旧读取会丢失多模型 provenance 且毫秒时间不精确。 | 已改为列感知读取：优先使用 `created_at_ms/updated_at_ms`，`source` 保持 Codex session source，`threadSource/model/reasoningEffort/git/cli/preview` 进入 `ImportedThreadSummary.metadata`；commit 把这些信息写入 session business object 和 turn runtime metadata，旧 schema 仍兼容。 | resolved | `scans_current_codex_state_db_metadata_and_millisecond_timestamps`、真实 content-studio smoke |
| CI-013 | Codex state DB 可能存在 stale `rollout_path`、archive mismatch 或压缩 rollout，Lime 如果只信 DB path / 只读明文 JSONL 会在确认导入后失败。 | 已按 Codex `rollout/src/list.rs` / `compression.rs` 的口径补齐路径解析和读取：优先使用可读 DB path；DB path 不存在时按 `sourceThreadId` 在对应 `sessions` / `archived_sessions` 目录中查找 rollout 文件；仍不可读的 state row 不进入 scan 可导入列表，preview / commit 保持 fail closed；`.jsonl.zst` 通过 zstd streaming decoder 透明读取，不需要 materialize 回明文文件。 | resolved | `scans_codex_state_db_repairs_stale_rollout_path_from_sessions`、`previews_archived_codex_thread_from_archived_sessions_when_db_path_is_stale`、`previews_and_commits_compressed_codex_rollout`、真实 content-studio smoke |
| CI-014 | PRD 要求同一 source thread 重复导入不重复创建内容；此前每次 confirmed commit 都会创建新 Lime session。 | 已新增 `conversation_import/import_status.rs`：以内存 `RuntimeCore` 当前 session store 为优先幂等事实源，miss 后按 `ProjectionStore.projected_sessions.metadata_json` 查询 `conversation.import + sourceClient + sourceThreadId`；commit 命中既有导入 session 时返回同一 session，不追加 turns / events；scan / preview 在同进程和 App Server 重启后都会把已导入 thread 标为 `imported`。projection hydrate 会恢复导入会话的 `BusinessObjectRef(kind=conversation.import)`，确保重启后继续对话仍继承 cwd、模型、reasoning、approval、sandbox 和 memory provenance。 | resolved | `committing_same_codex_thread_reuses_existing_imported_session`、`scan_and_preview_mark_previously_imported_codex_thread`、`committing_same_codex_thread_after_restart_reuses_projected_session`、真实 content-studio smoke 的 duplicate commit / rescan 断言 |
| CI-015 | PRD 要求导入会话进入 `evidence/export` 主链并携带 source provenance；此前只验证了 `agentSession/read`。 | 已新增 `conversation_import/tests/evidence.rs`，commit Codex rollout 后直接调用 RuntimeCore `export_evidence`，断言 `BusinessObjectRef`、session metadata、`message.created` session metadata 和 `message.delta.sourceClient` 均带 Codex provenance；这证明导入不是第二套 transcript store，而是进入 Lime current evidence/export 上下文。 | resolved | `imported_codex_thread_exports_evidence_with_source_provenance` |
| CI-016 | `conversation_import/codex.rs` 与 `conversation_import/tests.rs` 再次越过 800 行预警线，继续追加逻辑会违反体量边界趋势。 | 已把 preview message merge 拆到 `codex/messages.rs`，把 dry-run impact projection 拆到 `codex/dry_run.rs`，新增 dry-run 测试落到 `tests/dry_run.rs`；`codex.rs` 已降到 800 行以下。`tests.rs` 仍是历史聚合入口，后续触碰基础 preview 测试时优先迁到 `tests/preview.rs`。 | resolved | `wc -l lime-rs/crates/app-server/src/runtime/conversation_import/codex.rs lime-rs/crates/app-server/src/runtime/conversation_import/codex/dry_run.rs` |
| CI-017 | PRD FR-15 要求 dry-run impact summary，但原 preview 只有只读预览和 raw item count，无法确认 commit 会创建/复用 session、写入多少 Lime 投影消息、turn、附件和 timeline item。 | 已扩展 `ConversationImportPreviewSummary.dryRun`，不新增 JSON-RPC method；preview/commit 统一返回 `willCreateSession / willAppendToExistingSession / willImportMessages / willImportTurns / willImportTimelineItems / willImportAttachments / unsupportedItems`。`willImportMessages` 采用 Lime commit 投影后的写入消息数，`messageCount` 保留 Codex raw message item 数；导入确认弹窗展示 dry-run 影响摘要，API shape guard 缺字段 fail closed。 | resolved | `preview_dry_run_summary_counts_full_timeline_beyond_preview_limit`、`imported_preview_dry_run_marks_append_to_existing_session`、`src/lib/api/conversationImport.test.ts`、真实 content-studio smoke |
| CI-018 | Codex App 级还原需要 item 级 source provenance，不能只在 session metadata 上写 `sourceThreadId`。 | 已新增 `ConversationImportSourceProvenance` 并贯通 preview message/event、timeline runtime event payload、turn metadata 和 assistant `message.delta.sourceProvenance`。字段包含 source client、thread id、source path、rollout line seq、outer event type、payload type、call id、role/channel；parser 先按 JSONL line index 生成 item provenance，解析结束后统一补 thread/path；重复消息合并时保留 provenance。 | resolved | `preview_dry_run_summary_counts_full_timeline_beyond_preview_limit`、`imported_codex_thread_exports_evidence_with_source_provenance`、`src/lib/api/conversationImport.test.ts` |
| CI-019 | Codex 细节还原需要可解释的 fidelity summary，否则 UI 只能展示“已导入若干消息”，无法说明工具、命令、补丁、审批、MCP、搜索和预算裁剪覆盖度。 | 已新增 `ConversationImportFidelitySummary`，preview/commit 统一返回 messages、attachments、reasoning、tools、commands、patches、approvals、mcp、webSearch、unsupported、provenanceOnly、budgetDropped。commit 会把 summary 写入 session `BusinessObjectRef.metadata.codexImportFidelity`、turn `RuntimeOptions.metadata.codexImportFidelity`，并在导入弹窗展示“Codex 细节还原”摘要。统计口径是 source item / mapped runtime event 级别，不是 unique tool call 去重计数。 | resolved | `commit_limits_high_volume_codex_tool_events_without_dropping_messages_or_patches`、`src/components/AppSidebar.conversations.test.tsx`、`npm run smoke:codex-import-content-studio` |
| CI-020 | 导入 commit 后 `agentSession/read.detail.items` 没有把 Codex runtime events 投影到 GUI 会话页，导致现有 MessageList 只能看到 user/assistant 正文，reasoning / command / patch / approval / web search 无法按 turn 还原。 | 已新增 `runtime/thread_item_projection.rs`，从 RuntimeCore `StoredSession.events` 聚合出 `detail.items`：`reasoning.* -> reasoning`，`tool.* -> tool_call/web_search`，`command.* -> command_execution`，`patch.* -> patch`，`action.* -> approval_request`，并按 call id / request id 合并 lifecycle，保留 source event metadata；前端 `agentChatHistory` 复用 `toToolCallState/toActionRequired`，把这些 item 合入同一 turn 的 assistant 气泡 `contentParts/toolCalls/actionRequests`。这补的是导入后会话页展示主链，不新增平行导入浏览器。 | resolved | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server conversation_import::tests::runtime_events --lib`、`npx vitest run "src/components/agent/chat/hooks/agentChatHistory.test.ts" --silent=passed-only --disableConsoleIntercept` |
| CI-021 | 用户要求导入后的会话能继续在 Lime 里对话，不能只静态浏览；必须证明后续 turn 仍走同一个 current `AgentSession`。 | 后端 commit 仍写入 current `AgentSession`，`can_continue=true`，session metadata / runtime options 带 `importedContinuation`、`importedThreadSettings`、cwd、model、reasoning、approval、sandbox 和 memory provenance，后续 turn 经 `agentSession/turn/start` 进入 current RuntimeCore。Electron current fixture 已用真实 preload bridge 调用 `app_server_handle_json_lines`，按 `conversationImport/thread/commit -> agentSession/read -> agentSession/turn/start -> agentSession/read` 验证同一 session 续聊；external backend ledger 断言 runtime options 带 `imported=true` 与导入 cwd `/workspace/imported-codex`。 | resolved | `imported_conversation_continues_with_imported_runtime_context`；`node scripts/electron/codex-import-continuation-fixture-smoke.mjs --app-url "http://127.0.0.1:1420/" --timeout-ms 180000` |
| CI-022 | Electron fixture 已证明 current 链路，但完整用户点击路径仍缺：从侧边栏导入弹窗确认、跳到会话页、看到导入细节、在输入框发送 follow-up。 | 已新增 `codex-import-click-through-fixture-smoke`：使用临时 `CODEX_HOME/session_index.jsonl + rollout JSONL`，从真实侧边栏按钮打开导入弹窗，确认预览“Codex 细节还原”后点击导入，进入 Lime 会话页验证导入消息、reasoning、command、patch、web search、approval 可见，再通过真实输入框发送 follow-up；backend ledger 断言续聊仍在同一导入 session，且继承 `imported=true` 与 cwd。该入口是稳定 Electron GUI fixture，不等同于 Playwright MCP 手工视觉审计。 | resolved | `npm run smoke:codex-import-click-through-electron-fixture -- --app-url "http://127.0.0.1:1420/" --timeout-ms 180000` |
| CI-023 | 导入 timeline 已进入 GUI 主链后，代码产物工作台真实 Electron fixture 暴露两个证据误判：工具过程默认折叠时 `toolTimelineEvidencePresent` 看不到工具输出预览；空会话真实输入框已可用但 `data-session-id` 延迟水合时 fixture 误判未就绪。 | 已让 fixture 先从侧栏真实点击进入会话，再展开 `streaming-process-group` 采集工具轨迹 GUI 证据；空会话输入判定改为“输入框可见、未禁用、页面已处于目标会话 shell”即可发送，后续仍由 `agentSession/read` 与 backend ledger 校验真实 session。该修复不新增 mock、不回退旧事件，只把测试口径对齐真实用户路径。 | resolved | `npm run smoke:code-artifact-workbench-electron-fixture`、`node scripts/electron/code-artifact-workbench-fixture-smoke.mjs --scenario gui-coding-input --timeout-ms 180000`、`npm run smoke:agent-runtime-current-fixture` |

## 进行中记录

### 2026-06-17

- 已确认当前实现位于 App Server JSON-RPC current 主链，正确落点是 `lime-rs/crates/app-server/src/runtime/conversation_import/**`、`app-server-protocol`、`packages/app-server-client` 与 `src/lib/api/conversationImport.ts`。
- 已确认 scan/preview 是只读能力，不需要用户确认；commit 必须通过弹窗取得用户确认，并由后端 `confirmed=true` 再次强制。
- 已确认 `RuntimeCore` read model 会从 `turn_inputs` 投影用户消息，从 `message.delta` 聚合 assistant 消息；commit 不需要新增 transcript store。
- 已补齐 `conversationImport/thread/commit` 后端、协议、client、前端网关和定向测试。
- 已按 `/Users/coso/Documents/dev/rust/codex` 校正两个关键规则：优先读取 `state_5.sqlite`，并把 `event_msg.user_message / event_msg.agent_message` 作为 Codex 用户可见历史主来源。
- 已验证 commit 后导入结果能通过 `agentSession/read` 看到 user/assistant messages；新 turn 仍应走 Lime `agentSession/turn/start` current 主链。
- 已完成第一刀结构治理：`conversation_import/mod.rs` 不再超过 1000 行，commit 和 tests 已拆出；Codex parser 继续作为后续 P1 拆分项。
- 已新增真实 GUI 确认弹窗：侧边栏提供 Codex 导入入口，弹窗执行 scan/preview，展示 source、target、message count、warnings 和消息预览；用户确认前不会调用 commit。
- 已补五语言 `navigation` 文案与侧边栏回归：取消导入不提交 commit，项目范围导入会把 `workspaceId/projectPath` 带入 current App Server 主链，确认后导航到导入会话。
- 已完成第二刀结构治理：`conversation_import/codex.rs` 承接 Codex state / rollout parser，`conversation_import/codex/media.rs` 承接 Codex 图片 / 附件映射，`mod.rs` 收缩为 importer facade 和 source dispatch，避免继续把 Codex 细节塞回中心文件；`codex.rs` 已从拆分预警区降到 800 行以下。
- 已按 Codex 当前记录格式补齐多模态导入：`response_item.input_image`、`event_msg.images`、`event_msg.local_images` 均进入 Lime `AgentAttachment`；图片-only 用户消息保留 `[Image]` 占位，重复的 `event_msg` / `response_item` 用户消息会合并附件并保留 `event_msg` 为主要历史来源。
- 已把导入附件贯通到 `RuntimeCore` read model：commit 阶段写入用户 `AgentInput.attachments`，`agentSession/read` 返回的用户消息包含 `content` 媒体项和 `attachments` 原始投影，便于后续多模态继续对话和证据导出复用。
- 已补前端弹窗附件计数展示，测试夹具使用 Codex 图片附件覆盖“导入前预览确认”路径。
- 已用真实项目 `/Users/coso/Documents/dev/ai/limecloud/content-studio` 的 Codex 会话完成全量 dogfood：`smoke:codex-import-content-studio` 从 15 条 active DB row 中过滤 2 条 rollout 文件缺失的 stale row，导入 13 条真实可读线程，最新复跑累计 454 条 Lime 投影消息 / 279 个 turn，覆盖 4 条多模态线程和 13 条模型 metadata 线程；验证 `confirmed=false` 会被后端拒绝，`confirmed=true` 后每条 session 均可通过 `agentSession/read` 读取，并保留 Codex 多模型 / 多模态 provenance。
- 已对齐 Codex rollout path lookup 口径：`state_5.sqlite` 中的 `rollout_path` 仅作为优先候选，路径不可读时按 `sourceThreadId` 在对应 `sessions` / `archived_sessions` 目录修复；修复后仍不存在的 stale row 不作为可导入项展示，避免用户确认后才失败。
- 已对齐 Codex 压缩 rollout 读取口径：导入 parser 支持 `.jsonl` 与 `.jsonl.zst`，压缩文件通过 `zstd` streaming decoder 只读解析；这补齐了 Codex 冷归档压缩后的 preview / commit 能力，不写回或 materialize Codex 原始目录。
- 已对齐 Codex 当前 `state_5.sqlite` schema：优先读取毫秒时间戳，保留 `model/reasoningEffort/threadSource/git/cli/preview/firstUserMessage` metadata；这让 Lime 导入不仅兼容 Codex 会话，还能承接 Lime 的多模型、多模态后续能力。
- 已补 Codex 复杂 timeline 映射：`function_call/function_call_output/custom_tool_call/custom_tool_call_output/tool_search/web_search/mcp_tool_call_end` 进入 Lime `tool.started/tool.result/tool.failed`；`exec_command` 额外进入 `command.started/command.output/command.exited`，可被 `thread_read.commands` 消费；`patch_apply_end` 进入 `patch.applied/patch.failed` 并投影 changed files；approval request 作为 imported read-only action 立即 resolved，不触发真实审批。
- 已修正 Codex 双写历史：同一用户输入同时出现在 `event_msg.user_message` 和 `response_item.message(role=user)` 时按同一 turn 合并，并把附件补齐；相同文本出现在后续真实 turn 时仍保留为独立 turn，避免导入历史丢轮次。
- 已处理真实大 rollout 性能缺口：content-studio 最大线程约 8245 行、近 2000 次 function call；全量逐事件写入会触发 RuntimeCore 序列校验高成本扫描。当前 commit 层保留全部消息、全部 patch/action/terminal 事件，并按线程预算保留前 80 个 command tool call 与前 40 个其他 tool call，超预算 runtime event 进入 warning/provenance，确保导入可用且 GUI 保留代表性工具轨迹。
- 已补导入幂等：重复 confirmed commit 同一个 Codex `sourceThreadId` 会返回既有 Lime session，不再重复创建内容；scan / preview 会把当前 RuntimeCore 已导入 thread 标为 `imported`。
- 已补跨重启导入幂等：`import_status` 内存 miss 后会查询 `ProjectionStore` 中的 projected session metadata，按 `conversation.import + sourceClient + sourceThreadId` 复用既有 session；`read_session_current` 从 projection hydrate 时会恢复导入业务引用，确保 App Server 重启后继续对话仍继承导入上下文。
- 已补 evidence/export 闭环：导入后的 `conversation.import` session 可直接由 RuntimeCore `export_evidence` 消费，并在 session business object、event payload session metadata 和 evidence pack 上保留 Codex source provenance。
- 已补 FR-15 dry-run impact summary：preview / commit 返回结构化 `summary.dryRun`，确认弹窗展示将写入的 Lime 投影消息、turn、附件、timeline item 与 unsupported item；导入过的 thread preview 会标记为复用既有 session，重复 commit 返回同一 session 且不追加内容。
- 已补 item 级 source provenance：每条 preview message/event、导入 timeline runtime event、turn metadata 和 assistant delta 都可追溯到 Codex rollout 的 line seq、event type、payload type、call id、source path 与 source thread；这为 Agent Workspace 的 run rail、tool 下钻、evidence/replay 定位提供前置事实。
- 已补 Codex fidelity summary：preview/commit 结构化输出 messages / attachments / reasoning / tools / commands / patches / approvals / MCP / webSearch / unsupported / provenance-only / budget-dropped，UI 弹窗展示摘要，session 与 turn metadata 同步保存 `codexImportFidelity`，避免导入结果只有消息数而无法解释细节还原覆盖度。
- 已再次用真实项目 `/Users/coso/Documents/dev/ai/limecloud/content-studio` 验证导入：`smoke:codex-import-content-studio` 复跑通过，13/13 线程、454 条 Lime 投影消息、279 个 turn、4 条多模态线程、13 条模型 metadata 线程；脚本同时覆盖未确认 commit 拒绝、重复导入返回同一 session、dry-run impact summary、导入后 rescan 全部为 `imported`。
- 已补导入后会话页展示投影：`agentSession/read.detail.items` 现在从 stored runtime events 生成聚合 timeline item，前端历史恢复会把 Codex reasoning、命令、补丁、web search、approval 合入同一 assistant 气泡的 `contentParts/toolCalls/actionRequests`。这直接修复“导入成功但会话页细节无法还原”的主缺口。
- 已补导入会话续聊上下文：commit 将 cwd、provider/model、reasoning、approval、sandbox、memory、AGENTS 路径等信息落到 `importedContinuation` / `importedThreadSettings`，`agentSession/turn/start` 会在没有显式 turn options 时合成中性的 imported session runtime options；除导入来源与 provenance 外，续聊运行时不再使用来源专有命名。
- 已补真实 Electron current fixture 证据：`codex-import-continuation-fixture-smoke` 使用真实 Electron preload bridge 调用 App Server JSON-RPC，验证导入后 `detail.items` 包含 reasoning / command / patch / web_search / approval，并在同一导入 session 发起 follow-up；external backend ledger 证明 `agentSession/turn/start` 收到 `imported=true` runtime metadata 和导入 cwd。2026-06-17 本轮复测通过时使用已有 Vite renderer：`node scripts/electron/codex-import-continuation-fixture-smoke.mjs --app-url "http://127.0.0.1:1420/" --timeout-ms 180000`，证据写入 `.lime/qc/gui-evidence/codex-import-continuation-fixture/codex-import-continuation-fixture-summary.json`。
- 仍不把完整产品目标标记为完成：真实点击式 Playwright 路径还需要从侧边栏导入弹窗开始，确认后进入会话页，观察 task rail / message list 的导入细节，再从输入框发送 follow-up；当前 fixture 证明 current 链路和同 session 续聊，不替代用户完整点击闭环。
- 已补真实 Electron 点击闭环 fixture：`codex-import-click-through-fixture-smoke` 从侧边栏点击导入入口，使用临时 Codex home 触发 scan/preview，确认导入后进入会话页，断言导入消息、reasoning、command、patch、web search、approval 与续聊输出可见；该脚本通过真实输入框发送 follow-up，并用 external backend ledger 证明 `agentSession/turn/start` 仍携带导入 cwd 与 imported metadata。
- CI-022 当前可按 Electron GUI fixture 口径关闭；剩余视觉层缺口是 Playwright MCP / 人工截图审计，需独立确认 task rail 版式、长 rollout 展示密度和移动窗口下的视觉还原，不再阻塞 Codex-first MVP 的点击式可用闭环。
- 已修复代码产物工作台 fixture 对 current GUI 的两个误判：真实会话打开不再依赖输入框隐藏 `data-session-id` 立即水合，而是以侧栏 active conversation + conversation/canvas shell 为主证据；工具 timeline GUI 证据会先展开过程组再检查输出预览，避免把“后端已持久化但用户看不到”误判为通过或失败。
- 已完成本轮回归：`npm run smoke:code-artifact-workbench-electron-fixture` 通过，summary 断言 `toolTimelineEvidencePresent=true`、`codingChanges/Outputs/LogsEvidencePresent=true`、`codingRecoveryReachedBackend=true`；`node scripts/electron/code-artifact-workbench-fixture-smoke.mjs --scenario gui-coding-input --timeout-ms 180000` 通过；`npm run smoke:agent-runtime-current-fixture` 通过，覆盖历史恢复、流式终态、消息列表终态、代码工作台 Electron fixture 和停止后同会话继续输出。

## 拆分入口与状态

| 状态 | 拆分项 | 目的 |
| --- | --- | --- |
| done | `conversation_import/commit.rs` | 隔离写入会话主链，避免 facade 膨胀。 |
| done | `conversation_import/codex.rs` | 把 Codex state DB / rollout parser 从 facade 拆出，便于继续对齐 Codex。 |
| done | `conversation_import/codex/media.rs` | 隔离 Codex `input_image/images/local_images` 到 Lime attachment 的映射，避免 Codex parser 再次膨胀。 |
| done | `conversation_import/codex/paths.rs` | 隔离 Codex rollout path repair / active-archived lookup，避免 parser 文件继续膨胀并对齐 Codex filesystem fallback。 |
| done | compressed rollout parser | 支持 `.jsonl.zst` 透明解压读取，保持 Codex 原始目录只读，不 materialize 压缩文件。 |
| done | `conversation_import/codex/events.rs` | 隔离 Codex raw rollout item 到 Lime runtime events 的映射，覆盖 tool / command / patch / action。 |
| done | `conversation_import/codex/dry_run.rs` | 隔离 dry-run impact projection，区分 Codex raw message item 与 Lime commit 后实际写入消息 / turn / attachment / timeline 计数。 |
| done | `conversation_import/commit_events.rs` | 隔离导入 runtime event 预算、lifecycle 补齐和 synthetic imported event，避免 `commit.rs` 膨胀并保持 RuntimeCore 全局校验不放松。 |
| done | `conversation_import/import_status.rs` | 隔离导入状态叠加与同进程幂等查重，避免 scan / commit 继续互相耦合。 |
| P1 | `conversation_import/provenance.rs` | 进一步集中 source metadata、warnings 和 unsupported item 分类；item 级 source provenance / fidelity summary 已进入协议和导入主链。 |
| done | cross-restart import idempotency | `ProjectionStore` 已提供窄查询，按 projected session metadata 查 `conversation.import + sourceClient + sourceThreadId`；projection hydrate 也会恢复导入业务引用，避免重启后重复导入或续聊丢上下文。 |
| done | dry-run summary | `ConversationImportPreviewSummary.dryRun` 已显式返回 commit impact summary；artifact 仍以 timeline/source provenance 为主，独立 artifact sidecar 计数等待后续 artifact importer。 |
| done | per-item source provenance | `ConversationImportSourceProvenance` 已覆盖 preview message/event、timeline runtime event、turn metadata 和 assistant delta；source path hash 可在后续 evidence sidecar 中按隐私策略追加。 |
| done | imported session timeline projection | `runtime/thread_item_projection.rs` 统一从 `StoredSession.events` 生成 `detail.items`，让导入历史和 live runtime 使用同一 GUI 消息恢复路径。 |
| done | imported session continue Electron fixture | 真实 Electron preload bridge 已验证导入会话的 `agentSession/read.detail.items` 还原与同 session `agentSession/turn/start` 续聊，backend ledger 覆盖 imported metadata 和 cwd 继承。 |
| done | imported session click-through Electron fixture | 补完整用户点击证据：从侧边栏导入弹窗确认进入会话页，观察导入细节，再从输入框发送 follow-up；不再用 API fixture 直接替代用户路径。 |
| P1 | imported session Playwright visual audit | 在 Electron 点击 fixture 已证明可用闭环后，补 Playwright MCP / 截图审计 task rail 版式、长 rollout 展示密度和不同窗口尺寸下的视觉还原。 |
| P2 | UI modal view model | 当前弹窗已可用；后续若加入批量导入、Claude Code、批量附件筛选，需要先抽 view model，避免组件继续膨胀。 |
| P2 | Sidebar feature split | `AppSidebar.tsx` 已过大，继续新增会话管理能力前应拆搜索 / 邀请 / 导入 / 账号菜单 controller。 |
