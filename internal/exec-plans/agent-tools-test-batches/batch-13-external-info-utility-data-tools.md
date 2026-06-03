# Batch 13 - External Info / Utility Data Tools 工具链

## 背景

本批次覆盖前端展示层已经识别、但不属于 Rust fixed catalog 的外部信息工具。它们常见于 provider / MCP / hosted tool 结果：`SearchQuery`、`ImageQuery`、`finance`、`weather`、`sports`、`time`、`resolve_library_id`、`query_docs`。这些工具和 Batch 03 的 `WebSearch / WebFetch` 相邻，但语义不同：`SearchQuery / ImageQuery` 是外部搜索 API 形态；`finance/weather/sports/time` 是结构化数据查询；Context7 docs 工具是技术文档查询，不应被渲染成普通网页来源或内容任务。

用户最早暴露的问题是“整理今天的国际新闻没有工具调用 / 没有获得新闻 / 输出和搜索过程错序”。因此本批次的重点不是启用真实外部服务，而是证明这些外部信息工具进入 timeline 时，Lime 能保持工具过程顺序、主体对象、结果摘要和来源定位，不靠某个硬编码 provider 或模型名。

参考优先级：

1. `/Users/coso/Documents/dev/rust/codex`
2. `/Users/coso/Documents/dev/js/claudecode`

只参考架构和行为，不硬编码 session、provider、model、城市、球队、股票代码或某次搜索结果。Codex app 的关键口径是：外部信息工具过程作为 timeline item 展示；最终正文只保留结论与必要来源，不把 raw JSON、provider trace 或失败协议塞进正文。

## 覆盖工具

current dynamic display surface：

- `SearchQuery`
- `ImageQuery`
- `search_query`
- `image_query`
- `resolve_library_id`
- `query_docs`

external structured data tools：

- `finance`
- `weather`
- `sports`
- `time`

不在本批次重复覆盖：

- `WebSearch / WebFetch`，归 Batch 03
- `lime_search_web_images`，归 Batch 11
- `ToolSearch / ListMcpResourcesTool / ReadMcpResourceTool`，归 Batch 05

## 当前事实源与分类

事实源声明：外部信息工具 current 展示主路径只允许向 `toolDisplayInfo.ts` 的 exact config / subject extraction、`toolProcessSummary.ts` 的过程摘要、`searchResultPreview.ts` 的来源解析和 Agent Chat inline process 展示收敛；不能按具体 provider/model 名硬编码。

- `current`
  - `src/components/agent/chat/utils/toolDisplayInfo.ts` 中的 `searchquery / imagequery / finance / weather / sports / time / resolvelibraryid / querydocs`
  - `src/components/agent/chat/utils/toolProcessSummary.ts`
  - `src/components/agent/chat/utils/searchResultPreview.ts`
  - `src/components/agent/chat/components/StreamingRenderer.tsx`
- `compat`
  - provider 以 snake_case 输出的 `search_query / image_query`，通过 `normalizeToolNameKey` 归一化
- `deprecated`
  - 把 `finance/weather/sports/time` 结果当普通网页搜索来源展示的路径
  - 把 `resolve_library_id/query_docs` 当普通 `WebSearch` 的路径
- `dead`
  - 直接展示 provider raw JSON、`ref_id` 内部引用数组或 `search_query` 原始 payload 的路径
  - 结果先于工具过程显示、或工具过程统一被挪到最终正文之后的路径

## 当前认领写集

- `internal/exec-plans/agent-tools-test-batches/README.md`
- `internal/exec-plans/agent-tools-test-batches/coverage-matrix.md`
- `internal/exec-plans/agent-tools-test-batches/batch-13-external-info-utility-data-tools.md`
- `src/components/agent/chat/components/messageListItemProjection.ts`
- `src/components/agent/chat/components/messageListItemProjection.unit.test.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.test.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.test.ts`
- `src/components/agent/chat/utils/toolProcessSummary.test.ts`

不会修改：Rust tool 注册、真实 provider 工具调用、Batch 01-12 文档、Inputbar、设置页、AppSidebar。

## 起始状态

`git status --short` 显示当前工作区已有大量并行改动；本批次只在上述窄写集夹写。`internal/exec-plans/agent-tools-test-batches/` 当前为未跟踪目录。

## 发现的问题

### 2026-06-03

- Rust catalog 没有 `SearchQuery / ImageQuery / finance / weather / sports / time`，但前端 `toolDisplayInfo.ts` 已有 exact configs，说明这是动态外部工具展示面。
- `resolveToolPrimarySubject` 已支持 `finance/weather/sports/time` 的 `ticker/location/team/league/utc_offset/ref_id`，但缺少直接单元测试。
- `toolProcessSummary.test.ts` 尚未直接覆盖外部结构化数据工具的过程摘要，容易在后续改动中退回 generic。
- `lime_search_web_images` 已由 Batch 11 覆盖；本批次只验证 provider-style `ImageQuery` 不被混入内容工作台任务。

## 修复原则

- `SearchQuery / ImageQuery` 保持 search family，但不等同于 `WebSearch` 的来源卡。
- `finance/weather/sports/time` 保持 fetch family，主体对象优先来自结构化入参。
- `resolve_library_id/query_docs` 保持技术文档查询语义，不作为普通网页搜索来源。
- 新增或改动的用户可见 presentation 文案必须覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`；本批次不新增产品文案，只补测试和文档。

## 验证计划

最小前端验证：

```bash
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"
npx eslint "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --max-warnings 0
npx prettier --check "internal/exec-plans/agent-tools-test-batches/README.md" "internal/exec-plans/agent-tools-test-batches/coverage-matrix.md" "internal/exec-plans/agent-tools-test-batches/batch-13-external-info-utility-data-tools.md" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"
```

可选 renderer 验证：

```bash
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx"
```

GUI / Playwright：

- 本批次先用 deterministic helper tests 锁住 display / subject / summary。
- 后续截图对齐 fixture 应包含 `text -> SearchQuery -> text -> finance/weather/time -> text`，并验证外部数据工具过程不会被挪到最终正文之后。

## 进度日志

- 2026-06-03：创建覆盖矩阵和 Batch 13 文档，登记外部信息工具 dynamic display surface。
- 2026-06-03：补齐外部信息工具用户可见标签、fetch pre-summary 主体、Context7 批次折叠分类、SearchQuery 通用 process boundary 回归。

## 验证结果

通过：

```bash
npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts"
npx eslint "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/searchResultPreview.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" --max-warnings 0
```

结果：`5` 个 test files / `60` tests passed，ESLint 无 warning。

## 剩余缺口

- 尚未执行 GUI / Playwright 历史恢复截图对齐。
- 尚未验证真实 provider tool stream；本批次只验证前端展示和摘要投影。
