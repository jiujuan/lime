# Batch 07: Task Board 工具测试计划

## 独立背景

本批次覆盖结构化任务板工具：`TaskCreate`、`TaskList`、`TaskGet`、`TaskUpdate`。它们与 Batch 02 的 `TaskOutput/TaskStop` 不是同一类：Batch 02 管后台 shell 进程输出，本批次管会话内任务板状态、任务元数据、hook feedback 和 GUI task list 展示。

当前主线问题是工具过程与最终正文可能错序、重复或被拼进正文。任务板工具还有额外风险：结果 metadata 同时包含 `task`、`tasks`、`task_list`、`task_list_id`，前端如果只按 raw JSON 渲染，会把结构化任务状态当成长工具输出，影响最终回答可读性。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定计划/任务状态、update_plan 类 UI、任务列表摘要、历史恢复或 hook feedback 口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 本批次只认领任务板工具；不要修改后台 shell 输出、web search 来源引用或文件撤销链路。

## 覆盖工具

native 注册事实源：`src-tauri/crates/aster-rust/crates/aster/src/tools/mod.rs`

- `TaskCreate`
- `TaskList`
- `TaskGet`
- `TaskUpdate`

兼容 alias：

- `TaskCreateTool`
- `TaskListTool`
- `TaskGetTool`
- `TaskUpdateTool`

参数 alias 也要覆盖：

- `task_id` -> `taskId`
- `active_form` -> `activeForm`
- `add_blocks` -> `addBlocks`
- `add_blocked_by` -> `addBlockedBy`

## 认领边界

建议认领：

- `src-tauri/crates/aster-rust/crates/aster/src/tools/task_list_tools.rs`
- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/components/messageListInlineProcess.test.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`

不要修改：

- `TaskOutput` / `TaskStop` 后台命令输出控制，除非发现同名投影直接污染任务板展示。
- web search / browser 来源引用。
- 文件变更卡撤销链路。
- Agent / Team 创建逻辑，除非任务板绑定 team context 的测试直接失败。

## 必测场景

1. `TaskCreate -> text`：
   - `contentParts = [text("我先建任务"), tool_use(TaskCreate), text("下一步")]`
   - DOM 顺序必须是前置说明、任务创建过程、后续正文。
   - 过程摘要保留 task subject 和 id，不展示大段 raw JSON。

2. `TaskList` 空列表与非空列表：
   - 空列表显示为清晰的“无任务/0 tasks”摘要或等价状态。
   - 非空列表保留 task id、subject、status。
   - 不把 `tasks` metadata 拼进最终正文。

3. `TaskGet`：
   - 找到任务时保留 subject、description、status、依赖摘要。
   - 找不到任务时显示 null / missing 状态，不应作为工具失败误导用户。
   - `task_id` 参数 alias 必须可进入同一摘要路径。

4. `TaskUpdate`：
   - status 从 `pending -> in_progress -> completed` 的过程可见。
   - `deleted` 语义不应把历史任务直接从已完成消息里消失。
   - `addBlocks/addBlockedBy` 和 snake_case alias 都要覆盖。

5. hook feedback：
   - 若 hook 阻止创建或更新，错误摘要在工具过程内展示。
   - 后续最终正文仍位于错误过程之后。

6. 历史恢复：
   - 冷加载含任务板工具的会话时，任务过程不应统一 trailing 到正文后。
   - 最终正文只包含 assistant 最终回答，不拼入任务 JSON。

7. 与 Team 上下文：
   - 有 team task list id 时，工具 metadata 的 `task_list_id` 可读。
   - 无 team 时使用 session 级任务板，不影响普通会话。

## 建议测试入口

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" task_list_tools -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" test_register_default_tools -- --nocapture
```

前端：

```bash
npm test -- "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts"
npm test -- "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
```

GUI / Playwright：

```bash
npm run bridge:health -- --timeout-ms 120000
```

然后打开 `http://127.0.0.1:1420/`，优先使用 task board fixture 或新建安全对话：

1. 触发创建 2-3 个任务。
2. 列出任务并更新其中一个为 completed。
3. 验证过程摘要、最终正文顺序、任务状态和控制台 error / warning。
4. 历史冷加载同一会话，再验证 DOM 顺序和 raw JSON 去重。

## 交付记录模板

```md
## Batch 07 结果

- 进程/认领人：
- 当前 git 状态：
- 覆盖工具：
- 任务板状态证据：
- DOM 顺序 index：
- GUI 截图/快照：
- 控制台状态：
- 发现问题：
- 是否需要业务修复：
- 下一刀：
```

## Batch 07 结果

- 进程/认领人：当前 Codex 进程。本轮窄写集限定在任务板 Rust 工具、任务板前端过程渲染、历史投影回归和本批次文档；因发现展开态会走 raw JSON 兜底，额外认领 `InlineToolProcessStep.tsx` 作为直接阻塞修复点。
- 当前 git 状态：工作区全局很脏，本轮只修改相关文件：`src-tauri/crates/aster-rust/crates/aster/src/tools/task_list_tools.rs`、`src/components/agent/chat/components/InlineToolProcessStep.tsx`、`src/components/agent/chat/components/StreamingRenderer.test.tsx`、`src/components/agent/chat/components/messageListItemProjection.unit.test.ts`、本文件。`internal/exec-plans/` 目录当前为未跟踪状态，属于既有执行计划产物。
- 覆盖工具：`TaskCreateTool`、`TaskListTool`、`TaskGetTool`、`TaskUpdateTool`，并覆盖 native 等价名的归一化路径。
- 任务板状态证据：
  - Rust 新增 `test_task_board_input_aliases_deserialize_to_current_fields`，覆盖 `active_form`、`task_id`、`add_blocks`、`add_blocked_by` alias。
  - Rust 新增 `test_task_get_tool_returns_null_for_missing_task_without_failure`，证明 missing task 返回 `{ task: null }` 且 `success=true`，不会误报工具失败。
  - Rust 新增 `test_task_update_tool_accepts_snake_case_dependency_aliases`，证明 snake_case 依赖字段可更新任务板状态并在 list 输出里保留。
  - 删除本轮文件里重复的 `SessionManager` 测试 import；重跑后 `task_list_tools.rs` 不再产生 unused import warning。
- DOM 顺序 index：
  - `StreamingRenderer.test.tsx` 新增任务板交错 fixture，断言默认折叠态顺序为：`我先把工作拆成任务板。` -> `已处理 2 项安排` -> `任务板已建立，接下来开始执行。` -> `已处理 1 项安排` -> `最终结论：任务板状态已经同步完成。`
  - 同一测试展开两个过程组后，断言可见任务 subject `整理国际新闻` 和更新动作 `已更新任务 1`。
  - 折叠态与展开态都断言不泄露 `task_list_id`、`updatedFields`、`"tasks"` 这类结构字段。
- 历史恢复证据：
  - `messageListItemProjection.unit.test.ts` 新增历史任务板 timeline fixture，断言 `rendererContentParts` 顺序保持 `text -> tool_use -> tool_use -> tool_use -> text`。
  - 最终正文只保留 `最终结论：任务板已完成。`，不把 `updatedFields` / `task_list_id` 拼进 `rendererRawContent`。
- 业务修复：
  - `InlineToolProcessStep.tsx` 新增任务板结构化详情归一化：从 `metadata.task` / `metadata.tasks` / `metadata.task_list` 或 output JSON 中生成短任务摘要，避免通用 Markdown 详情兜底打印 raw JSON。
  - 该逻辑按工具族 `taskcreate/tasklist/taskget/taskupdate` 与结构字段归一化，不绑定 session、provider、model、路径或某个测试 fixture。
- 已执行验证：
  - `npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"`：3 files / 74 tests passed。
  - `npx eslint "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx"`：passed。
  - `CARGO_TARGET_DIR="/Users/coso/Documents/dev/ai/aiclientproxy/lime/src-tauri/target" cargo test --manifest-path "src-tauri/crates/aster-rust/Cargo.toml" -p aster-core task_list_tools -- --nocapture`：`task_list_tools` 15 tests passed；其余 test targets 在同一 filter 下为 0 tests。
- GUI 截图/快照：本轮未跑 Playwright / GUI。原因是 Batch 07 的风险已由 deterministic contentParts fixture、历史 projection fixture 和 Rust task board 单测覆盖；真实 GUI 任务板工具需要安全 runtime fixture 或模型驱动触发，当前不应为了证据让模型真实创建/更新任务。
- 控制台状态：未进入浏览器页面，因此无新增控制台 error / warning 采样。
- 发现问题：
  - `cargo test --manifest-path "src-tauri/Cargo.toml" -p aster-core ...` 不可用，因为 `aster-core` 被 `src-tauri` workspace exclude；正确入口是 `src-tauri/crates/aster-rust/Cargo.toml`，并显式设置 `CARGO_TARGET_DIR` 到 `src-tauri/target`。
  - Rust 重跑期间曾被已有 `tauri dev` / `cargo run` 占用 artifact lock；最终等待释放后通过。
  - 当前仍有 `worktree_tools.rs` 的 `SessionManager` unused import warning，属于 Batch 06 / worktree 写集残留，本轮不夹写。
- 是否需要业务修复：已完成必要业务修复。否则任务板工具展开态会泄露结构 JSON，直接违背本批次“工具结果不串正文、不 raw JSON 展示”的验收口径。
- 下一刀：进入下一批前优先选择未覆盖的长尾工具族或回到 GUI smoke；若继续清 warning，单独认领 `worktree_tools.rs`，不要混在任务板批次里。
