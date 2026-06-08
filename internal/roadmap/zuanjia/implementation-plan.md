# 专家功能客户端实施计划

更新时间：2026-05-15

## 一句话结论

先用本地 fixture 跑通“专家广场 → 详情 → 添加 → 专家对话”闭环，再接 LimeCore 云目录；不要先做运营后台、付费市场或第二套 Agent Runtime。

## 当前进度

2026-05-15：P0-P4 已落第一版。已新增 `src/features/experts/**`、专家广场入口、详情/添加 overlay、专家对话运行时 metadata 绑定、LimeCore `client/experts` 云目录同步、五语言文案和定向回归。下一刀进入 GUI smoke / 交互续测与 P5 运营事件、榜单质量闭环。

2026-05-15 收口验证：通用 `npm run verify:gui-smoke -- --reuse-running` 已通过；补充本地 Playwright 真实交互验证“专家广场 → 搜索营销策略专家 → 打开详情 → 添加专家 → 开始对话”，捕获到 `agent_runtime_submit_turn`，且 `turn_config.metadata.expert.expertId` 与 `metadata.harness.expert.expert_id` 均为 `marketing-strategist`，控制台 error 为 0。已验证海洋浅色 / 霓虹深色主题下主按钮跟随 Lime 主题且不是黑色，`390x780` 视口可纵向滚动且无横向溢出。P0-P4 current 主链达到可交付门槛；后续只剩 P5 运营事件、榜单质量与对话内固定专家信息面板增强。

2026-05-15 右侧专家信息面板补齐：已在 Agent 对话工作台 `WorkspaceShellScene` 增加可选右侧 rail，并用 `ExpertInfoPanel` 消费 `initialRequestMetadata / initialAutoSendRequestMetadata` 中的 `expert` / `harness.expert`。专家入口启动后右侧固定显示“专家信息、简介、记忆、日记、技能、工作流程”，内容来自云目录缓存或 seeded catalog 投影；面板只读展示，不创建第二套 runtime，也不把私有对话写回公共专家目录。

2026-05-15 面板验证：新增 `WorkspaceShellScene` right rail 回归与 `AgentChatPage` 专家首发回归，确认尚无会话时也能自动创建发送计划、保留 `skipSessionRestore` 和专家 metadata，并渲染 `expert-info-panel / memory / skills / workflow`。本地 Playwright 真实交互已复走“专家 → 搜索营销 → 详情 → 添加 → 开始对话 → 右侧专家信息面板”，同时验证 `390x780` 专家广场可滚动且无横向溢出、专家开始按钮不为黑色、`agent_runtime_submit_turn` metadata 仍为 `marketing-strategist`。证据写入 `.lime/e2e/expert-panel/expert-panel-e2e-summary.json`。

2026-05-15 技能添加补齐：右侧 `ExpertInfoPanel` 的“技能”区已从静态标签升级为可添加入口。点击 `+` 会打开实体底色技能选择弹窗，候选合并当前本地 Lime Skills、服务技能目录和 seeded Skill Catalog；添加后即时出现在当前专家面板，并把合并后的 `skillRefs` 写入后续 workspace request metadata 的 `expert.skillRefs` 与 `harness.expert.skill_refs`，不新增第二套 runtime 或 Tauri command。

2026-05-15 P5 运营事件补齐：客户端新增 `expertAnalytics`，专家广场会在云目录专家上记录曝光、详情打开、添加和开始对话事件，批量上报到 LimeCore `POST /client/experts/events`；无会话但已有 OEM 云端上下文时进入本地队列，网络恢复后 `flushExpertCatalogEvents` 可补发。事件仅包含 expert / release / surface / catalogVersion / locale / metadata 等运营字段，主动过滤 `prompt / message / response / fileContent / memory / conversation`，不把用户内容、助手回复、文件或私有记忆写入统计。

2026-05-15 专家 Agent 身份层补齐：客户端新增 `ExpertAgentInstance` 本地事实源与 LimeCore 同步入口，同一 `tenantId + expertId + releaseId` 默认恢复最近 `latestSessionId`，只有详情里的“新对话”显式创建新会话。`ExpertPlazaPage` 会从云端拉取 active 实例并合并本地 fallback；`AgentChatWorkspace` 在 sessionId 出现和右侧技能变更时回写实例，确保重复点击专家不再自动发送首条 prompt，也不再重复创建 chat。

2026-05-15 详情弹窗视觉收口：专家详情侧栏按钮从纵向 flex 膨胀改为固定 48px 高的主题按钮组，主按钮使用 Lime 青绿渐变，次按钮使用实体白底描边；详情弹窗宽度收为 `980px` 级工作台浮层，右侧背景回到低饱和 Lime 主题色，禁止黑色按钮并保持多主题变量。

2026-05-15 测试限制：Playwright MCP 工具当前返回 `Transport closed`，无法用 MCP 通道复走同一 GUI 流程；已用本地 Playwright + 真实 DevBridge 补等价交互验证，并在 request 侧捕获 `agent_runtime_submit_turn` metadata。MCP 服务恢复后需优先复走同一路径作为最终 MCP 证据。

## P0：文档与本地 fixture

目标：固定对象模型和本地样本，避免后续 UI 与云契约漂移。

交付：

- 新增专家本地 fixture，覆盖推荐、热门、上新、分类和详情样例。
- 新增 `ExpertProfile` parser / projection 单测。
- 明确 `personaRef`、`memoryTemplateRef`、`skillRefs`、`workflowRefs` 的引用格式。
- seeded fallback 至少包含 6 个专家：营销策略、资料整理、代码文学、短视频脚本、法务合同、数据分析。

验收：

- parser 能拒绝缺少 `id/title/personaRef/releaseId` 的无效专家。
- projection 能合并 ranking、category、stats 和 install overlay。
- 文档与 fixture 中不出现云端执行专家对话的描述。

## P1：本地专家广场 MVP

目标：用户能在桌面 GUI 中浏览和筛选专家。

交付：

- 新增专家广场入口。
- 渲染三块榜单、分类筛选、搜索框、专家卡片网格。
- 卡片支持未添加 / 已添加 / 依赖缺失状态。
- 补组件测试覆盖分类、搜索、榜单和空态。

设计约束：

- 页面使用卡片型列表工作台布局。
- 不引入高饱和营销背景。
- 搜索和分类是独立筛选区，不挤在标题行。

## P2：详情与添加闭环

目标：用户能理解专家能力并添加到本地。

交付：

- 新增专家详情大浮层。
- 展示简介、showcase、技能标签、工作流摘要、使用量、点赞、添加和分享入口。
- 实现 `ExpertInstallOverlay` 本地存储。
- 添加后更新广场状态和会话侧边栏入口。

验收：

- 删除 overlay 后，专家回到未添加状态。
- 云目录对象不因用户添加而被修改。
- 已添加专家能保留最近使用时间。

## P3：专家对话运行时绑定

目标：添加专家后能启动真实 Agent Runtime 会话。

交付：

- 新增 `expertRuntimeBinding`，把专家引用转成现有 turn context 输入。
- 会话首屏显示专家欢迎语和 starter prompts。
- 右侧专家信息面板展示简介、记忆、日记、技能、工作流程。
- `skillRefs` 接入现有 Skill Catalog 解析；缺失时显示 readiness。
- `memoryTemplateRef` 接入现有 memory source / compaction 边界。

验收：

- 专家会话仍调用 `agent_runtime_submit_turn`。
- 同一专家可创建多个普通会话，历史消息不写回公共专家目录。
- 禁用专家记忆后，首轮 prompt 不包含该专家 memory template。

## P4：LimeCore 云目录同步

目标：用云端目录替换本地 fixture 作为 current 事实源，保留 seeded fallback。

交付：

- 接入 `bootstrap.expertCatalog` 或 `client/experts`。
- 实现目录缓存、版本号、release hash、刷新和错误回退。
- 支持租户可见性、下架、灰度和默认推荐。
- 对目录请求失败、hash 不一致、release 下架补 UI 状态。

验收：

- 离线时可打开上次缓存专家广场。
- 云端禁用某专家后，新用户不可见，已安装用户看到下架提示。
- 客户端不依赖云端执行专家任务。

## P5：榜单与运营质量闭环

目标：专家广场具备可运营的发现和质量信号。

交付：

- 展示推荐榜、热门榜、最近上新和分类榜单。
- 上传聚合事件：曝光、详情打开、添加、会话启动、点赞、分享。
- 支持榜单快照刷新和本地缓存。
- 增加专家详情质量字段：适用场景、边界、依赖、版本说明。

验收：

- 统计事件不携带用户 prompt、回复、文件内容和私有记忆。
- 榜单排序缺失时仍可按 category / updatedAt 降级展示。

## 文件边界

优先新增独立模块，不向大文件堆逻辑：

```text
src/features/experts/**
src/components/experts/**
src/i18n/resources/*/agentExperts.json 或现有 agent namespace
```

专家能力不得新增 Tauri command wrapper。若后续需要后端事实，走 App Server JSON-RPC / RuntimeCore / services；若需要文件选择、窗口或系统能力，走 Electron Desktop Host bridge。新增 current 命令面必须同步：

```text
src/lib/api/* 网关
Electron Desktop Host bridge 或 App Server JSON-RPC protocol / client
agentCommandCatalog
mockPriorityCommands / defaultMocks
```

## 验收命令

按改动面选择，不无限追加：

```bash
npm run test:contracts
npm run verify:gui-smoke
npm run verify:local
```

GUI 主路径完成后，补 Playwright 续测：

```text
打开专家广场 → 搜索专家 → 打开详情 → 添加专家 → 进入对话 → 验证右侧专家信息栏
```

已执行验证：

```text
npm test -- src/features/experts src/components/experts/ExpertPlazaPage.test.tsx src/components/AppPageContent.test.tsx src/lib/navigation/sidebarNav.test.ts src/components/AppSidebar.test.tsx src/i18n/__tests__/types.test.ts
npm test -- src/components/experts/ExpertPlazaPage.test.tsx
npm test -- src/components/agent/chat/experts/ExpertInfoPanel.test.tsx
npm test -- src/components/agent/chat/index.test.tsx -t 自动首条专家入口
npm test -- src/components/agent/chat/index.test.tsx
npm test -- src/components/agent/chat/workspace/WorkspaceShellScene.test.tsx
npm test -- src/i18n/__tests__/types.test.ts
npm test -- src/features/experts/expertAnalytics.test.ts src/components/experts/ExpertPlazaPage.test.tsx
npm test -- src/features/experts src/components/experts/ExpertPlazaPage.test.tsx src/components/AppPageContent.test.tsx src/components/agent/chat/experts/ExpertInfoPanel.test.tsx
npm run typecheck
npm run verify:gui-smoke
npx prettier --check src/components/agent/chat/experts/ExpertInfoPanel.tsx src/components/agent/chat/experts/ExpertInfoPanel.test.tsx src/components/agent/chat/AgentChatWorkspace.tsx src/i18n/resources/*/agentExperts.json
npm run verify:gui-smoke -- --reuse-running
本地 Playwright 交互脚本：主题切换海洋浅色 / 霓虹深色 → 专家广场主按钮非黑色 → 390x780 滚动 / 无横向溢出
本地 Playwright 交互脚本：专家广场 → 搜索 → 详情 → 添加 overlay → 开始对话 → 捕获 agent_runtime_submit_turn 专家 metadata
本地 Playwright 交互脚本：专家广场 → 搜索营销策略专家 → 详情 → 添加 → 开始对话 → 验证右侧专家信息栏、记忆、日记、技能、工作流程
本地 Playwright 交互脚本：专家广场 → 搜索营销策略专家 → 开始对话 → 右侧技能 + → 添加服务技能 → 下一轮发送 metadata 含 expert.skillRefs / harness.expert.skill_refs，证据 `.lime/e2e/expert-panel/expert-skill-add-e2e-summary.json`
本地 Playwright 交互脚本：预置真实 Agent session → 专家广场继续同一专家 → 验证未触发 `agent_runtime_create_session / agent_runtime_submit_turn` → 右侧技能添加写回 `skillRefsOverride` → 再次点击同一专家仍恢复同一 session → 详情按钮 48px 且非黑色，截图 `test-results/expert-agent-flow.png`
Playwright MCP：当前 Transport closed，待 MCP 恢复后复走
```

当前阻塞：Playwright MCP 服务仍返回 `Transport closed`；已用本地 Playwright + 真实 DevBridge 完成等价 GUI 主路径验证。

## 风险控制

| 风险                         | 控制                                       |
| ---------------------------- | ------------------------------------------ |
| 专家变成第二套 Agent Runtime | 启动会话只走 `agent_runtime_submit_turn`。 |
| 专家复制 Skill 定义          | `skillRefs` 只引用 Skill Catalog。         |
| 市场页先行污染主路径         | P0-P3 先本地闭环，P4 再接云目录。          |
| 私有数据进入公共目录         | 公共目录只存 metadata 和 refs。            |
| UI 看起来像网页市场          | 按 Lime 卡片型工作台和桌面设计语言收口。   |
