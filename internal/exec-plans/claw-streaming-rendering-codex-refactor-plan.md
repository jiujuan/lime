# Claw Streaming Rendering Codex 对齐重构计划

> 状态：completed / S4.10 历史 hydrate / local merge / GUI fixture guard 已按结构化 runtime turn 边界收口；普通工具、WebTools、Skills Runtime、MCP structuredContent 与 Expert Panel 聚合 current fixture 均已复跑通过
> 创建时间：2026-06-24
> 关联研究：`internal/research/workbech/codex-streaming-rendering.md`
> 主目标：用 Codex 风格的结构化 item lifecycle 修复 Claw / Agent Chat 中 reasoning、WebSearch / WebFetch、阶段性输出与最终正文的错序、重复、消失和错误追加。

## 1. 当前目标

先落骨架，后补细节。

本计划第一阶段只解决事实源和生命周期骨架：

1. `AgentThreadItem / Message.contentParts / rendererContentParts` 是 current 显示事实源。
2. `Message.content` 只作为无 process boundary 的 legacy fallback。
3. `streamingTextOverlay` 只作为 final answer active tail，不写入 `rawDisplayContent`。
4. 显式 `phase=commentary` 的 agent message 作为 process / thinking 展示，不进入最终正文。
5. renderer 不做 lifecycle 语义判断，只消费投影后的 `ContentPart[]`。

细节阶段再补：

1. WebSearch / WebFetch 展开详情的搜索来源、读取页面、URL 脱敏与摘要展示。
2. live streaming 与 history hydrate 的同构证据。
3. 失败 fixture 的逐场景修复与截图验收。

## 2. 事实源分类

- `current`
  - App Server stream event / thread item。
  - `turnId + itemId + sequence + phase + type` provenance。
  - 前端 normalized timeline item。
  - `Message.contentParts` / `rendererContentParts`。
  - `StreamingRenderer`。

- `compat`
  - 无 process boundary、无 timeline、无 provenance 的历史 `Message.content` 纯文本。
  - 旧无 phase agent message 的最终正文 fallback。

- `deprecated`
  - 从 `displayContent` 恢复 process 前导语。
  - 正文签名、空白折叠、标点边界去重。
  - completion suffix 盲追加到跨 process boundary 的 text。

- `dead`
  - 用“已完成思考”“正在搜索”“Finding”“今天的国际新闻”等展示文案判断 lifecycle。
  - 用 CSS 或 DOM 位置修复 item 顺序。
  - renderer 内新增 reasoning/search/final answer 语义猜测。
  - process boundary 之后把 legacy 无 phase `message.delta` 合成为 live final overlay、commentary item 或 process text；`sequence` 只能用于排序和 provenance，不能作为 lifecycle 豁免条件。
  - 普通工具过程用“已运行 N 条命令 / 已探索项目 / 已执行 N 项技能操作”等批次摘要替换默认可见历史记录。

## 3. 阶段切分

### S0 研究沉淀

状态：completed

- 已新增 `internal/research/workbech/README.md`。
- 已新增并更新 `internal/research/workbech/codex-streaming-rendering.md`。
- 已记录 Codex 方法：`ThreadItem / TurnItem` 一等显示协议、item-scoped delta、active tail 与 committed history 分离、commentary 与 final answer 分离。

### S1 骨架实现

状态：implemented, pending fixture details

本阶段只收 current 主链，不追所有 UI 展开细节：

1. 切断 `streamingTextOverlay -> rawDisplayContent`。
2. 删除 current path 的 `displayContent` leading text restore。
3. 删除正文签名 / 正则式 lifecycle 去重。
4. 单条 reasoning timeline item 也进入 `ContentPart[]`。
5. 显式 commentary agent_message 在 history hydrate 中保留为 thinking/process part，但不进入 `Message.content`。
6. 增加 guard 防旧恢复函数和展示文案判断回流。

退出条件：

- [x] 定向 projection / history 单测通过。
- [x] `streamingProjectionGuard.unit.test.ts` 覆盖 projection 文件。
- [x] web-tools fixture 至少能证明 renderer 收到结构化序列；展开详情缺口登记到 S2。

### S2 GUI 细节补全

状态：implemented for web-tools fixture

已补齐：

1. WebSearch / WebFetch 折叠组展开后显示搜索来源和读取页面。
2. 展开态显示中间 reasoning 文本。
3. `phase=commentary` 的 text 在 GUI 中保留在 WebSearch / WebFetch 过程组之前。
4. `smoke:claw-chat-current-fixture -- --scenario web-tools-rendering` 通过。
5. `smoke:agent-runtime-current-fixture` 中 unrelated expert panel fixture 另行归类，不能阻塞本主线判断。

关键修复：

- `ContentPart` 的 process boundary 不再只等于 `part.type !== "text"`；带 `metadata.phase=commentary` 的结构化 text 也是过程项。
- history / read model 合并时按 `tool id / action id / itemId / threadItemId / turnId / phase / sequence` 补齐缺失过程项，避免同一 turn 的 commentary 被远端工具过程覆盖。
- remote hydrate 新增 commentary text 时按 `sequence` 插入过程流，不靠自然语言正文、展示文案或 CSS 位置修复。

### S3 live legacy delta 收口

状态：completed

复发症状：

1. WebSearch running 中间态出现孤立 `我`，并继续把后续无 phase delta 追加成普通正文。
2. renderer 侧曾尝试用 overlay 补位，导致 process / final / reasoning 槽位混在同一可变 tail。
3. completed fixture 只证明最终 read model，没有覆盖 live 中间态，所以曾误判完成。

本轮规则：

1. `phase=commentary` 才能作为过程文本进入 `agent_message` timeline / `ContentPart.metadata.phase=commentary`。
2. `phase=final_answer` 才能作为 live final answer overlay 显示在过程之后。
3. legacy 无 phase delta 在 process boundary 之后按 `dead` 路径处理：不按有无 `sequence` 分叉，统一清 active tail，不显示、不建 thread item、不标记已有最终答复。
4. `turn_completed.text` 是 completion / read model consolidation source；它可以在完成时替换 legacy candidate 并落最终正文。
5. 无 sequence 的旧纯文本 provider 暂保留为兼容兜底，但不得作为 WebSearch / Browser current E2E 的通过依据。

已落实现：

- `agentStreamTextDeltaLifecycle.ts` 增加结构化 eligibility / suppression gate。
- `agentStreamRuntimeHandler.ts` 在 process 后丢弃 legacy 无 phase delta，不再进入 overlay 或 non-final timeline；`sequence` 只用于排序和 provenance，不作为绕过 lifecycle boundary 的条件。
- `agentStreamRuntimeLifecycleEvents.ts` 允许 `turn_completed.text` 作为完成态事实源接管最终正文。
- `messageListItemProjection.ts` 在 active process 中隐藏无 phase streaming overlay，显式 `final_answer` 不受影响。
- `streamingProjectionGuard.unit.test.ts` 纳入 text delta lifecycle 文件，防展示文案 / 动态正则回流。

验证证据：

- 定向 runtime / projection 集合通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/streamingContentPartSegments.unit.test.ts" "src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts"`，6 个文件、64 个用例通过。
- history / projection / guard 宽集合通过：`npx vitest run "src/components/agent/chat/hooks/agentChatHistoryProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts" "src/components/agent/chat/utils/contentPartTimeline.unit.test.ts"`，8 个文件、79 个用例通过。
- fixture 脚本单测通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，20 个用例通过。
- 真实 Electron web-tools fixture 通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-s3-live --timeout-ms 180000`。
  - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-s3-live-summary.json`
  - live running capture：`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#3|tool:WebFetch:completed#7"`，`latestAssistantTextAfterProcessPart=false`，`runningProcessHasLegacyTextAfterProcess=false`，`processGroupExcludesFinalMarkdown=true`。
  - completed capture：`hasFinalTextAfterProcess=true`，展开态 `hasTimelineOrderPreserved=true`，Markdown heading / strong / table 均已渲染。
- 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，覆盖 history/cache hydration、final_done 工具收尾、Claw GUI current fixture、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
- 2026-06-24 17:06 复核：
  - 定向 runtime / projection / guard 集合通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/streamingContentPartSegments.unit.test.ts" "src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`，7 个文件、65 个用例通过。
  - history / projection / completion / WebSearch 宽集合通过：`npx vitest run "src/components/agent/chat/hooks/agentChatHistoryProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/utils/contentPartTimeline.unit.test.ts"`，7 个文件、78 个用例通过。
  - fixture 脚本单测通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，20 个用例通过。
  - 真实 Electron web-tools fixture 通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-codex-verify --timeout-ms 180000`。
    - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-codex-verify-summary.json`
    - live running capture：`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#3|tool:WebFetch:completed#7"`，`latestAssistantTextAfterProcessPart=false`，`runningProcessHasLegacyTextAfterProcess=false`，`processGroupExcludesFinalMarkdown=true`。
    - completed expanded capture：`hasFinalTextAfterProcess=true`，`expandedDetails.hasTimelineOrderPreserved=true`，Markdown heading / strong / table 均已渲染。
  - `npm run smoke:agent-runtime-current-fixture` 首次复跑未全绿，失败点是 `Coding Workbench Electron fixture` 的会话可见性：App Server session list 已包含 `代码产物工作台 Electron fixture`，GUI 首页最近会话仍显示“暂无聊天”，失败摘要为 `.lime/qc/gui-evidence/code-artifact-workbench-electron-fixture/code-artifact-workbench-gui-coding-input-regression-summary.json`。该失败不在本计划的 WebSearch / reasoning / final answer 排版主链内，但属于同类 external fixture 会话刷新缺口，后续已按 current GUI session refresh 同步收口。
  - 2026-06-24 18:13 复核：
    - Coding Workbench fixture 创建 / 更新 session 后派发 `lime:agent-runtime-sessions-changed`，并保留 `reason="external"`、`sessionId`、`workspaceId`；`waitForSessionHydrated` 统一走 `hasHydratedSessionSnapshot(...)`，覆盖 GUI coding input 的工具时间线 hydrate。
    - Claw fixture 的 `waitForGuiSessionVisible` 不再依赖 `focus` 防抖刷新，改为派发同一 `lime:agent-runtime-sessions-changed` test-only 同步事件；Plan hydrate 打开历史时允许 plan decision panel 作为已打开会话的 ready anchor，避免把没有可编辑输入框的 Plan 决策态误判为未打开。
    - 定向脚本守卫通过：`npx vitest run "scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs"`，4 个用例通过；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，20 个用例通过。
    - 真实 Coding Workbench Electron fixture 通过：`npm run smoke:code-artifact-workbench-electron-fixture -- --scenario gui-coding-input --prefix code-artifact-workbench-gui-coding-input-session-refresh-fix --timeout-ms 180000`。
      - evidence：`.lime/qc/gui-evidence/code-artifact-workbench-electron-fixture/code-artifact-workbench-gui-coding-input-session-refresh-fix-summary.json`
    - 真实 Claw Plan history hydrate Electron fixture 通过：`npm run smoke:claw-chat-current-fixture -- --scenario plan --prefix claw-chat-current-fixture-plan-history-session-refresh-fix-2 --timeout-ms 180000`。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-plan-history-session-refresh-fix-2-summary.json`
      - 关键断言：`guiPlanHistoryHydrateCompleted=true`、`readModelPlanHistoryHydratePreserved=true`、`legacyUpdatePlanToolHidden=true`、`noConsoleErrors=true`、`liveProviderNotUsed=true`。
    - 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，覆盖 history/cache hydration、final_done 工具收尾、Claw GUI current fixture、真实 GUI coding 输入到 Coding Workbench、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
  - 2026-06-24 18:43 复核：
    - `agentStreamTextDeltaLifecycle.ts` 继续收口 legacy fallback：process boundary 后无 phase delta 不再按 `sequence` 分叉，带 `itemId` 或完全无 provenance 的 legacy 文本都不得进入 final overlay；只有显式 `phase=final_answer` 能跨 process boundary 作为最终正文。
    - 旧纯文本 provider 仍保留 compat：整轮没有 process boundary 时，`item_scoped_legacy` / `legacy_unphased` 仍可作为 final fallback。
    - 当前 contract 样本同步为结构化 final：工具 / thinking 边界后的自然正文测试改用 `phase=final_answer`，不再鼓励无 phase text 继续绕过生命周期边界。
    - 定向 lifecycle / runtime / projection 集合通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/streamingContentPartSegments.unit.test.ts" "src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.unit.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`，10 个文件、99 个用例通过。
    - history / hydrate 宽集合通过：`npx vitest run "src/components/agent/chat/hooks/agentChatHistoryProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/utils/contentPartTimeline.unit.test.ts" "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.unit.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`，7 个文件、53 个用例通过。
    - 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，真实 Electron 覆盖 Coding Workbench、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
    - 真实 Claw WebTools Electron fixture 通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-legacy-no-sequence-closed --timeout-ms 180000`。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-legacy-no-sequence-closed-summary.json`
      - 关键断言：`guiWebToolsLiveNoLegacyTextAfterProcess=true`、`guiWebToolsTimelineOrderPreserved=true`、`guiMarkdownRendered=true`、`noConsoleErrors=true`、`liveProviderNotUsed=true`。

退出条件：

- [x] 定向 runtime/projection 单测覆盖 running WebSearch 中无 phase overlay 不显示、显式 `final_answer` 显示、`turn_completed.text` 完成态接管。
- [x] lifecycle 单测覆盖 process boundary 后无 sequence legacy delta 也不得进入 final overlay，纯旧 provider 无 process boundary 时仍保留 compat fallback。
- [x] history / projection / guard 宽集合通过。
- [x] `claw-chat-current-fixture --scenario web-tools-rendering` 增加 live 中间态断言并通过，证明确实没有孤立 token 正文。
- [x] 如 GUI fixture 仍只覆盖 completed summary，补 live capture summary / screenshot evidence 后再把本计划改回 completed。

### S3.1 inline renderer owner 收口

状态：implemented / targeted + WebTools fixture verified

复发症状：

1. 用户截图中 live 输出阶段的 WebSearch / reasoning / final 顺序看起来正确，但完成后又切到另一组过程渲染，出现内容消失、重排或重复。
2. 根因不是 CSS，而是 `messageListItemProjection.ts` 在完成态优先用 `timelineInlineContentParts` 重建过程流；live 阶段已经写入 `Message.contentParts` 的结构化过程流被 remote timeline 替换。

本轮规则：

1. `Message.contentParts` 一旦持有结构化 process flow，就是该 assistant message 的 inline renderer owner。
2. timeline / read model 只允许作为稀疏补丁补入缺失的 `reasoning` / `commentary agent_message` / `turn_summary`；不得用 timeline 的 WebSearch / WebFetch / tool item 重新生成另一组过程流。
3. fixture 的 debug signature guard 必须识别 `tool:WebSearch:completed#3`、`thinking#5`、`text#7` 这类 current renderer signature，不能只识别旧字面 `tool_use` / `thinking`。

已落实现：

- `messageListItemProjection.ts` 新增 contentParts owner gate：已有 inline process flow 时不再从 timeline 重建完整过程；只允许 sparse timeline patch 合并缺失 reasoning / commentary。
- `messageListItemProjection.webRetrieval.unit.test.ts` 新增完成态双事实源回归：renderer 必须保留 live contentParts，不被 timeline 文本替换。
- `claw-chat-current-fixture-gui-web-tools-waits.mjs` 修正 process/text signature 识别，避免 E2E guard 漏掉 `tool:*` / `thinking#*`。

验证证据：

- `npx vitest run "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.unit.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，8 个文件、97 个用例通过。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-single-owner-20260625 --timeout-ms 180000` 通过。
  - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-single-owner-20260625-summary.json`
  - running capture：`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#3|tool:WebFetch:completed#7"`、`latestAssistantTextAfterProcessPart=false`、`runningProcessHasLegacyTextAfterProcess=false`。
  - completed capture：`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#5|tool:WebFetch:completed#7|text"`、`latestAssistantTextAfterProcessPart=true`、展开态 `hasTimelineOrderPreserved=true`。
- `npm run smoke:agent-runtime-current-fixture` 本轮未完成：聚合入口卡在既有 `Coding Workbench Electron fixture`，失败 evidence 为 `.lime/qc/gui-evidence/code-artifact-workbench-electron-fixture/code-artifact-workbench-gui-coding-input-regression-summary.json`，错误 `断言失败: appServerJsonRpcUsed`；该子场景与本轮 WebSearch inline renderer owner 不同主链，已终止本次 spawned fixture 进程树。

退出条件：

- [x] current WebTools 专项真实 Electron fixture 通过。
- [x] 完成态双事实源 projection 回归覆盖。
- [ ] 聚合 current fixture 需在 Coding Workbench `appServerJsonRpcUsed` 缺口修复后复跑全绿。

### S3.2 timeline owner 收窄与纯 reasoning 恢复

状态：implemented / targeted + WebTools fixture verified

复发症状：

1. 修掉 completed 双事实源后，普通 completed / running reasoning timeline 被错误吞进 inline renderer，导致安全思考入口、首字状态或外置执行轨迹消失。
2. 这属于同一类 owner 错误：timeline 既被用于补 WebTools 缺失项，又被过宽地当成完整 inline process owner。

本轮规则：

1. `Message.contentParts` 已经有过程边界时，它继续是唯一 inline renderer owner；timeline 只能 sparse patch `reasoning` / `commentary agent_message` / `turn_summary`。
2. `Message.contentParts` 没有过程边界时，timeline 只有包含工具、命令、计划、审批、用户输入请求等结构化 process boundary，才允许构造成完整 inline process flow。
3. 纯 `reasoning` / `commentary` timeline 不得抢占 inline owner；它应保留原有安全思考入口或外置执行轨迹，不让思考状态在完成后消失。

已落实现：

- `messageListItemProjection.ts` 新增 `canTimelineOwnInlineProcessFlow(...)`，把 timeline 完整 inline owner 限制到真实结构化 process boundary。
- `MessageList.reasoningFlow.test.tsx` 新增 WebTools DOM 级回归：live `contentParts` 已包含 commentary / WebSearch / reasoning / WebFetch / final 时，completed `timelineItems` 不得再渲染 `assistant-primary-timeline-shell` 或 leading timeline。
- `MessageList.reasoningPersistence.test.tsx` 调整多段 reasoning 穿插断言，允许 current provenance metadata 存在，同时继续断言 sequence 顺序。
- `AppPageContent.tsx` 稳定 `onSessionChange` callback，避免 GUI fixture 因父子层重复 session target 写入触发 React maximum update depth warning。
- `AppSidebarConversationShelf.tsx` 用稳定 project id key 清理折叠状态，避免 sidebar project section 引用变化触发重复 state 写入。
- `workspaceArtifactStoreSync.ts` / `useWorkspaceArtifactStoreRuntime.ts` 增加 artifact store 等价短路，避免同内容 artifact 数组反复写入。

验证证据：

- `npx vitest run "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/MessageList.reasoningPersistence.test.tsx" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.reasoning.unit.test.ts"`，4 个文件、46 个用例通过。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --app-url http://127.0.0.1:1420/ --prefix claw-chat-current-fixture-web-tools-rendering-timeline-owner-s3-2-dev-url-session-callback-fix --timeout-ms 180000` 通过。
  - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-timeline-owner-s3-2-dev-url-session-callback-fix-summary.json`
  - 关键断言：`noConsoleErrors=true`、`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#5|tool:WebFetch:completed#7|text"`、`processGroupCount=1`、`runningProcessHasLegacyTextAfterProcess=false`、展开态 `hasTimelineOrderPreserved=true` / `hasSearchSourceSection=true` / `hasFetchPageSection=true` / `hasMidThinkingText=true`。

退出条件：

- [x] 纯 reasoning timeline 不再被吞进 inline renderer。
- [x] WebTools inline owner 完成态不再外置重复 timeline。
- [x] 复跑 WebTools 真实 Electron fixture，确认 GUI evidence 中 completed / running debug signature 与 DOM 状态一致。

### S3.3 final_answer live part owner 收口

状态：implemented / targeted + WebTools fixture verified / aggregate fixture interrupted on unrelated Coding Workbench wait

复发症状：

1. 用户截图中 final 正文在 streaming 时先出现在过程流下方，后续 delta 又像 overlay 一样替换当前位置。
2. `turn_completed` 后 completion controller 再重算一次 final text，导致 live 可见的正文在完成态消失、搬位或被另一组内容替换。
3. 根因是 `phase=final_answer` 仍主要走 `streamingTextOverlay + Message.content`，没有像 `commentary` 一样在 live 阶段占据稳定 `ContentPart` item slot。

本轮规则：

1. 显式 `phase=final_answer` 且带 `itemId` 的 text delta 必须在 streaming 阶段 upsert 到 `Message.contentParts`。
2. 同一 `itemId` 的 final delta 按 item lifecycle 增量合并，保留 `source=agent_text_delta / itemId / phase / sequence / turnId` provenance。
3. `streamingTextOverlay` 不再承载这类结构化 final segment；它只保留给无结构化 item 的 legacy final tail。
4. completion controller 只做完成态收尾和缺失 suffix reconcile，不再成为第一套 final 正文渲染 owner。

已落实现：

- `agentStreamAgentMessageContentSync.ts` 从 commentary-only 扩展为 agent message phase sync，统一支持 `commentary` 与 `final_answer`。
- `agentStreamRuntimeHandler.ts` 在 explicit final text delta 更新 `accumulatedContent` 后，同步写入结构化 `contentParts`，并清除 overlay，避免 live / completed 双 owner。
- `agentStreamRuntimeHandler.unit.test.ts` 增加 turn 完成前断言：final answer 已进入 `contentParts` 且 overlay 为空。
- `internal/aiprompts/claw-streaming-rendering-correctness.md` 增加 final_answer live part owner invariant，明确 overlay 不能作为结构化 final 的第一渲染事实源。

验证证据：

- `npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx"`，3 个文件、56 个用例通过。
- `npx vitest run "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.unit.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timelineFlow.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.reasoning.unit.test.ts" "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/MessageList.reasoningPersistence.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts" "src/components/agent/chat/workspace/workspaceArtifactStoreSync.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceArtifactStoreRuntime.unit.test.ts" "src/components/app-sidebar/sidebarConversationGroups.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，16 个文件、149 个用例通过。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --app-url http://127.0.0.1:1420/ --prefix claw-chat-current-fixture-web-tools-rendering-final-part-owner-s3-3 --timeout-ms 180000` 通过。
  - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-final-part-owner-s3-3-summary.json`
  - screenshot：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-final-part-owner-s3-3-chat.png`
  - 关键断言：`consoleErrors=[]`、completed `latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#5|tool:WebFetch:completed#7|text"`、`hasFinalTextAfterProcess=true`、`processGroupCount=1`、running `runningProcessHasLegacyTextAfterProcess=false`。
- `npm run smoke:agent-runtime-current-fixture` 本轮未完成：聚合入口卡在 `Coding Workbench Electron fixture` 的 `collect-coding-workbench-gui-evidence-after-recovery` 后续等待，超过子场景 `--timeout-ms 180000` 仍未退出；已中断本轮 spawned 进程并确认无残留。该卡点不在本轮 WebTools / final_answer owner 主链。
- `npm run typecheck` 本轮未完成：`tsc --noEmit` 超过 9 分钟无输出，仍处于 running；已中断本轮 spawned 进程并确认无残留，不计为通过。

退出条件：

- [x] 状态机单测证明 explicit final 在 live 阶段已有结构化 part owner。
- [x] DOM 级 WebTools inline owner 回归仍通过。
- [x] 复跑 `claw-chat-current-fixture --scenario web-tools-rendering`，确认用户截图里的 final 正文不会在完成态消失。
- [ ] 复跑 `npm run smoke:agent-runtime-current-fixture` 并收掉 Coding Workbench 子场景卡住问题。
- [ ] 复跑 `npm run typecheck` 到自然结束。

## 4. 已知验证结果

2026-06-24：

- 通过：
  - `messageListItemProjection.webRetrieval.unit.test.ts`
  - `messageListInlineProcess.test.ts`
  - `StreamingRenderer.webSearch.sequence.test.tsx`
  - `streamingContentPartOrder.unit.test.ts`
  - `streamingProjectionGuard.unit.test.ts`
  - `agentStreamRuntimeHandler.unit.test.ts`
  - `agentStreamCompletionController.test.ts`
  - `messageListTimelineContentParts.unit.test.ts`
  - `messageListTimelineContentParts.reasoning.unit.test.ts`
  - `messageListTimelineContentParts.imported.unit.test.ts`
  - `streamingContentPartSegments.unit.test.ts`

- S1 骨架复测通过：
  - `npx vitest run "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`
  - 结果：5 个文件、48 个用例通过。

- S1 补刀：
  - 已移除 `messageListTimelineContentParts.ts` 中 final text / sparse process 的空白签名匹配 helper。
  - `streamingProjectionGuard.unit.test.ts` 已封禁 `normalizeFinalTextSignature` 与 `normalizeSparseProcessText` 回流。
  - 复跑 `npx vitest run "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.imported.unit.test.ts" "src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`，结果：4 个文件、16 个用例通过。
  - 复跑 S1 完整定向集合，结果：5 个文件、48 个用例通过。

- 历史失败，现已复测通过：
  - `npm run smoke:agent-runtime-current-fixture`
  - 已通过 cancel、plan history、skills runtime、MCP structured content、expert skills runtime、expert plaza skills runtime。
  - 曾失败在 `expert-panel-skills-runtime`：专家技能选择器未出现候选/添加按钮。2026-06-24 复跑聚合 fixture 已通过，覆盖 ExpertInfoPanel 调整 skillRefs 后下一轮继承同一 Skills Runtime 闭环并展示 Evidence Pack 复盘。

- 本主线相关失败：
  - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-regression --timeout-ms 180000`
  - renderer debug 已出现结构化序列：`tool:WebSearch:completed#3 | thinking#5 | tool:WebFetch:completed#7 | text`。
  - GUI 仍缺：intro text、搜索来源区、读取页面区、中间 thinking 可见文本、timeline order preserved。

- S2 定位与修复：
  - 失败证据显示 read model 已包含 `agent_message phase=commentary sequence=2`，live stream 已收到 `AgentStream.inboundTextDelta / nonFinalTextDelta`，但最终 `messageContentPartTypes` 缺第一段 commentary text。
  - 根因收敛为 history / hydrate merge 把 `phase=commentary` text 当普通 text，而不是 process boundary；当远端也已有工具过程时，本地 commentary 缺失项没有按 provenance 合并回 `contentParts`。
  - 已补单测：
    - `contentPartTimeline.unit.test.ts` 覆盖 `phase=commentary` text 是 process boundary、`phase=final_answer` text 仍是最终正文，以及 completion suffix 不得追加到早于后续 process boundary 的 text。
    - `agentChatHistoryProcess.test.ts` 覆盖 remote hydrate 新增 commentary text 按 sequence 插入工具过程前。
    - `agentChatHistory.localMerge.test.ts` 覆盖同 turn 本地 commentary + 远端工具 / reasoning / final answer 合并后保持 `text -> tool_use -> thinking -> tool_use -> text`。
  - 已复跑 `npx vitest run "src/components/agent/chat/utils/contentPartTimeline.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistoryProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`，结果：5 个文件、45 个用例通过。
  - 已复跑 `npx vitest run "src/components/agent/chat/hooks/agentChatHistoryProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts"`，结果：3 个文件、42 个用例通过。
  - 已复跑 streaming / projection 定向集合：
    - `agentStreamRuntimeHandler.unit.test.ts`
    - `agentStreamTurnEventBinding.test.ts`
    - `agentChatHistory.timeline.test.ts`
    - `agentSessionState.webTools.test.ts`
    - `messageListTimelineContentParts.unit.test.ts`
    - `messageListItemProjection.timeline.unit.test.ts`
    - `messageListItemProjection.webRetrieval.unit.test.ts`
    - `StreamingRenderer.webSearch.sequence.test.tsx`
    - `streamingProjectionGuard.unit.test.ts`
    - 结果：9 个文件、94 个用例通过。
  - 已复跑 `npm run electron:build:smoke`，通过；新增 suffix guard 后再次复跑仍通过。
  - 已复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-regression --timeout-ms 180000`，通过；新增 suffix guard 后再次复跑仍通过。
  - 通过证据：summary 中 `guiWebToolsRenderingCompleted.hasIntroText=true`、`hasIntroBeforeProcess=true`；展开态 `expandedDetails.hasSearchSourceSection=true`、`hasFetchPageSection=true`、`hasMidThinkingText=true`、`hasTimelineOrderPreserved=true`；read model `latestTurnStatus=completed` 且包含 WebSearch / WebFetch / reasoning item。
  - 已复跑 `npm run smoke:agent-runtime-current-fixture`，通过；summary 覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench、cancel-then-continue、Plan revisioned history hydrate、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza 与 ExpertInfoPanel skills runtime 闭环；`liveProviderUsed=false`。

- S4 live provider running 阻塞定位与修复：
  - 失败证据：真实会话 `sess_f0291b4b77ae4866b57d773e155d09d6` / turn `60bb0e45-5f17-434b-a6ec-f2d27aa04ebb` 长时间停在 `running`，read model 已有 `web_search:completed=3`、`reasoning:in_progress=128`，最后事件停在 `reasoning.delta`，没有 `turn.completed / turn.failed / turn.canceled`。
  - 根因收敛：`lime-rs/crates/agent/src/request_tool_policy.rs` 只在 cancel token 下用 100ms poll 检查取消，没有 provider stream idle deadline；live provider 若停止发送事件但不结束 stream，`stream_reply_with_policy(...).await` 永久悬挂，App Server 无法写 terminal。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/stream_idle.rs`，默认 `120000ms` provider idle deadline，可用 `LIME_PROVIDER_STREAM_IDLE_TIMEOUT_MS` / `PROXYCAST_PROVIDER_STREAM_IDLE_TIMEOUT_MS` 覆盖或关闭；`stream_agent_reply_once` 改为 `tokio::select!` 监听 cancel token，同时用 idle timeout 包住真实 `stream.next()`，不再 100ms 轮询重建 future。
  - 语义：idle timeout 返回 `Agent provider execution failed: stream idle timeout ...`，复用现有 provider tail failure retry；首次 retry 仍 idle 则返回错误，由 App Server current turn execution 写 `turn.failed`，禁止前端合成完成态。
  - 新增 Rust 回归：provider 首轮 partial output 后 idle 必须触发 tail retry 并成功；provider 首事件前 idle 必须在测试超时前 fail closed；原有 cancel path 必须继续不等待 provider 后续分片。
  - 已复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，结果：7 个用例通过。
  - 已复跑 `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 current fixture history/cache、stream completion、failed read model、Claw 终态 UI、Electron GUI coding、cancel-then-continue、Plan hydrate、Skills Runtime、MCP structuredContent、Expert Skills Runtime / Plaza / Panel，`liveProviderUsed=false`。
  - 已复跑 `npm run smoke:claw-chat-current-fixture`，通过；summary `scenario=complete`、`readModelCompleted.latestTurnStatus=completed`、`guiInputRemainsReady=true`、`guiNotStuckStreaming=true`、`noConsoleErrors=true`。
  - 已复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-provider-idle-regression --timeout-ms 180000`，通过；summary `readModelWebToolsRenderingCompleted.latestTurnStatus=completed`、`guiWebToolsLiveNoLegacyTextAfterProcess=true`、`guiWebToolsTimelineOrderPreserved=true`、`guiMarkdownRendered=true`、`liveProviderNotUsed=true`。

- S4.1 巨型 Rust 文件治理补刀：
  - 问题：`request_tool_policy.rs` 已超过 4000 行，继续把 provider idle 测试 provider 与专项断言留在中心文件，会继续扩大同一治理风险。
  - 清理：新增 `lime-rs/crates/agent/src/request_tool_policy/tests/provider_stream_idle.rs`，把 provider idle 专项测试与测试 provider 外移；中心文件只保留 `mod provider_stream_idle;` 测试入口，生产行为不变。
  - DRY 补刀：`request_tool_policy.rs` 内 provider idle timeout 的 flush / log / error 构造收敛到 `build_provider_stream_idle_timeout_error(...)`，避免 cancel-token 分支与无 cancel-token 分支以后漂移。
  - 结果：`request_tool_policy.rs` 从 4917 行降到 4696 行；provider idle 配置仍在 `request_tool_policy/stream_idle.rs`，测试隔离在 `request_tool_policy/tests/`。
  - 已复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture` 两次，最近结果：7 个用例通过。
  - 已复跑 `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 current Agent Runtime fixture regression，`liveProviderUsed=false`。

- S4.2 provider stream idle 首事件前 fail-closed 与 diagnostics 拆分：
  - 问题：S4 修复后，provider 已返回 stream 但 `stream.next()` 空闲可被 idle deadline 收口；但“首事件前”仍可能卡在 Aster 内部 provider stream poll。单跑 `stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event` 曾在 3 秒测试超时内失败，说明 App Server 仍可能无法写 terminal。
  - current 修复：`stream_agent_reply_once` 在启用 `provider_stream_idle_timeout` 且外层没有用户 cancel token 时，创建内部 `CancellationToken` 传给 `agent.reply(...)`，迫使 Aster 内部 provider stream 使用可让出的 cancel-aware poll；外层仍以统一 idle deadline 生成 `Agent provider execution failed: stream idle timeout ...`。用户 cancel token 语义不变。
  - 治理清理：新增 `lime-rs/crates/agent/src/request_tool_policy/stream_diagnostics.rs`，把 `StreamEventDiagnostics`、stream 事件计数、terminal ToolSearch no-retry metadata、saved site / persisted artifact fallback、provider tail failure retry / downgrade 判断移出中心文件；`request_tool_policy.rs` 从 4696 行降到 4468 行。
  - 定向验证：
    - 单跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event -- --nocapture`，通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，7 个用例通过，覆盖取消、tail failure retry、empty reply retry、inline provider error、provider idle retry 与首事件前 idle fail-closed。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过。
    - 覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。

- S4.3 text delta batcher 拆分：
  - 问题：`TextDeltaBatcher` 决定 provider / newline / backlog / final boundary 的可见 text flush，和“阶段性输出被分割 / 继续追加错位”问题直接相关；继续留在中心执行器会让 streaming 文本策略与 retry / diagnostics / preflight 混在同一巨型文件中。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/stream_text_batcher.rs`，把 `TextDeltaBatcher`、`TEXT_DELTA_BATCH_BACKLOG_CHARS` 与 `emit_text_delta_batch(...)` 从 `request_tool_policy.rs` 移出；中心执行器只保留调用 boundary，不再承接 batch 策略。
  - 结果：`request_tool_policy.rs` 从 4468 行降到 4404 行；text delta batching 与 stream diagnostics / stream idle 均已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，7 个用例通过，无 warning。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过。
    - 覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
    - 复跑真实 Electron Web tools rendering fixture：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-reply-retry-s45 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-reply-retry-s45-summary.json`
      - 关键断言：`latestTurnStatus=completed`、`latestAssistantRendererContentPartTypes="text|tool:WebSearch:completed#3|thinking#3|tool:WebFetch:completed#7"`、`latestAssistantTextAfterProcessPart=false`、`runningProcessHasLegacyTextAfterProcess=false`。

- S4.4 Web retrieval process state 拆分：
  - 问题：`WebRetrievalProcessState` 决定 WebSearch / WebFetch 工具全部返回后是否发出“正在整理联网结果” runtime status，和 WebSearch 阶段性输出顺序直接相关；继续留在中心执行器会让 web tool 过程状态与 provider idle、text batcher、retry mode 混在同一巨型文件中。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/web_retrieval_process.rs`，把 `WebRetrievalProcessState`、WebSearch/WebFetch 工具名识别、active/completed tool id 去重和 final text started 判断从 `request_tool_policy.rs` 移出；中心执行器只保留调用点和 runtime status 发射。
  - 结果：`request_tool_policy.rs` 从 4404 行降到 4340 行；Web retrieval process state、text delta batching、stream diagnostics、stream idle 已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_retrieval_process_state -- --nocapture`，3 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，7 个用例通过。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过。
    - 覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。

- S4.5 reply retry mode 拆分：
  - 问题：empty final reply、WebSearch synthesis retry、direct answer retry 与 intermediate conclusion retry 决策仍保留在 `request_tool_policy.rs` 中，和 stream diagnostics / Web retrieval process state 并列影响最终正文是否应继续、是否应 fail closed。继续在中心文件保留这些同名函数会让“工具后没有最终正文”“阶段性输出被当最终答复”等问题再次回到正文猜测与巨型文件分叉。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/reply_retry.rs`，把 `ReplyRetryMode`、WebSearch synthesis 阈值、`looks_like_incomplete_tool_batch_summary(...)`、`resolve_reply_retry_mode(...)`、`should_synthesize_web_search_after_enough_evidence(...)` 与 empty final reply 错误消息 builder 从中心文件移出；中心执行器只保留调用点。`WebSearchExecutionTracker` 只暴露 `has_attempts()` 与 policy 计数查询方法给子模块，未直接公开内部 attempt map。
  - 结果：`request_tool_policy.rs` 从 4340 行降到 4172 行；`reply_retry.rs` 为 184 行。stream idle、stream diagnostics、stream text batcher、web retrieval process 与 reply retry mode 均已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_synthesis_boundary -- --nocapture`，5 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，7 个用例通过。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过。
    - 覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。

- S4.6 WebSearch preflight 拆分：
  - 问题：WebSearch preflight 的 query 构造、URL 提取、coverage summary、prompt appendix、preflight 执行器和 turn context 权限测试仍保留在 `request_tool_policy.rs`，与 reply retry / synthesis / web retrieval process 并列影响“搜索后是否继续最终正文”和“是否错误追加阶段性输出”。继续把它放在中心文件，会让 WebSearch preflight 与 synthesis 边界重新混在同一个 4000+ 行文件里。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/web_search_preflight.rs` 与 `web_search_preflight/tests.rs`，把 `PreflightToolExecution`、`WebSearchPreflightRequest`、`PreflightSearchOutcome`、preflight query expansion、URL extraction、coverage summary、prompt context merge 和 `execute_web_search_preflight_if_needed(...)` 从中心文件移出；中心执行器只通过 re-export 调用 preflight API。测试专用 `TurnContextGatedWebSearchTool` 也随 preflight 测试外移。
  - 结果：`request_tool_policy.rs` 从 4172 行降到 3429 行；`web_search_preflight.rs` 为 524 行，`web_search_preflight/tests.rs` 为 241 行。stream idle、stream diagnostics、stream text batcher、web retrieval process、reply retry mode 与 WebSearch preflight 均已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight -- --nocapture`，7 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should -- --nocapture`，7 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_synthesis_boundary -- --nocapture`，5 个用例通过。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
    - 复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-preflight-s46 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-preflight-s46-summary.json`

- S4.7 request policy config 拆分：
  - 问题：`search_mode` / `web_search` 解析、WebSearch required / allowed / disallowed 工具集合、env parsing、工具名归一匹配和 request policy system prompt 合并仍保留在 `request_tool_policy.rs` 中。它们是 App Server / scheduler 进入 Agent Runtime 的 request policy public surface，继续和 stream 执行器混在中心文件里，会让联网工具开关、preflight、synthesis 与最终正文重试再次形成平行判断。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/policy_config.rs`，把 `RequestToolPolicyMode`、`RequestToolPolicy`、`REQUEST_TOOL_POLICY_MARKER`、`resolve_request_tool_policy*`、`request_tool_policy_with_additional_required_tools(...)`、`merge_system_prompt_with_request_tool_policy(...)`、工具白/黑名单 env parsing 与工具名匹配 helper 移出中心文件；中心执行器只消费解析后的 `RequestToolPolicy`，`lime_agent` public re-export 不变。policy config 单测随模块外移，避免中心测试继续承接配置解析细节。
  - 结果：`request_tool_policy.rs` 从 3429 行降到 3067 行；`policy_config.rs` 为 377 行。stream idle、stream diagnostics、stream text batcher、web retrieval process、reply retry mode、WebSearch preflight 与 request policy config 均已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture`，56 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-scheduler request_tool_policy -- --nocapture`，1 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server web_search -- --nocapture`，3 个用例通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server search_mode -- --nocapture`，1 个用例通过。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
    - 复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-policy-config-s47 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-policy-config-s47-summary.json`

- S4.8 runtime status 与 auto compaction projection 拆分：
  - 问题：retry / synthesis / web retrieval runtime status builder、runtime item 持久化投影，以及 Aster 自动压缩 system notification 过滤仍保留在 `request_tool_policy.rs` 中。它们直接影响“正在整理联网结果”“正在重试生成答复”“上下文上限失败”这类 lifecycle 状态是否按结构化 item 发出；继续留在中心执行器会让 streaming lifecycle 与展示文案、provider 事件投影重新耦合。
  - current 修复：新增 `lime-rs/crates/agent/src/request_tool_policy/runtime_status.rs`，把 `build_empty_reply_retry_runtime_status(...)`、`build_provider_tail_failure_retry_runtime_status(...)`、`build_incomplete_tool_batch_continue_runtime_status(...)`、`build_web_search_synthesis_runtime_status(...)`、`build_web_retrieval_synthesis_runtime_status(...)` 与 `emit_runtime_status_with_projection(...)` 从中心文件移出；新增 `lime-rs/crates/agent/src/request_tool_policy/auto_compaction_projection.rs`，把 `AutoCompactionProjectionState`、自动压缩开始 / thinking / complete 通知过滤、disabled context limit 错误投影和 compaction failure 提取从中心文件移出。中心执行器只消费结构化投影结果和 status builder，不再承接这些文案与持久化细节。
  - 结果：`request_tool_policy.rs` 从 3067 行降到 2857 行；`runtime_status.rs` 为 135 行，`auto_compaction_projection.rs` 为 106 行。stream idle、stream diagnostics、stream text batcher、web retrieval process、reply retry mode、WebSearch preflight、request policy config、runtime status 与 auto compaction projection 均已成为独立 current 子模块。
  - 定向验证：
    - 复跑 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent`，通过。
    - 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture`，56 个用例通过。
  - GUI/current fixture 验证：
    - 复跑 `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel runtime；`liveProviderUsed=false`。
    - 复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-runtime-status-s48 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-runtime-status-s48-summary.json`
      - 关键断言：`appServerJsonRpcUsed=true`、`liveProviderNotUsed=true`、`guiWebToolsLiveNoLegacyTextAfterProcess=true`、`guiWebToolsTimelineOrderPreserved=true`、`guiMarkdownRendered=true`、`noConsoleErrors=true`。

- S4.9 普通工具过程记录持久化：
  - 复发症状：用户截图中类似 Codex 的 `Read / Ran / Explored ...` 过程记录，在后续工具调用进入后被替换为批次摘要或另一套完成态渲染；视觉结果是“刚才看到的工具记录消失”。
  - Codex 对齐依据：Codex App Server 的 `ThreadItem` 把 `commandExecution`、`mcpToolCall`、`dynamicToolCall`、`webSearch`、`reasoning` 等作为独立 item 追加 / 更新；TUI 可以把连续 exec 合入 `ExecCell`，但默认可见层仍保留每个 call，而不是只显示一个总摘要。
  - current 修复：
    - `StreamingProcessRun` 只让 WebSearch / WebFetch 进入专门 `StreamingProcessGroup` 时间线；普通 command/read/search/skill/task/image/site 工具默认渲染为逐条 `InlineToolProcessStep`。
    - `StreamingRenderer` 不再在 tool 到来时无条件 flush 纯 thinking；纯 thinking + WebSearch/WebFetch 继续留在同一网页检索过程组内，避免 `Searching...` 短过渡显示成正文。
    - `InlineToolProcessStep` 在消息仍流式输出时隐藏普通工具 raw result / post summary；完成态主行优先保留工具主体叙述，不再让 `ok`、任务 JSON 或 structured result 抢占过程行；vision 工具隐藏 `Viewed image...` raw result，只保留专门图片摘要和可展开预览。
    - 普通工具完成态不再因为 active process 自动展开详情；raw result / structured output 只在用户显式展开时进入详情，避免历史 turn 或后续工具调用后把旧摘要、JSON、协议输出重新铺回正文。
    - `functions.exec_command` 等 Codex 风格命名空间工具按命令工具提取主体，避免 `Ran / Read` 类过程记录只剩泛化动作。
    - `mcp-structured-content` GUI fixture 断言迁到 current `inline-tool-process-step`，旧 `streaming-process-group` 不再作为普通工具完成态 owner。
  - 分类：
    - `current`：按 content part / tool id 时序逐条显示普通工具过程记录；每个工具自身负责详情折叠。
    - `current`：WebSearch / WebFetch 的专门时间线和来源 / 读取页面展开态。
    - `dead`：普通工具批次摘要替代默认可见记录。
  - 定向验证：
    - `npx vitest run "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts"`，5 个文件、65 个用例通过。
    - `npx vitest run "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx" "src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts"`，11 个文件、122 个用例通过。
    - `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，1 个文件、20 个用例通过。
    - `npx prettier --check "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/StreamingProcessRun.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts"`，通过。
    - `npx prettier --check "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/StreamingProcessRun.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx" "src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx" "src/components/agent/chat/utils/toolDisplaySubject.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-gui-tool-waits.mjs"`，通过。
  - 真实 GUI fixture 验证：
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-tool-history-s49 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-tool-history-s49-summary.json`
      - screenshot：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-tool-history-s49-chat.png`
      - 关键断言：`guiWebToolsLiveNoLegacyTextAfterProcess=true`、`guiWebToolsTimelineOrderPreserved=true`、`guiWebSearchNoiseHidden=true`、`guiMarkdownRendered=true`。
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-tool-history-s49b --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-tool-history-s49b-summary.json`
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-tool-history-s49c --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-tool-history-s49c-summary.json`
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario skills-runtime --prefix claw-chat-current-fixture-skills-runtime-tool-history-s49 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-skills-runtime-tool-history-s49-summary.json`
      - screenshot：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-skills-runtime-tool-history-s49-chat.png`
      - 关键断言：`guiSkillsRuntimeCompleted=true`、`readModelSkillSearchObserved=true`、`readModelSkillInvocationObserved=true`、`skillSearchBeforeSkillInvocation=true`、显式与手动启用 Skills Runtime 分支均完成。
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario skills-runtime --prefix claw-chat-current-fixture-skills-runtime-tool-history-s49b --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-skills-runtime-tool-history-s49b-summary.json`
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario skills-runtime --prefix claw-chat-current-fixture-skills-runtime-tool-history-s49c --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-skills-runtime-tool-history-s49c-summary.json`
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario mcp-structured-content --prefix claw-chat-current-fixture-mcp-structured-content-tool-history-s49b --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-mcp-structured-content-tool-history-s49b-summary.json`
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario mcp-structured-content --prefix claw-chat-current-fixture-mcp-structured-content-tool-history-s49c --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-mcp-structured-content-tool-history-s49c-summary.json`
    - `npm run smoke:agent-runtime-current-fixture` 本轮未全绿：已通过 history/cache、stream completion、fixture smoke guard、Coding Workbench、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza Skills Runtime；失败在 `Claw Expert Panel Skills Runtime override Electron fixture` 的 `dedupeGuardHits`，同一句 `专家 Skills runtime 证据已完成` 在整页出现 2 次。
      - failure evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-expert-panel-skills-runtime-regression-summary.json`
      - 定位：该旁路是 Expert Panel 二轮 fixture scenario / dedupe scope 问题，不是本轮普通工具 inline owner 主链；本轮直接相关三条 GUI fixture 已用 `s49c` 复跑通过。

- S4.10 runtime turn 边界收口：
  - 问题 1：Expert Panel 二轮场景中，第一轮专家 summary 是同一会话历史消息的合法可见内容；旧 `waitForGuiChatCompleted(...)` 用整页 `mainText` 做 `dedupeGuardTexts` 统计，把历史轮误判为当前轮重复。
  - 问题 2：completion scope 改窄后仍复现第二轮 assistant bubble 混入第一轮专家 commentary / final 文案；根因是历史 hydrate / local merge 中仍存在跨 runtime turn 的 assistant 过程合并。
  - Codex 对齐依据：验收与合并都必须按结构化 item / turn lifecycle 定位当前轮；不同 `runtimeTurnId` 的 assistant item / message 不能为了相邻显示、过程保留或最终态补全被合成一条。
  - current 修复：
    - `MessageList` 的 `message-turn-group` 暴露 `data-runtime-turn-id`、`data-last-assistant-message-id`、`data-timeline-message-id`。
    - `MessageListItem` 的消息气泡暴露 `data-message-id` 与 `data-runtime-turn-id`。
    - `waitForGuiChatCompleted(...)` 先按包含当前 prompt 的最新 `message-turn-group` 建立 completion scope，再在该 turn 的最新 assistant bubble 内检查 summary / done / required texts / dedupe guard / disallowed text；整页 occurrence 只保留为诊断字段，不再作为当前轮完成态判断。
    - `mergeHydratedMessagesWithLocalState(...)` 的本地 process fallback 在远端带 `runtimeTurnId` 时只匹配同一 turn 的本地 assistant。
    - `mergeAssistantAgentMessageContentPartsFromThreadItems(...)` 按当前 `turnId` 过滤 `agent_message` item，避免 completed merge 把 `getThreadItems()` 中历史 commentary / final 合到当前 assistant。
    - `mergeAdjacentAssistantMessages(...)` 禁止两个明确且不同 `runtimeTurnId` 的相邻 assistant 合并。
    - Expert Panel fixture scenario 增加 `disallowedVisibleTexts`，当前轮 assistant scope 中如出现第一轮专家文本直接失败。
  - 定向验证：
    - `npx vitest run "src/components/agent/chat/components/MessageList.test.tsx" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.test.mjs"`，3 个文件、35 个用例通过。
    - `npx vitest run "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx" "src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，12 个文件、143 个用例通过。
    - `npx prettier --check "src/components/agent/chat/components/MessageList.tsx" "src/components/agent/chat/components/MessageListItem.tsx" "src/components/agent/chat/components/MessageList.test.tsx" "scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，通过。
    - `npx vitest run "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentChatHistory.test.ts" "src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts" "scripts/agent-runtime/skills-runtime-fixture-scenario.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.test.mjs"`，6 个文件、58 个用例通过。
    - `npx vitest run "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.unit.test.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"`，3 个文件、55 个用例通过。
    - `npx prettier --check "scripts/agent-runtime/skills-runtime-fixture-scenario.mjs" "scripts/agent-runtime/skills-runtime-fixture-scenario.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-completion-waits.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "src/components/agent/chat/hooks/agentChatHistoryAdjacentMerge.ts" "src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts"`，通过。
    - `npx eslint "src/components/agent/chat/components/MessageList.tsx" "src/components/agent/chat/components/MessageListItem.tsx" "src/components/agent/chat/hooks/agentChatHistoryAdjacentMerge.ts" "src/components/agent/chat/hooks/agentChatHistoryLocalMerge.ts" "src/components/agent/chat/hooks/agentStreamAgentMessageContentSync.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts" --max-warnings 0`，通过。
  - 真实 GUI fixture 验证：
    - `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario expert-panel-skills-runtime --prefix claw-chat-current-fixture-expert-panel-skills-runtime-disallowed-guard-s56 --timeout-ms 180000`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-expert-panel-skills-runtime-disallowed-guard-s56-summary.json`
      - 关键断言：`.guiExpertPanelSkillsRuntimeCompleted.disallowedVisibleTextHits[]` 均为 `0`；当前 assistant scope 中 `oldHit=false`、`firstTurnHit=false`、`secondTurnHit=true`。
    - `npm run smoke:agent-runtime-current-fixture`，通过；覆盖 history/cache hydration、stream completion、Claw 终态 UI、Coding Workbench Electron GUI 输入、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza Skills Runtime、Expert Panel Skills Runtime；`liveProviderUsed=false`。
    - `npm run verify:gui-smoke`，通过；覆盖 renderer smoke build、`typecheck:electron`、Electron host build、app-server sidecar build 和 Electron smoke，最终输出 `renderer loaded`、`app-server initialized protocol=appserver.v0 version=1.80.0`、`claw workbench shell ready`、`memory settings ready`。
  - 全量校验缺口：
    - `npm run verify:local` 已通过 `verify:app-version`、`i18n:check`、`i18n:unused`、`lint`、变更文件 `i18n:scan`，随后在 `npm run typecheck` 阶段被系统以 `143` 结束，未输出 TypeScript 诊断。
    - 单独 `/usr/bin/time -p ./node_modules/.bin/tsc --noEmit --pretty false` 运行 `729.93s` 仍未自然退出，持续 CPU 计算且无诊断输出，已手动中断。
    - `tsc --listFilesOnly` 展开约 `4820` 个文件，用时约 `90s`；`src/components/agent/chat/hooks` 显式 files 分片运行 `521.06s` 仍未自然退出，说明当前 TypeScript 全仓 / 大依赖图存在性能阻塞，不能把 `typecheck` 标记为通过。
    - 进一步二分到本轮 hooks 变更的 5 个入口文件后，`tsc -p .lime/tmp/tsconfig-chatHooksChanged.files.json --noEmit --pretty false` 运行 `338.96s` 仍未自然退出；单入口 `agentStreamAgentMessageContentSync.ts` 正常解析依赖图运行 `141.15s` 仍未自然退出。
    - `--noResolve` 单入口可在 `36.64s` 返回，但会产生大量缺失依赖假错误，不能作为有效 typecheck 证据；该结果仅说明慢点在正常依赖解析 / 类型图展开阶段，不是本轮文件的语法错误。

- S4.11 `@配图` current chain Electron fixture：
  - 问题：用户输入 `@配图` 后曾出现没有 Agent 思考 / 工具过程就直接生成图片、刷新后跳回首页或只剩前端伪 task 卡的现象；这类问题不能靠前端直建 task 或 `{task_id}` 模板占位修补，必须证明原文先进入 Agent turn，再由 Skill / tool / task file / GUI 恢复同一条 current 主链收口。
  - Codex 对齐依据：图片命令验收必须按结构化生命周期定位，不能从截图猜测；工具过程、task artifact 和 GUI 轻卡应由同一 task id 串起来，刷新恢复继续消费 `.lime/tasks/image_generate/*.json`，而不是靠 renderer 内存状态或 draft card。
  - current 修复：
    - App Server protocol / method catalog / processor / runtime / local data source 已补齐 `mediaTaskArtifact/image/complete`；TS app-server-client、前端 `mediaTasks` 网关、DevBridge App Server method profile、schema fixture 和 generated protocol types 已同步。
    - 新增 `scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs` 承接 image-command 场景，避免继续往超大 `claw-chat-current-fixture-scenario-flow.mjs` 堆图片业务逻辑。
    - `claw-chat-current-fixture-backend-file.mjs` 的 external fixture backend 发出 `Skill(image_generate)` 与 `lime_create_image_generation_task` 两段工具事件；真实 task artifact 仍由 GUI 侧通过 App Server current `mediaTaskArtifact/image/create` 创建，并把响应回传给 backend 作为 tool result。
    - fixture 不再直接 patch `.lime/tasks/image_generate/*.json`；终态回写统一通过 App Server current `mediaTaskArtifact/image/complete`，再用 `get/list` 和 task file 读取验证同一 task artifact 已推进到 `succeeded`。
    - GUI 断言锁定 `data-testid="image-workbench-message-preview-${taskId}"`，要求同一卡片进入终态、有真实 media、无 `draft-image-`、无 `{task_id}`；刷新后重新打开 fixture session，继续用同一 task id 验证恢复。
    - assertion context / scenario assertions 增加 `IMAGE_COMMAND_ASSERTION_KEYS`，同时验证 backend metadata、App Server `mediaTaskArtifact/image/create|complete|get|list`、read model tool call、task file terminal、单卡终态和 reload restore。
    - reload 前保存 `agentUiPerformanceTracePreReload`，避免刷新后 hydrate trace 覆盖 provider/client 分段证据。
  - 分类：
    - `current`：`@配图 原文 -> Agent turn -> harness.image_skill_launch -> Skill(image_generate) -> lime_create_image_generation_task -> mediaTaskArtifact/image/create -> mediaTaskArtifact/image/complete -> .lime/tasks/image_generate/*.json -> GUI 轻卡终态 -> 刷新恢复`。
    - `test-only`：external fixture backend 等待 GUI 创建的 task artifact，再把真实响应作为 tool result 回灌；这不是生产 fallback。
    - `dead`：前端静默直建图片 task、`draft-image-*` 伪结果卡、`{task_id}` 模板占位、旧 `agent_runtime_submit_turn` / `execute_skill` 首发路径。
  - 定向验证：
    - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc`，3 个用例通过，覆盖 `image/complete` JSON-RPC 正向、错误 task type 和 cancelled terminal 拒绝。
    - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together`，通过。
    - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output --test schema_fixtures`，通过。
    - `npm run check:protocol-types`，通过。
    - `npx vitest run packages/app-server-client/tests/client.test.mjs`，53 个用例通过。
    - `node scripts/check-app-server-client-contract.mjs`，283 checks 通过。
    - `npx vitest run src/lib/api/mediaTasks.test.ts src/lib/api/mediaTasks.current-boundary.test.ts src/lib/api/appServer.test.ts src/lib/api/agentRuntime/mediaClient.test.ts src/lib/api/agentRuntime/mediaClient.current-boundary.test.ts scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs`，6 个文件、65 个用例通过。
    - `node --check` 覆盖 `scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs`、`claw-chat-current-fixture-scenario-assertions.mjs`、`claw-chat-current-fixture-constants.mjs`，通过。
  - 真实 GUI fixture 验证：
    - `npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture" --prefix "claw-chat-current-fixture-image-command"`，通过。
      - evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-image-command-summary.json`
      - backend ledger：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-image-command-backend-ledger.json`
      - 关键断言：`imageCommandUsedCurrentMediaTaskArtifactMethods=true`、`imageCommandTaskArtifactTerminal=true`、`imageCommandTaskArtifactSameTaskUpdated=true`、`guiImageCommandTaskCardTerminal=true`、`guiImageCommandSingleTaskCard=true`、`guiImageCommandRestoredAfterReload=true`、`agentUiPerformanceTraceSeparatesProviderAndClient=true`、`actionableConsoleErrors=[]`。
  - 剩余边界：
    - 本轮已新增 App Server `mediaTaskArtifact/image/complete` current method；仍未声明完整外部 worker orchestration、鉴权、重试或 live Provider 图片生成已产品化。
    - 本轮未跑 live Provider 图片生成；验收范围是非 live Provider 的真实 Electron GUI + App Server current fixture 主链。
    - 新增 image-command fixture 文件已接近 `800` 行体量预警；后续如果继续扩展 inline 配图、封面位或 retry/cancel，应先拆 task artifact helper / GUI wait / scenario runner 子模块。

## 5. 当前缺口

1. S3 current 展示主线已完成：live running WebSearch 中间态已有结构化 evidence，completed read model 不再作为唯一证据。
2. S4 后端 running 阻塞已完成 Rust current 修复、定向测试、Agent Runtime 聚合 fixture、Claw 新闻 GUI fixture 与 Web tools rendering fixture；App Server terminal 已被 GUI fixture 真实消费。
3. S4.9 普通工具过程记录持久化已完成定向单测和真实 GUI fixture 复跑；WebTools、Skills Runtime、MCP structuredContent 证据已回填。
4. S4.11 `@配图` current chain 已通过真实 Electron fixture：同一 task artifact 经 `mediaTaskArtifact/image/create -> mediaTaskArtifact/image/complete` 从 `pending_submit/pending` 推进到 `succeeded/succeeded`，GUI 同一卡片终态并在刷新后恢复；仍不声称 live Provider 或完整外部 worker orchestration 已完成。
5. 后续若复发展示问题，必须先看 `guiWebToolsRenderingInProgress.latestAssistantRendererContentPartTypes` 与 `latestAssistantTextAfterProcessPart`，普通工具则先看 DOM 中 `inline-tool-process-step` 数量与 tool id 时序，图片命令则先看 `image-workbench-message-preview-${taskId}`、task file status 和 read model tool calls，不要从截图文字猜 lifecycle。
6. `request_tool_policy.rs` 仍是 2800+ 行巨型文件；本轮已把 idle 专项测试、stream diagnostics、text batcher、web retrieval process state、reply retry mode、WebSearch preflight、request policy config、runtime status 与 auto compaction projection 外移，后续应继续按职责拆 WebSearch execution tracker、stream attempt orchestration 或取消上下文持久化等 production 子模块。
7. 无 sequence 的旧纯文本 provider 仍作为兼容兜底存在；后续要删除它，必须先确认 App Server / provider 全部输出 `phase` 或完成态 `turn_completed.text`。
8. Expert Panel Skills Runtime override 旁路已关闭：GUI completion wait、local merge、completed thread item merge 与相邻 assistant merge 均按 runtime turn 边界收口；历史轮 summary 仍可见但不再污染当前轮 assistant bubble。

## 6. 下一刀

后续维护口径：

1. 继续拆 `request_tool_policy.rs` 的 production 子职责，优先拆 WebSearch execution tracker 或 stream attempt orchestration 中测试覆盖清晰且直接影响 streaming lifecycle 的一块。
2. 继续收缩无 sequence legacy 兜底前，先让 App Server / provider 全面输出 `phase=commentary/final_answer` 或 `turn_completed.text`。
3. 如果继续扩 `@配图` 到 inline 配图、封面位、retry/cancel 或外部 worker 回写，先拆 `claw-chat-current-fixture-image-command.mjs` 子职责，并复用 App Server current `mediaTaskArtifact/image/complete`；不要继续堆前端直建 task 或 fixture-only 回写。
4. 对 Browser action runtime 复用同一 live running capture 口径：process 后不得有无 phase text part。
5. 不新增展示文案正则；新增 phase 必须先进入 App Server stream event / thread item protocol，再映射到 `ContentPart.metadata` 和定向 fixture。
