# Agent Tools 分批测试计划索引

## 背景

Lime Agent Chat 最近暴露的核心问题是：工具过程与最终正文在流式和历史渲染中可能错序，典型表现为“最终新闻简报”出现在“已搜索网页 N 次”前面，或工具输出与正文穿插位置不符合实际 runtime timeline。上一轮已经修复了 `web_search` 场景里的 overlay / completion reconcile 顺序，但这只覆盖了搜索工具的代表路径。

当前真实工具面不止 `web_search`、`Bash`、`Read`、`Write` 几个。事实源显示，Agent native tools、gated native tools、Agent / Team / Task tools、MCP resource / deferred tools、以及 `mcp__server__tool` 动态工具都会进入同一套 Agent Chat 渲染链路。因此本计划把工具按族拆成多份文档，方便多个进程并行认领测试。

## 总目标

证明以下链路对所有主要工具族都成立：

1. runtime / timeline 事件顺序不被前端 overlay、completion reconcile、历史 hydration 改写。
2. 工具过程在消息内按 `正文片段 -> 过程块 -> 正文片段` 的顺序展示，不被统一挪到正文后或正文前。
3. 连续工具可以折叠成过程摘要，但展开后仍保留工具名、参数摘要、结果摘要、失败状态和来源引用。
4. 文件改动类工具进入文件变更汇总卡，不重复渲染普通 artifact / trailing timeline。
5. Task Board 与后台命令任务不要混淆：`TaskCreate/List/Get/Update` 是结构化任务板，`TaskOutput/TaskStop` 是后台 shell 输出控制。
6. MCP / dynamic tool 不依赖硬编码工具名，也能按操作族 `browser / search / list / read / generic` 分类展示。
7. 每个批次都能给出定向测试、GUI / Playwright 证据、控制台状态和剩余缺口。

## 当前事实源

- 主要外部参考优先级：
  - 第一优先级：`/Users/coso/Documents/dev/rust/codex`
  - 第二优先级：`/Users/coso/Documents/dev/js/claudecode`
- 参考规则：
  - 不确定工具过程、消息渲染、timeline、来源引用、文件改动、undo、模型无关抽象的口径时，优先读 Codex，因为它仍在持续更新维护。
  - Claude Code 作为补充参考，主要用于理解工具过程、markdown / tool result 展示、交互状态和测试组织。
  - 只参考架构和行为，不把具体 session、path、provider、model、tool name 列表硬编码到 Lime 业务代码里。
  - 如果 Codex 与 Claude Code 口径冲突，默认采用 Codex；若与 Lime current 架构冲突，在批次结果里写明差异和取舍。
- native tool 注册入口：`lime-rs/crates/agent-rust/crates/agent/src/tools/mod.rs`
- native alias 事实源：`lime-rs/crates/agent-rust/crates/agent/src/tools/registry.rs`
- Agent Chat 投影：`src/components/agent/chat/components/messageListItemProjection.ts`
- inline process 合并：`src/components/agent/chat/components/messageListInlineProcess.ts`
- 流式完成态 reconcile：`src/components/agent/chat/hooks/agentStreamCompletionController.ts`
- 主渲染：`src/components/agent/chat/components/StreamingRenderer.tsx`
- 工具展示分类：`src/components/agent/chat/utils/toolDisplayInfo.ts`
- 工具批次摘要：`src/components/agent/chat/utils/toolBatchGrouping.ts`
- 工具结果摘要：`src/components/agent/chat/utils/toolProcessSummary.ts`
- 搜索来源解析：`src/components/agent/chat/utils/searchResultPreview.ts`
- 历史恢复与 timeline 回归：`src/components/agent/chat/components/MessageList.test.tsx`

## 批次分配

每个进程只认领一个批次文档，除非用户明确要求合并。不要跨批次夹写；发现别的进程已经改了同一文件，切到只读验证并在批次文档里记录冲突。

如果要把同一批次交给 Codex 和 Claude Code 做截图对比，统一使用：

- `internal/exec-plans/agent-tools-test-batches/cross-agent-screenshot-alignment-prompt.md`

该提示词要求两边使用同一批次文档、同一 GUI 入口、同一 viewport、同一截图节点和同一 DOM / computed style 采样口径，便于后续按证据修 Lime，而不是按主观印象继续修补。

批次覆盖矩阵：

- `internal/exec-plans/agent-tools-test-batches/coverage-matrix.md`
- `internal/exec-plans/agent-tools-test-batches/final-audit.md`

| 批次 | 文档                                                                                           | 覆盖范围                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 01   | `internal/exec-plans/agent-tools-test-batches/batch-01-file-search-tools.md`                   | `Read / Write / Edit / NotebookEdit / view_image / Glob / Grep`                                                                |
| 02   | `internal/exec-plans/agent-tools-test-batches/batch-02-shell-background-tools.md`              | `Bash / PowerShell / TaskOutput / TaskStop / Sleep`                                                                            |
| 03   | `internal/exec-plans/agent-tools-test-batches/batch-03-web-browser-tools.md`                   | `WebSearch / WebFetch / browser* / playwright* / chrome* / mcp browser tools`                                                  |
| 04   | `internal/exec-plans/agent-tools-test-batches/batch-04-agent-team-interaction-tools.md`        | `Agent / SendMessage / AskUserQuestion / SendUserMessage / TeamCreate / TeamDelete / ListPeers / EnterPlanMode / ExitPlanMode` |
| 05   | `internal/exec-plans/agent-tools-test-batches/batch-05-skill-mcp-deferred-tools.md`            | `Skill / Workflow / ToolSearch / ListMcpResourcesTool / ReadMcpResourceTool / dynamic MCP read/list/search/mutation tools`     |
| 06   | `internal/exec-plans/agent-tools-test-batches/batch-06-gated-runtime-governance-tools.md`      | `Config / CronCreate / CronList / CronDelete / RemoteTrigger / EnterWorktree / ExitWorktree / LSP`                             |
| 07   | `internal/exec-plans/agent-tools-test-batches/batch-07-task-board-tools.md`                    | `TaskCreate / TaskList / TaskGet / TaskUpdate`                                                                                 |
| 08   | `internal/exec-plans/agent-tools-test-batches/batch-08-action-approval-tools.md`               | `action_required / approval_request / request_user_input / permission confirmation / Ask-style HITL`                           |
| 09   | `internal/exec-plans/agent-tools-test-batches/batch-09-vision-media-tools.md`                  | `view_image / ViewImage / ViewImageTool / model-visible image content / legacy hidden analyze_image`                           |
| 10   | `internal/exec-plans/agent-tools-test-batches/batch-10-content-workbench-tools.md`             | `lime_create_*_task / social_generate_cover_image / GenerateImage / media task artifact metadata`                              |
| 11   | `internal/exec-plans/agent-tools-test-batches/batch-11-browser-assist-site-tools.md`           | `lime_site_* / lime_search_web_images / compat lime_run_service_skill`                                                         |
| 12   | `internal/exec-plans/agent-tools-test-batches/batch-12-structured-output-final-reply-tools.md` | `StructuredOutput / SyntheticOutputTool / final reply protocol residue`                                                        |
| 13   | `internal/exec-plans/agent-tools-test-batches/batch-13-external-info-utility-data-tools.md`    | `SearchQuery / ImageQuery / finance / weather / sports / time / resolve-library-id / query-docs`                               |
| 14   | `internal/exec-plans/agent-tools-test-batches/batch-14-compat-dynamic-aliases.md`              | `MCPTool / McpAuthTool / REPLTool / ListSkills / LoadSkill / WaitAgent / ResumeAgent / CloseAgent`                             |
| 15   | `internal/exec-plans/agent-tools-test-batches/batch-15-runtime-empty-final-error-recovery.md`  | `empty final reply / provider stream failure / soft completion and failure split`                                              |

## 并行执行规则

1. 每个进程先读本索引和自己批次文档，再执行。
2. 每个进程在不确定测试口径或实现细节时，先读 `/Users/coso/Documents/dev/rust/codex` 的对应实现；仍不清楚再读 `/Users/coso/Documents/dev/js/claudecode`。
3. 每个进程开头必须记录：
   - 当前 `git status --short` 中自己相关文件状态
   - 认领写集
   - 不会修改的文件范围
4. 批次文档允许补充“进度日志”和“发现的问题”，但不要改其他批次文档。
5. 如果要修改业务代码，必须先在批次文档写明“为什么这个修复直接影响本批次交付”。
6. GUI 验证优先复用 `http://127.0.0.1:1420/` 当前 Lime 页签；进入前确认 `http://127.0.0.1:3030/health` 为 ok。
7. 每个批次收尾必须给：
   - 跑过的命令
   - Playwright / GUI 证据
   - 控制台 error / warning
   - 是否发现错序、重复、缺失、硬编码
   - 需要下一批或主线处理的问题

## 推荐公共命令

按批次风险选择，不要求每个进程全跑：

```bash
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/components/MessageList.test.tsx"
npm test -- "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts"
npx eslint "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.ts" --max-warnings 0
npm run smoke:agent-runtime-tool-surface
npm run bridge:health -- --timeout-ms 120000
cargo test --manifest-path "lime-rs/Cargo.toml" tools::
cargo test --manifest-path "lime-rs/Cargo.toml" task_list_tools -- --nocapture
```

注意：`npm run typecheck` 在当前工作区可能超过 120s，单批次进程不要反复长跑。若必须跑，先说明目的并设置超时。

## 验收口径

一个批次完成，不等于全目标完成。批次只需要证明自己工具族在以下维度覆盖充分：

- 投影顺序：`rendererContentParts` 或 timeline items 顺序正确。
- DOM 顺序：关键文本与工具摘要在页面里的 index 顺序正确。
- 摘要质量：工具名、参数、结果/来源、失败状态不丢。
- 去重：inline process 覆盖后不再外置重复 timeline。
- 历史恢复：冷加载历史会话不退化成“只有最终正文”或“工具统一挪到尾部”。
- 可交接：文档里记录命令、证据、问题和下一刀。
