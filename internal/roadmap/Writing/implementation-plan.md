# Writing 实施计划

更新时间：2026-06-28  
状态：In Progress

## 1. 当前主目标

把写文章从宿主硬编码入口收敛为 Lime Plugin Package v1 下的内容工厂插件 workflow，并完成最小可用闭环：

```text
已安装内容工厂插件包 -> @写文章 -> content_article_workflow -> 小产物卡 -> 右侧 Product Profile
```

## 2. 当前状态

- 已有内容工厂外部包、runtime yaml、workbench yaml、worker、skills 和基础 workflow，是迁移输入。
- 已有宿主 plugin contract、输入栏候选、activation metadata、Product Profile 基础路径，是迁移输入。
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
- [x] `app.workbench.yaml` 使用 v1 骨架声明 `articleDraft` Product Profile。
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
- [x] 本地 / 云包 inspect 从 `plugin.json` 读取 runtime / workbench，并投影 activation entries、workflow、worker、workbench 和 Product Profile 恢复 contract。
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

### P4：文章产物卡与右侧 Product Profile

状态：单元链路完成，真实 GUI / Playwright 待验证

- [x] 右侧 Product Profile 和 plugin workspace 基础路径已有。
- [x] 内容工厂 articleDraft object / workspace patch 基础路径已有。
- [x] 聊天消息区稳定显示“文章小产物卡”，不展示整篇正文；卡片摘要改为结构化 facts + i18n 展示，避免在 artifact 生成层写死中文。
- [x] 小产物卡点击后沿 `openedFrom=right_surface_product_profile` 传递 Product Profile artifact，单元链路覆盖右侧展开入口。
- [ ] Product Profile 展示正文、结构、引用、配图规划和动作。
- [ ] Playwright 真实点击验证：`@写文章` 发送后聊天只显示小产物卡，点击卡片展开右侧 articleDraft。

### P5：真实 workflow 执行质量

状态：待完成

- [ ] worker / runtime 明确执行 research -> strategy -> draft -> edit -> image plan。
- [ ] 多轮搜索 evidence 可见。
- [ ] 写作失败时不产出假 articleDraft。
- [ ] 审稿和配图规划进入 articleDraft metadata。

### P6：历史恢复

状态：待完成

- [ ] 历史打开时优先恢复 selected articleDraft。
- [ ] 无 selected 时恢复 primary articleDraft。
- [ ] 只在没有 plugin workspace / artifact 时回退聊天。
- [ ] 补内容工厂专属历史恢复 E2E。

### P7：云端控制面同步

状态：稍后处理

当前判断：不在本轮同步修改 `/Users/coso/Documents/dev/ai/limecloud/limecore`。

原因：

- 宿主 `plugin.json` 安装链、runtime / workbench 投影、内容工厂 `@写文章` E2E 还在收敛中；服务端此时跟进会提前固化半成品合同。
- 服务端当前边界是 catalog、release metadata、tenant enablement、license / registration、package URL / hash 下发，不执行插件 worker，不渲染 Product Profile，不托管 UI runtime。
- `manifestHash` 已规划为投影后的 Agent App manifest hash，`packageHash` 已规划为包内容 hash；这两个口径必须先在宿主本地 fetch / install / review 链路稳定。
- 内容工厂当前主风险在客户端主链：已安装插件可见、`@写文章` 激活、小产物卡、右侧 Product Profile、多轮搜索后写作。先改服务端不能直接证明这些主风险收口。

本阶段服务端分类：

- `current`：继续保持云端控制面，只负责可见性、授权、release metadata 和包引用下发。
- `deferred`：v1 package upload 校验、release summary、OpenAPI / SDK / 类型同步。
- `dead`：在服务端新增插件 worker 执行、UI runtime 托管、Product Profile 渲染或 `/agent-apps/*/run` 路由。

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
7. 发送后确认不是聊天正文长文，而是小产物卡。
8. 点击卡片，确认右侧 Product Profile 展开。

## 5. 剩余缺口优先级

| 优先级 | 缺口 | 原因 |
| --- | --- | --- |
| P0 | 小产物卡和右侧展开真实 E2E | 用户明确要求“内容在小框中输出，点击展开右边栏”。 |
| P0 | worker 多轮搜索后再写作 | 用户明确要求“通过几轮搜索之后再写”。 |
| P1 | 历史恢复 articleDraft | 写作结果必须可继续工作。 |
| P1 | Product Profile 文章动作 | 继续改写、生成配图、导出是内容工厂价值闭环。 |
| P1 | LimeCore v1 package release 同步 | 宿主闭环稳定后再改云端控制面，避免服务端提前固化半成品合同。 |
| P2 | 图片 workflow 深化 | 本轮聚焦写文章，配图可作为下一阶段。 |

## 6. 完成判定

MVP 只有在以下条件同时满足时才算完成：

- `@写文章` 来自内容工厂已安装插件。
- request metadata 带完整 workflow orchestration。
- runtime 产生 articleDraft artifact / workspace patch。
- 聊天只显示小产物卡。
- 点击卡片展开右侧 Product Profile。
- Playwright 通过真实点击验证上述路径。

## 7. 禁止事项

- 不新增宿主内置 `writing_runtime` 作为 `@写文章` 主入口。
- 不在 `browserTaskRequirement.ts` 或类似工具里继续 hard code 内容工厂。
- 不为未安装内容工厂提供假入口。
- 不把完整文章塞进 assistant message。
- 不绕过内容工厂插件 workflow 直接调 provider。
