# Lime 测试分层路线图

## 背景

当前 `npm test` 同时承载纯单元、React/jsdom 组件、DevBridge/Tauri 契约、脚本集成和少量 live-gated 测试。按当前工作区实测，前端完整 Vitest 分批跑完约 `306.95s`，Rust 后端 `cargo test --manifest-path "src-tauri/Cargo.toml"` 约 `11.00s`。这说明 Lime 的主要反馈瓶颈在前端测试分层，而不是 Rust 后端。

本路线图目标是把本地 TDD 反馈环从“全量前端 Vitest”收敛到“快速纯单元 + 定向相关测试”，同时保留 `verify:local`、`test:contracts`、`verify:gui-smoke` 对交付风险的覆盖。

## 原则

1. **单元测试优先测业务逻辑边界** - 前端复杂逻辑应优先沉淀到 View Model / projection / presentation / selector / command planner 等纯函数边界，再用纯单元测试覆盖。
2. **组件测试只测必要契约** - React Testing Library / jsdom 测试只保留关键渲染、可访问性、事件接线和回归点，不承担大段业务状态机验证。
3. **核心用户流交给 GUI smoke / E2E** - 用户必须真实完成的主路径，用 `verify:gui-smoke`、Playwright 或已有产品 E2E 验证，不把完整流程塞进单个组件测试。
4. **不引入重 MVVM 框架** - Lime 继续使用现有 React + projection/helper 模式；View Model 是测试边界，不是新的运行时框架。
5. **先分层入口，再逐步迁移** - 第一阶段不批量重命名 800+ 测试文件，先用 runner 分类和显式脚本形成反馈环；后续再按热点迁移。

## 分层定义

| 层级 | 命令 | 覆盖范围 | 本地 TDD 默认 |
| --- | --- | --- | --- |
| Unit | `npm run test:unit` | 纯函数、parser、formatter、projection、presentation、selector、View Model 状态转换 | 是 |
| Component | `npm run test:component` | React/jsdom 组件与 hook 渲染、事件接线、关键 UI 断言 | 按 UI 改动定向跑 |
| Contract | `npm run test:contract` | `safeInvoke`、DevBridge、Tauri mock、command catalog、schema 契约 | 按命令/桥接改动跑 |
| Integration | `npm run test:integration` | 文件系统、子进程、本地 fixture server、多模块脚本流程 | CI 或本地按需 |
| E2E | `npm run test:e2e` | Vitest 内显式 E2E / smoke / live-gated 测试；真实产品主路径仍以 GUI smoke / Playwright 为准 | 默认不进 TDD |
| Frontend All | `npm run test:frontend:all` | 现有前端 Vitest 全量兼容入口 | 交付前/CI |
| Layer Stats | `npm run test:layers:stats` | 按同一分类事实源输出分层统计、默认可运行数和 live-gated 数 | 统计 / 治理 |
| Rust | `npm run test:rust` | Rust workspace 测试 | Rust 改动定向后再全量 |
| GUI Smoke / E2E | `npm run verify:gui-smoke` | Tauri 壳、DevBridge、Workspace、主产品路径 | GUI 主路径改动/交付前 |

## 治理后统计

最后统计时间：2026-05-31。

| 范围 | 命令 | 文件 / 用例 | 实测耗时 | 备注 |
| --- | --- | --- | --- | --- |
| 前端分层统计 | `npm run test:layers:stats` | Vitest 总 `888` 个文件；默认可运行 `887`；live-gated `1` | 统计脚本级 | 同一事实源来自 `scripts/lib/vitest-layer-classifier.mjs` |
| 前端 Unit | `npm run test:unit` | `386` 个文件，`2088` 个 case | `21.68s` | 本地 / AI TDD 默认第一轮信号 |
| Rust 后端 | `cargo test --manifest-path "src-tauri/Cargo.toml"` | `1528` passed，`3` ignored | `13.17s` total | 后端全量测试当前不是主要瓶颈 |

前端 Vitest 当前分层：

| 层级 | 文件数 | 默认可运行 | Live-gated |
| --- | ---: | ---: | ---: |
| Unit | `391` | `391` | `0` |
| Component | `370` | `370` | `0` |
| Contract | `77` | `77` | `0` |
| Integration | `49` | `49` | `0` |
| E2E | `1` | `0` | `1` |

## 前端 View Model 策略

### 适合抽到 View Model 的逻辑

- 从 runtime/session/thread/state 计算 UI 展示模型
- 从用户输入、选中项、Provider 能力推导按钮状态和提交参数
- 消息、工具调用、artifact、task preview 的分组、排序、去重、状态折叠
- 表单草稿、筛选、分页、空态、错误态、loading 态的状态转换
- GUI 事件映射为 command/action 的规划逻辑

### 不应放进 View Model 的内容

- DOM 测量、滚动、焦点、快捷键监听等真实浏览器行为
- Tauri / DevBridge / 文件系统 / 网络调用本身
- 纯视觉布局、CSS、动画细节
- 需要真实壳或真实用户流才能证明的行为

### 测试分配

- VM / projection / selector：大量纯单元测试，作为 TDD 默认反馈环。
- 组件：少量接线测试，证明 VM 输出被正确渲染、关键按钮事件会触发对应 action。
- E2E / smoke：覆盖“用户能完成任务”的主路径，不重复测试 VM 的所有分支。

## 阶段计划

### P0：建立测试分层入口

- 新增 Vitest 分层 runner，支持 `unit/component/contract/integration/e2e`。
- 保留 `npm test` 原语义，新增分层命令，不破坏现有 CI。
- 分类规则先基于文件名和静态特征，避免第一刀批量迁移测试文件。
- 完成标准：`npm run test:unit -- --list` 能快速列出纯单元候选，`npm run test:unit -- <file>` 能运行指定纯单元测试，`npm run test:layers:stats` 能输出治理后统计。

### P1：把 TDD 默认入口切到 Unit

状态：第一刀已完成。

- 在工程文档中明确：AI / 本地 TDD 默认先跑 `npm run test:unit` 和相关文件。
- `verify:local` 继续作为交付入口，不被 `test:unit` 替代。
- 完成标准：普通纯逻辑改动无需跑完整 `npm test` 就能得到第一轮信号。

### P2：热点组件 VM 化

状态：已开始，先从 `AgentChatPage` shell 路由抽取小型 View Model 作为模板。

优先迁移当前耗时和复杂度最高的前端测试：

1. `src/components/agent/chat/index.test.tsx`
2. `src/components/agent/chat/hooks/useAsterAgentChat.test.tsx`
3. `src/components/agent/chat/workspace/*PreviewRuntime.test.tsx`
4. `src/components/agent/chat/components/HarnessStatusPanel.test.tsx`

迁移方式：

- 从大组件/大 hook 中抽出纯 projection、selector、command planner。
- 新增 `*.unit.test.ts` 覆盖状态转换和边界分支。
- 原 `*.test.tsx` 降为少量组件接线测试，或改名为 `*.component.test.tsx`。
- 核心用户路径交给 `verify:gui-smoke` 或 Playwright 续测。

完成标准：`src/components/agent/chat/index.test.tsx` 单文件耗时从约 `55s` 降到可接受范围，且对应 VM 单测进入 `test:unit`。

当前模板：

- `src/components/agent/chat/agentChatPageShellViewModel.ts`：承载 `new-task` 直达工作区意图判断、`claw` 强制切换和聊天面板展示策略。
- `src/components/agent/chat/agentChatPageShellViewModel.unit.test.ts`：覆盖文本、图片、站点技能、服务技能、输入能力、资料包、项目文件和浏览器协助等纯路由分支。
- `src/components/agent/chat/agentChatWorkspaceShellViewModel.ts`：承载工作区 shell 的展示消息、聊天面板、侧栏切换和工作区图片任务恢复策略。
- `src/components/agent/chat/agentChatWorkspaceShellViewModel.unit.test.ts`：覆盖空白首页、执行态、任务中心草稿压制、画布/主题工作台、紧凑工作台和非 `new-task` 入口等纯布局分支。
- `src/components/agent/chat/index.shell-routing.test.tsx`：保留 React 接线层测试，证明 VM 输出被传给 `AgentChatWorkspace`。
- `src/components/agent/chat/components/harnessStatusPanelViewModel.ts`：承载 Harness 状态面板中的状态标签、Badge 变体、工具友好标签、子任务摘要、LimeCore policy 展示和人工审核展示标签等纯 presentation 逻辑。
- `src/components/agent/chat/components/harnessStatusPanelViewModel.unit.test.ts`：覆盖子任务 runtime/session type、工具标签、子任务汇总、浏览器动作状态、LimeCore policy 状态/决策、审核状态/风险/权限/限制等纯展示分支。
- `src/components/agent/chat/hooks/agentChatAutoTitleViewModel.ts`：承载 `useAsterAgentChat` 自动标题中的占位标题判断、assistant 预览标题判断、用户文本存在性判断和标题生成上下文构造。
- `src/components/agent/chat/hooks/agentChatAutoTitleViewModel.unit.test.ts`：覆盖自动标题占位、预览派生标题、是否触发标题生成、用户文本过滤和生成上下文 `1000` 字符裁剪。
- `src/components/agent/chat/utils/submitOpRuntimeCompaction.ts`：承载 turn submit 前的 provider/model、execution strategy、thinking、web_search、access mode 与 Harness metadata 去重事实源，避免通过重 hook 测试间接验证纯配置裁剪。
- `src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts`：覆盖 runtime / synced preference 已承接时裁掉重复字段、未同步时保留显式变更、fast response / image routing 特例、team selection 与 access mode metadata 裁剪。
- `src/components/agent/chat/hooks/agentSessionTopicViewModel.ts`：承载 `useAgentSession` 中 topic/session detail 映射、runtime thread 状态判定、topic upsert 排序、新建 session 草稿插入、远端校验 session 补入、execution strategy 写回、live snapshot 写回 reducer、transient messages/turns/items tail selector，以及 restore candidate 工作区隔离清洗计划。
- `src/components/agent/chat/hooks/agentSessionTopicViewModel.unit.test.ts`：覆盖自动恢复运行态、queued/waiting/failed 状态映射、排队预览、topic 本地 pin/unread/tag 保留、新建 session 草稿插入 / 去重、远端校验 session 补入 / 已存在复用、execution strategy 写回、live snapshot 写回 / 无变化复用、transient 历史窗口裁剪，以及 restore candidate 空值/辅助会话/旧默认工作区/跨工作区/合法映射清洗。
- `src/components/agent/chat/hooks/agentSessionRestoreViewModel.ts`：承载 `useAgentSession` 中工作区切换 / 恢复时从 transient storage 与 cached snapshot 推导首屏 session snapshot、timeline、历史窗口和缓存快照打点上下文的纯状态逻辑。
- `src/components/agent/chat/hooks/agentSessionRestoreViewModel.unit.test.ts`：覆盖直接使用 cached snapshot、合并 cached/transient messages、timeline 回退、current turn 优先级、scoped snapshot 规范化，以及 cached topic snapshot 的历史窗口和 metric context 派生。
- `src/components/agent/chat/hooks/agentSessionState.ts`：承载 session snapshot / hydration 状态转换、detail hydration 策略、restorable topic 选择，以及当前会话缺失于 topics 时清空 / 跳过 / 远程校验的纯决策。
- `src/components/agent/chat/hooks/agentSessionState.test.ts`：覆盖空会话快照、恢复目标选择、detail hydration 延后策略、同会话 hydration 合并，以及 missing session from topics 的 inactive / detached / auxiliary / remote verify 分支。
- `src/components/agent/chat/hooks/sessionSwitchSnapshotController.ts`：承载 topic switch 中 cached snapshot 加载 / 应用 / 刷新策略计划、defer hydration 状态计划、pending shell 状态计划、切换开始状态重置计划、切换指标上下文，以及 in-flight switch 复用的纯决策。
- `src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts`：覆盖 cached snapshot 命中、pending shell、指标上下文、缓存读取 / 应用 / 立即刷新策略、defer hydration 直接/延迟加载模式、pending shell 空会话壳策略、切换开始状态计划，以及普通同 topic 切换可复用 / 强刷 / 自动恢复 / detached / session start hooks 禁止复用分支。
- `src/components/agent/chat/hooks/sessionFinalizeController.ts`：承载会话 detail finalize 阶段的 workspace restore 拒绝、执行策略 fallback / override，以及成功 finalize 后 restore/hydration 状态收尾计划。
- `src/components/agent/chat/hooks/sessionFinalizeController.test.ts`：覆盖 known workspace 解析、跨 workspace 拒绝上下文、shadow execution strategy fallback、最终 execution strategy override，以及 finalize 成功后的状态收尾计划。
- `src/components/agent/chat/hooks/sessionMetadataSyncController.ts`：承载 finalize 成功路径中的 metadata sync 输入选择、access mode / provider / execution strategy patch 规划、本地状态应用计划、metadata sync 成功应用计划、topic execution strategy 回填 reducer、switch success 指标上下文和 metadata sync 执行 fallback。
- `src/components/agent/chat/hooks/sessionMetadataSyncController.test.ts`：覆盖 runtime provider preference 优先级、session storage preference fallback、runtime metadata 无回填、session storage / workspace default patch、finalize 本地状态应用计划、metadata sync 成功应用计划、topic execution strategy 回填 reducer、switch success metric 和 metadata sync runtime fallback。
- `src/components/agent/chat/hooks/sessionPostFinalizePersistenceController.ts`：承载 finalize 成功后的 workspace 持久化、topic workspace 回填、provider preference 应用、副作用应用入口计划和 topic workspace 回填 reducer。
- `src/components/agent/chat/hooks/sessionPostFinalizePersistenceController.test.ts`：覆盖 topic workspace 解析顺序、持久化 workspace 解析、post finalize persistence plan、副作用 apply plan 和 runtime workspace 回填 reducer。
- `src/components/agent/chat/hooks/agentChatActionState.ts`：承载 action_required 写入 assistant 消息、确认提交后在 pending action / submitted in-flight / message actionRequests / contentParts / runtime status 之间同步状态、fallback ask 回答排队和真实 request 匹配，以及 replay request 结果到 ActionRequired 的纯 reducer / planner / mapper。
- `src/components/agent/chat/hooks/agentChatActionState.unit.test.ts`：覆盖 ask/elicitation 提交后保留 submitted 面板、tool confirmation 确认后移除请求、未命中 requestId 不污染消息、submitted in-flight upsert / 清理、fallback ask 排队、同 assistant 消息真实请求匹配、queued 状态同步，以及 replay request questions/options/scope 映射。

后续迁移要求：

- 每次从重组件测试中抽出一个 VM / projection / selector，都要补一个 `*.unit.test.ts`。
- 原 `*.test.tsx` 只保留关键渲染和事件接线，不重复覆盖 VM 的所有分支。
- 若 unit 层测试依赖真实 `setTimeout`、idle callback、DOM 或浏览器全局，应优先改成可控调度器或移入 component / integration 层。

### P3：命名和 CI 收敛

- 新增或迁移测试时使用后缀：
  - `*.unit.test.ts`
  - `*.component.test.tsx`
  - `*.contract.test.ts`
  - `*.integration.test.ts`
  - `*.e2e.test.ts`
  - `*.live.test.ts`
- `*.live.test.ts` 归入 E2E 层，但默认受 live Provider gate 排除；必须显式设置 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1` / `LIME_REAL_API_TEST=1` 才会进入默认可运行集合。
- CI 快速门禁跑 `lint`、`typecheck`、`test:unit`、`test:contract`。
- main / release 门禁继续跑 `test:frontend:all`、`test:rust`、`verify:gui-smoke`。

## 风险与边界

- `test:unit` 不是交付证明，只是 TDD 快速反馈。
- GUI 产品改动仍必须按 `internal/aiprompts/quality-workflow.md` 补 GUI smoke / E2E。
- 迁移测试时不能为了追求纯单元而删除真实回归覆盖；应先把覆盖迁到 VM 或 E2E 后再删重组件断言。
- live Provider 测试继续保持显式 opt-in，不进入默认单元测试。

## 进度日志

- 2026-05-31：记录测试分层目标、前端 VM 策略与阶段计划。当前第一刀目标是新增分层 runner 和 npm 入口，不改现有 `npm test` 语义。
- 2026-05-31：P0 第一刀完成。新增 `test:unit`、`test:component`、`test:contract`、`test:integration`、`test:frontend:all`；`npm run test:unit` 当前筛出 `384` 个文件、`2072` 个 case，实测 `20.62s` 通过。`npm run test:contract -- src/lib/dev-bridge/http-client.test.ts` 实测 `27` 个 case，`0.70s` 通过。当前 `test:unit` 为稳定入口仍沿用默认 jsdom 环境；纯 Node VM 单测收敛放到 P2 迁移阶段。
- 2026-05-31：P1 第一刀完成。`internal/aiprompts/quality-workflow.md` 与 `internal/test/unit-tests.md` 已把本地 / AI TDD 默认入口收敛到 `npm run test:unit`，同时明确它不是 `verify:local`、`test:contracts`、`verify:gui-smoke` 的替代品。
- 2026-05-31：P2 第一刀完成。抽取 `agentChatPageShellViewModel`，新增 `agentChatPageShellViewModel.unit.test.ts`，将 `AgentChatPage` 的 `new-task` 直达工作区 shell 路由判断落到纯 VM 单测；`npm run test:unit -- src/components/agent/chat/agentChatPageShellViewModel.unit.test.ts` 实测 `8` 个 case，约 `0.73s` 通过；`npm run test:component -- src/components/agent/chat/index.shell-routing.test.tsx` 实测 `6` 个 case，约 `0.74s` 通过。
- 2026-05-31：修复 unit 层稳定性缺口。`sessionMetadataSyncScheduler.test.ts` 去掉真实 `setTimeout(0)` 式 promise flush，改为纯 microtask flush，避免 timer 状态泄漏导致伪单元测试超时；完整 `npm run test:unit` 当前筛出 `385` 个文件、`2080` 个 case，实测 `21.43s` 通过。
- 2026-05-31：P0/P3 分层治理收口。新增 `test:e2e` 与 `test:layers:stats`，将 Vitest 分层事实源收敛到 `scripts/lib/vitest-layer-classifier.mjs` 与 `scripts/report-vitest-layers.mjs`。当前 `npm run test:layers:stats` 统计：总 `882` 个 Vitest 文件，默认可运行 `881`，live-gated `1`；分层为 unit `385`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：补齐最终治理统计。最近一次完整 `npm run test:unit` 实测 `385` 个文件、`2080` 个 case、`25.01s` 通过；最近一次 `cargo test --manifest-path "src-tauri/Cargo.toml"` 实测 `13.17s` total，`1528` passed，`3` ignored。
- 2026-05-31：P2 第二刀完成。抽取 `agentChatWorkspaceShellViewModel`，将 `AgentChatWorkspace` 内联的展示消息、聊天面板、侧栏切换和工作区图片任务恢复判断落到纯 VM 单测；`npm run test:unit -- src/components/agent/chat/agentChatWorkspaceShellViewModel.unit.test.ts` 实测 `8` 个 case，约 `0.96s` 通过；`npm run test:component -- src/components/agent/chat/index.test.tsx -t "showChatPanel=false|new-task 执行态"` 实际回归整文件 `120` 个 case，约 `56.43s` 通过。当前 `npm run test:unit` 单独复跑 `386` 个文件、`2088` 个 case，实测 `21.68s` 通过；`npm run test:layers:stats` 统计：总 `883` 个 Vitest 文件，默认可运行 `882`，live-gated `1`；分层为 unit `386`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：修复 unit 层 i18n 状态污染。`agentStreamErrorController.test.ts` 在测试级固定 `zh-CN` locale，避免完整 `test:unit` 中其他 locale 测试污染 402 Provider 友好提示断言；`npm run test:unit -- src/components/agent/chat/hooks/agentStreamErrorController.test.ts` 实测 `15` 个 case 通过。
- 2026-05-31：P2 第二刀 GUI 验证完成。`npm run verify:gui-smoke` 完整通过，包含 `workspace-ready`、`browser-runtime`、`site-adapters`、Service Skill entry、runtime tool surface、页面级 runtime tool surface、code runtime fixture、approval/sandbox、`@` command registry、Agent Apps、Knowledge GUI、design canvas；`claw-chat-ready-streaming` 仍按规则跳过真实 Provider 调用。
- 2026-05-31：P2 第三刀完成。抽取 `harnessStatusPanelViewModel`，将 `HarnessStatusPanel` 中可纯测的状态标签、Badge 变体、工具友好标签、子任务摘要、LimeCore policy 与人工审核展示标签迁移到 VM 单测；`npm run test:unit -- src/components/agent/chat/components/harnessStatusPanelViewModel.unit.test.ts` 实测 `8` 个 case，约 `3.53s` 通过；`npm run test:component -- src/components/agent/chat/components/HarnessStatusPanel.test.tsx` 实测 `49` 个 case，约 `12.33s` 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计：总 `884` 个 Vitest 文件，默认可运行 `883`，live-gated `1`；分层为 unit `387`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第四刀完成。抽取 `agentChatAutoTitleViewModel`，将 `useAsterAgentChat` 内联的自动标题占位判断、assistant 预览派生判断、用户文本过滤和标题生成上下文构造迁移到 VM 单测；`npm run test:unit -- src/components/agent/chat/hooks/agentChatAutoTitleViewModel.unit.test.ts` 实测 `6` 个 case，约 `0.89s` 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "自动标题"` 实测 `2` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计：总 `885` 个 Vitest 文件，默认可运行 `884`，live-gated `1`；分层为 unit `388`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第五刀完成。补强 `submitOpRuntimeCompaction` 纯单元覆盖，将 `useAsterAgentChat.test.tsx` 后半段反复间接验证的 synced `recent_preferences` 与 `access_mode` metadata 去重沉到 unit 层，并修复偏好全部裁掉后残留 `{ harness: {} }` 的空 metadata；`npm run test:unit -- src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts` 实测 `12` 个 case，约 `0.74s` 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "recent_preferences|access_mode"` 实测 `9` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `885` 个 Vitest 文件，默认可运行 `884`，live-gated `1`；分层为 unit `388`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第六刀完成。抽取 `agentSessionTopicViewModel`，将 `useAgentSession` 中 topic/session detail 映射、runtime thread 状态、topic upsert 和 transient tail selector 迁移到纯 VM 单测；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionTopicViewModel.unit.test.ts` 实测 `7` 个 case 通过；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionState.test.ts src/components/agent/chat/hooks/agentSessionRefresh.test.ts` 实测 `22` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|排队会话|话题列表暂时"` 实测 `23` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计：总 `886` 个 Vitest 文件，默认可运行 `885`，live-gated `1`；分层为 unit `389`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第七刀完成。抽取 `agentSessionRestoreViewModel`，将 `useAgentSession` 工作区恢复 effect 中的 transient/cached snapshot 选择、消息合并、timeline 回退、current turn 优先级和历史窗口推导迁移到纯 VM 单测；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionRestoreViewModel.unit.test.ts` 实测 `4` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|排队会话|话题列表暂时"` 实测 `23` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计：总 `887` 个 Vitest 文件，默认可运行 `886`，live-gated `1`；分层为 unit `390`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第八刀完成。补强 `agentChatActionState`，将 `useAgentTools` 中确认提交后同步 message actionRequests、contentParts 与 runtime status 的状态转换抽成纯 reducer；`npm run test:unit -- src/components/agent/chat/hooks/agentChatActionState.unit.test.ts` 实测 `3` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "action_required|fallback ask|elicitation"` 实测 `29` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第九刀完成。继续补强 `agentChatActionState`，将 fallback ask 回答暂存、同 assistant 消息真实 request 匹配、queued 状态写回 pending action / message actionRequests / contentParts 的逻辑从 `useAgentTools` 抽成纯 planner / reducer；`npm run test:unit -- src/components/agent/chat/hooks/agentChatActionState.unit.test.ts` 实测 `6` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "fallback ask"` 实测 `2` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第十刀完成。继续补强 `agentChatActionState`，将 `useAgentTools.replayPendingAction` 中 replay response 到 `ActionRequired` 的字段映射、questions/options 归一化、scope 映射和非法 arguments 裁剪抽成纯 mapper；`npm run test:unit -- src/components/agent/chat/hooks/agentChatActionState.unit.test.ts` 实测 `8` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "replayPendingAction"` 实测 `1` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第十一刀完成。补强 `agentSessionRestoreViewModel`，将 `useAgentSession.applyCachedTopicSnapshot` 中 cached topic snapshot 到首屏 session snapshot、history window 与 metric context 的派生逻辑抽成纯 VM；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionRestoreViewModel.unit.test.ts` 实测 `6` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-05-31：P2 第十二刀完成。补强 `agentSessionTopicViewModel`，将 `useAgentSession` 中 restore candidate 清洗逻辑抽成纯计划，覆盖空候选、辅助会话、旧默认工作区、跨工作区和合法映射；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionTopicViewModel.unit.test.ts` 实测 `9` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "恢复态|切换话题|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十三刀完成。补强 `agentSessionState`，将 `useAgentSession` 中当前会话缺失于 topics 时的 detached 跳过、辅助会话清理、无活动清空和远程存在性校验决策抽成纯 selector；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionState.test.ts` 实测 `20` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "恢复态|切换话题|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十四刀完成。补强 `sessionSwitchSnapshotController`，将 `useAgentSession.switchTopic` 中 in-flight switch 复用判断抽成纯 selector，避免 force refresh、自动恢复、detached session 和 session start hooks 分支继续靠重 hook 间接覆盖；`npm run test:unit -- src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts` 实测 `6` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十五刀完成。继续补强 `sessionSwitchSnapshotController`，将 `useAgentSession.switchTopic` 开始阶段的当前 session preference 持久化目标、detached session 写入、auto restore 清理和 hydration 重置抽成纯 state plan；`npm run test:unit -- src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts` 实测 `7` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十六刀完成。继续补强 `sessionSwitchSnapshotController`，将 `useAgentSession.switchTopic` 中 cached snapshot 是否读取、是否先应用、是否需要立即刷新这一组策略抽成纯 planner，存储读取副作用仍留在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts` 实测 `8` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十七刀完成。继续补强 `sessionSwitchSnapshotController`，将 `useAgentSession.switchTopic` 的 defer hydration 分支中 Chrome 状态应用、restore candidate、auto restore / hydration 状态清理和 detail load mode 抽成纯状态计划，异步加载与错误重试仍留在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts` 实测 `9` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十八刀完成。继续补强 `sessionSwitchSnapshotController`，将 `useAgentSession.switchTopic` 的 pending shell 分支中空 session snapshot、history window 清理、Chrome 状态应用、restore candidate 和 hydration 状态设置抽成纯状态计划，execution strategy 归一化与 metric 仍留在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionSwitchSnapshotController.test.ts` 实测 `10` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第十九刀完成。补强 `sessionFinalizeController`，将 `useAgentSession.finalizeResolvedTopicDetail` 成功末尾的 auto restore / hydration 状态收尾抽成纯 plan，作为后续继续下沉 runtime preference / access mode / metadata sync 成功路径的模板；`npm run test:unit -- src/components/agent/chat/hooks/sessionFinalizeController.test.ts` 实测 `6` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第二十刀完成。补强 `sessionMetadataSyncController`，将 `useAgentSession.finalizeResolvedTopicDetail` 中 runtime preference / access mode / session storage preference 到 metadata sync 入参的选择抽成纯 input plan，保持 `buildSessionMetadataSyncPlan` 继续作为 patch 生成事实源；`npm run test:unit -- src/components/agent/chat/hooks/sessionMetadataSyncController.test.ts` 实测 `8` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第二十一刀完成。补强 `sessionPostFinalizePersistenceController`，将 `useAgentSession.finalizeResolvedTopicDetail` 中保存 session workspace、回填 topic workspace、应用 provider preference 的副作用入口抽成纯 apply plan，保留实际写 storage / setTopics / apply preference 在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionPostFinalizePersistenceController.test.ts` 实测 `4` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint`、`git diff --check` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `888` 个 Vitest 文件，默认可运行 `887`，live-gated `1`；分层为 unit `391`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第二十二刀完成。补强 `sessionMetadataSyncController`，将 `useAgentSession.finalizeResolvedTopicDetail` 成功路径中的 runtime execution strategy synced 标记、access mode 本地应用 / 持久化判断，以及 switch success metric 上下文组装抽成纯 local state plan，实际 setState / storage / metric 记录仍留在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionMetadataSyncController.test.ts` 实测 `10` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过。
- 2026-06-01：P2 第二十三刀完成。继续补强 `sessionMetadataSyncController`，将 `scheduleSessionMetadataSync.onSynced` 中 provider preference synced 标记、execution strategy synced 标记和 topic execution strategy 回填抽成纯 success apply plan，实际 mark / setTopics 仍保留在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionMetadataSyncController.test.ts` 实测 `11` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过。
- 2026-06-01：P2 第二十四刀完成。补强 `sessionPostFinalizePersistenceController`，将 `useAgentSession.finalizeResolvedTopicDetail` 中 runtime workspace 回填目标 topic 的 `setTopics(prev => prev.map(...))` 抽成纯 reducer，保留 React state 写入在 hook 接线层；`npm run test:unit -- src/components/agent/chat/hooks/sessionPostFinalizePersistenceController.test.ts` 实测 `5` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过。
- 2026-06-01：P2 第二十五刀完成。继续补强 `sessionMetadataSyncController`，将 `scheduleSessionMetadataSync.onSynced` 成功后 fallback execution strategy 回填目标 topic 的 `setTopics(prev => prev.map(...))` 抽成纯 reducer；`npm run test:unit -- src/components/agent/chat/hooks/sessionMetadataSyncController.test.ts` 实测 `12` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过。
- 2026-06-01：P2 第二十六刀完成。补强 `agentSessionTopicViewModel`，将 `useAgentSession.updateTopicSnapshot` 中 live snapshot 写回目标 topic 的 `setTopics(prev => prev.map(...))` 抽成纯 reducer，并固化未改变 / 未命中时复用原数组，避免组件层继续间接覆盖该性能语义；`npm run test:unit -- src/components/agent/chat/hooks/agentSessionTopicViewModel.unit.test.ts` 实测 `11` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计：总 `889` 个 Vitest 文件，默认可运行 `888`，live-gated `1`；分层为 unit `392`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第二十七刀完成。继续补强 `agentSessionTopicViewModel`，将 `useAgentSession` 中新建 session 草稿插入 / 去重、当前 session 缺失后远端校验成功补入 topic、以及 `updateTopicExecutionStrategy` 的 topic execution strategy 写回抽成纯 reducer；`useAgentSession` 继续保留 runtime 调用和 React state 接线。`npm run test:unit -- src/components/agent/chat/hooks/agentSessionTopicViewModel.unit.test.ts` 实测 `14` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "切换话题|恢复态|话题列表暂时"` 实测 `22` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `889` 个 Vitest 文件，默认可运行 `888`，live-gated `1`；分层为 unit `392`、component `370`、contract `77`、integration `49`、e2e `1`。
- 2026-06-01：P2 第二十八刀完成。阶段性审计后继续补强 `agentChatActionState`，将 `useAgentTools` 中 submitted action in-flight upsert、acknowledged requestIds 清理 pending / in-flight 集合，以及 ask/elicitation 是否保留 submitted 面板的判断抽成纯 reducer / selector；实际 runtime respond、read model refresh 和 toast 仍留在 hook 接线层。`npm run test:unit -- src/components/agent/chat/hooks/agentChatActionState.unit.test.ts` 实测 `11` 个 case 通过；`npm run test:contract -- src/components/agent/chat/hooks/useAsterAgentChat.test.tsx -- -t "action_required|fallback ask|elicitation"` 实测 `29` 个相关 case 通过；`npm run typecheck`、`npm run lint` 均通过。当前 `npm run test:layers:stats` 统计保持：总 `889` 个 Vitest 文件，默认可运行 `888`，live-gated `1`；分层为 unit `392`、component `370`、contract `77`、integration `49`、e2e `1`。
