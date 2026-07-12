# Host Agent Run UI SDK

> 状态：current-minimum-slice
> 更新时间：2026-05-17
> 目标：把 Claw 类 AI 运行现场上移为 Lime Host 通用 UI 能力，让内容工厂和后续 Plugin 不再重复实现思考、执行、Skill、工具、模型、Token、费用、证据链和确认链展示。

## 1. 为什么需要这一层

Plugin 的价值不是把 Lime Chat 换成 iframe，也不是让业务 App 直接调模型 API。Plugin 应该把业务流程做成合适的产品形态，同时继续复用 Lime 已有 AgentRuntime / Claw / ToolRuntime / Skill / Evidence 能力。

内容工厂暴露出的核心问题是：业务 App 一旦需要真实 AI Agent，就会被迫重新实现一套“AI 同事”侧栏，包括流式输出、思考过程、工具调用、Skill 调用、模型选择、Token、费用、Evidence 和人工确认。这会带来三类错误：

- 每个 App 复制一份运行 UI，体验和数据口径漂移。
- App 误以为自己需要直连模型 API，退化成普通 Web App。
- Claw 已有能力无法共享，Lime 的 AgentRuntime 事实源被拆散。

因此需要 Host 级 `lime.ui.openAgentRun / updateAgentRun / closeAgentRun`，由 Lime 主 App 提供统一运行面板，业务 App 只声明“我要展示哪次 Agent Run”。

## 2. 责任边界

| 层 | 应该做什么 | 不应该做什么 |
| --- | --- | --- |
| Lime Host UI | 提供通用 Agent Run 面板、抽屉/弹窗/子页容器、运行过程折叠、模型/Token/费用/Skill/Evidence/确认链展示 | 写死内容工厂业务字段，或让每个 App 自己复制 Claw 渲染 |
| AgentRuntime / ToolRuntime | 产出 `runtimeProcess`、timeline、stream、thinking、execution、tool/skill、artifact、evidence、usage、cost 事实 | 决定业务页面布局，或把结果只塞进聊天文本 |
| SDK / Host Bridge | 暴露 `lime.ui.openAgentRun/updateAgentRun/closeAgentRun`，把 App 请求路由到 Host UI | 让 App 绕过 Host DOM 或私有 postMessage 协议 |
| 业务 Plugin | 定义业务流程、任务 contract、expected output、artifact adapter、人工确认和写回 | 自建底层 Agent Runtime、直连 provider key、复制 Skill runtime、长期维护私有 AI 过程 UI |
| 内容工厂 | 规划项目资料、场景、文案、脚本、图片需求、交付和复盘 | 把所有 AI 思考/工具/Skill/用量渲染逻辑长期留在 App 内 |

边界结论：

```text
Plugin 可以有很多个，但 Agent Run UI 只能有一个 Host 事实源。
业务 App 可以决定何时打开、如何命名、如何把产物落回业务状态；不能拥有模型、Skill、Tool、Token、费用和 Evidence 的底层事实源。
```

## 3. SDK 合同

### 3.1 `lime.ui.openAgentRun`

App 在启动或恢复 Agent task 后调用：

```ts
await lime.ui.openAgentRun({
  taskId,
  bridgeAction: "content_factory.production",
  title: "生成内容批次",
  mode: "drawer",
  expectedOutput: { artifactKind: "content_batch" },
});
```

Host 返回：

```ts
{
  opened: true,
  surface: "host_agent_run",
  mode: "drawer",
  taskId
}
```

### 3.2 `lime.ui.updateAgentRun`

App 或 Host Bridge 在拿到 task snapshot、subscription event、`runtimeProcess`、runtime facts 后调用，用于刷新同一个 Host 面板：

```ts
await lime.ui.updateAgentRun({
  taskId,
  title,
  runtimeProcess,
  events,
  task,
  snapshot,
});
```

Host UI 必须保证：运行中可展开过程；终态默认折叠但过程不消失。

### 3.3 `lime.ui.closeAgentRun`

App 可以在用户关闭业务页面、取消任务、或希望释放视图时调用。关闭 UI 不等于取消 Agent task；取消仍走 `lime.agent.cancelTask`。

## 4. 渲染原则

Host 统一 Agent Run UI 第一刀只做通用容器，不急着复刻完整 Claw：

- 展示标题、taskId、bridgeAction 和来源 App。
- 展示模型、Token、费用、Skill 约束和真实调用情况。
- 读取 `runtimeProcess.timeline`，运行中展开，完成后折叠但不删除。
- 读取 `events / taskEvents / runtimeFacts`，把确认链、交付物和 Evidence 单独收成事实栏，避免业务 App 只在自家面板里展示这些关键过程。
- 按 `timeline.kind` 呈现 routing / skill / tool / execution / artifact / warning / completed 的轻量语义标记，让 Host 面板接近 Claw 的运行现场，而不是普通日志列表。
- 工具标题复用 Claw 的 `resolveUserFacingToolDisplayLabel`，避免 Plugin Host UI 暴露 `browser_snapshot` 这类底层工具名。
- 工具过程摘要复用 Claw 的 `resolveToolProcessNarrative`，Host UI 只做容器和 facts 编排，不再为工具调用另写一套“运行中 / 已完成 / 失败”文案规则。
- Tool / Skill 步骤 UI 复用 Claw 的 `InlineToolProcessStep`，Host 只负责把 App timeline 标准化为 `AgentToolCallState`，不再为工具和 Skill 步骤自绘第二套卡片。
- 思考过程 UI 复用 Claw 抽出的 `ThinkingBlock`，Host 不再用自绘 `pre` 文本块展示 thinking。
- 执行过程和成稿输出 UI 复用 Claw 的 `MarkdownRenderer`，Host 不再把 `executionText / streamText` 当纯文本 `pre` 展示，避免执行摘要和 Markdown 成稿无法正常渲染。
- 消费 `timeline.collapseKey`，同一流式阶段合并为一组并显示片段数，折叠视觉噪音但不丢任一过程片段。
- 展示 `thinkingText / executionText / streamText` 的入口，但不让业务 App 自己解析底层事件。
- 后续可把 Claw 已有 renderer 下沉成共享 `AgentRunRenderer`，由 Host UI 调用，而不是 iframe App import Claw React 组件。

当前代码边界：

- `src/features/plugin/ui/AgentRunHostDrawer.tsx` 是 Host 级 Agent Run UI 的第一份 Host Shell。
- `AgentRunRenderer` 是抽屉、弹窗或未来 Claw 共享 renderer 都可复用的运行事实渲染入口；Host Shell 负责容器，Renderer 负责模型、Token、费用、Skill、timeline、thinking、execution、artifact 和 evidence 渲染。
- `AgentRunProcessPanel` 保留为 `AgentRunRenderer` 的兼容别名，避免后续容器形态继续复制一份过程面板。
- `src/features/plugin/ui/PluginRuntimePage.tsx` 只负责 iframe runtime、Host Bridge 生命周期和 `lime.ui.*AgentRun` state 连接。
- 后续如果 Claw renderer 抽包，应该替换 `AgentRunHostDrawer` 内部 timeline/text 渲染器，而不是再把渲染逻辑塞回 `PluginRuntimePage` 或业务 App。

## 5. 内容工厂过渡策略

当前内容工厂已有 App 内 `AI 同事` 面板，这是过渡实现，不是目标架构。退出条件：

1. 内容工厂启动 Agent task 后调用 `lime.ui.openAgentRun`。
2. task subscription / stream / snapshot 更新时调用 `lime.ui.updateAgentRun`。
3. App 内面板只作为 Host UI 不可用时的 fallback。
4. 所有新 App 默认接 Host UI SDK，不再新写私有 `host-task-process` 解析器。
5. 真实 Claw 过程渲染、模型选择、Token、费用、Evidence、确认链继续在 Lime Host / AgentRuntime 层收敛。

## 6. 本轮最小交付

本轮先实现最小垂直切片：

- SDK contract / catalog 增加 `openAgentRun / updateAgentRun / closeAgentRun`。
- Host Bridge 拦截 `lime.ui` capability invoke，支持 toast / navigation / download / snapshot 和 Agent Run UI 请求。
- `PluginRuntimePage` 渲染 Host 级统一 Agent Run 抽屉。
- 内容工厂调用 Host UI SDK，保留 App 内面板作为 fallback。

不在本轮完成：

- 不把 Claw 的完整 React renderer 抽包。
- 不新增 `content_factory_*` Tauri 命令。
- 不动 0.7 manifest/reference CLI 并行写集。
- 不把 App 内所有页面一次性重设计完成。

## 7. 验收口径

最小验收：

- App 通过 SDK 调用 `lime.ui.openAgentRun` 后，Host 页面出现通用 AI 运行抽屉。
- 抽屉能显示 taskId、标题、模型、Token、费用、Skill 和 timeline。
- `updateAgentRun` 后 Host 抽屉内容刷新。
- `closeAgentRun` 只关闭 UI，不取消 Agent task。
- 内容工厂在 Host 不支持该能力时仍能用本地 fallback，不中断业务流。

完整验收：

- Host UI 使用 Claw 共享 renderer，而不是重新复制样式。
- Evidence Pack、analysis handoff、review decision、人工确认都能在同一个 Host Run UI 中追踪。
- 内容工厂全流程页面不再长期维护私有底层 Agent 过程解析。

## 8. 当前完成审计

| 要求 | 现有证据 | 结论 |
| --- | --- | --- |
| App 能通过 SDK 打开 Host Run UI | `PluginRuntimePage.test.tsx` 覆盖 `lime.ui.openAgentRun / updateAgentRun / closeAgentRun` | done/first-cut |
| 完成后折叠但过程不消失 | Host Run dock / drawer 保留同一份 `agentRunUi`，测试断言终态仍能看到历史 timeline | done/first-cut |
| 思考、执行、成稿流式输出不被 App 私有解析 | `AgentRunHostDrawer.tsx` 直接读取 `runtimeProcess.thinkingText / executionText / streamText` | done/first-cut |
| Tool / Skill / 模型路由 / 产物等过程可区分 | `AgentRunHostDrawer.tsx` 读取 `timeline.kind` 并输出 `data-agent-run-timeline-kind` 语义标记；测试覆盖 `routing / skill / tool / execution / completed` | done/first-cut |
| Host UI 不只绑定抽屉一种形态 | `AgentRunRenderer` 已成为 Host 共享渲染入口，`AgentRunProcessPanel` 仅为兼容别名；测试断言 `data-agent-run-renderer="host-shared"` 存在 | done/first-cut |
| Claw 工具名展示复用 | `AgentRunHostDrawer.tsx` 复用 `resolveUserFacingToolDisplayLabel`；测试断言 `browser_snapshot` 在 Host Run UI 中显示为“页面截图” | done/first-cut |
| Claw 工具过程摘要复用 | `AgentRunHostDrawer.tsx` 复用 `resolveToolProcessNarrative`，把 tool timeline 转成 Claw 同源“先抓取页面状态”等摘要，原始 App message 保留为详情；测试覆盖 Host UI 中出现 Claw 摘要和原始过程 | done/first-cut |
| Claw Tool / Skill 步骤 renderer 复用 | `AgentRunHostDrawer.tsx` 将 tool / skill timeline 标准化为 `AgentToolCallState` 并渲染 `InlineToolProcessStep`；测试断言 Host Run UI 出现 `inline-tool-process-step`，且 Skill 显示 Claw 同源“先执行技能”过程 | done/first-cut |
| Claw 思考过程 renderer 复用 | `ThinkingBlock` 从 `StreamingRenderer` 抽成共享组件，`AgentRunHostDrawer.tsx` 直接渲染该组件；测试断言 Host Run UI 出现 `thinking-block` 和“思考中” | done/first-cut |
| Claw 执行 / 成稿 Markdown renderer 复用 | `AgentRunHostDrawer.tsx` 使用 `MarkdownRenderer` 渲染 `executionText / streamText`；测试断言 Host Run UI 出现 `agent-run-markdown-execution / agent-run-markdown-output` 且 Markdown 标题可见 | done/first-cut |
| 流式过程折叠但不丢片段 | `AgentRunHostDrawer.tsx` 消费 `timeline.collapseKey` 合并同组片段，并用 `×N` 标记组内数量；测试覆盖两段 `assistant_text` 同组仍可见 | done/first-cut |
| 模型、Token、费用、Skill 由 Host 统一展示 | `AgentRunMetricCards` 读取 `runtimeProcess.model / usage / cost / skillNames / invokedSkillNames`；测试覆盖模型、Token、费用、Skill | done/first-cut |
| 多个业务 Skill 调用不能被流式参数前缀污染 | `agentRuntimeProcess.ts` 将 required skills、真实 invoked skills 分开投影，从 `events / snapshot.threadRead.tool_calls / artifacts` 补齐调用名，并剔除 `article-w`、`content-review` 这类 streaming partial | done/first-cut |
| required Skills 不能只靠 prompt | `runtime_turn.rs` 在 Plugin required skill contract 存在时，进入模型前通过 `LimeSkillTool` 逐个执行 required Skill，并把 `ToolStart / ToolEnd` 投影到 Host task events；`LimeSkillTool` 对 Plugin runtime session 中模型二次触发的内容工厂文本参数 Skill 也走 fast path，避免 nested Skill 卡住 | done/runtime-enforced |
| 输出合同不能因为模型漏建 Artifact 而断流 | `runtime_turn.rs` 在 stream 完成后读取 `plugin_runtime_output_contract`，优先物化模型返回的 `contentFactoryWorkspacePatch`；`strategy_report / review_report` 会生成可复核报告 patch，`script_batch / prompt_batch` 只生成 `requiresHumanReview=true` 的 review draft patch，`content_batch` 仍不伪造内容条目 | done/runtime-materialized |
| 证据链、交付物、确认链不丢 | `AgentRunFactRail` 读取 `events / taskEvents / runtimeFacts`；测试覆盖 review request、artifact、evidence | done/first-cut |
| 真正复用 Claw renderer | 已复用 Claw 工具名、工具摘要纯函数、Tool / Skill 步骤 React renderer、thinking renderer 和 execution / output Markdown renderer；timeline 外壳 / facts 仍是 Host Run 专用 renderer，未抽出完整共享 renderer | partial |
| 内容工厂移除私有 AI 面板 | 内容工厂已接 Host UI SDK；Host connected 且存在 `hostTask` 时，App 内 `AI 同事` 抽屉/浮标不再渲染，只保留 Host 不可用 fallback | partial-to-done |

## 9. 最近验证记录

此前验证证明 Host Agent Run UI SDK 已从 first-cut 进入可复用 renderer seam，并补上内容工厂真实完成态证据；2026-05-17 增量验证继续补多 Skill 投影，但仍不等于所有业务 AI 动作全部完成态覆盖：

- `npm test -- "src/features/plugin/ui/PluginRuntimePage.test.tsx"`：通过，覆盖 `lime.ui.openAgentRun / updateAgentRun / closeAgentRun`、Host dock/drawer、模型/Token/费用/Skill、Claw 工具名、Claw 工具过程摘要、Claw Tool / Skill 步骤 renderer、Claw thinking renderer、Claw execution / output Markdown renderer、流式分组合并、facts 和终态折叠。
- `npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx"`：通过，证明 `ThinkingBlock` 抽出后 Claw 原聊天流式渲染行为保持不变。
- `npm test -- "src/components/agent/chat/components/MarkdownRenderer.test.tsx"`：通过，证明 Host 复用的 Claw Markdown renderer 本体仍可用。
- `npm test -- "src/components/agent/chat/utils/toolProcessSummary.test.ts"`：通过，证明 Host 复用的 Claw 工具过程摘要事实源仍可用。
- `npm test -- "src/components/agent/chat/components/InlineToolProcessStep.test.tsx"`：通过，证明 Host 复用的 Claw 工具步骤 renderer 本体仍可用。
- `npx eslint "src/components/agent/chat/components/ThinkingBlock.tsx" "src/components/agent/chat/components/thinkingBlockDisplay.ts" "src/components/agent/chat/components/StreamingRenderer.tsx" "src/features/plugin/ui/AgentRunHostDrawer.tsx" "src/features/plugin/ui/PluginRuntimePage.test.tsx" --max-warnings 0`：通过。
- `git diff --check -- "internal/roadmap/agentruntime/host-agent-run-ui-sdk.md" "src/components/agent/chat/components/ThinkingBlock.tsx" "src/components/agent/chat/components/thinkingBlockDisplay.ts" "src/components/agent/chat/components/StreamingRenderer.tsx" "src/features/plugin/ui/AgentRunHostDrawer.tsx" "src/features/plugin/ui/PluginRuntimePage.test.tsx"`：通过。
- `npm run typecheck`：通过，300s 受控窗口内完成，取得全量类型绿色。
- `/Users/coso/Documents/dev/ai/limecloud/content-factory-app`: `npm test`：通过，63 tests passed；覆盖 Host Bridge 发起 AgentRuntime、Host connected 时不走本地生成 API、Host 流式 JSON workspace patch 写回业务对象、右侧面板承载真实流式输出、模型/Token/费用/Skill facts 回写。
- `npm run verify:gui-smoke`：通过，复用已运行 headless Tauri；覆盖 workspace ready、browser runtime、site adapters、Skill Forge entry、runtime tool surface/page、`@` command registry、Plugins、Claw streaming、Knowledge GUI、Design Canvas。该验证使用当前脏工作树，不代表并行 `scripts/plugin/apps-smoke.mjs` 改动归属本线程。
- `npm run smoke:plugins -- --timeout-ms 540000 --prefix agent-run-renderer-content-factory-completion --include-content-factory-completion-e2e --completion-timeout-ms 420000`：通过；summary `.lime/qc/gui-evidence/plugins/agent-run-renderer-content-factory-completion-summary.json` 断言 `contentFactoryCompletionReady=true`、`contentFactoryActionNoHostFallback=true`、`contentFactoryActionRequiredSkillsProjected=true`，Host task `plugin-task-42a3c2e4-c327-4312-a869-6c9bbd7d07ff` / session `plugin-runtime-3b12fc2d-1e29-4515-bacf-6cc828ea0408` 成功完成，`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady` 全为 true。
- 历史深水位：`.lime/qc/gui-evidence/plugins/plugins-smoke-p18-7-completion-run-scenarios-success-summary.json` 已覆盖“生成/更新场景包”完成态；本轮未重跑该动作，作为 P18.7 并行验证证据引用。

2026-05-17 增量验证：

- `npm test -- "src/features/plugin/runtime/agentRuntimeProcess.test.ts"`：通过，覆盖多 Skill 调用从 `snapshot.threadRead.tool_calls` 和 artifact 文本补投，且 `article-w`、`content-review` 这类流式参数前缀不再进入 `invokedSkillNames`。
- `npm test -- "src/features/plugin/ui/PluginRuntimePage.test.tsx"`：通过，Host Run UI 仍能消费更新后的 `runtimeProcess`。
- `npx eslint "src/features/plugin/runtime/agentRuntimeProcess.ts" "src/features/plugin/runtime/agentRuntimeProcess.test.ts" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix agent-run-renderer-content-factory-run-production-skill-projection --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/agent-run-renderer-content-factory-run-production-skill-projection-summary.json` 证明 run-production completion ready，但暴露 `article-w / content-review` 前缀污染，本轮随后在数据层修复。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix agent-run-renderer-content-factory-run-production-skill-projection-clean --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/agent-run-renderer-content-factory-run-production-skill-projection-clean-summary.json` 证明 run-production completion ready，`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady` 全为 true；随后继续收窄前缀清理规则。
- `scripts/plugin/apps-smoke.mjs` 已将 content factory action 的 `taskAccepted / hostTaskRecordSeen` 从只认 `hostTaskRecord.taskId` 收敛为同时接受 `sdkTaskId`，用于覆盖 failure raw record 中已有 `bridgeRecord / taskRecord / sdkTaskId` 但 summary 判定失败的形态。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix agent-run-renderer-content-factory-run-production-skill-projection-final3 --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/agent-run-renderer-content-factory-run-production-skill-projection-final3-summary.json` 证明 Host task record gate 修复后，run-production completion ready，且 `article-writer / content-reviewer` 均进入 `invokedSkillNames`，不再出现 `article-w / content-review` partial。
- `scripts/plugin/apps-smoke.mjs` 随后新增 `contentFactoryActionExpectedSkillsInvoked`，completion E2E 不再只接受“required skills 出现在 prompt/callLog”，必须在完成态 `runtimeProcess.invokedSkillNames` 看到每个 expected skill。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix agent-run-renderer-content-factory-run-production-strict-skills --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000`：失败；failure `.lime/qc/gui-evidence/plugins/agent-run-renderer-content-factory-run-production-strict-skills-failure.json` 显示本轮 run-production 未稳定同时调用 `article-writer / content-reviewer`。这不是脚本假失败，而是“required skills 有时只声明、不一定被真实调用”的产品缺口。
- `npm run verify:gui-smoke`：执行到 `smoke:claw-chat-ready-streaming` 时失败；前置 `workspace-ready / browser-runtime / site-adapters / Skill Forge / runtime tool surface / @ command registry / plugins` 均通过，失败原因是 Claw smoke 中一次 `agent_init` DevBridge fetch timeout 形成 console error，和本轮 `runtimeProcess` Skill 投影变更无直接耦合。

2026-05-17 Runtime contract enforcement 增量验证：

- `cargo test -p lime plugin_required_skill --lib`：通过，覆盖 Plugin required Skill 参数保留 `agentTaskContract` 快路径输入、`LimeSkillTool` fast path 真实执行、ToolEnd metadata 可被 Host task projection 消费。
- `cargo test -p lime plugin_skill_contract_should_resolve_required_skill_allowlist --lib`：通过，证明 `content_factory_skill_contract` 仍能解析为 `article-writer / content-reviewer` allowlist。
- `cargo test -p lime plugin_runtime_runtime_event_projection --lib`：通过，证明 Runtime event projection 对 artifact / evidence / stream text 仍保持兼容。
- `npm test -- "src/features/plugin/runtime/agentRuntimeProcess.test.ts"`：通过，证明 Host `runtimeProcess.invokedSkillNames` 继续能消费 Runtime ToolEnd metadata，并过滤流式半截 Skill 名。
- `node --check "scripts/plugin/apps-smoke.mjs"`：通过，确认 strict smoke 脚本语法仍可执行。
- `npm run typecheck`：通过。
- `git diff --check -- "lime-rs/src/commands/agent_cmd/runtime_turn.rs" "internal/roadmap/agentruntime/host-agent-run-ui-sdk.md"`：通过。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix plugin-required-skills-runtime-enforced-run-production --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-required-skills-runtime-enforced-run-production-summary.json` 证明 run-production completion ready，完成态 `runtimeProcess.invokedSkillNames=["article-writer","content-reviewer"]`，`modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady` 全为 true。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix plugin-required-skills-runtime-enforced-only-copy --include-content-factory-completion-e2e --content-factory-action only-copy --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-required-skills-runtime-enforced-only-copy-summary.json` 证明 only-copy 在 strict gate 下也能稳定看到 `article-writer / content-reviewer`，且模型、usage、cost、artifact 均 ready。
- `npm run verify:gui-smoke`：通过；复用已有 headless Tauri，覆盖 workspace ready、browser runtime、site adapters、Skill Forge、runtime tool surface/page、`@` command registry、Plugins、Claw streaming、Knowledge GUI、Design Canvas；此前 Claw `agent_init` timeout 未复现。

实现结论：`requiredSkills` 已从“写进 prompt / metadata，等待模型自觉调用”推进为 Runtime contract pre-execution；Plugin 仍通过 `plugin_runtime_start_task -> agent_runtime_submit_turn` current 主链进入，不新增 `content_factory_*` 命令，不让内容工厂直连模型 API。

2026-05-17 Output contract materialization 增量验证：

- `cargo test -p lime plugin_output_contract --lib`：通过，覆盖三条边界：模型已返回 fenced JSON patch 时保留模型结构；`strategy_report` 只有自然语言时物化为可复核 workspace patch；`content_batch` 没有 patch 时不伪造内容条目。
- `cargo test -p lime plugin_required_skill --lib`：通过，确认 required Skill pre-execution 与 ToolEnd projection 仍可用。
- `cargo test -p lime plugin_skill_contract_should_resolve_required_skill_allowlist --lib`：通过。
- `cargo test -p lime plugin_runtime_runtime_event_projection --lib`：通过。
- `npm test -- "src/features/plugin/runtime/agentRuntimeProcess.test.ts"`：通过。
- `node --check "scripts/plugin/apps-smoke.mjs"`：通过。
- `npm run typecheck`：通过。
- `npm run test:contracts`：通过。
- `git diff --check -- "lime-rs/src/commands/agent_cmd/runtime_turn.rs" "internal/roadmap/agentruntime/host-agent-run-ui-sdk.md"`：通过。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix plugin-output-contract-materialized-run-strategy --include-content-factory-completion-e2e --content-factory-action run-strategy --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-output-contract-materialized-run-strategy-summary.json` 证明 `run-strategy` 完成态 `modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady` 全为 true，`artifactCount=1`，`invokedSkillNames=["article-writer","content-reviewer","user:article-writer"]`，direct runtime snapshot `hasWorkspacePatch=true`。
- `npm run smoke:plugins -- --timeout-ms 720000 --prefix plugin-output-contract-materialized-run-review --include-content-factory-completion-e2e --content-factory-action run-review --completion-timeout-ms 600000`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-output-contract-materialized-run-review-summary.json` 证明 `run-review` 完成态全 ready，`artifactCount=1`，`invokedSkillNames=["content-reviewer"]`，direct runtime snapshot `hasWorkspacePatch=true`。
- `npm run verify:gui-smoke`：通过；复用已有 headless Tauri，覆盖 workspace ready、browser runtime、site adapters、Skill Forge、runtime tool surface/page、`@` command registry、Plugins、Claw streaming、Knowledge GUI、Design Canvas。

实现结论补充：内容工厂交付包 / 复盘不再因为“required Skills 已执行但模型没有创建 artifact”卡住；Host Runtime 会先尊重模型输出的真实 workspace patch，只有报告类产物缺少结构化 patch 时才做保守 materialization，并把 `requiresHumanReview`、原始运行输出和 Skill evidence 一起写入 Artifact，避免把补救产物伪装成无风险终稿。

2026-05-17 Direct runtime snapshot 复核：

- `node "scripts/plugin/apps-smoke.mjs" --include-content-factory-completion-e2e --content-factory-action run-production --completion-timeout-ms 120000 --prefix plugin-run-production-direct-audit`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-run-production-direct-audit-summary.json` 证明 `run-production` 完成态全 ready，`directRuntimeSnapshot.hasWorkspacePatch=true`，`directRuntimeSnapshot.artifactCount=1`，`toolCallCount=2`，`runtimeProcess.invokedSkillNames=["article-writer","content-reviewer"]`，模型为 `deepseek/deepseek-v4-flash`，usage / cost 均 ready。
- `node "scripts/plugin/apps-smoke.mjs" --include-content-factory-completion-e2e --content-factory-action only-copy --completion-timeout-ms 120000 --prefix plugin-only-copy-direct-audit`：通过；summary `.lime/qc/gui-evidence/plugins/plugin-only-copy-direct-audit-summary.json` 证明 `only-copy` 完成态全 ready，`runtimeProcess.invokedSkillNames=["article-writer","content-reviewer"]`，usage / cost / artifact / workspace patch 均 ready。
- `.lime/qc/gui-evidence/plugins/plugin-direct-runtime-postcheck.json`：对上面两次 task 再次调用 `plugin_runtime_get_task` 复核，`run-production` 与 `only-copy` 的 direct snapshot 都已能看到 `contentFactoryWorkspacePatch / workspacePatch`，且 Artifact 路径分别落到 `.lime/artifacts/plugin/<task>/<turn>/content_batch.workspace-patch.json`。
- 复核结论：`run-production` 的 direct snapshot 弱证据已收口；`only-copy` summary 中的 `directRuntimeSnapshot.hasWorkspacePatch=false / artifactCount=0` 是 completion loop 先以 Host live record 达到 ready 后立刻返回导致的毫秒级读时序差，后续 direct get 已返回 `threadArtifactCount=1 / hasWorkspacePatchByDirectSnapshot=true`。产品侧不应把该 summary 字段单独当成失败，但 smoke 脚本后续应在 `latestReadiness.ready` 前补一次 direct workspace patch stabilization gate。

2026-05-17 单会话流程 runner 与新发现：

- `scripts/plugin/content-factory-flow.mjs`：新增独立验收入口，不夹写并行脏 `scripts/plugin/apps-smoke.mjs`；默认在同一 Lime 页面 / 内容工厂 iframe 中串 `run-scenarios -> run-production -> run-scripts -> run-strategy -> run-review`，并记录每步模型、Skill、Artifact、workspace patch、Evidence。
- `cargo test --manifest-path "lime-rs/crates/agent/Cargo.toml" plugin_content_factory_skill_should_use_fast_path_for_text_args`：通过；修正模型二次调用 `Skill(content-reviewer)` 且 `args` 是自然语言时可能进入 nested Skill 长跑的问题。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime plugin_output_contract --lib`：通过，4 tests；新增 `script_batch` review draft materialization，仍保持 `content_batch` 无结构化 patch 时不伪造内容。
- `node "scripts/plugin/apps-smoke.mjs" --timeout-ms 720000 --prefix plugin-run-scripts-recheck-after-fast-path --include-content-factory-completion-e2e --content-factory-action run-scripts --completion-timeout-ms 600000`：通过；证明单个 `run-scripts` key action 在 fast path 修正后仍 completion ready，direct snapshot `hasWorkspacePatch=true`。
- `node "scripts/plugin/content-factory-flow.mjs" --timeout-ms 720000 --completion-timeout-ms 600000 --prefix content-factory-full-flow-20260517`：失败；真实串联显示 `build-store` 后会把已确认样例带回“资料还不能生产”门禁，`run-scenarios` 不可见，说明“知识库整理 -> 场景生成”的产品状态递进还没闭环。
- `node "scripts/plugin/content-factory-flow.mjs" --timeout-ms 720000 --completion-timeout-ms 600000 --prefix content-factory-operational-flow-fast-skill-20260517`：失败；从已确认样例知识库出发，`run-scenarios` 可进入真实 runtime，但继续串到后续动作时仍暴露 startTask 等待 / 页面热更新 / 模型输出 patch 稳定性问题。结论：key action 已可交付，单会话全流程仍不能宣称完成。

## 10. Prompt-to-artifact 完成检查表

| 用户明确要求 / 目标 | 当前 artifact 证据 | 覆盖判断 | 下一步缺口 |
| --- | --- | --- | --- |
| App 内完成 Agent 工作，不跳回 Lime 原 Chat UI | `lime.ui.openAgentRun / updateAgentRun / closeAgentRun` 已接 Host dock/drawer；内容工厂关键动作 strict completion 已覆盖到生产、脚本、交付和复盘；本轮新增单会话 flow runner 并记录真实失败点 | covered for key actions | 还需把单会话全流程跑绿，并补失败/人工确认分支 |
| 不能直接调 API，要复用完整 Lime AI Agent 能力 | Host UI 消费 `runtimeProcess / events / runtimeFacts`；completion E2E 证明真实 task subscription、runtime facts、artifact、evidence、workspace patch 均回写 | covered for key actions | 继续覆盖失败/人工确认分支和跨 App 标准化 |
| 要像 Claw 一样展示流式输出过程，过程不能消失 | timeline 消费 `collapseKey` 分组，终态只折叠不删除；`verify:gui-smoke` 和 content-factory strict completion E2E 均通过 | first-cut covered | 还需补 Playwright 层对“手动展开终态详情”的视觉断言 |
| 要展示思考、执行过程、工具调用，不只是工具调用 | `ThinkingBlock`、`InlineToolProcessStep`、`MarkdownRenderer` 已接入 Host Run UI；`AgentRunRenderer` 已作为 Host 共享 seam；测试覆盖 thinking、Tool、Skill、execution/output Markdown | first-cut covered | timeline 外壳仍是 Host 专用，尚未抽成 Claw / Host 共同消费的跨模块 renderer 包 |
| 生成内容要用 Skills | `AgentRunMetricCards` 展示 `skillNames / invokedSkillNames`；completion E2E 证明 `knowledge-builder`、`article-writer`、`content-reviewer` 在对应动作中进入真实 `invokedSkillNames` | covered for key flows | 继续补单会话串联全流程和失败/人工确认分支 |
| 生成本轮内容包必须同时展示写作和复核 Skill | Runtime contract pre-execution 已通过 `LimeSkillTool` 逐个执行 `article-writer / content-reviewer`；`plugin-required-skills-runtime-enforced-run-production-summary.json` 完成态看到两个 Skill 均进入 `invokedSkillNames` | covered for run-production | 继续补单会话串联和失败重试分支 |
| 只重写文案批次必须有可复核 workspace patch | `plugin-only-copy-direct-audit-summary.json` 证明 only-copy completion ready；`plugin-direct-runtime-postcheck.json` 复核 direct get 已看到 `threadArtifactCount=1 / hasWorkspacePatchByDirectSnapshot=true` | covered for only-copy | smoke 脚本还需补 direct snapshot stabilization，避免 ready 后立即返回留下过时摘要 |
| 交付包和复盘必须有 artifact/workspace patch | `runtime_turn.rs` 已补 Host Runtime output contract materialization；`plugin-output-contract-materialized-run-strategy-summary.json` 和 `plugin-output-contract-materialized-run-review-summary.json` 均为 completion ready，且 direct snapshot `artifactCount=1 / hasWorkspacePatch=true` | covered for run-strategy/run-review | 继续补单会话从前置状态到交付/复盘的端到端路径 |
| 模型选择、Token、费用都要支持 | `AgentRunMetricCards` 已读取 `model / usage / cost`；completion E2E 证明 `deepseek/deepseek-v4-flash`、usage、cost 均 ready | covered for first flow | 继续覆盖用户手动切换模型和低余额/限额分支 |
| UI 应由 Lime Host / SDK 提供，不让每个 App 自己实现 | `AgentRunRenderer`、`AgentRunHostDrawer` 位于 Lime Host；内容工厂 Host connected 时隐藏 App 私有运行抽屉，仅保留 fallback | mostly covered | 需要把该规则固化为 Plugin 标准与 lint/fixture 检查 |
| 文档要同步更新边界和审计 | 本文件第 2 / 4 / 8 / 9 / 10 节记录 Host/App/Runtime 边界、渲染原则、完成审计和验证记录 | covered | 后续每一刀继续把验证结果回写 |
| 不和并行进程打架 | 本轮先只读审计并行 `scripts/plugin/apps-smoke.mjs`，确认 Host task record 判定是主线阻塞后只接管 `taskAccepted / expectedSkillsInvoked` 两个最小补丁点；继续避让 `internal/roadmap/plugin/*` 和 0.7 写集 | covered | 若继续扩展 chained seed / 多动作 flow，需要继续按脚本写集合并窗口处理 |
| 达到 Lime 可交付门槛 | Runtime required Skill enforcement、Plugin 文本参数 Skill fast path、output contract materialization 已落 current 主链；Rust 定向测试、前端 runtimeProcess 测试、`typecheck`、`test:contracts`、run-production/only-copy/run-scripts/run-strategy/run-review strict completion、完整 `verify:gui-smoke` 均通过 | covered for current key actions / partial for full content factory | 单会话全流程 runner 已新增但仍红；还需修知识库 readiness 回退、连续 startTask 稳定性、失败/人工确认分支和终态展开视觉断言 |

## 11. 剩余主线缺口

按对整体目标的影响排序：

1. **单会话全流程仍未完整串联**：本轮已新增独立 runner 并真实执行，但结果仍红；`build-store` 后可能回退到“资料还不能生产”，从已确认知识库出发继续串联也会遇到 startTask 等待、页面热更新或模型输出 patch 变体。当前关键动作已分别通过 strict completion，但还缺一条从知识库 / 场景 / 内容 / 脚本 / 交付 / 复盘连续跑完的绿色用户旅程。
2. **完整共享 renderer 尚未抽包**：Host 已复用 Claw 工具名、工具摘要、Tool/Skill 步骤、ThinkingBlock 和 MarkdownRenderer，但 timeline shell / facts rail 仍是 Host 专用；后续应继续下沉为 Lime SDK 层共享组件，而不是让每个 Plugin 自绘。
3. **终态手动展开视觉断言仍缺**：当前已有组件回归与 smoke，但还缺一条直接点击终态折叠组并确认 thinking / execution / output 仍可展开的 Playwright 级断言。
4. **direct snapshot stabilization 应进入 smoke gate**：产品 direct get 已能复核 `run-production / only-copy` workspace patch，但 `scripts/plugin/apps-smoke.mjs` 在 Host live record 已 ready 时会立即返回，可能留下过时的 `directRuntimeSnapshot.hasWorkspacePatch=false` 摘要；该脚本当前是并行写集，后续由持有脚本写集的进程补“ready 前再等一次 direct workspace patch”的稳定门。
5. **报告类 patch 字段已回灌到 Plugin runtime metadata/events 事实源**：`plugin_runtime_cmd` 已把 `strategyReport / pptOutline / reviewReport / riskCheck` 纳入 accepted/extract 字段，并用 `plugin_runtime` Rust 回归固定，避免不同投影层对“workspace patch 是否完整”的判断口径不一致；后续只需在脚本写集可用时补产品 smoke 复核。
