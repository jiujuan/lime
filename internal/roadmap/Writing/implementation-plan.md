# Writing 实施计划

更新时间：2026-06-29
状态：In Progress

## 1. 当前主目标

把写文章从宿主硬编码入口收敛为 Lime Plugin Package v1 下的内容工厂插件 workflow，并完成最小可用闭环：

```text
已安装内容工厂插件包 -> @写文章 -> content_article_workflow -> ArtifactFrame(articleArtifacts renderer) -> 右侧 Article Editor
```

## 2. 当前状态

- 已有内容工厂外部包、runtime yaml、workbench yaml、worker、skills 和基础 workflow，是迁移输入。
- 已有宿主 plugin contract、输入栏候选、activation metadata、ArtifactDocument / Workbench 基础路径，是迁移输入。
- 内容工厂样板包骨架已迁到 Lime Plugin Package v1：`plugin.json` 成为入口，`subagents/`、`clis/`、`connectors/`、`hooks/`、`resources/` 已落盘并通过包内验证。
- 插件包标准事实源已落到 `internal/tech/plugin/`。
- 宿主本地安装链正在切到只读取 `plugin.json`，旧入口归类为 dead。
- LimeCore 服务端控制面本轮暂不修改；本轮只把宿主本地安装、插件投影和内容工厂写作主链收敛到 `plugin.json`。等宿主 package v1 contract、manifest hash 和安装投影稳定后，再统一迁移云端 release / upload 校验。

## 3. 实施切片

### P0：Lime 插件包标准事实源

状态：完成骨架

- [x] 在 `internal/tech/plugin/` 建立 Lime Plugin Package v1 标准文档。
- [x] 内容工厂外部包新增 `plugin.json` 作为唯一插件包入口。
- [x] 内容工厂外部包补齐 `subagents/`、`clis/`、`connectors/`、`hooks/`、`resources/` 标准目录。
- [x] 旧说明文档退出机器事实源。
- [x] validator 按 v1 标准校验 `plugin.json`、runtime、workbench、skills、subagents、CLI、connectors、hooks、resources。

### P1：内容工厂样板包

状态：骨架完成，细节待深化

- [x] `app.runtime.yaml` 使用 v1 骨架声明 `content_article_workflow`。
- [x] `app.workbench.yaml` 使用 v1 骨架声明 `articleDraft` 业务对象和 articleArtifacts contract。
- [x] workflow 明确绑定 research、strategy、draft、review、image-plan 五个步骤。
- [x] 每个 subagent 有 `prompt.md` 和输出格式。
- [x] skills 使用稳定 id，被 workflow 引用。
- [x] CLI inspect / run / validate 可证明插件包自洽。
- [ ] subagent references / scripts / templates 继续深化。
- [ ] hooks 从声明型骨架升级为真实 runtime 生命周期执行。
- [ ] connectors 从声明型骨架升级为宿主授权和可用性状态。

### P2：宿主 contract 投影

状态：安装链与 activation 投影完成，详情展示待补

- [x] plugin contract 类型支持 `schemaVersion=lime.plugin.package.v1`、`contributions` 和 `plugin.json` 入口形状。
- [x] plugin contract 可从 `contributions` 派生 runtime / workbench / skills / subagents / CLI / connectors / hooks 路径。
- [x] 本地安装从 `plugin.json` 读取插件包入口。
- [x] 本地安装不再支持旧入口；只有负向测试可写旧文件名证明拒绝。
- [x] 本地 / 云包 inspect 从 `plugin.json` 读取 runtime / workbench，并投影 activation entries、workflow、worker、workbench 和 articleDraft 恢复 contract。
- [x] App Server 包解析 / 投影从 `local_data_source/agent_apps` 抽到 `agent_app_packages`，`local_data_source` 只保留 installed state / uninstall / 本地持久化委托。
- [ ] normalizer 继续补齐 skills / subagents / CLI / connectors / hooks 的内容级读取，而不是只投影路径和引用。
- [ ] 插件中心详情页展示 subagents、skills、CLI、connectors、hooks、授权和可用性。
- [ ] 移除内容工厂专属 hard code 和旧临时字段依赖。

### P3：输入栏与激活

状态：基础链路完成，编排 metadata 继续补强

- [x] 输入建议读取 installed plugin contract。
- [x] 未安装时不硬编码内容工厂候选。
- [x] `@写文章` / `@写作` 从安装态插件包 activation entries 映射到 `content_article_generate`。
- [x] 发送时写入 plugin activation metadata，且不回流旧 `writing_runtime`。
- [x] metadata 包含 workflow、subagents、skill refs 和 default prompts。
- [x] metadata 包含 CLI refs、connector refs、hook policy 和 runtime registry 路径。

### P4：通用 ArtifactFrame 与右侧 Article Editor

状态：基础可编辑主链已完成；右侧 Article Editor 已按原型调整为文章画布优先的可编辑工作区，编辑稿持久化、刷新和历史恢复已通过 Electron fixture 验证

- [x] 右侧 Artifact Workbench 和 plugin workspace 基础路径已有。
- [x] 内容工厂 articleDraft object / workspace patch 基础路径已有。
- [x] 补充 `ArtifactFrame(articleArtifacts renderer)` -> Article Editor 静态 HTML 原型，先确认产品方向。
- [x] 清理前一版把完整文章塞进非文章编辑器面板的偏航实现。
- [x] 新增通用 `ArtifactFrame` shell：从 artifact contract 选择 renderer，支持文章、图片集、表格、演示稿、网页、报告等后续产物框。
- [x] 新增通用 `artifact frame registry`：文章先作为首个 renderer，后续 artifact 只需注册自己的 renderer 与 matcher，不必改主列表分发。
- [x] 新增 `articleArtifacts` renderer：从 articleDraft / worker artifact 在框内流式输出完整文章，不落到普通 assistant message。
- [x] 新增 Article Editor renderer：右侧显示可编辑正文、工具条、结构、引用、配图规划和动作。
- [x] Article Editor 正文画布独立为 Tiptap 组件，避免继续膨胀右侧工作台主文件。
- [x] Article Editor 后续 action 携带当前本地编辑 Markdown，避免改写 / 导出丢失画布内编辑上下文。
- [x] `ArtifactFrame` 点击后打开 Article Editor，不再以 `right_surface_article_workspace` 作为用户可见入口。
- [x] 文章 renderer 改为专用文章产物框：展示写作过程、完整正文容器和右侧编辑器入口，不再显示成通用 Document 文件卡。
- [x] 多个 articleDraft 并存时，聊天产物框和右侧 Article Editor 默认选择多轮检索后的最终稿，不再被初始短草稿覆盖。
- [x] Article Editor 会话内编辑正文覆盖当前 selected articleDraft，后续 action / 预览默认携带当前画布 Markdown。
- [x] Article Editor 编辑内容通过 `agentSession/update.articleWorkspaceEditedDraft` 持久写回 App Server read model，后续读取优先使用最新编辑正文。
- [x] Article Editor 布局改为“主文章画布 + 辅助资料栏”：窄右栏默认单栏防变形，宽面板自动展开为画布 / 资料双栏；大纲、检索、引用、配图、标题候选、写作计划进入辅助栏。
- [x] 补刷新 / 历史恢复 E2E，证明 persisted `articleWorkspaceEditedDraft` 可跨 Electron 重启恢复到 Article Editor。
- [x] Playwright / Electron fixture 真实点击验证：聊天出现独立产物框，框内输出完整文章，点击展开右侧 articleDraft Article Editor。

### P5：真实 workflow 执行质量

状态：基础 worker dogfood 已跑通；worker 已输出 host 可执行检索请求、pending 检索证据、审稿清单和配图规划，宿主已回填真实检索 evidence，文章失败态已 fail closed

- [x] 内容工厂 worker 拆出 `article-planning.mjs`，入口 worker 降到 800 行以下。
- [x] fixture worker 输出 research -> strategy -> draft -> review -> image plan 的结构化写作对象。
- [x] 多轮检索 evidence 已进入 articleDraft metadata，并在聊天产物框与右侧 Article Editor 可见。
- [x] `articleDraft` / `workerEvidence` 输出 `searchRequests`、`searchEvidence`、`reviewChecklist` 和 `imagePlan`。
- [x] 宿主 connector / tool timeline 执行 `searchRequests` 并把真实 evidence 回填到 articleDraft metadata。
- [x] 写作失败时不产出假 articleDraft。
- [x] 审稿和配图规划进入 articleDraft metadata。

### P6：历史恢复

状态：完成；articleDraft / 编辑稿恢复、对象优先级和边缘 fallback 已收口

- [x] 历史打开时优先恢复 selected articleDraft。
- [x] 无 selected 时恢复 primary articleDraft。
- [x] 只在没有 plugin workspace / artifact 时回退聊天。
- [x] 补内容工厂专属历史恢复 E2E，覆盖 `articleWorkspaceEditedDraft` 写回、刷新和历史恢复。

### P7：云端控制面同步

状态：稍后处理

当前判断：不在本轮同步修改 `/Users/coso/Documents/dev/ai/limecloud/limecore`。

原因：

- 宿主 `plugin.json` 安装链、runtime / workbench 投影、内容工厂 `@写文章` E2E 还在收敛中；服务端此时跟进会提前固化半成品合同。
- 服务端当前边界是 catalog、release metadata、tenant enablement、license / registration、package URL / hash 下发，不执行插件 worker，不渲染 Article Editor，不托管 UI runtime。
- `manifestHash` 已规划为投影后的 Agent App manifest hash，`packageHash` 已规划为包内容 hash；这两个口径必须先在宿主本地 fetch / install / review 链路稳定。
- 内容工厂当前主风险在客户端主链：已安装插件可见、`@写文章` 激活、独立 ArtifactFrame、右侧 Article Editor、多轮搜索后写作。先改服务端不能直接证明这些主风险收口。

本阶段服务端分类：

- `current`：继续保持云端控制面，只负责可见性、授权、release metadata 和包引用下发。
- `deferred`：v1 package upload 校验、release summary、OpenAPI / SDK / 类型同步。
- `dead`：在服务端新增插件 worker 执行、UI runtime 托管、Article Editor 渲染或 `/agent-apps/*/run` 路由。

后续进入条件：

- 宿主 `agentAppLocalPackage/inspect`、`agentAppPackage/fetchCloud` 和前端 install review 均稳定只认 `plugin.json`。
- Lime Plugin Package v1 的 `manifestHash` 口径固定为投影后的 Agent App manifest hash，`packageHash` 口径固定为包内容 hash。
- 内容工厂外部包完成 v1 validator、sample runtime、local install 和 `@写文章` E2E。

服务端待办：

- [ ] 平台 package upload 校验 zip / lapp 中必须存在唯一 `plugin.json`。
- [ ] release metadata / manifestSummary 从旧 Agent App 摘要迁到 Lime Plugin Package v1 摘要。
- [ ] `content-factory-app` seeded catalog 指向 v1 package 版本和新 hash。
- [ ] 未激活注册码时继续不下发 package URL / hash，避免本地绕过企业定制授权。
- [ ] API client、OpenAPI、docs 和 contract tests 同步 v1 字段。
- [ ] 保持 LimeCore 不执行插件 worker、不托管 UI runtime、不新增 `/agent-apps/*/run`。

## 4. 验证入口

### 内容工厂外部包

```bash
npm test
npm run runtime:sample
npm run validate:app
npm run cli:inspect
```

### Lime 定向测试

```bash
npx vitest run \
  src/features/plugin/manifest/pluginContract.unit.test.ts \
  src/components/agent/chat/workspace/workspacePluginInputSuggestions.unit.test.ts \
  src/components/agent/chat/workspace/workspacePluginActivation.unit.test.ts \
  src/features/plugin/marketplace/pluginMarketplaceViewModel.unit.test.ts
```

### Lime GUI / Playwright

```bash
npm run verify:gui-smoke
```

Playwright 真实交互用例：

1. 打开插件中心。
2. 确认未登录云端时本地内容工厂仍可见。
3. 查看内容工厂详情页，确认 subagents / tools / skills 可见。
4. 回到 Claw 输入框。
5. 输入 `@写文章 写一篇关于 AI Agent 工作流的文章`。
6. 确认输入建议来自内容工厂。
7. 发送后确认不是普通聊天正文长文，而是独立 `ArtifactFrame`。
8. 确认文章正文在框内流式输出，点击产物框后右侧 Article Editor 展开。

最新证据：

- `2026-06-29`：`npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --timeout-ms 180000` 通过。
- 证据文件：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。
- 关键 GUI 证据：聊天区 `article-artifact-frame` 显示“文章产物 / 完整正文 / 正文草稿 / 展开右侧编辑器”，且 `contentFactoryArticleWorkspaceArtifactFrame.hasWorkerResearchText = true`、`hasWorkerDraftText = true`；点击后 `contentFactoryArticleWorkspaceRightSurface.activeSurface = articleWorkspace`、`rootVisible = true`、`canvasVisible = true`、`hasLoadedDraftStatus = true`、`hasWorkerResearchText = true`、`hasWorkerDraftText = true`。
- 关键 read model 证据：`contentFactoryArticleWorkspaceReadModel.workerArticleObject.researchRoundCount >= 3`、`markdownIncludesResearch = true`、`markdownIncludesDraft = true`、`imageSlotCount >= 3`。
- `2026-06-29`：Article Editor 本地编辑覆盖层已补单测，后续 action 会携带当前画布 Markdown；`npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --timeout-ms 180000` 继续通过。
- `2026-06-29`：Article Editor 编辑正文写回 App Server current `agentSession/update.articleWorkspaceEditedDraft`，read model 重建 `article_workspace` 时覆盖匹配 `articleDraft.source.markdown`，保留 research / outline / citations / image slots 等 worker metadata。
- `2026-06-29`：Article Editor UI 从纵向信息卡堆叠改成原型化编辑工作区：主列显示 Tiptap 正文画布，辅助栏承载动作、结构、检索、引用、配图和关联产物；CSS 使用容器查询，窄右栏单栏防止变形，宽面板自动切换双栏。
- `2026-06-29`：内容工厂 worker 拆出 `src/runtime/article-planning.mjs`，`articleDraft.source`、`workerEvidence` 和 `imageGenerationSet.source` 同步输出 `searchRequests`、`searchEvidence`、`reviewChecklist`、`imagePlan`；外部插件包 `npm test`、`npm run runtime:sample`、`npm run validate:app`、`npm run cli:inspect` 通过，宿主 fixture 与 contract/unit 回归通过。
- `2026-06-29`：Electron fixture 验证 `E2E_EDITED_ARTICLE_DRAFT_RESTORED` 出现在聊天产物框、右侧 Tiptap canvas 和 read model，证明编辑稿可刷新 / 历史恢复。
- `2026-06-29 16:43`：重跑 `npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --timeout-ms 180000` 通过；summary session=`claw-chat-current-1782722594659-2154`，`contentFactoryArticleWorkspaceEditedDraftRestored = true`，`noConsoleErrors = true`，`appServerJsonRpcUsed = true`，`liveProviderNotUsed = true`。
- `2026-06-29 16:45`：重跑外部插件包 `npm test` / `npm run runtime:sample` / `npm run validate:app` / `npm run cli:inspect` 通过；宿主 `contentFactoryWorkerContract`、`contentFactoryWorkspacePatch`、`workspaceArticleWorkspaceModel`、`workspaceArticleWorkspaceMessageArtifacts`、`MessageArtifactCards`、`artifactFrameRegistry` 定向回归通过。
- `2026-06-29`：历史恢复 fallback 已收口：`artifactRefs` 统一从顶层 snapshot、selected / primary object ref 和 plugin workspace object 聚合；只有没有 plugin workspace / object / artifact 时才进入纯聊天。定向回归 `pluginHistoryRestore`、`workspacePluginHistoryRestoreRuntime`、`workspacePluginHistoryRestoreLanding`、`workspacePluginHistoryRestoreArtifacts` 通过。

## 5. 剩余缺口优先级

| 优先级 | 缺口                                                | 原因                                                              |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| P1     | LimeCore v1 package release 同步                    | 宿主闭环稳定后再改云端控制面，避免服务端提前固化半成品合同。      |
| P2     | 图片 workflow 深化                                  | 当前已有配图规划 metadata，真实图片任务、slot 回填和编辑器动作仍需深化。 |
| P0     | `searchRequests` -> host connector / tool timeline 回填真实 evidence | 当前 fixture worker 已声明 host 可执行检索请求；宿主真实检索已接通，后续关注失败策略与回填收敛。 |

## 6. 完成判定

MVP 只有在以下条件同时满足时才算完成：

- `@写文章` 来自内容工厂已安装插件。
- request metadata 带完整 workflow orchestration。
- runtime 产生 articleDraft artifact / workspace patch。
- 聊天出现独立 `ArtifactFrame`，完整文章在框内流式输出。
- 点击产物框展开右侧 Article Editor。
- Playwright 通过真实点击验证上述路径。

## 7. 禁止事项

- 不新增宿主内置 `writing_runtime` 作为 `@写文章` 主入口。
- 不在 `browserTaskRequirement.ts` 或类似工具里继续 hard code 内容工厂。
- 不为未安装内容工厂提供假入口。
- 不把完整文章塞进 assistant message。
- 不把非文章编辑器面板当文章编辑器。
- 不绕过内容工厂插件 workflow 直接调 provider。
