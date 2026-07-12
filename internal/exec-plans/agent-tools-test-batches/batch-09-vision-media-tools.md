# Batch 09 - Vision / Media 工具链

## 背景

本批次覆盖本地图片查看、图片结果回传和模型可见图片 content block。它和 Batch 01 的文件读取有交集，但风险不同：`Read` 可以读取图片路径并给出文本化输出，`view_image` 则应该把图片作为结构化 image content 传给模型，同时在前端只展示过程摘要和可展开预览，不能把 base64 或工具内部 raw output 当成正文。

Codex 当前做法是让图片以结构化 content item 进入请求 / 工具结果，例如 `input_image` / `FunctionCallOutputContentItem::InputImage`，而不是让 UI 或模型从普通文本里猜 base64。Lime 已经在 Rust 侧实现相近链路：`view_image` 输出 `model_visible_image` 和 `image_url` metadata，Agent agent 会把它转换成 model-visible image content，并从 structured content 里移除传输用 `image_url`。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考行为和架构，不硬编码 provider、model、session、绝对路径或某一次工具调用结果。

## 本批次目标

1. `view_image` / `ViewImage` / `ViewImageTool` 在前端展示层归一成同一类图片查看工具。
2. 图片查看工具在流式和历史渲染中保持 `正文片段 -> 工具过程 -> 正文片段` 顺序。
3. 完成态摘要展示 `已查看图片 <subject>`，不回退展示 raw `Viewed image: ...`。
4. 展开过程详情时能预览结构化图片结果，且正文文本不泄露 `data:image/...;base64`。
5. `analyze_image` 只记录为 legacy hidden / deprecated candidate，不把它重新注册到 current tool surface。

## 当前事实源与分类

事实源声明：Vision / Media current 主路径只允许向 `view_image` native tool + model-visible image content + 前端 inline process 展示收敛。

- `current`
  - `lime-rs/crates/agent-rust/crates/agent/src/tools/view_image.rs`
  - `lime-rs/crates/agent-rust/crates/agent/src/tools/mod.rs` 中注册的 `ViewImageTool`
  - `lime-rs/crates/agent-rust/crates/agent/src/agents/agent.rs` 中 model-visible image content 转换
  - `src/components/agent/chat/hooks/agentChatToolResult.ts` 中图片结果归一化
  - `src/components/agent/chat/components/InlineToolProcessStep.tsx` 中图片预览
- `compat`
  - `ViewImage` / `ViewImageTool` 展示别名，仅用于归一到 `view_image`
- `deprecated`
  - `lime-rs/crates/agent-rust/crates/agent/src/tools/analyze_image.rs`
  - `lime-rs/src/agent_tools/execution.rs` 中 `analyze_image` 执行策略残留
- `dead-candidate`
  - `analyze_image` 没有 catalog entry，也未在 Agent `register_all_tools` 注册；`Agent::list_tools` 测试要求它继续留在 legacy hidden surface 外，不应作为新入口修复。

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/batch-09-vision-media-tools.md`
- `src/components/agent/chat/hooks/agentChatToolResult.ts`
- `src/components/agent/chat/hooks/agentChatToolResult.test.ts`
- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/components/ToolCallDisplay.tsx`
- `src/components/agent/chat/components/ToolCallDisplayViewModel.ts`
- `src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/hooks/agentChatHistory.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.test.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/utils/toolProcessSummary.test.ts`

不会修改：Rust tool 注册、catalog、DevBridge、设置页、Inputbar、AppSidebar、前 8 批文档。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集内夹写。相关已改文件包括：

- `lime-rs/crates/agent-rust/crates/agent/src/tools/mod.rs`
- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/utils/toolProcessSummary.test.ts`
- `internal/exec-plans/` 当前为 untracked 目录

## 发现的问题

### 2026-06-03

- `view_image` 已是 current native tool，并且 Rust 侧已经输出 `model_visible_image` / `image_url` metadata。
- `native_tool_result_to_call_tool_result` 已能把 `view_image` metadata 转成模型可见 image content，并避免把 `image_url` 留在 structured content。
- 前端 `toolDisplayInfo` 已有 `vision` family 和 `viewimage` / `analyzeimage` label。
- 缺口：`toolProcessSummary` 对 `vision` family 没有专门 pre/post 摘要；完成态容易回退到 raw `Viewed image: ...`。
- 缺口：inline 预览只从 `result.images` 或 raw output 中提取 data URL，未兜住 current `metadata.image_url`。
- 缺口：缺少历史 timeline 和 DOM 顺序回归，不能证明图片查看过程不会被挪到最终正文前后。

## 修复原则

- 只增强 current `view_image` 展示和结构化图片读取，不注册 `analyze_image`。
- 图片预览来源以 `metadata.model_visible_image + image_url` 这类结构化协议为准，不从 session、路径或 provider 名称推断。
- 过程摘要用工具族和主体对象生成，不展示 `Viewed image: ...` 这类 Rust 内部 output 第一行。
- 组件测试只验证 DOM 接线；顺序和摘要尽量落到 projection / utility 单元测试。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
npm test -- "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx eslint "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplayViewModel.ts" "src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --max-warnings 0
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-09-vision-media-tools.md" "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplayViewModel.ts" "src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"
```

Rust 定向验证建议：

```bash
CARGO_TARGET_DIR="/Users/coso/Documents/dev/ai/aiclientproxy/lime/lime-rs/target" cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core view_image -- --nocapture
CARGO_TARGET_DIR="/Users/coso/Documents/dev/ai/aiclientproxy/lime/lime-rs/target" cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core test_native_tool_result_to_call_tool_result_attaches_model_visible_image -- --nocapture
CARGO_TARGET_DIR="/Users/coso/Documents/dev/ai/aiclientproxy/lime/lime-rs/target" cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core test_list_tools_excludes_legacy_agent_control_surface -- --nocapture
```

GUI / Playwright：本批次先用 deterministic projection + renderer DOM 测试锁住顺序和预览；如后续要做截图对齐，应复用 `cross-agent-screenshot-alignment-prompt.md`，用包含 `view_image` 的 fixture turn 做 Chrome 证据。

## 进度日志

- 2026-06-03：创建 Batch 09 文档，登记 Vision / Media current 主路径、legacy `analyze_image` 分类和验证计划。
- 2026-06-03：补充 `agentChatToolResult.normalizeToolResultImages`，支持从 `model_visible_image + image_url` metadata 归一化图片预览。
- 2026-06-03：同步历史 hydration、inline process 与旧 `ToolCallDisplay` 的图片 metadata 读取，避免只在 `result.images` 存在时才显示预览。
- 2026-06-03：补充 `view_image` / `ViewImageTool` 的查看语义摘要和批次标题，完成态不再回退展示 raw `Viewed image: ...`。
- 2026-06-03：补充 projection / renderer 回归，锁定历史 `text -> view_image -> text` 顺序、DOM 过程组顺序、展开图片预览和正文不泄露 base64。

## 验证结果

已通过：

```bash
npm test -- "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
```

结果：6 files / 99 tests passed。

已通过：

```bash
npx eslint "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplayViewModel.ts" "src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --max-warnings 0
```

结果：exit 0，无新增 warning。

已通过：

```bash
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-09-vision-media-tools.md" "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatToolResult.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplayViewModel.ts" "src/components/agent/chat/components/ToolCallDisplayViewModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"
```

结果：All matched files use Prettier code style。

未执行：

- Rust 定向测试：本轮未修改 Rust runtime / native tool 注册；只根据现有事实源防止前端回退。
- GUI smoke / Playwright：本批次先用 deterministic projection + renderer DOM 回归证明顺序和预览；需要截图证据时再按公共 prompt 单独起 GUI。

## 剩余缺口

- `analyze_image` Rust 残留尚未删除；本批次只防止它回流，不做 Rust 删除，以免扩大写集。
- 本批次不覆盖图片生成 / 搜图 / 视觉 workbench 任务；这些属于内容创建工具或外部搜索工具，应在后续批次单独覆盖。
