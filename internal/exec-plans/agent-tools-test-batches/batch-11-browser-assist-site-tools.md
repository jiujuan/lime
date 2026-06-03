# Batch 11 - Browser Assist / Site Tools 工具链

## 背景

本批次覆盖 Browser Assist 里的站点能力工具，以及与站点能力容易混淆的联网搜图和旧服务技能兼容工具。它和 Batch 03 不同：Batch 03 覆盖通用 `WebSearch / WebFetch / browser* / mcp__lime-browser__*`，本批次只验证 Lime 注入的站点能力 surface。它也和 Batch 10 不同：`lime_search_web_images` 会生成图片候选和来源 artifact，但不是 `lime_create_*_task` 内容任务发起；`lime_run_service_skill` 是旧会话兼容入口，不应继续扩展成 current 主链。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考架构和行为，不硬编码 session、provider、model、绝对路径或某一次站点结果。Codex app 的关键口径是：工具过程按 runtime timeline 留在正文片段之间；工具结果用结构化元数据生成来源、保存目标和可展开内容，不把 raw JSON、内部路径或 provider 错误串进最终正文。

## 覆盖工具

current Browser Assist / Site tools：

- `lime_site_list`
- `lime_site_recommend`
- `lime_site_search`
- `lime_site_info`
- `lime_site_run`

相关 current workbench search 工具：

- `lime_search_web_images`

compat 工具：

- `lime_run_service_skill`

不在本批次重复覆盖：

- `WebSearch / WebFetch / browser* / playwright* / chrome* / mcp__lime-browser__*`，归 Batch 03
- `lime_create_*_task / social_generate_cover_image`，归 Batch 10
- `TaskCreate/List/Get/Update`，归 Batch 07

## 当前事实源与分类

事实源声明：站点能力 current 主路径只允许向 `src-tauri/src/agent_tools/catalog.rs` 的 Browser Assist catalog、浏览器 runtime / site adapter 元数据、`runtimeToolInventoryMocks.ts` 的 browser assist mock inventory，以及 Agent Chat inline process / saved site content 展示收敛。

- `current`
  - `src-tauri/src/agent_tools/catalog.rs` 中的 `LIME_SITE_*_TOOL_NAME`
  - `src/lib/tauri-mock/runtimeToolInventoryMocks.ts` 中的 `BROWSER_ASSIST_MOCK_TOOL_SPECS`
  - `src/components/agent/chat/utils/toolDisplayInfo.ts` 的站点工具展示
  - `src/components/agent/chat/utils/toolProcessSummary.ts` 的站点过程摘要
  - `src/components/agent/chat/utils/siteToolResultSummary.ts`
  - `src/components/agent/chat/utils/latestSavedSiteContentTarget.ts`
  - `src/components/agent/chat/utils/taskPreviewFromToolResult.ts` 的 `lime_search_web_images` 图片候选 artifact
- `compat`
  - `lime_run_service_skill`：旧服务技能兼容执行。只允许展示和历史会话恢复，不作为新能力入口继续扩展。
- `deprecated`
  - 依赖中文 `groupTitle === "站点"` 判断站点工具族的旧展示逻辑。后续五语言迁移时必须继续向工具族 key / capability key 收敛。
- `dead`
  - 把 `lime_site_*` raw JSON、`saved_content` 内部 bundle 路径、`project_root_path` 绝对路径、`tool_family` metadata 直接展示给用户的路径。
  - 把 `lime_site_search` 当成普通网页搜索来源引用的路径。
  - 把 `lime_search_web_images` 当成普通内容任务发起或隐藏 task JSON 的路径。

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/batch-11-browser-assist-site-tools.md`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.test.ts`
- `src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts`

不会修改：Rust tool 注册、真实 browser runtime、site adapter 执行器、Batch 01-10 文档、Inputbar、设置页、AppSidebar。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集夹写。相关既有改动包括 `toolDisplayInfo.ts`、`toolProcessSummary.ts`、`StreamingRenderer.test.tsx`、`ToolCallDisplay.siteMedia.test.tsx`、`runtimeToolInventoryMocks.ts` 和 `core.test.ts`，`internal/exec-plans/` 当前为未跟踪目录。

## 发现的问题

### 2026-06-03

- `src-tauri/src/agent_tools/catalog.rs` 已把 `lime_site_*` 标记为 `current`，`lime_run_service_skill` 标记为 `compat`。
- Browser fallback mock 已包含 `lime_site_*`，workbench mock 已包含 `lime_search_web_images` 和 `lime_run_service_skill`。
- `toolDisplayInfo.ts` 的站点批次标题此前通过 `info.groupTitle === "站点"` 判定站点族。该做法会在后续 i18n 化 groupTitle 时变成隐性行为漂移。
- `taskPreviewFromToolResult.ts` 已支持 `lime_search_web_images` 的图片候选预览和带来源 artifact document，但缺少直接单元测试锁住该工具名。
- 旧 `toolDisplayInfo.ts` / `toolProcessSummary.ts` 里仍有大量既有中文硬编码。本批次不做全量工具展示 i18n 迁移，只登记为后续治理项；新增测试不引入新用户可见文案 key。

## 修复原则

- 站点工具族判断使用规范化工具名集合，不依赖中文展示分组。
- `lime_site_search` 只展示为站点能力搜索，不和普通 WebSearch 来源引用混淆。
- `lime_site_run` 的保存结果继续通过 `siteToolResultSummary` 解析，不展示 raw JSON、内部 bundle 路径或 legacy 绝对路径。
- `lime_search_web_images` 输出 `modal_resource_search` 预览和 artifact document，并保留每张图片的来源 locator。
- `lime_run_service_skill` 只保持 compat 展示和历史恢复，不新增业务逻辑。
- 新增或改动的用户可见 presentation 文案必须走 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`；本批次没有新增产品文案，只补测试和结构判断。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/siteToolResultSummary.test.ts" "src/components/agent/chat/utils/latestSavedSiteContentTarget.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"
npx eslint "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts" --max-warnings 0
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-11-browser-assist-site-tools.md" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"
```

可选 contract 验证：

```bash
npm test -- "src/lib/tauri-mock/core.test.ts"
npm run test:contracts
```

注意：上一批已记录 `npm run test:contracts` 当前可能因非本批次写集 `src/components/agent/chat/utils/harnessRequestMetadata.ts` 的并行改动失败；若仍失败，记录为非 Batch 11 阻塞。

GUI / Playwright：

- 本批次先用 deterministic unit/component tests 锁住站点工具族、保存内容和联网搜图 artifact。
- 后续截图对齐使用 `cross-agent-screenshot-alignment-prompt.md`，fixture 应包含 `text -> lime_site_search -> text -> lime_site_run(saved_content) -> lime_search_web_images -> text`，同时采样折叠态、展开态、保存内容按钮和图片候选卡。

## 进度日志

- 2026-06-03：创建 Batch 11 文档，登记 Browser Assist / Site Tools current 主路径、`lime_run_service_skill` compat 边界和验证计划。
- 2026-06-03：把站点批次标题判断从中文 groupTitle 收敛到规范化工具名集合，降低后续 i18n 迁移风险。
- 2026-06-03：补 `lime_search_web_images` 结构化图片候选预览与来源 artifact document 单元测试。

## 验证结果

已通过：

```bash
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/siteToolResultSummary.test.ts" "src/components/agent/chat/utils/latestSavedSiteContentTarget.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"
```

结果：5 files / 53 tests passed。

已通过：

```bash
npx eslint "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts" --max-warnings 0
```

结果：exit 0，无新增 warning。

已通过：

```bash
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/batch-11-browser-assist-site-tools.md" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"
```

结果：All matched files use Prettier code style。

## 剩余缺口

- 旧 `toolDisplayInfo` / `toolProcessSummary` 仍有大量既有中文硬编码；需要单独做 tool display copy i18n 迁移，不能和行为修复混在一起。
- 真实 GUI / Playwright 截图对齐尚未执行。
- 真实 browser runtime / site adapter 执行器不在本批次改动范围；若要验证真实登录态和保存链路，需要另开 Browser Assist GUI flow。
