# Batch 10 - Content Workbench / Media Creation 工具链

## 背景

本批次覆盖内容工作台与媒体创建工具。它和 Batch 07 的 `TaskCreate/List/Get/Update` 不同：Batch 07 是会话任务板；本批次的 `lime_create_*_task` 是内容工作台 artifact/task 主链，用于写入 `.lime/tasks/...` 任务记录并把媒体任务 metadata 回传给 Agent Chat。它也和 Batch 03 的搜索不同：`lime_create_modal_resource_search_task` 名字里包含 `search`，但语义是素材检索任务发起，不应被前端折叠成普通 Web/Search 来源过程。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考架构和行为，不硬编码 session、provider、model、绝对路径或某一次工具调用结果。Codex app 的关键口径是：工具过程按 runtime timeline 留在正文片段之间；工具协议噪声、内部路径和 raw JSON 不进入最终正文；来源和任务结果通过结构化元数据展示，而不是靠模型自然语言兜底。

## 覆盖工具

current workbench task 工具：

- `lime_create_video_generation_task`
- `lime_create_audio_generation_task`
- `lime_create_transcription_task`
- `lime_create_broadcast_generation_task`
- `lime_create_cover_generation_task`
- `lime_create_modal_resource_search_task`
- `lime_create_image_generation_task`
- `lime_create_url_parse_task`
- `lime_create_typesetting_task`

direct 内容生成工具：

- `social_generate_cover_image`

历史 / 兼容展示入口：

- `GenerateImage`
- `lime_create_resource_search_task`，仅作为历史别名展示，不是 Rust current catalog 名称

## 当前事实源与分类

事实源声明：Content Workbench current 主路径只允许向 `lime-rs/src/agent_tools/catalog.rs` 的 workbench catalog、`tool_runtime/creation_tools.rs` 的任务 artifact 写入、`media_cli_bridge.rs` 的任务 metadata、以及前端 Agent Chat inline process 展示收敛。

- `current`
  - `lime-rs/src/agent_tools/catalog.rs` 中的 `LIME_CREATE_*_TASK_TOOL_NAME`
  - `lime-rs/src/commands/agent_cmd/tool_runtime/creation_tools.rs`
  - `lime-rs/src/commands/agent_cmd/tool_runtime/media_cli_bridge.rs`
  - `lime-rs/src/commands/agent_cmd/tool_runtime/social_tools.rs` 的 `social_generate_cover_image`
  - `src/components/agent/chat/utils/toolDisplayInfo.ts`
  - `src/components/agent/chat/utils/toolProcessSummary.ts`
  - `src/components/agent/chat/utils/limeTaskProtocolNoise.ts`
- `compat`
  - `GenerateImage` / `generateimage`：历史 direct 图片生成展示别名
  - `lime_create_resource_search_task`：历史资源检索任务展示别名，current Rust catalog 使用 `lime_create_modal_resource_search_task`
- `deprecated`
  - 展示层按普通 `task` family 输出“已完成 N 项任务”的旧口径；本批次只允许作为历史对比，不继续扩展
- `dead`
  - 把 `.lime/tasks/...`、`absolute_artifact_path`、`task_id`、RPC code 或 `lime_create_*_task` raw tool name 直接展示给用户的路径

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/batch-10-content-workbench-tools.md`
- `src/components/agent/chat/utils/contentWorkbenchToolCopy.ts`
- `src/components/agent/chat/utils/limeTaskProtocolNoise.ts`
- `src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts`
- `src/components/agent/chat/utils/protocolResidue.ts`
- `src/components/agent/chat/utils/protocolResidue.test.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/utils/toolProcessSummary.test.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.test.ts`
- `src/components/agent/chat/components/InlineToolProcessStep.tsx`
- `src/components/agent/chat/components/InlineToolProcessStep.test.tsx`
- `src/components/agent/chat/components/ToolCallDisplay.tsx`
- `src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/lib/tauri-mock/runtimeToolInventoryMocks.ts`
- `src/lib/tauri-mock/core.test.ts`
- `src/i18n/resources/*/agentRuntime.json`
- `src/i18n/__tests__/loadNamespace.test.ts`
- `src/i18n/__tests__/types.test.ts`

不会修改：Rust tool 注册、真实 media artifact 写入、Task Board、Batch 01-09 文档、Inputbar、设置页、AppSidebar。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集夹写。相关既有改动包括 `toolDisplayInfo.ts`、`toolProcessSummary.ts`、`StreamingRenderer.test.tsx`、`MessageList.test.tsx` 等，`internal/exec-plans/` 当前为未跟踪目录。

## 发现的问题

### 2026-06-03

- `lime_create_audio_generation_task` 已在 Rust current catalog 和 `creation_tools.rs` 注册，但前端展示和 browser fallback mock 工具库存没有覆盖。
- `toolProcessSummary` 只对 `lime_create_image_generation_task` 做协议失败净化，视频、音频、转写、素材检索等失败可能泄露 `-32603: -32002: lime_create_*_task`。
- `protocolResidue` 只把图片生成协议失败当作正文残留，其他内容任务失败仍可能进入最终回答。
- `social_generate_cover_image` 和历史 `GenerateImage` 没有内容生成专用摘要，容易回退到“已发起这一步”或普通任务语义。
- `toolDisplayInfo` 把内容工作台任务放在普通 `"任务"` groupTitle，批次标题会变成“已完成 N 项任务”，与 Batch 07 Task Board 和 Batch 02 后台任务混淆。
- 新增用户可见文案必须走五语言 i18n；本批次新增 key 落在 `agentRuntime.json` 的 `agentChat.contentWorkbenchTools.*`。

## 修复原则

- current 任务发起用“内容任务”语义：单项展示 `已发起视频生成`，多项展示 `已发起 N 个内容任务`。
- direct 生成用“已生成封面图 / 已生成图片”，不伪装成异步任务发起。
- 失败净化按工具族和 task kind 判定，不按单一图片工具特例判定。
- 折叠态、展开态、旧结果面板和最终正文残留清理共用同一个协议失败事实源。
- 新增 UI 文案覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`；旧硬编码文案只登记为后续治理，不在本批次全量迁移。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
npm test -- "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/lib/tauri-mock/core.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"
npx eslint "src/components/agent/chat/utils/contentWorkbenchToolCopy.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/lib/tauri-mock/runtimeToolInventoryMocks.ts" "src/lib/tauri-mock/core.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts" --max-warnings 0
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-10-content-workbench-tools.md" "src/components/agent/chat/utils/contentWorkbenchToolCopy.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/lib/tauri-mock/runtimeToolInventoryMocks.ts" "src/lib/tauri-mock/core.test.ts" "src/i18n/resources/zh-CN/agentRuntime.json" "src/i18n/resources/zh-TW/agentRuntime.json" "src/i18n/resources/en-US/agentRuntime.json" "src/i18n/resources/ja-JP/agentRuntime.json" "src/i18n/resources/ko-KR/agentRuntime.json" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"
```

GUI / Playwright：

- 本批次先用 deterministic contentParts 和 component tests 锁住顺序、折叠、展开和 i18n。
- 如果后续要做截图对齐，使用 `cross-agent-screenshot-alignment-prompt.md`，fixture 应包含 `text -> lime_create_video_generation_task -> lime_create_audio_generation_task -> text`，同时采样折叠态和展开态。

## 进度日志

- 2026-06-03：创建 Batch 10 文档，登记 Content Workbench current 主路径、compat 别名和验证计划。
- 2026-06-03：补通用 Lime 内容任务协议失败净化，覆盖视频、音频、转写、封面、素材检索、链接解析、排版等任务。
- 2026-06-03：补 direct 内容生成摘要，`social_generate_cover_image` 展示为封面图生成语义。
- 2026-06-03：把内容任务批次标题从普通“任务”收敛到“内容任务”，并补 `lime_create_audio_generation_task` 前端展示与 mock inventory。
- 2026-06-03：新增五语言 `agentChat.contentWorkbenchTools.*` 文案，新增文案不再扩张裸中文硬编码。

## 验证结果

已通过：

```bash
npm test -- "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"
```

结果：6 files / 49 tests passed。

已通过：

```bash
npm test -- "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/lib/tauri-mock/core.test.ts"
```

结果：4 files / 103 tests passed。

已通过：

```bash
npx eslint "src/components/agent/chat/utils/contentWorkbenchToolCopy.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/lib/tauri-mock/runtimeToolInventoryMocks.ts" "src/lib/tauri-mock/core.test.ts" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts" --max-warnings 0
```

结果：exit 0，无新增 warning。

已通过：

```bash
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-10-content-workbench-tools.md" "src/components/agent/chat/utils/contentWorkbenchToolCopy.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.ts" "src/components/agent/chat/utils/limeTaskProtocolNoise.test.ts" "src/components/agent/chat/utils/protocolResidue.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/lib/tauri-mock/runtimeToolInventoryMocks.ts" "src/lib/tauri-mock/core.test.ts" "src/i18n/resources/zh-CN/agentRuntime.json" "src/i18n/resources/zh-TW/agentRuntime.json" "src/i18n/resources/en-US/agentRuntime.json" "src/i18n/resources/ja-JP/agentRuntime.json" "src/i18n/resources/ko-KR/agentRuntime.json" "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts"
```

结果：All matched files use Prettier code style。

部分通过 / 非本批次阻塞：

```bash
npm run test:contracts
```

结果：

- `check:agent-runtime-clients` 通过。
- `check-command-contracts.mjs` 通过，输出 frontend commands 425 / rust registered commands 585 / mock priority commands 55 / default mock commands 403。
- `check-harness-contracts.mjs` 失败：`src/components/agent/chat/utils/harnessRequestMetadata.ts` 前端未按约定输出 current `preferences.task/subagent`。该文件当前已有并行改动，不在 Batch 10 写集；本批次不夹写修复。

## 剩余缺口

- 旧 `toolDisplayInfo` / `toolProcessSummary` 里仍有大量既有中文硬编码；本批次只迁移新增内容工作台文案。下一刀应单独做 tool display copy i18n 迁移，不要和工具行为修复混在一起。
- 本批次不改 Rust media task artifact 写入；若要验证真实 artifact，需要单独跑 Rust creation_tools 定向测试或 GUI live/fixture flow。
- 真实 GUI / Playwright 截图对齐尚未执行。
