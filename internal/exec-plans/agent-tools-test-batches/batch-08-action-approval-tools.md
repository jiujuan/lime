# Batch 08 - Action / Approval / HITL 工具链

## 背景

本批次覆盖 `action_required`、历史 timeline 里的 `approval_request` / `request_user_input`，以及 Ask-style HITL 用户输入链路。它们不是普通工具结果，但会和 `thinking`、工具过程、正文、文件改动一起进入同一条消息渲染链路。

Codex 的当前实现把审批请求视为 turn lifecycle 的一部分：请求可以在进行中以交互面板呈现，决策完成后进入历史记录，但不会被当成最终正文，也不会把后续回答挪到审批请求前面。Lime 需要对齐这个口径：交互请求是过程边界，应该按 runtime timeline 顺序进入 inline process flow。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考行为和架构，不硬编码 provider、model、session、path 或具体工具名特例。

## 本批次目标

1. `action_required` content part 在流式和历史渲染中保持原始顺序。
2. `approval_request` / `request_user_input` timeline item 能转换成 `action_required` content part。
3. 确认卡不被外置 timeline 重复渲染，不被统一挪到正文前或正文后。
4. 已提交问答在历史中只读回显；未提交审批仍保留可交互状态。
5. 不扩大搜索、文件、Task Board 等前序批次写集。

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/batch-08-action-approval-tools.md`
- `src/components/agent/chat/components/messageListItemProjection.ts`
- `src/components/agent/chat/components/messageListInlineProcess.ts`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`

不会修改：更新页、AppSidebar、Inputbar、设置页、i18n、前 7 批文档和 Rust tool surface。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集内夹写。相关已改文件包括：

- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `lime-rs/crates/agent-rust/crates/agent/src/tools/task_list_tools.rs`
- `internal/exec-plans/` 当前为 untracked 目录

## 发现的问题

### 2026-06-03

- `messageListInlineProcess.createInlineCoverageMatcher` 已经能用 `request_id` 覆盖 `approval_request` / `request_user_input`。
- `AgentThreadApprovalRequestItem` 与 `AgentThreadRequestUserInputItem` 已在 `src/lib/api/agentProtocol.ts` 中定义。
- `timeline-utils/itemConverters.ts` 已有 `toActionRequired(item)`，可把历史 timeline item 转成前端 `ActionRequired`。
- 缺口：`messageListItemProjection.buildTimelineInlineContentParts` 只消费 `reasoning / agent_message / tool_call / command_execution / web_search`，未消费 `approval_request / request_user_input`。
- 缺口：`hasTimelineProcessItems` 未把 `approval_request / request_user_input` 视为 process item，导致只含 HITL 的历史 turn 容易退化成外置 timeline 或丢失 inline 顺序。

## 修复原则

- 使用已有 `toActionRequired` 转换器，避免在 projection 里复制 ActionRequired 字段映射。
- 把审批和问答视作通用 process boundary，不按具体 request_id / tool_name 硬编码。
- 保留现有 `action_required` content part 渲染路径，避免新增并行 UI。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --max-warnings 0
```

不跑 Rust 定向测试：本批次不修改 Rust runtime/tool surface。

GUI / Playwright：本批次先用 deterministic projection + renderer DOM 测试锁住顺序；如后续要做真实截图对齐，应复用 `cross-agent-screenshot-alignment-prompt.md`，用包含审批/问答的 fixture turn 做 Chrome 证据。

## 进度日志

- 2026-06-03：创建 Batch 08 文档，登记 action / approval / HITL 覆盖范围和写集。
- 2026-06-03：修复 timeline inline builder，复用 `toActionRequired` 把 `approval_request` / `request_user_input` 转成 `action_required` content part。
- 2026-06-03：补充 `hasTimelineProcessItems`，把 `approval_request` / `request_user_input` 纳入 process item 判定。
- 2026-06-03：补充 projection 回归，锁定历史 timeline 中 `text -> action_required -> text -> action_required -> text` 顺序。
- 2026-06-03：补充 StreamingRenderer DOM 回归，确认交错 `action_required` 不会被挪到前后正文之外。

## 验证结果

已通过：

```bash
npm test -- "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
```

结果：2 files / 59 tests passed。

已通过：

```bash
npm test -- "src/components/agent/chat/components/messageListInlineProcess.test.ts"
```

结果：1 file / 4 tests passed。

已通过：

```bash
npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --max-warnings 0
```

结果：exit 0，无新增 warning。

已通过：

```bash
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-08-action-approval-tools.md" "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
```

结果：All matched files use Prettier code style。

未执行：

- Rust 定向测试：本批次未修改 Rust runtime / tool surface。
- GUI smoke / Playwright：本批次先用 deterministic projection + DOM 回归证明顺序；需要截图对齐时再按公共 prompt 单独起 GUI 证据。

## 剩余缺口

- `usesProcessSeparatedFinalText` 仍只对 web search 做最终正文选择。Batch 08 没有扩大该策略，避免和前序批次并行修改冲突；后续若要统一所有 process boundary 的 copy / quote / save 口径，应单独开治理批次。
- 本批次未覆盖真实用户点击提交后的 runtime resume；这属于 GUI / bridge 交互证据，应在后续 Playwright 批次里用可控 fixture turn 验证。
