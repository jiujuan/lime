# Batch 12 - Structured Output / Final Reply 工具链

## 背景

本批次覆盖 `StructuredOutput` / `SyntheticOutputTool` 以及最终答复协议残留清理。它和 Batch 04 的 `SendUserMessage` 不同：`StructuredOutput` 是模型把最终结果交给 runtime 的内部 final-output 工具，不是给用户发送一条普通消息。它也和 Batch 08 的 HITL 不同：本批次不处理用户输入确认，而是验证最终正文不会被工具协议、续跑提示、`select:StructuredOutput` 或 provider final-output 约束污染。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考架构和行为，不硬编码 session、provider、model 或某一次 final output 文本。Codex app 的关键口径是：最终答复必须是用户可直接阅读的正文；工具调用、StructuredOutput 约束、续跑提示和 runtime 错误 envelope 只能留在过程 / 诊断层，不能进入 assistant 正文。

## 覆盖工具

current：

- `StructuredOutput`

compat / alias：

- `SyntheticOutputTool`
- `structured_output`
- `select:StructuredOutput`，只作为 ToolSearch / protocol residue 里的内部选择词识别，不是用户可见工具名

不在本批次重复覆盖：

- `SendUserMessage / BriefTool`，归 Batch 04
- `ToolSearch select:<tool>` 结果展示，归 Batch 05
- `approval_request / request_user_input`，归 Batch 08

## 当前事实源与分类

事实源声明：最终答复 current 主路径只允许向 runtime final content、`messageDisplaySanitizer`、`protocolResidue`、`toolProcessSummary` 和 Agent Chat inline process 展示收敛；`StructuredOutput` 工具名只能作为过程摘要或协议清理信号，不应成为最终正文的一部分。

- `current`
  - `lime-rs/src/agent_tools/catalog.rs` 中的 `StructuredOutput`
  - `src/lib/tauri-mock/runtimeToolInventoryMocks.ts` 中的 `StructuredOutput`
  - `src/components/agent/chat/utils/toolDisplayInfo.ts` 的 `structuredoutput` 展示
  - `src/components/agent/chat/utils/toolProcessSummary.ts` 的最终答复过程摘要
  - `src/components/agent/chat/utils/protocolResidue.ts`
  - `src/components/agent/chat/utils/messageDisplaySanitizer.ts`
- `compat`
  - `SyntheticOutputTool` / `syntheticoutputtool` alias，归一化到 `structuredoutput`
- `deprecated`
  - 把 `StructuredOutput` continuation prompt、`select:StructuredOutput`、`final output tool` 当普通正文展示的旧路径
- `dead`
  - 最终正文只剩 `StructuredOutput`、`select:StructuredOutput`、JSON schema 约束或“请继续，你上一条回复还是中间过程结论”的路径
  - 把 runtime final-output 错误 envelope 当用户可读正文展示的路径

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/batch-12-structured-output-final-reply-tools.md`
- `src/components/agent/chat/utils/protocolResidue.test.ts`
- `src/components/agent/chat/utils/messageDisplaySanitizer.test.ts`

不会修改：Rust tool 注册、mock inventory、真实 runtime final-output 协议、Batch 01-11 文档、Inputbar、设置页、AppSidebar。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集夹写。`internal/exec-plans/agent-tools-test-batches/` 当前为未跟踪目录。

## 发现的问题

### 2026-06-03

- Rust catalog 和 mock inventory 都已有 `StructuredOutput`，但批次索引此前没有单独覆盖最终答复工具链。
- `toolDisplayInfo.test.ts` 已覆盖 `SyntheticOutputTool -> structuredoutput` 和展示标签“最终答复”。
- `toolProcessSummary.test.ts` 已覆盖 `SyntheticOutputTool` 的过程文案“先整理最终答复 / 已整理最终答复”。
- `protocolResidue.test.ts` 已覆盖 `StructuredOutput` continuation、`select:StructuredOutput` 和中文续跑提示残留，但缺少 final-output JSON 约束句的直接回归。
- `messageDisplaySanitizer.test.ts` 已覆盖工具过程自述清理，但缺少 StructuredOutput 协议残留穿透到最终正文时的成组回归。

## 修复原则

- `StructuredOutput` 只作为过程工具显示为“最终答复”，不能污染最终正文。
- `select:StructuredOutput` 只允许作为内部 ToolSearch 选择词被清理。
- final-output JSON 约束、续跑提示和 runtime error envelope 不进入用户正文。
- 正常解释 “StructuredOutput 是内部工具名” 的用户可读说明不能误删。
- 新增或改动的用户可见 presentation 文案必须走 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`；本批次不新增产品文案，只补测试和文档。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
npx eslint "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" --max-warnings 0
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-12-structured-output-final-reply-tools.md" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts"
```

可选 runtime / history 验证：

```bash
npm test -- "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx"
```

GUI / Playwright：

- 本批次先用 deterministic sanitizer / process tests 锁住最终正文清理。
- 后续截图对齐 fixture 应包含 `text -> StructuredOutput tool_use -> final text`，并验证最终正文不显示 `StructuredOutput` / `select:StructuredOutput` / continuation prompt。

## 进度日志

- 2026-06-03：创建 Batch 12 文档，登记 `StructuredOutput` current 主路径、`SyntheticOutputTool` compat alias 和最终答复协议残留验证计划。
- 2026-06-03：补 final-output JSON 约束残留清理回归，覆盖 `protocolResidue` 与 `messageDisplaySanitizer` 两层。

## 验证结果

已通过：

```bash
npm test -- "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
```

结果：4 files / 63 tests passed。

已通过：

```bash
npx eslint "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" --max-warnings 0
```

结果：exit 0，无新增 warning。

已通过：

```bash
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-12-structured-output-final-reply-tools.md" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts"
```

结果：All matched files use Prettier code style。

## 剩余缺口

- 尚未执行 GUI / Playwright 历史恢复截图对齐。
- `StructuredOutput` 的真实 runtime final-output 协议未在本批次改动；若要验证 provider stream 端到端，需要另开 runtime fixture 或 GUI smoke。
