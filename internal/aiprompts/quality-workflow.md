# Lime 工程质量工作流

## 这份文档回答什么

本文件定义 Lime 仓库的工程质量入口，主要回答四个问题：

- 不同改动，提交前默认该跑什么
- 为什么 Lime 作为 GUI 桌面产品，不能只看 `lint` / `typecheck` / 单测
- `verify:local`、`verify:gui-smoke`、`test:contracts`、Playwright E2E 分别覆盖什么风险
- `.github/workflows/quality.yml` 与本地校验如何保持一条主线

它是 **工程入口文档**，不是某个模块的实现设计文档。

## 快速复核口径

用户问“结论 / 复核 / 是否能删 / 是否 dead”时，先给短结论和关键证据，不自动升级成 `verify:local`、`test:contracts`、GUI smoke 或全量质量矩阵。只有用户要求继续实现、修文档、补守卫、提交前验证，或改动已经真实触达 GUI / 命令 / bridge / 配置边界时，才进入完整校验流程。

目录级旧实现若已脱离构建 / workspace manifest、当前工作树已物理删除或 staged delete、已有 current owner 承接，且边界守卫能防回流，可直接按目录级 `dead / deleted / forbidden-to-restore` 处理；不要求逐文件证明旧实现“业务语义无价值”。执行计划历史 checkpoint、旧路线图和 git history 里的旧路径默认是 evidence，不是当前质量缺口。

## 什么时候先读

遇到以下任一情况时，先读本文件：

- 不确定本次改动最少该跑哪些校验
- 修改了 GUI 壳、Electron Desktop Host bridge、DevBridge、Workspace、App Server JSON-RPC、legacy desktop facade 或前端主路径
- 需要判断跑最小 smoke 还是交互型 E2E
- 需要理解 `quality.yml` 为什么触发某些 CI 任务

如果改动属于 `@` / 产品型 `/` / 轻卡 / viewer / `ServiceSkill` 场景主链，先补读：

- `internal/aiprompts/command-runtime.md`

如果改动涉及 Agent 运营级测试、qcloop 批量质检、Evidence Pack 或发布证据门禁，先补读：

- `internal/tests/agent-ops-qc.md`
- `internal/tests/agent-qc-p0-scenarios.md`
- `internal/tests/lime-agent-qc-rollout-plan.md`

## 交付定义

对 Lime 来说，“代码通过检查” 不等于 “产品可以交付”。

一次可交付的改动，至少要满足：

1. **静态与定向校验通过** - 对应范围的 lint、类型检查、单测、Rust 定向测试通过
2. **边界变更已同步** - 命令、桥接、配置、版本等结构性改动完成成组更新
3. **GUI 主路径可运行** - 涉及 GUI 壳、Bridge、Workspace、主页面路径时，最小冒烟通过
4. **用户可见回归已补齐** - 用户可见 UI 改动有稳定断言或既有 snapshot 回归
5. **全球本地化事实源正确** - 新增或改动的用户可见产品文案必须覆盖 Lime current 五语言 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`；前端进入 key-based i18n resources，Rust / Electron host / App Server 导出 Markdown、copy prompt、artifact title 等 presentation 文案进入 locale copy service，不依赖 legacy DOM Patch 或中英双语兜底
6. **文档与锁文件不掉队** - 相关文档、schema、锁文件与实际实现保持一致

## 测试用例迁移口径

测试用例需要全面更新口径，但不等于把所有测试一次性重写。

默认事实源如下：

- `current`：Electron Desktop Host bridge、Electron preload / IPC 白名单、App Server JSON-RPC、`packages/app-server-client`、`src/lib/desktop-host/` mock、`npm run smoke:electron` / `npm run verify:gui-smoke`
- `compat`：`safeInvoke` 兼容层、DevBridge 浏览器 fallback；旧 `agent_runtime_*` 只允许作为 retired guard / test-only fixture / migration-only residual，测试只能证明它们未回流 production truth 或 mock fallback
- `deprecated`：legacy desktop facade、legacy mock path、legacy host 注册；测试只能证明旧入口被限制、未回流、未承接新业务逻辑
- `dead`：旧桌面宿主路径、旧宿主 GUI smoke 和旧宿主专用 E2E 口径；不得作为新改动的可交付证据

生产不能 mock，只有测试才 mock。`src/lib/desktop-host/` 中的 mock、`mockPriorityCommands`、`defaultMocks`、`invokeMockOnly`、`explicitMockFallback` 和 App Server mock backend 只允许用于 `*.test.*`、测试夹具、契约守卫或专门声明为测试的 smoke 场景；GUI smoke、业务 E2E、Electron Host 和 App Server sidecar 生产路径必须真实连通，失败时直接暴露错误。

`lime-rs/src/**` 旧主 crate / legacy facade / 迁移来源目录已于 `2026-06-10` 物理删除，当前 Cargo workspace 只以 `lime-rs/crates/**` 为 Rust 事实源。质量检查不能把该目录当成新增 Rust 后端能力的落点，也不能为了通过检查恢复 bootstrap / runner / compat facade / tombstone / stub；需要参考旧实现时只读 git history / 执行计划，落地必须进入 App Server、RuntimeCore、services、core、agent、协议/client crate 或 Electron Desktop Host。

`lime-rs/src/commands/**` 已随 `lime-rs/src/**` 删除；旧 Tauri command wrapper、runner / dispatcher / catalog / mock 注册只能作为 retired guard / 历史引用存在。质量检查不能把该目录当成新增 Rust 后端能力或桌面壳能力的落点；新增后端能力必须进入 App Server crates / RuntimeCore / services，桌面壳能力进入 Electron Desktop Host。涉及旧命令路径的测试只允许作为回流守卫，证明旧 wrapper 没有恢复，不能作为 GUI current 可交付证据。

新增或迁移测试时按下面顺序处理：

1. 新 Agent / runtime / host integration / 跨 App 复用能力，优先补 App Server protocol / server / npm client / Electron host 测试。
2. GUI 壳或桌面平台能力，优先补 Electron main / preload / IPC channel / `src/lib/desktop-host` 测试，再补 `npm run verify:gui-smoke` 或 Playwright 续测。
3. 前端业务网关仍可测试 `safeInvoke` 接线，但断言应指向 Electron/App Server current 行为，不再把 legacy mock 返回当真实产品行为。
4. 保留的 legacy host / legacy mock 测试只作为 legacy guard：证明旧 facade 不接新命令、不伪造 current runtime、不成为 GUI 可交付证据。
5. 删除或跳过旧测试前，先确认已有 current 测试覆盖同一用户风险；否则先迁移覆盖，再清退旧测试。

Agent Runtime / Claw chat 主路径改动还必须先跑 current fixture 回归：

```bash
npm run smoke:agent-runtime-current-fixture
```

该入口借鉴 Codex app-server 测试实践：用本地 fixture backend / harness 驱动真实 client、App Server JSON-RPC、流式事件、read model 和 UI 投影，不把真实模型后端作为日常回归门槛。它覆盖历史 / 缓存恢复、`final_done` 工具收尾、完成态 UI、Electron session history / 代码产物工作台 fixture guard、Claw GUI current fixture guard，以及真实 Electron `cancel-then-continue` 场景；脚本必须保持 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=0`、`LIME_REAL_API_TEST=0`，不能引入 `--allow-live-provider`、App Server mock backend、renderer mock fallback、`mockPriorityCommands`、`defaultMocks` 或 `invokeMockOnly`。该 smoke 只证明 current fixture 回归，不替代 `verify:gui-smoke`、Playwright MCP 真实点击、或用户显式发起的 `smoke:claw-chat-ready-streaming` live Provider streaming E2E。

修 Agent Runtime / Claw chat 的 streaming 卡住、无法停止、输入框不可用、用户消息 / assistant 输出可见性、`final_done` 后仍显示“正在输出”等问题时，必须优先补状态机级回归：terminal 事件必须覆盖 App Server current `turn.completed` 投影后的 `turn_completed`，以及 `done` / `final_done` / 可软完成的 `error`；这些事件应清理对应 active stream、dispose listener，并在当前 stream 匹配或尚未激活时显式把 `isSending` 收回 `false`。不要用固定 timeout / grace timer 合成 `final_done` 作为产品收口；Codex app-server 语义下 `turn/completed` 是 turn 终态，最终正文来自已完成 message/item 或 `turn.completed` payload。定向测试必须覆盖陈旧 terminal 事件不能误停新的 active stream，优先放在 `agentStreamRuntimeHandler.unit.test.ts` / `agentStreamCompletionController.test.ts` / `MessageList.test.tsx`，再跑 `npm run smoke:agent-runtime-current-fixture` 和对应真实 Electron fixture。无法停止 / 停止后无法继续输出类问题还必须证明同一 current session 的 `cancel-then-continue`：GUI 点击停止后输入框恢复，随后同一会话从 GUI 输入“继续输出”，后端收到第二个 `turnStart`，GUI 与 read model 都完成第二轮。

修 Agent Runtime / Claw chat 的 reasoning、工具调用、WebSearch / WebFetch 或最终正文排版顺序时，必须把 display correctness 绑定到结构化事件生命周期，而不是正文内容。current 口径见 `internal/aiprompts/claw-streaming-rendering-correctness.md`：`ContentPart` 必须保留 `sequence / turnId / itemId / phase / source` provenance；renderer 不做 lifecycle 语义判断；禁止用“已完成思考”、搜索文案、新闻正文、`Finding` 等自然语言正文或展示文案正则识别 reasoning / search / final answer；工具完成、reasoning 完成、`turn_completed.text` 终态标记本身都不等于 final answer。最低定向回归应覆盖 sequence-bearing text 与 process part 混排、provenance text 不盲合并、completion suffix 不追加到早于 process boundary 的 text、tool / reasoning 后没有 assistant final text 时 fail closed、live stream 与 history hydrate 同构。

如果本轮问题直接涉及历史详情 hydrate、最近对话恢复、归档 / 反归档后的 read model 读取，聚合 guard 通过后再显式跑：

```bash
npm run smoke:agent-session-history-electron-fixture
```

该入口启动真实 Electron Desktop Host，经 preload `app_server_handle_json_lines` 读取 App Server current session start/read/update/list 形状；它使用 `APP_SERVER_BACKEND_MODE=unavailable`，不触发 `agentSession/turn/start`，不调用模型后端。

如果本轮问题直接涉及代码产物、artifact snapshot、从历史打开工作台或工作台面板渲染，聚合 guard 通过后再显式跑：

```bash
npm run smoke:code-artifact-workbench-electron-fixture
```

该入口启动真实 Electron Desktop Host，使用本地 external fixture backend 产生 `artifact.snapshot` 与 `turn.final_done`，再从 GUI 历史会话打开工作台；它不调用正式模型，不使用 App Server mock backend、renderer mock fallback 或 legacy runtime command。

代码产物工作台 fixture 必须分开验证后端事实源和 GUI 可见性：`toolTimelinePersisted` 只证明 App Server read model 的 `tool_calls` / `thread_read.tool_calls` 已持久化 fixture tool completed 记录；`toolTimelineEvidencePresent` 只认 GUI 页面可见工具轨迹文案或工具输出预览。不要用 read model 持久化替代 GUI 证据，也不要为了让 smoke 通过在生产路径新增前端 mock 或 legacy 工具展示。

如果本轮问题直接涉及 Claw 输入框不可见、用户输入不显示、assistant 输出卡住、自然语言新闻请求或 `agentSession/turn/start` GUI 链路，聚合 guard 通过后再显式跑：

```bash
npm run smoke:claw-chat-current-fixture
```

该入口启动真实 Electron Desktop Host，通过 GUI textarea 发送“整理今天的国际新闻”，验证 Frontend -> Electron IPC -> App Server JSON-RPC -> RuntimeCore/backend current 链路、完成态 UI、read model 和 external fixture backend ledger；current fixture 应覆盖 `message.delta + turn.completed` 单终态即可完成，不要求 `turn.final_done`；它仍然禁止正式模型后端、App Server mock backend、renderer mock fallback 和 legacy runtime command。

## 路线图任务防跑偏

如果任务明确绑定路线图主线，质量校验除了回答“是否通过”，还必须回答“这次改动是否真的推进了路线图目标”。

执行时额外遵守：

1. 校验前先确认本轮改动对应路线图哪一项
2. 选择下一刀前先按“对整体目标完成度的增量”排序，优先补直接影响可用闭环的主缺口；协议 polish、错误分类、额外 seam、边缘校验、文案润色、内部抽象等梢枝末节，只有在阻塞主路径、会造成假入口/假配置，或用户明确要求时才做
3. 如果本轮改动只是清理 dead surface、补 README、局部整理或低杠杆细节，但没有直接推进主链，不能把“校验通过”当作完成目标
4. 汇报时必须同时给出：
   - 本轮改动对应的路线图节点
   - 本轮校验覆盖了哪条主线风险
   - 当前距离该路线图阶段完成还差什么
5. 用户问“完成了么”时，先回答主线目标是否已经达到可交付门槛；额外校验、顺手清理、可选优化必须单独列出，不要反向覆盖主线结论
6. 校验的上限是证明当前主线可交付；一旦已经覆盖本轮真实风险，就不要因为还有更重的检查可跑而无限追加验证

## 开发任务收口反馈

非纯问答的开发任务结束时，最终回复必须给出面向开发主线的完成度反馈，而不只是列文件和测试。

默认包含：

1. `本轮完成度：X%`，并用一句话说明百分比依据
2. 本轮目标是否完成，以及落在哪条 current 主链
3. 实际完成了什么，哪些事实源或边界已同步
4. 实际执行了哪些验证；未执行的高风险验证要说明原因
5. 还剩什么未完成或仍不应宣称完成
6. 下一刀最该做什么

如果任务绑定路线图、执行计划、多阶段迁移或用户连续要求“继续主线”，还必须额外给出完成度判断：

- 区分 `本轮完成度` 和 `整体目标完成度`
- 整体百分比必须说明口径，例如工程闭环、MVP、完整产品目标
- 如果无法精确量化，给区间或估算值，但必须说明依据，不能省略百分比
- 剩余项按影响主线交付的优先级排序，避免把可选优化和主线缺口混在一起
- 简单单文件修复可以压缩成 2-3 句；不要为了格式而写长报告

该反馈只适用于开发任务；普通解释、检索、问答或无需改仓库的讨论不强制输出完成度百分比。只要发生代码、配置、脚本、测试或工程文档修改，就视为开发任务，最终回复必须给本轮完成度百分比。

## 执行硬规则

### 1. 不要继续扩展 compat / deprecated 路径

- 新 API、新 Electron IPC channel、新 App Server 方法、新前端入口默认落在当前 `current` 主路径
- 不要继续给 legacy / compat 网关长新表面
- 如果发现能力已经存在多条路径，先读 `internal/aiprompts/governance.md`

### 2. 协议改动必须同步四侧

涉及命令或桥接协议时，至少检查：

- 前端 `safeInvoke(...)` / `invoke(...)` 的实际调用
- Electron Desktop Host bridge / preload 白名单或 App Server JSON-RPC 协议
- legacy desktop facade 注册（仅在触碰兼容层时）
- `src/lib/governance/agentCommandCatalog.json` 的治理口径
- `mockPriorityCommands` 与 `defaultMocks` 的同步状态
- `src/lib/dev-bridge/**` 的职责分类：`safeInvoke`、HTTP client、`app_server_handle_json_lines`、事件监听和可用性探测属于 `current` renderer bridge；旧命令 `commandPolicy`、no-mock fallback、mock priority、旧 smoke 和 retired guard 属于后续治理对象，不能混成整目录删除

只改其中一侧，不算完成。

命令迁移或清退收口时，质量结论必须说明 `src/lib/dev-bridge` 的检查结果：已迁旧命令是否仍在 production truth / mock fallback 中；如果只能保留旧命令字符串，是否明确为 `dead / retired guard-only` 或 `test-only`；删不掉的 residual 是否已登记到当前执行计划。跨命令组或会长期存在的 legacy policy / mock residual 必须同步回挂 `internal/exec-plans/tech-debt-tracker.md` 的 `CCD-012`，不能只留在聊天、handoff、旧 smoke 备注或单次校验输出里。这条检查不替代 `npm run test:contracts`，而是防止 contract 通过后旧 policy / 旧 smoke 继续把 retired 命令伪装成 current。

如果本轮是在下线共享网关控制面，`start_server`、`stop_server`、`get_server_status`、`get_available_routes`、`get_route_curl_examples`、`test_api`、`get_network_info`，以及托盘残留 `sync_tray_state`、`update_tray_server_status`、`update_tray_credential_status`、`get_tray_state`、`refresh_tray_menu`、`refresh_tray_with_stats` 必须同步从前端网关、Rust 注册、DevBridge 和 mock 中撤掉；server 兼容面 `/v1/routes`、`/{selector}/v1/messages`、`/{selector}/v1/chat/completions` 也必须同步从 server 路由表与 services/core 模型中撤掉；开发者诊断只保留 App Server `diagnostics/server/read` current 主链，旧 `get_server_diagnostics` 只能作为 retired guard / 负向测试 / cleanup-only residual；托盘只保留 `sync_tray_model_shortcuts`，server 只保留标准 `/v1/messages` 与 `/v1/chat/completions`。

如果本轮是在下线项目默认风格旧链路，`style_guide_get` / `style_guide_update` 与 `ProjectMemory.style_guide` 也必须同步从前端 API、Rust 注册、数据库 schema、默认 mock 和 GUI 入口中撤掉。

如果本轮是在下线项目模板或品牌人设扩展旧链路，`create_template` / `list_templates` / `get_template` / `update_template` / `delete_template` / `set_default_template` / `get_default_template`，以及 `get_brand_persona` / `get_brand_extension` / `save_brand_extension` / `update_brand_extension` / `delete_brand_extension` / `list_brand_persona_templates` 也必须同步从前端 API、Rust 注册、services/core 模型、默认 mock 和 GUI 入口中撤掉。

如果本轮是在清退旧图库素材命名，`create_poster_metadata` / `get_poster_metadata` / `get_poster_material` / `update_poster_metadata` / `delete_poster_metadata` / `list_by_*`，以及 `PosterMaterial*` / `poster_material_*` 表名与模块名也必须同步从前端网关、Rust 注册、DAO 与治理目录册中撤掉；如需保留历史数据，只允许在 schema 迁移中短暂停留旧表名。最低校验至少包含 `npm run test:contracts` 与 `npm run governance:legacy-report`。

如果本轮是在清退旧设置页的“安全与性能 / 容错配置”命令面，`get_retry_config`、`update_retry_config`、`get_failover_config`、`update_failover_config`、`get_switch_log`、`clear_switch_log`、`get_rate_limit_config`、`update_rate_limit_config`、`get_conversation_config`、`update_conversation_config`、`update_hint_routes`、`get_pairing_config`、`update_pairing_config` 也必须同步从前端网关、Rust 注册和默认 mock 中撤掉；若当前输入框提示仍依赖 `get_hint_routes`，则只保留该只读读取面。最低校验至少包含 `npm run test:contracts` 与 `npm run governance:legacy-report`。

如果本轮是在清退旧 onboarding 插件安装流或 Provider Switch 命令面，`get_switch_providers`、`get_current_switch_provider`、`add_switch_provider`、`update_switch_provider`、`delete_switch_provider`、`switch_provider`、`import_default_config`、`read_live_provider_settings`、`check_config_sync_status`、`sync_from_external_config` 也必须同步从前端常量、Rust 注册、services、默认 mock 与 GUI 入口中撤掉；当前 onboarding 只允许保留语音体验链，不再保留 `config-switch` 推荐安装面。最低校验至少包含 `npm run test:contracts` 与 `npm run governance:legacy-report`。

如果本轮是在清退插件中心模块，插件安装 / 管理 / UI / RPC 命令族也必须同步从 `src/lib/api` 网关、页面入口、设置入口、Rust 注册、DevBridge 与默认 mock 中撤掉；当前 GUI 不再保留插件中心或动态插件侧栏入口。最低校验至少包含 `npm run test:contracts`、`npm run governance:legacy-report` 与受影响前端回归。

`companion_*` 桌宠命令族已下线并归类为 `dead`。如果本轮发现 `companion_get_pet_status`、`companion_launch_pet`、`companion_send_pet_command`、`src/lib/api/companion.ts`、桌宠设置页、桌宠偏好或 `companion-pet-status` 事件重新出现在生产入口、Desktop Host、DevBridge、默认 mock 或 App Server 主链，应先按旧路回流处理并删除；不得把它们恢复成浏览器模式 mock fallback。

如果本轮涉及 team runtime 工具面或主线程用户消息工具，还要同步检查 Rust catalog / inventory、runtime 注册、浏览器 fallback mock 与前端 tool display；`Agent / TeamCreate / TeamDelete / SendMessage / ListPeers` 必须保持同一组 current surface，`SendUserMessage` 也必须继续停留在 current 主线程工具面，不要把已删除的 `SubAgentTask` compat 工具重新接回 Rust catalog、runtime 注册、mock 或前端 tool display。

如果本轮涉及 MCP bridge runtime tool surface、inventory 或 ToolSearch，还要同步检查 Rust extension 注入、inventory 快照、浏览器 fallback mock 与 GUI 面板命名；当前唯一命名事实源是 `mcp__<server>__<tool>`，对应 extension surface key 为 `mcp__<server>`，不要让 mock 或 UI 退回裸 `server__tool`。同时，Lime runtime 里的 `ToolSearch` 当前事实源必须是 `ToolSearchBridgeTool`；`aster-rust` 自带 `ToolSearchTool` 只能停留在 compat 存量，不允许再抢占当前 runtime surface。
如果本轮还需要对子工作区单独跑 Rust 定向测试，例如 `lime-rs/crates/aster-rust`，必须确认产物仍落在统一的 `lime-rs/target`，不要重新写回子目录自己的 `target/`；否则 legacy host watcher 可能把构建产物当成源码变化，反复触发重编译。

如果本轮涉及 `create_skill_scaffold_for_app`、`SkillsPage / SkillScaffoldDialog`，或“聊天结果 -> Skill 脚手架”沉淀闭环，还要同步检查前端网关、App Server / RuntimeCore owner、current command catalog、retired guard 与 test-only mock 是否仍保持同一条主链；若新增了结构化骨架字段，至少要确认 `何时使用 / 输入 / 执行步骤 / 输出 / 失败回退` 能真实落进生成后的 `SKILL.md`。

如果本轮涉及 `capability_draft_create/list/get/verify/register/list_registered_skills/submit_approval_session_inputs/execute_controlled_get`，还要同步检查 `src/lib/api/capabilityDrafts.ts`、App Server / RuntimeCore capability draft owner、current command catalog、retired guard、`mockPriorityCommands` 与 test-only mock；注册命令只能证明 workspace-local Agent Skill 包已落盘，registered discovery 只能证明当前 workspace 可发现带 provenance 的 Skill 包，session 输入命令只能证明一次性授权输入有效，受控 GET 命令只能返回当前命令 evidence，正向 / `request_failed` 只能落非敏感 evidence artifact，不能保存 endpoint/token/response preview，不能把“已注册 / 已发现 / 已校验 / 已执行一次 GET”当成“已进入 tool surface / 可自动运行”。最低校验至少包含 Rust capability draft 定向测试、前端 API / UI 回归、`npm run test:contracts`；若 Skills 工作台可见行为变化，再补 `npm run verify:gui-smoke`。

如果本轮涉及 App Server `workspaceSkillBindings/list`，还要同步检查 `src/lib/api/agentRuntime/inventoryClient.ts`、App Server protocol / client、RuntimeCore runtime binding owner、current command catalog、retired guard、`mockPriorityCommands` 与 test-only mock；旧 `agent_runtime_list_workspace_skill_bindings` 只允许作为 retired guard / 历史 evidence。该 method 只表示 P3B registered skill 的 runtime binding readiness projection，不能把 `ready_for_manual_enable` 当成“已注入 Query Loop / 已进入 SkillTool / 可自动执行”。最低校验至少包含 Rust runtime binding 定向测试、前端 API / UI 回归、App Server client / protocol check、`npm run test:contracts`；若 Skills 工作台可见行为变化，再补 `npm run verify:gui-smoke`。

如果本轮涉及 `request_metadata.harness.workspace_skill_bindings` / `workspaceSkillBindings` 的 Query Loop metadata 投影，还要同步检查 `lime-rs/crates/agent/src/turn_input_envelope.rs` 的 prompt stage contract、`src/components/agent/chat/utils/workspaceSkillBindingsMetadata.ts` 与 `buildHarnessRequestMetadata` 的裁剪边界；旧 `lime-rs/src/commands/aster_agent_cmd/workspace_skill_binding_prompt.rs` 已随 `lime-rs/src/**` 删除，只允许从 git history / 执行计划只读参考，不是新增 prompt 投影落点。该 metadata 只表示 P3C readiness 的只读规划上下文，不能自动打开 `allow_model_skills`、不能注入 `SkillTool` registry、不能改变默认 tool surface。最低校验至少包含 Rust prompt 投影定向测试、前端 metadata builder 单测和 `npm run typecheck`；若同时改了 runtime command schema 或 command manifest，再补 `npm run test:contracts`。

如果本轮涉及 `request_metadata.harness.workspace_skill_runtime_enable` / `workspaceSkillRuntimeEnable` 的 Skill Forge P3E runtime enable，还要同步检查 App Server / RuntimeCore 的 runtime binding current owner、`lime-rs/crates/agent/src/tools/skill_tool_gate.rs`、`src/components/agent/chat/utils/workspaceSkillBindingsMetadata.ts` 与 `buildHarnessRequestMetadata`；旧 `lime-rs/src/services/runtime_skill_binding_service.rs`、`lime-rs/src/commands/aster_agent_cmd/runtime_turn.rs`、`workspace_skill_binding_prompt.rs` 已删除，只允许从 git history / 执行计划只读参考，不是新增 runtime enable 落点。该 metadata 只能在当前 session scope 内显式启用 P3C ready binding，并把 `SkillTool` 裁剪到 allowlist，不能复活 marketplace、scheduler 或绕过 App Server `agentSession/turn/start` 的平行执行命令。最低校验至少包含 Rust runtime binding / SkillTool gate 定向测试、Rust prompt 投影定向测试、前端 metadata builder 单测和 `npm run test:contracts`。

如果本轮涉及记忆主链，还要同步检查 memory store、`MemoryBackend`、memory tools、prompt contributor、Soul current 配置、App Server / RuntimeCore owner、current command catalog 与 test-only guard 是否仍保持同一条 current surface；旧 `lime-rs/src/commands/memory_management_cmd.rs` 已随 `lime-rs/src/**` 删除，只允许从 git history / 执行计划只读参考，不是新增记忆实现落点。旧 `memory_runtime_*`、`unified_memory_*`、旧 MemoryPage 灵感库和旧命中预演只允许 cleanup / retired guard，不得恢复已删除的旧 wrapper、旧注册或旧分发分支。

### 3. 用户可见 UI 改动必须补稳定回归

- 新增或改动的按钮、标题、空态、toast、confirm、prompt、placeholder、aria/title、错误提示、导出 Markdown / copy prompt / artifact title 等用户可见 presentation 文案，必须覆盖 Lime current 五语言：`zh-CN / zh-TW / en-US / ja-JP / ko-KR`
- 前端文案必须走 current i18n：`useTranslation(ns)` / `Trans` + `src/i18n/resources/<locale>/<namespace>.json`；Rust / Electron host / App Server 导出文案必须走对应 locale copy service，不得只在业务逻辑里硬编码中文或英文
- 只做中文 / 英文双语兜底不算全球本地化；确需临时例外时，必须写入对应路线图或执行计划，说明覆盖范围、原因和退出条件
- legacy DOM Patch 只允许作为迁移期兜底，不允许成为新功能或新文案的本地化事实源；确需临时例外时，必须写入对应路线图或执行计划并说明退出条件
- 动态用户可见文案使用 i18next interpolation / plural / context；日期、数字、相对时间、列表和排序优先复用 `src/i18n/format.ts`
- 协议 facts / JSON schema / stable enum（例如 `type/status/failureCategory/reasonCode`）不得随 locale 翻译；只翻译 presentation 层，避免测试、join key 或跨模块判断被本地化文案污染
- i18n 资源、loader 或 bundle 策略变更后，质量任务选择器的 `recommendedCommands` 会提示刷新 `translation-pr-pack.json` 与 `bundle-strategy-report.json`；这类 evidence 用于证明翻译 PR 可审阅、bundle 体积与 chunk 策略没有漂移
- Chrome extension、发布材料、installer / app metadata 或 RTL 布局敏感面变更后，质量任务选择器的 `recommendedCommands` 会提示刷新对应 P4 evidence；docs-only 变更仍跳过代码校验，但不应吞掉这些审阅建议
- 优先补现有 `*.test.tsx` 的关键文案、状态与交互断言
- 如果目标区域已有 snapshot / 结构化快照机制，沿用现有机制
- 不要因为“只是 UI”就跳过回归
- 如果改动涉及 Provider 类型切换、Prompt Cache 提示或模型/协议能力认知，至少补到“列表扫描态、详情头部、创建/编辑入口、聊天发送前或结果解释”中的实际受影响落点，避免同一语义只在单点出现

### 4. 配置与依赖改动必须成组提交

- 改配置结构时，要同步更新 schema、校验器、消费者与文档
- 改版本结构时，要执行 `npm run verify:app-version`
- 改依赖时，要同步提交对应锁文件，如 `package-lock.json`、`lime-rs/Cargo.lock`
- 本仓库没有 Bazel，不适用 Bazel lockfile 规则

Electron 打包 / 发布 / updater metadata 的 current 事实源固定为 `forge.config.mjs`、`electron-forge package`、`electron-forge make` 与仓库内 Forge maker。改这条链路时必须成组检查：

- `forge.config.mjs`
- `electron/forge/*`
- `package.json` 与 `package-lock.json`
- `.github/workflows/release.yml` 与相关发布 workflow
- `scripts/electron/run-package-dir.mjs`
- `scripts/electron/stage-release-assets.mjs`
- `scripts/electron/verify-package-resources.mjs`
- `scripts/electron/current-entrypoints.test.mjs`
- `scripts/electron/current-docs-guard.test.mjs`
- `scripts/check-app-server-client-contract.mjs`
- `internal/roadmap/appserver/release-updater.md`

旧 builder 配置 / CLI、自定义 Windows installer maker 与旧 YAML / blockmap updater metadata 属于 `dead`，不得继续作为 current 文档、CI、质量任务、i18n app metadata evidence 或守卫输入。运行时更新链路以 `electron/updateHost.ts` + Electron 内置 `autoUpdater` 为 current；Windows installer 以 Forge Squirrel 为 current，必须产出 `RELEASES` / `.nupkg` / Setup，macOS updater metadata 以 Forge ZIP maker 的 `RELEASES.json` 为 current。

旧 Rust / Tauri updater command 面已经删除，质量检查不能再把旧 `update_cmd` 文件、`commands::update_cmd::*` runner 注册、`UpdateInstallSessionState` 或 Rust 后台更新检查任务当作 fallback 或可修补对象。若 updater 行为失败，按 Electron Desktop Host / Forge / feed current 链路补实现和验证；不要在 `lime-rs/src/commands/` 新增 updater stub 或 compat wrapper。

`scripts/` 根目录和一级领域目录都是冻结的治理边界。新增可执行脚本默认必须放到已有 `scripts/<domain>/`、`scripts/lib/` 或所属 package；只有公开稳定入口且无法归入现有领域目录时才允许新增根目录或一级目录例外。涉及脚本目录、脚本入口或新增脚本时，必须同步检查：

- `scripts/README.md`
- `scripts/script-root-governance-baseline.json`
- `scripts/check-scripts-governance.mjs`
- `scripts/lib/scripts-governance-core.mjs`
- `package.json#scripts`

最低校验至少包含：

```bash
npm run governance:scripts
```

### 5. Rust 校验先小后大

- 默认先跑受影响 crate、模块或定向测试
- 再根据边界扩散决定是否执行全量 `cargo test`
- 目标是尽快暴露问题，而不是一上来把所有测试都跑满
- 后端 TDD / 发布续测默认优先使用仓库分层入口和 Cargo 过滤：`npm run test:rust:changed`、`npm run test:rust:related -- <paths...>`、`npm run test:rust:unit -- -p <crate> <filter>`、`npm run test:rust:integration -- -p <crate> --test <target>`；只有跨 crate 协议、workspace 版本 / schema、发布最终门禁或定向覆盖不足时，才扩大到 `--workspace` 或 `npm run test:rust`
- `test:rust:changed` / `test:rust:related` 是 Rust 后端压缩测试的默认执行入口：它们按 Git diff 或显式路径映射 `lime-rs/crates/**` workspace package，再用 `cargo metadata` 扩展反向依赖；触碰根 `Cargo.toml`、`Cargo.lock`、workspace 配置等边界时自动扩大到 `--workspace`；Rust 路径无法映射到 current workspace crate 时必须 fail closed，不允许静默通过 0 个测试
- 冷编译慢时不要靠反复全量重跑解决。优先复用统一 `lime-rs/target`、保留增量缓存，并在本机 / CI 工具链具备时使用 `RUSTC_WRAPPER=sccache` 或 `cargo nextest run` 作为环境级加速；仓库脚本只有在依赖和 CI 均已配置后才能把它们设为默认
- 在仓库根运行 Rust 校验必须显式带 `--manifest-path "lime-rs/Cargo.toml"`，或先 `cd lime-rs`；不要直接 `rustc lime-rs/src/*.rs` 编译主 crate，否则会绕过 workspace 依赖并产生 `can't find crate for lime_*` 误报
- 如果定向测试来自 `lime-rs/crates/aster-rust` 这类被 legacy host watch 覆盖的子工作区，先确认其 Cargo `target-dir` 已统一回 `lime-rs/target`，避免 watch 风暴导致 dev 无法启动

### 6. 巨型文件先拆分

- 新增 Rust 模块尽量控制在 `500 LoC` 内；所有非生成代码文件接近 `800 LoC` 时进入拆分预警，优先拆新模块或抽离职责切片
- 非生成代码文件超过 `1000` 行时，触碰前必须先判断是否能按领域、职责、数据边界或协议边界拆分
- 拆分时优先复用项目已有模式：facade + 子模块、service / repository 分层、projection / selector / helper 分离、测试模块外置；不要为了“拆文件”新增无意义抽象
- 如果本轮无法拆分，必须在执行计划登记原因、风险、退出条件和下一次拆分入口
- 不得继续向超过 `1000` 行的文件追加新业务逻辑，把“后续再拆”当作默认完成态

## 质量分层

### Layer 0：快速提醒

入口：

- `.husky/pre-commit`
- `npm run ai-verify`

作用：

- 做提交前的快速卫生检查
- 暴露明显问题与风险

边界：

- **不替代** 编译、测试、契约检查、GUI smoke

### Layer 0.5：TDD 快速测试分层

入口：

```bash
npm run test:unit
npm run test:component
npm run test:contract
npm run test:integration
npm run test:e2e
npm run test:layers:stats
npm run test:frontend:all
npm run test:resume
npm run test:related -- <files>
npm run test:changed -- <ref>
npm run test:rust:unit
npm run test:rust:changed
npm run test:rust:related -- <paths...>
npm run test:rust:integration
npm run test:rust:integration:changed
npm run test:rust:integration:related -- <paths...>
npm run test:rust:e2e
npm run test:rust:layers:stats
```

作用：

- `test:unit` 是本地和 AI TDD 的默认第一轮信号，优先覆盖 View Model / projection / selector / parser / formatter 等纯逻辑边界
- `test:component` 覆盖 React/jsdom 组件接线和关键 UI 回归
- `test:contract` 覆盖 DevBridge、desktop-host mock、App Server client / protocol、command catalog 一类轻量契约测试
- `test:integration` 覆盖文件系统、子进程、本地 fixture server 和多模块脚本流程
- `test:e2e` 覆盖 Vitest 内显式 E2E / smoke / live-gated 测试；真实产品主路径仍以 `verify:gui-smoke` / Playwright 为准
- `test:layers:stats` 按同一分类事实源输出分层统计、默认可运行数、live-gated 数，以及 component 测试的 VM 迁移候选提示
- `test:frontend:all` 保留现有前端 Vitest 全量兼容入口
- `npm test` / `test:frontend:all` 由 `scripts/run-vitest-smart.mjs` 执行分批全量，状态写入 `.lime/test/vitest-smart-last-run.json`；失败或中断后默认先用 `npm run test:resume` 续跑，或用 `npm test -- --from-batch <N>` / `npm test -- --only-batch <N>` 精确补批次，不要直接从头重跑全量
- `test:related` 使用 Vitest `related --run`，适合修改少量源码后只跑静态依赖相关测试；`test:changed` 使用 Vitest `--changed [ref]`，适合按 Git diff 收缩本地回归范围。二者是缩小反馈环，不替代发布前必要的全量或 GUI 证据
- CI 需要横向压缩前端全量时优先用 Vitest `--shard=<index>/<count>` 做稳定分片，并合并报告；本地中断续跑仍使用 `.lime/test/` 状态，不把 shard 当成失败续跑机制
- `test:rust:unit` 默认覆盖 Cargo default package 的 lib / module 单元测试，是后端 TDD 默认第一轮信号；改 workspace crate 时优先用 `npm run test:rust:changed` 或 `npm run test:rust:related -- <paths...>` 自动推导受影响 package，也可用 `npm run test:rust:unit -- -p <crate> <filter>` 精确过滤，避免无差别编译所有 crate
- `test:rust:integration` 默认覆盖 Cargo default package 的 integration test targets；需要扩大到全后端时显式传 `--workspace`，需要单个 integration target 时优先透传 `--test <target>`
- `test:rust:unit:changed` / `test:rust:integration:changed` 默认比较 `HEAD`，可传 `--changed=<ref>` 覆盖；`test:rust:unit:related` / `test:rust:integration:related` 接受一个或多个路径。二者都先映射 owning crate，再通过 Cargo metadata 扩展反向依赖；如果没有命中 `lime-rs` 路径会跳过 Rust 层，如果命中了 Rust 路径但无法映射 workspace crate 会失败
- `test:rust:e2e` 只在 `LIME_REAL_API_TEST=1` 或 `PROXYCAST_REAL_API_TEST=1` 显式打开时运行 ignored/live Rust E2E；默认不消耗真实 Provider / ASR 凭证
- `test:rust:layers:stats` 输出 Rust 测试文件分层统计，区分 workspace 默认可运行、live-gated 和 excluded subcrate 治理项
- Rust 分层命令的 `--list` 遵循同一 Cargo package scope：默认只列 root `lime` package，传 `--workspace` 才列全 workspace，传 `-p <crate>` 只列目标 crate；全树治理统计只看 `test:rust:layers:stats`
- Rust 加速优先级：先 Cargo `-p` / `--lib` / `--test` / test filter 收缩范围，再复用 `target` / incremental / sccache 缓存，最后才考虑 Nextest 并行调度；不要把 Nextest 或 sccache 写成必需门禁，除非仓库已经把安装和 CI 缓存配置纳入事实源

边界：

- `test:unit` 只证明快速逻辑回归，不等于可交付
- `test:rust:unit` 也只证明后端快速逻辑回归；Rust 模块交付仍需按风险补受影响 crate、integration、workspace 或全量 `test:rust`
- 显式后缀不能降低风险层级；`*.unit.test.*` 只在无 React/jsdom、DevBridge/Desktop Host/App Server、文件系统、网络、Playwright 等外部边界时进入 unit
- 新增或迁移 fast-check 属性测试时，优先用 `src/test/fastCheckRuns.ts` 的 `fastCheckRuns(100)` / `fastCheckRuns(50)` 包装 `numRuns`；本地 / AI TDD 默认降采样，CI 保持原始 runs，确需本地满量时设置 `LIME_FAST_CHECK_RUNS=100`
- GUI 壳、Workspace、主页面路径、Electron Host bridge、App Server、legacy desktop facade 和 Bridge 改动仍必须按后续 Layer 1-3 跑对应校验
- 前端复杂 UI 逻辑应优先抽到 View Model / projection / selector 中做单元测试；组件测试只保留必要渲染和事件接线，核心用户流程交给 GUI smoke / E2E
- 新增或重写前端测试时先做分层判断：筛选 / 分组 / formatter / request builder / 状态机 / reducer / runtime 参数投影等可纯化逻辑必须落到 `*.unit.test.ts`；只有 React 渲染、真实 DOM 事件、hook 生命周期、DevBridge/Desktop Host/App Server、文件系统、网络或端到端流程才进入 component / contract / integration / e2e
- 不允许为了“补回归”把大量业务分支继续加进 `*.test.tsx` 挂载测试。若当前逻辑暂时无法抽 VM，必须在路线图或执行计划记录原因、退出条件和后续迁移点，避免后续 Agent 把临时组件测试当作新规范
- 如果本地前端全量已经产生 `.lime/test/vitest-smart-last-run.json`，继续验证时先读该状态：上次失败 / running / interrupted / pending 批次未处理前，不得无理由再次执行裸 `npm test` 从第 1 批开始。只有测试收集规则、批次大小、依赖图或目标分支已经改变，才重建状态并说明原因

### Layer 1：本地统一入口

入口：

```bash
npm run verify:local
npm run verify:local:full
```

作用：

- 根据改动范围自动选择前端、Rust、Bridge、GUI smoke 等检查
- 让开发者在发起 PR 前有一个统一入口
- smart 模式下 Rust 路径改动走 `npm run test:rust:changed`；`--staged` 模式走 `npm run test:rust:related -- <staged-rust-paths>`；`--full`、无改动兜底和 workflow 全局风险仍保留 workspace 全量 `cargo test`

适用建议：

- 普通功能改动：默认执行 `npm run verify:local`
- 跨前后端、大范围重构、发布前自检：执行 `npm run verify:local:full`

### Layer 2：GUI 最小冒烟

入口：

```bash
npm run verify:gui-smoke
npm run verify:gui-smoke -- --include-knowledge-product-e2e --reuse-running
```

作用：

- 启动或复用 Electron GUI / Desktop Host
- 等待 `DevBridge` 健康检查通过
- 验证默认 workspace 的准备态可用
- 验证 `browser runtime` 的启动、状态读取与审计主链可用
- 其中 `browser runtime smoke` 默认以无界面浏览器会话执行，避免额外弹出仅用于校验的空白 Chrome
- 验证 `site adapter catalog` 的状态、列表与推荐主链可读
- 可选执行项目资料产品 E2E：`--include-knowledge-product-e2e` 会在 `smoke:knowledge-gui` 后追加 `npm run knowledge:product-e2e`，用于验证项目资料 PRD v3 首页、状态说明、确认、选择、保存和整理闭环

它解决的是 GUI 产品特有风险：

- 前端壳能不能真正起来
- `DevBridge` 是否就绪
- 默认 workspace / 本地工作目录能力是否可用

这类问题 **单靠** `lint`、`typecheck`、`vitest` 无法覆盖。

默认 `npm run verify:local`、`npm test`、`cargo test --manifest-path "lime-rs/Cargo.toml"` 与 `npm run verify:gui-smoke` 不允许消耗真实模型 / 图片 Provider 额度。会调用 App Server `agentSession/turn/start`、App Server `modelProvider/testChat`、图片生成、embedding、ASR 或 live AgentRuntime transcript 的测试 / smoke，必须显式 opt-in：

```bash
npm run verify:gui-smoke -- --include-live-provider-smokes
LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 npm run verify:gui-smoke
LIME_REAL_API_TEST=1 npm run smoke:agent-runtime-approval-sandbox
```

除 `npm run smoke:claw-chat-ready-streaming` 这种用户显式发起的 Claw live Provider / WebSearch-WebFetch E2E 入口外，单项 live Provider 脚本统一使用 `--allow-live-provider`；`npm run smoke:managed-objective-continuation`、`npm run smoke:managed-objective-automation` 与 `npm run smoke:code-runtime-fixture` 默认启动 localhost OpenAI-compatible fixture，不读取 `LIME_AGENT_QC_PROVIDER / LIME_E2E_PROVIDER / LIME_DEFAULT_PROVIDER` 作为真实 Provider 兜底，只有显式 `--allow-live-provider` 或 live Provider 环境授权后才可指定真实 provider/model；Vitest 的 `*.live.test.*` 默认从 `npm test` / `npx vitest` 收集中排除，直接点名运行也必须设置 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1` 或 `LIME_REAL_API_TEST=1`；普通 Vitest 默认还会安装外部网络守卫，覆盖 `fetch`、`XMLHttpRequest`、Node `http` / `https` 与 `net` / `tls` 直连请求，只允许 localhost / data / blob / file 等离线路径，避免未按 `.live.test` 命名的测试或 SDK 误打 Deepseek、OpenAI 或图片 Provider；Rust 真实联网测试必须同时使用 `#[ignore]` 和 `LIME_REAL_API_TEST=1` 二次门禁。设计画布只有 `--image-task live-single-layer` 需要该授权，connector outbox 只有 `--mode live` 需要该授权，Agent Apps 内容工厂的 action / completion E2E 与 `scripts/agent-app/content-factory-flow.mjs` 需要该授权，replay / fixture / registry-only 路径不应调用真实 Provider。

Agent Runtime / Claw chat 主路径改动，在进入 GUI smoke 或 Playwright 前先跑：

```bash
npm run smoke:agent-runtime-current-fixture
```

该入口必须维持非 live Provider、非 App Server mock backend、非 renderer mock fallback。它用于快速拦截历史恢复、流式终态、消息列表完成态、Electron session history / 代码产物工作台 guard 与 Claw GUI current fixture guard 回归；如果它失败，先修 current fixture 回归，再进入更重的 Electron / Playwright 验证。

若要验证真实 Electron 历史详情 hydrate / 最近对话恢复 current 链路，使用 `npm run smoke:agent-session-history-electron-fixture`。该脚本启动 Electron 并经 App Server current JSON-RPC 执行 session start/read/update/list，但不触发 turn，也不调用模型后端。

若要验证真实 Electron 代码产物和工作台闭环，使用 `npm run smoke:code-artifact-workbench-electron-fixture`。该脚本启动 Electron，使用 external fixture backend 产生代码 artifact，再通过 GUI 历史入口打开工作台；不调用正式模型，不走 App Server mock backend。

若要验证真实输入框发送和自然语言新闻请求 current 链路，使用 `npm run smoke:claw-chat-current-fixture`。该脚本比聚合 guard 更重，会启动 Electron 并通过 GUI 输入框发送“整理今天的国际新闻”，但仍使用 external fixture backend，不调用正式模型。

### Layer 3：契约与桥接边界

入口：

```bash
npm run test:contracts
npm run test:bridge
npm run bridge:health -- --timeout-ms 120000
```

如果本轮改动落在 harness cleanup / dashboard 推荐动作契约，还应补：

```bash
npm run harness:cleanup-report:check
```

这条校验已经进入 `npm run test:contracts` 默认门禁；如果你要点检某个指定产物，再显式执行：

```bash
node scripts/check-generated-slop-report.mjs --input "<cleanup-json>"
```

同时，`scripts/report-generated-slop.mjs`、`scripts/check-generated-slop-report.mjs`、`scripts/harness/eval-history-record.mjs`、`scripts/harness/eval-trend-report.mjs`、`scripts/lib/generated-slop-report-core.mjs`、`scripts/lib/harness-dashboard-core.mjs` 这条 harness cleanup/report 主链，在 `verify:local` 的 smart 模式里默认也按 bridge/contracts 风险处理。
本地 `verify:local` 输出里如果看到 `bridge 校验（harness cleanup contract）`，说明命中的就是这条 cleanup/report 契约门禁，而不是普通 DevBridge 变更。
CI 里的 `.github/workflows/quality.yml` 结果摘要现在也会透出 `bridge_reasons`，并写入 `GITHUB_STEP_SUMMARY`，用于区分这次是 `harness_cleanup_contract`、`bridge_runtime`，还是 `workflow_full_suite` / `fallback_full_suite` 这类全量触发。Agent QC / qcloop 保持为本地与人工证据工具，不进入 GitHub Actions 验证链路。
结果摘要默认按 `Scope / Required Gates / Notes / Recommended Next Action / Failure` 分段，优先让人一眼看清“为什么触发”“哪些门禁必跑”“最终为什么失败”，以及失败后本地最应该先跑哪条命令。
如果命中的是 `harness_cleanup_contract`，推荐动作应优先指向 `npm run harness:cleanup-report:check`，而不是只给一条泛化的 bridge 校验建议。

作用：

- 检查前端命令调用与 Rust 注册表是否一致
- 检查 harness metadata / execution runtime / 后端 request metadata 的关键字段是否漂移
- 检查浏览器桥接 / mock 优先路径是否同步
- 检查 `DevBridge` 是否可用
- 检查 task / service / workflow 类能力是否命中了各自的 current binding family；若某能力当前属于 `typed local_cli`，验证 runtime 是否结构化组装 `Lime CLI` 并回写统一真相源；若属于 `server_api / hybrid`，验证 run/job/task snapshot 是否正确回流，而不是把“模型有没有先写 Bash”当成通过条件
- 检查纯文本 `Claw @配图` 是否已经走 `原始用户消息 -> harness.image_skill_launch -> Agent 首刀 Skill(image_generate) -> lime_create_image_generation_task -> task/timeline` 主链，显式图片动作是否也已经走 `synthetic user message / displayContent -> harness.image_skill_launch -> Agent 首刀 Skill(image_generate) -> task/timeline`，统一目录声明的图片模型标签（例如设置页从 Provider 模型创建的 `@Nano Banana 2` / `@GPT Images 2`，或 Lime Cloud 下发的同构命令）是否也进入同一 `image_skill_launch` 回合并只把 Provider / model / executor_mode 作为路由上下文；未在 catalog 中声明的任意 `@模型名` 不应自动调用图片 API。图片主链不能卡在 `ToolSearch / WebSearch / Read / Glob / Grep`、退回旧的 `Bash/lime media image generate --json` / `lime task create image --json` 或聊天前端直建任务旁路，或把 `任务 ID：{task_id}` 这类模板占位原样显示出来
- 检查纯文本 `Claw @封面` 是否已经走 `原始用户消息 -> harness.cover_skill_launch -> Agent 首刀 Skill(cover_generate) -> task file` 主链，而不是回流成普通图片命令、卡在 `ToolSearch / WebSearch / Read / Glob / Grep`，或前端本地伪造结果
- 检查纯文本 `Claw @海报` 是否已经走 `原始用户消息 -> harness.image_skill_launch -> Agent 首刀 Skill(image_generate) -> lime_create_image_generation_task -> task/timeline` 主链，而不是回流成普通聊天、另一套海报协议、旧的 Bash/CLI 图片旁路，卡在 `ToolSearch / WebSearch / Read / Glob / Grep`，或前端本地伪造结果；同时确认默认 `entry_source=at_poster_command`、默认尺寸 `4:5 -> 864x1152` 与“海报设计”语义补齐仍然成立
- 检查纯文本 `Claw @视频` 是否已经走 `原始用户消息 -> harness.video_skill_launch -> Agent 首刀 Skill(video_generate) -> current binding -> task/timeline` 主链；如果当前 binding family 是 `typed local_cli`，应看到 runtime 结构化组装的 `lime media video generate --json`；如果当前 binding family 是原生结构化 binding，则应看到对应的 create task 调用。无论哪种都不能退化成模型自由写 Bash、卡在 `ToolSearch / WebSearch / Read / Glob / Grep`，或前端本地伪造结果
- 检查纯文本 `Claw @播报` 是否已经走 `原始用户消息 -> harness.broadcast_skill_launch -> Agent 首刀 Skill(broadcast_generate) -> task file` 主链，而不是退回普通聊天改写、卡在 `ToolSearch / WebSearch / Read / Glob / Grep`，或前端本地伪造结果
- 检查纯文本 `Claw @素材` 是否已经走 `原始用户消息 -> harness.resource_search_skill_launch -> Agent 首刀 Skill(modal_resource_search) -> 图片直搜时优先 lime_search_web_images / 其余情况走 task file` 主链，而不是回流到前端本地素材页逻辑、卡在 `ToolSearch / WebSearch / Read / Glob / Grep`，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @搜索` 是否已经走 `原始用户消息 -> harness.research_skill_launch -> Agent 首刀 Skill(research) -> search_query / tool timeline` 主链，而不是直接凭模型记忆回答、卡在 `ToolSearch / Read / Glob / Grep` 这类工具目录/本地文件偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @深搜` 是否已经走 `原始用户消息 -> harness.deep_search_skill_launch -> Agent 首刀 Skill(research) -> 多轮 search_query / tool timeline` 主链，而不是退化成一次普通搜索、卡在 `ToolSearch / Read / Glob / Grep` 这类工具目录/本地文件偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @研报` 是否已经走 `原始用户消息 -> harness.report_skill_launch -> Agent 首刀 Skill(report_generate) -> search_query / tool timeline` 主链，而不是直接退回普通聊天长文、卡在 `ToolSearch / Read / Glob / Grep` 这类工具目录/本地文件偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @竞品` 是否已经走 `原始用户消息 -> harness.report_skill_launch -> Agent 首刀 Skill(report_generate) -> search_query / tool timeline` 主链，而不是退回普通聊天口头对比、卡在 `ToolSearch / Read / Glob / Grep` 这类工具目录/本地文件偏航，或把 session permission 拒绝直接暴露给用户；同时确认默认 `focus` / `output_format` 已按竞品分析语义补齐
- 检查纯文本 `Claw @站点搜索` 是否已经走 `原始用户消息 -> harness.site_search_skill_launch -> Agent 首刀 Skill(site_search) -> lime_site_* / tool timeline` 主链，而不是先退回 `research / WebSearch`、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用搜索/本地文件偏航，或把浏览器兼容工具权限拒绝直接暴露给用户
- 检查纯文本 `Claw @读PDF` 是否已经走 `原始用户消息 -> harness.pdf_read_skill_launch -> Agent 首刀 Skill(pdf_read) -> list_directory / read_file / tool timeline` 主链，而不是退回普通聊天总结或前端本地解析、卡在 `ToolSearch / WebSearch / Grep` 这类工具目录/联网检索偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @总结` 是否已经走 `原始用户消息 -> harness.summary_skill_launch -> Agent 首刀 Skill(summary) -> 可选 list_directory / read_file / tool timeline` 主链，而不是退回普通聊天总结、卡在 `ToolSearch / WebSearch / Grep` 这类工具目录/联网检索偏航，或把 session permission 拒绝直接暴露给用户；同时确认 `Read / Glob` 仍保留给显式路径场景
- 检查纯文本 `Claw @翻译` 是否已经走 `原始用户消息 -> harness.translation_skill_launch -> Agent 首刀 Skill(translation) -> 可选 list_directory / read_file / tool timeline` 主链，而不是退回普通聊天翻译、卡在 `ToolSearch / WebSearch / Grep` 这类工具目录/联网检索偏航，或把 session permission 拒绝直接暴露给用户；同时确认 `Read / Glob` 仍保留给显式路径场景
- 检查纯文本 `Claw @分析` 是否已经走 `原始用户消息 -> harness.analysis_skill_launch -> Agent 首刀 Skill(analysis) -> 可选 list_directory / read_file / tool timeline` 主链，而不是退回普通聊天分析、卡在 `ToolSearch / WebSearch / Grep` 这类工具目录/联网检索偏航，或把 session permission 拒绝直接暴露给用户；同时确认 `Read / Glob` 仍保留给显式路径场景
- 检查纯文本 `Claw @发布合规` 是否已经走 `原始用户消息 -> harness.analysis_skill_launch -> Agent 首刀 Skill(analysis) -> 可选 list_directory / read_file / tool timeline` 主链，而不是退回普通聊天判断、重新长出另一套法务协议，或把 session permission 拒绝直接暴露给用户；同时确认默认 `focus/style/output_format` 与 `entry_source=at_publish_compliance_command` 已按创作风控语义补齐
- 检查纯文本 `Claw @转写` 是否已经走 `原始用户消息 -> harness.transcription_skill_launch -> Agent 首刀 Skill(transcription_generate) -> task file` 主链，而不是回流到前端直连旧 ASR 接口、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @链接解析 / @抓取 / @网页读取` 是否已经走 `原始用户消息 -> harness.url_parse_skill_launch -> Agent 首刀 Skill(url_parse) -> task file` 主链，而不是退回普通聊天总结、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或把 session permission 拒绝直接暴露给用户；同时确认 `@抓取` 默认会把 `extract_goal` 收敛到 `full_text`，`@网页读取` 默认会把 `extract_goal` 收敛到 `summary`
- 检查纯文本 `Claw @排版` 是否已经走 `原始用户消息 -> harness.typesetting_skill_launch -> Agent 首刀 Skill(typesetting) -> task file` 主链，而不是退回普通聊天润色、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或把 session permission 拒绝直接暴露给用户
- 检查纯文本 `Claw @网页` 是否已经走 `原始用户消息 -> harness.webpage_skill_launch -> Agent 首刀 Skill(webpage_generate) -> write_file HTML artifact` 主链，而不是退回普通聊天口头方案、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或没有真实 `.html` 文件就宣布完成
- 检查纯文本 `Claw @PPT` 是否已经走 `原始用户消息 -> harness.presentation_skill_launch -> Agent 首刀 Skill(presentation_generate) -> write_file Markdown artifact` 主链，而不是退回普通聊天口头提纲、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或没有真实演示稿文件就宣布完成
- 检查纯文本 `Claw @表单` 是否已经走 `原始用户消息 -> harness.form_skill_launch -> Agent 首刀 Skill(form_generate) -> ```a2ui simple form JSON` 主链，而不是退回普通聊天字段建议、卡在 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用工具偏航，或回流成单文件 HTML 表单原型；同时确认 render contract 已收敛为 `form + json`
- 检查自然语言代码任务是否已经走 `原始用户消息 -> react Agent runtime -> 模型按需工具 / 协作判断` 主链；`@代码` 只作为 `command catalog(code_runtime)` mention 快捷入口触发同一条主链，不允许前端根据“代码 / 修复 / 重构 / 评审”等正文关键词改写 prompt、重新写入 `harness.code_command`，不允许重新打开 `resolveCodeOrchestratedRuntimeDefaults`、前置执行策略选择或默认代码团队，也不允许把代码任务改写成另一套 workflow 旁路。旧 `code_orchestrated` / `auto` 输入只能在 compat 边界归一到 `react`
- 检查纯文本 `Claw @渠道预览` 是否已经走 `原始用户消息 -> displayContent 保留 -> /content_post_with_cover -> artifact` 主链，而不是退回普通聊天解释、重新长出另一套 `channel_preview_task` 协议，或静默混成正式 `@发布`；同时确认 `publish_command.intent=preview`、`entry_source=at_channel_preview_command` 与预览稿意图补齐仍然成立
- 检查纯文本 `Claw @上传` 是否已经走 `原始用户消息 -> displayContent 保留 -> /content_post_with_cover -> artifact` 主链，而不是退回普通聊天解释、重新长出另一套 `upload_task` 协议，或静默混成正式 `@发布`；同时确认 `publish_command.intent=upload`、`entry_source=at_upload_command` 与上传稿意图补齐仍然成立；若命中平台后台，也要确认浏览器门禁继续生效
- 检查纯文本 `Claw @发布` 是否已经走 `原始用户消息 -> displayContent 保留 -> dispatch /content_post_with_cover -> content_post workflow` 主链，而不是直接把 `@发布` 文本原样当普通聊天发送，或重新造一套 `publish_task` 协议；同时确认平台后台类输入会继续触发 `browser_requirement`
- 检查纯文本 `Claw @配音` 是否保留原始用户消息并写入 `harness.service_scene_launch(scene_key=voice_runtime)` / `entry_source=at_voice_command` 元数据，而不是退回普通聊天解释、误走站点型 `service_skill_launch`，或重新回流旧的本地 TTS 测试命令；同时确认 `skill_id` 与最近使用记录都能写回，且不会再注入 `scene_base_url / session_token` 一类旧云运行上下文。当前 `voice_generation` 是 `metadata_only` compat，检查时不能要求或声称本地 ServiceSkill 已真实生成音频，也不能写 `resolved_route` / `model_route_execution`
- 检查纯文本 `Claw @浏览器` 是否已经走 `原始用户消息 -> harness.browser_requirement/browser_launch_url -> Browser Assist / mcp__lime-browser__* timeline` 主链，而不是退回 WebSearch、普通聊天解释，或错误伪装成站点型 `service_skill_launch`；同时确认前端本轮 `webSearch` 已关闭
- 检查产品型 `/scene-key` 是否已经走 `原始用户消息 -> harness.service_scene_launch -> Agent 基于本地 service-scene 上下文直接执行 -> 本地 ServiceSkill / tool timeline` 主链，而不是前端直接调用云端 run API 或在 Rust 侧重新长出云执行分支
- 如果某个 `/scene-key` 绑定的是 `site_adapter` 型技能，还要额外检查 `scene -> linkedSkillId -> 完整 ServiceSkill 目录 -> harness.service_skill_launch` 这条绑定链是否仍然成立，避免首页隐藏 site skill 后 slash scene 变成“目录可见但执行找不到 skill”
- 如果某个 `site_adapter` 结果开始返回 `markdown_bundle`，还要确认保存链会把 Markdown、图片和 `meta.json` 一起落到项目导出目录，并把重写后的相对图片路径写回内容 metadata；同时确认聊天轻卡或 tool timeline 能显示项目目录、Markdown 路径和图片数量，不能只把远程图片 URL 或临时 DOM 文本留在聊天结果里；进入工作区后还要实际打开项目里的真实 `index.md`，确认正文不是运行摘要副本，且相对图片已经在预览里渲染出来

高频场景：

- 修改 `safeInvoke` / `invoke`
- 修改 `execute_skill`、`list_executable_skills`、`get_skill_detail` 或它们在 DevBridge / mock 中的分流
- 修改 `create_skill_scaffold_for_app`、技能草稿透传字段，或“聊天结果 -> Skill 脚手架”主链
- 修改 `capability_draft_*` 生成、验证或注册命令，或 Skills 工作台的 Capability Draft 隔离区
- 修改 `src/lib/api/document-export.ts`、`save_exported_document`，或把新的 GUI 导出入口接到本地文件保存主链
- 修改 App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.approval_policy / sandbox_policy`
- 修改 App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.provider_config.model_capabilities / tool_call_strategy / toolshim_model`
- 修改 App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.metadata.harness.team_memory_shadow`
- 修改 App Server / RuntimeCore / `lime-rs/crates/agent` 子代理 request surface 的 `name / teamName / cwd`、spawn 后 Team 成员写回，或 child `working_dir` / 父子上下文投影语义
- 修改 team runtime tool surface、tool inventory、主线程用户消息工具或协作工具展示，例如 `SendUserMessage`、`Agent / TeamCreate / TeamDelete / SendMessage / ListPeers`
- 修改 App Server `agentSession/update` 或会话 provider/model / recent_access_mode / recent_preferences / recent_team_selection 恢复语义
- 修改 `execution_runtime.recent_access_mode / recent_theme / recent_session_mode / recent_gate_key / recent_run_title / recent_content_id` 恢复语义，或前端 `harness.access_mode / harness.theme / harness.session_mode / harness.gate_key / harness.run_title / harness.content_id` steady-state 去重逻辑
- 修改首页 / 工作区进入 `Claw` 时的首条自动发送上下文，例如 `initialUserPrompt`、`initialAutoSendRequestMetadata`、`harness.service_skill_launch`
- 修改 `site_*` 站点适配器命令族，例如 `site_recommend_adapters`、`site_get_adapter_launch_readiness`、`site_import_adapter_yaml_bundle`、`site_run_adapter`
- 发现已下线的 `companion_get_pet_status`、`companion_launch_pet`、`companion_send_pet_command`、`companion-pet-status` 或旧桌宠本地 companion 协议回流
- 修改自动化设置 App Server method 族，例如 `automationJob/list`、`automationJob/create`、`automationJob/update`、`automationJob/health` 或 `automationJob/runHistory`；旧 `get_automation_*` / `*_automation_job` 命令已退役，只能作为负向回归扫描对象
- 修改浏览器资料 / 环境预设命令族，或调整它们在 `mockPriorityCommands` 里的优先级
- 修改浏览器连接器命令族，例如安装目录、启用状态、系统连接器、浏览器动作配置、扩展安装状态、打开 Chrome 扩展 / 远程调试页，或主动断开扩展连接
- 修改 `get_model_registry_provider_ids` 兼容空结果、Provider 实时模型读取或用户 `custom_models` 合并语义
- 修改 `create_image_generation_task_artifact`、`get_media_task_artifact`、`list_media_task_artifacts`、`cancel_media_task_artifact`、`src/lib/api/mediaTasks.ts`、`src/lib/api/skill-execution.ts`、`useWorkspaceSendActions`、`useWorkspaceImageWorkbenchActionRuntime`、`runtime_turn`，或调整 `Claw @配图` / 图片模型标签 `-> harness.image_skill_launch -> Agent 首刀 Skill(image_generate) -> task/timeline` 的异步图片任务主链
- 修改 `@封面` parser、`useWorkspaceSendActions`、`runtime_turn`、`cover_skill_launch`、`lime task create cover`、`cover_generate` skill 或 `lime_create_cover_generation_task`，尤其是调整 `Claw @封面 -> harness.cover_skill_launch -> Agent 首刀 Skill(cover_generate) -> task file` 主链
- 修改 `@海报` parser、`useWorkspaceSendActions`、`runtime_turn`、`image_skill_launch`、`lime_create_image_generation_task`、`image_generate` skill 或相关图片 timeline 展示，尤其是调整 `Claw @海报 -> harness.image_skill_launch -> Agent 首刀 Skill(image_generate) -> task/timeline` 主链
- 修改 `@播报` parser、`useWorkspaceSendActions`、`runtime_turn`、`broadcast_skill_launch`、`lime task create broadcast`、`broadcast_generate` skill 或 `lime_create_broadcast_generation_task`，尤其是调整 `Claw @播报 -> harness.broadcast_skill_launch -> Agent 首刀 Skill(broadcast_generate) -> task file` 主链
- 修改 `@素材` parser、`useWorkspaceSendActions`、`runtime_turn`、`resource_search_skill_launch`、`lime task create resource-search`、`modal_resource_search` skill 或 `lime_create_modal_resource_search_task`，尤其是调整 `Claw @素材 -> harness.resource_search_skill_launch -> Agent 首刀 Skill(modal_resource_search) -> task file` 主链
- 修改 `@搜索` parser、`useWorkspaceSendActions`、`runtime_turn`、`research_skill_launch`、`research` 默认 skill 或相关 tool timeline 展示，尤其是调整 `Claw @搜索 -> harness.research_skill_launch -> Agent 首刀 Skill(research) -> search_query / timeline` 主链
- 修改 `@深搜` parser、`useWorkspaceSendActions`、`runtime_turn`、`deep_search_skill_launch`、`research` 默认 skill 或相关 tool timeline 展示，尤其是调整 `Claw @深搜 -> harness.deep_search_skill_launch -> Agent 首刀 Skill(research) -> 多轮 search_query / timeline` 主链
- 修改 `@研报` parser、`useWorkspaceSendActions`、`runtime_turn`、`report_skill_launch`、`report_generate` 默认 skill 或相关 tool timeline 展示，尤其是调整 `Claw @研报 -> harness.report_skill_launch -> Agent 首刀 Skill(report_generate) -> search_query / timeline` 主链
- 修改 `@竞品` parser、`useWorkspaceSendActions`、`runtime_turn`、`report_skill_launch`、`report_generate` 默认 skill 或相关 tool timeline 展示，尤其是调整 `Claw @竞品 -> harness.report_skill_launch -> Agent 首刀 Skill(report_generate) -> search_query / timeline` 主链
- 修改 `@站点搜索` parser、`useWorkspaceSendActions`、`runtime_turn`、`site_search_skill_launch`、`site_search` 默认 skill 或相关 `lime_site_*` timeline 展示，尤其是调整 `Claw @站点搜索 -> harness.site_search_skill_launch -> Agent 首刀 Skill(site_search) -> lime_site_* / timeline` 主链
- 修改 `@读PDF` parser、`useWorkspaceSendActions`、`runtime_turn`、`pdf_read_skill_launch`、`pdf_read` 默认 skill 或相关 `list_directory / read_file` timeline 展示，尤其是调整 `Claw @读PDF -> harness.pdf_read_skill_launch -> Agent 首刀 Skill(pdf_read) -> list_directory / read_file / timeline` 主链
- 修改 `@总结` parser、`useWorkspaceSendActions`、`runtime_turn`、`summary_skill_launch`、`summary` 默认 skill 或相关 skill / tool timeline 展示，尤其是调整 `Claw @总结 -> harness.summary_skill_launch -> Agent 首刀 Skill(summary) -> 可选 list_directory/read_file / timeline` 主链
- 修改 `@翻译` parser、`useWorkspaceSendActions`、`runtime_turn`、`translation_skill_launch`、`translation` 默认 skill 或相关 skill / tool timeline 展示，尤其是调整 `Claw @翻译 -> harness.translation_skill_launch -> Agent 首刀 Skill(translation) -> 可选 list_directory/read_file / timeline` 主链
- 修改 `@分析` parser、`useWorkspaceSendActions`、`runtime_turn`、`analysis_skill_launch`、`analysis` 默认 skill 或相关 skill / tool timeline 展示，尤其是调整 `Claw @分析 -> harness.analysis_skill_launch -> Agent 首刀 Skill(analysis) -> 可选 list_directory/read_file / timeline` 主链
- 修改 `@发布合规` parser、`useWorkspaceSendActions`、`analysis_skill_launch`、`analysis` 默认 skill 或相关 skill / tool timeline 展示，尤其是调整 `Claw @发布合规 -> harness.analysis_skill_launch -> Agent 首刀 Skill(analysis) -> 风控结论 / timeline` 主链
- 修改 `@转写` parser、`useWorkspaceSendActions`、`runtime_turn`、`transcription_skill_launch`、`lime task create transcription`、`transcription_generate` skill 或 `lime_create_transcription_task`，尤其是调整 `Claw @转写 -> harness.transcription_skill_launch -> Agent 首刀 Skill(transcription_generate) -> task file` 主链
- 修改 `@链接解析` / `@抓取` / `@网页读取` parser、`useWorkspaceSendActions`、`runtime_turn`、`url_parse_skill_launch`、`lime task create url-parse`、`url_parse` skill 或 `lime_create_url_parse_task`，尤其是调整 `Claw @链接解析 / @抓取 / @网页读取 -> harness.url_parse_skill_launch -> Agent 首刀 Skill(url_parse) -> task file` 主链
- 修改 `@排版` parser、`useWorkspaceSendActions`、`runtime_turn`、`typesetting_skill_launch`、`lime task create typesetting`、`typesetting` skill 或 `lime_create_typesetting_task`，尤其是调整 `Claw @排版 -> harness.typesetting_skill_launch -> Agent 首刀 Skill(typesetting) -> task file` 主链
- 修改 `@网页` parser、`useWorkspaceSendActions`、`runtime_turn`、`webpage_skill_launch`、`webpage_generate` skill 或 HTML artifact 预览链路，尤其是调整 `Claw @网页 -> harness.webpage_skill_launch -> Agent 首刀 Skill(webpage_generate) -> write_file HTML artifact` 主链
- 修改 `@PPT` parser、`useWorkspaceSendActions`、`runtime_turn`、`presentation_skill_launch`、`presentation_generate` skill 或演示稿 artifact 预览链路，尤其是调整 `Claw @PPT -> harness.presentation_skill_launch -> Agent 首刀 Skill(presentation_generate) -> write_file Markdown artifact` 主链
- 修改自然语言编程底座、legacy `code_orchestrated` 兼容归一、`@代码` mention 快捷入口、`parseMentionCommand`、`useWorkspaceSendActions` 或 mention builtin command，尤其要确认普通代码请求仍走 `原始用户消息 -> react Agent runtime -> 模型按需工具 / 协作判断` 主链，`@代码` 只通过 catalog route 进入同一条主链，不恢复前置执行策略选择、搜索选择或思考选择
- 修改 `@渠道预览` parser、`useWorkspaceSendActions`、`publish_command` metadata 或 `content_post_with_cover` 预览意图编排，尤其是调整 `Claw @渠道预览 -> publish_command.intent=preview -> /content_post_with_cover -> artifact` 主链
- 修改 `@上传` parser、`useWorkspaceSendActions`、`publish_command` metadata、浏览器门禁推导或 `content_post_with_cover` 上传意图编排，尤其是调整 `Claw @上传 -> publish_command.intent=upload -> /content_post_with_cover -> artifact` 主链
- 修改 `@发布` parser、`useWorkspaceSendActions`、content post workflow 入口或浏览器门禁推导，尤其是调整 `Claw @发布 -> displayContent/raw -> /content_post_with_cover -> publish workflow` 主链
- 修改 `@配音` parser、`useWorkspaceSendActions`、`service_scene_launch` 组装或 `voice_generation` metadata-only compat 护栏，尤其要确认 `Claw @配音 -> harness.service_scene_launch(scene_key=voice_runtime)` 只写入口 / 任务元数据，不恢复旧 TTS、不注入云 session、不伪造本地 ServiceSkill 音频执行
- 修改 `@浏览器` parser、`useWorkspaceSendActions`、Browser Assist 直发策略、`browser_requirement` 推导或 `mcp__lime-browser__*` 浏览器工具接线，尤其是调整 `Claw @浏览器 -> harness.browser_requirement/browser_launch_url -> Browser Assist timeline` 主链
- 修改 `/scene-key` 解析、`serviceSkillSceneLaunch`、`useWorkspaceSendActions`、`runtime_turn`、`prompt_context`、compat `lime_run_service_skill` 或 `client/skills` scene 目录协议，尤其是调整 `Claw /scene-key -> harness.service_scene_launch -> 本地 service-scene 直驱执行 -> 本地 ServiceSkill / tool timeline` 主链
- 修改 `src/lib/dev-bridge/`
- 修改 `src/lib/desktop-host/` 或 legacy mock path
- 修改 `lime-rs/src/app/runner.rs`
- 修改 `lime-rs/src/dev_bridge/`

如果本轮修改了 `Claw @配图` 或图片任务 artifact 回填语义，最低校验至少包含：

- `npm run test:contracts`
- `cd lime-rs && cargo test test_merge_system_prompt_with_image_skill_launch_appends_prompt`
- `cd lime-rs && cargo test test_append_image_skill_launch_session_permissions_blocks_detour_tools`
- `imageWorkbenchCommand`、`useWorkspaceSendActions`、受影响 skill / image task Hook 单测，以及 `aster_agent_cmd` 图片主链定向测试
- 如果本轮还改了显式图片动作入口，例如文稿 inline 配图、封面位或图片工作台编辑/重绘，额外覆盖 `useWorkspaceImageWorkbenchActionRuntime` 或对应发送桥接回归
- 若本轮还改了显式 `execute_skill` 的 `images / requestContext` 透传或 compat 续接，额外覆盖 `skillCommand` 回归
- 受影响的 `image task` / `image workbench` Hook 单测
- `npm run verify:gui-smoke`

如果本轮还修改了文稿 inline 配图占位逻辑，例如 `usage=document-inline`、`relationships.slot_id`、payload compat `slot_id`、`anchor_section_title`、`anchor_text`、正文占位块原位替换或文稿画布图片占位渲染，受影响回归至少要额外覆盖：

- 文稿占位块插入
- `relationships.slot_id` 绑定的原位替换
- `anchor_section_title` 驱动的小节级插入
- `anchor_text` 驱动的段落级插入
- 失败 / 取消状态不误替换成成功图片

如果本轮修改了 `Claw @封面` 或封面任务协议，最低校验至少包含：

- `coverWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 封面主链 / detour tool 限制定向测试
- `lime-cli` 封面任务创建回归、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- `npm run verify:gui-smoke`

如果本轮修改了 `Claw @视频` 或视频任务协议，最低校验至少包含：

- `videoWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 视频主链 / detour tool 限制定向测试
- `lime media video generate` 回归、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @播报` 或播报任务协议，最低校验至少包含：

- `broadcastWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 播报主链 / detour tool 限制定向测试
- `lime-cli` 播报任务创建测试、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @素材` 或素材检索任务协议，最低校验至少包含：

- `resourceSearchWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 素材检索主链 / detour tool 限制定向测试
- `lime-cli` 资源检索任务创建测试、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @搜索` 或搜索 prompt skill 协议，最低校验至少包含：

- `searchWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 搜索主链 / detour tool 限制定向测试
- `research` 默认 skill / tool catalog 相关回归
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @深搜` 或深搜 prompt skill 协议，最低校验至少包含：

- `deepSearchWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 深搜主链 / detour tool 限制定向测试
- `research` 默认 skill / tool catalog 相关回归，且要确认没有退化成只执行一轮浅搜
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @研报` 或研报 prompt skill 协议，最低校验至少包含：

- `reportWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 研报主链 / detour tool 限制定向测试
- `report_generate` 默认 skill / `skillCatalog` 相关回归，且要确认没有退回普通聊天长文或跳过真实 `search_query`
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @站点搜索` 或站点搜索 prompt skill 协议，最低校验至少包含：

- `siteSearchWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 站点搜索主链 / detour tool 限制定向测试
- `site_search` 默认 skill / `lime_site_*` tool catalog 相关回归
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @读PDF` 或读 PDF prompt skill 协议，最低校验至少包含：

- `pdfWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 读 PDF 主链 / detour tool 限制定向测试
- `pdf_read` 默认 skill / `skillCatalog` 相关回归；若支持相对路径，还要确认没有跳过真实 `list_directory / read_file` timeline
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @总结` 或总结 prompt skill 协议，最低校验至少包含：

- `summaryWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 总结主链 / detour tool 限制定向测试
- `summary` 默认 skill / `skillCatalog` 相关回归；若支持文件路径总结，还要确认没有跳过真实 `list_directory / read_file` timeline
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @翻译` 或翻译 prompt skill 协议，最低校验至少包含：

- `translationWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 翻译主链 / detour tool 限制定向测试
- `translation` 默认 skill / `skillCatalog` 相关回归；若支持文件路径翻译，还要确认没有跳过真实 `list_directory / read_file` timeline
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @分析` 或分析 prompt skill 协议，最低校验至少包含：

- `analysisWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 分析主链 / detour tool 限制定向测试
- `analysis` 默认 skill / `skillCatalog` 相关回归；若支持文件路径分析，还要确认没有跳过真实 `list_directory / read_file` timeline
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @转写` 或转写任务协议，最低校验至少包含：

- `transcriptionWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 转写主链 / detour tool 限制定向测试
- `lime-cli` 转写任务创建测试、`media-runtime` 任务类型回归、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @链接解析` 或链接解析任务协议，最低校验至少包含：

- `urlParseWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 链接解析主链 / detour tool 限制定向测试
- `lime-cli` 链接解析任务创建测试、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @排版` 或排版任务协议，最低校验至少包含：

- `typesettingWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 排版主链 / detour tool 限制定向测试
- `lime-cli` 排版任务创建测试、受影响的默认 skill / tool catalog 测试
- `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @网页` 或网页生成协议，最低校验至少包含：

- `webpageWorkbenchCommand`、`useWorkspaceSendActions`、提及面板 builtin command 回归，以及 `aster_agent_cmd` 网页主链 / detour tool 限制定向测试
- `webpage_generate` 默认 skill、默认 skill 安装或 `lime-cli skill show webpage_generate` 相关回归

如果本轮修改了 `Claw @PPT` 或演示稿生成协议，最低校验至少包含：

- `npx vitest run "src/components/agent/chat/utils/presentationWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx"`
- `cargo test presentation_skill_launch`
- `cargo test -p lime-cli skill_show_presentation_generate_returns_builtin_skill`
- `presentation_generate` 默认 skill、默认 skill 安装或 `lime-cli skill show presentation_generate` 相关回归
- `npm run test:contracts`
- 若 HTML artifact 预览主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了自然语言编程底座、`@代码` 快捷入口或代码编排发送协议，最低校验至少包含：

- `npx vitest run "src/components/agent/chat/utils/mentionCommandPrefixMatch.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/lib/governance/legacySurfaceCatalog.test.ts"`
- 如有改动扩散到 runtime/team/tool 协议，再补对应 `agentStream*` / runtime team / tool display 定向回归
- 若命令边界或 harness 协议继续扩散，再补 `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @发布` 或发布工作流接线，最低校验至少包含：

- `npx vitest run "src/components/agent/chat/utils/publishWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts"`
- 如有改动扩散到 `content_post_with_cover` slash skill 或写文件回流，再补 `skillCommand` / `MessageList` / general workbench 相关定向回归
- 若浏览器门禁或 harness 协议继续扩散，再补 `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @配音` 或配音服务型技能接线，最低校验至少包含：

- `npx vitest run "src/components/agent/chat/utils/voiceWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts" "src/lib/api/serviceSkills.test.ts"`
- 如有改动扩散到 `service_scene_launch` runtime、`lime_run_service_skill`、本地 service-scene 执行桥或 compat 结果回流，再补对应 `runtime_turn` / `prompt_context` / `tool_runtime/service_skill_tools` 定向测试
- 若 `service_scene_launch` / harness 协议继续扩散，再补 `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 `Claw @浏览器` 或显式浏览器任务接线，最低校验至少包含：

- `npx vitest run "src/components/agent/chat/utils/browserWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" "src/components/agent/chat/skill-selection/CharacterMention.test.tsx" "src/lib/api/skillCatalog.test.ts"`
- 如有改动扩散到 Browser Assist 自动拉起、画布附着或浏览器工具结果回流，再补 `index.test.tsx`、`useWorkspaceBrowserAssistRuntime` 或相关 artifact/runtime 定向回归
- 若 `browser_requirement` / harness 协议继续扩散，再补 `npm run test:contracts`
- 若 GUI 主路径受影响，再补 `npm run verify:gui-smoke`

如果本轮修改了 Provider 模型真相源或设置页中的“支持的模型”展示逻辑，还应额外确认：

- 资源索引损坏时，GUI 会明确提示“模型真相源异常”
- 不会再静默回退数据库或把错误伪装成空模型列表

如果本轮修改了 Provider 类型与 Prompt Cache 能力边界，还应额外确认：

- `anthropic-compatible` 不会再被 UI 或运行时误显示成“自动 Prompt Cache”
- `设置 -> AI 服务商` 的列表、详情、创建和编辑入口中，受影响落点会继续提示“显式 cache_control”
- 聊天侧 `ModelSelector / Inputbar / MessageList / TokenUsageDisplay` 与 API Key Provider / model registry 的口径保持一致

### Layer 4：交互型 E2E

入口：

- `internal/aiprompts/playwright-e2e.md`
- 项目资料 PRD v3 产品闭环：`npm run knowledge:product-e2e`
- 需要把项目资料产品闭环和 GUI smoke 串联时：`npm run verify:gui-smoke -- --include-knowledge-product-e2e --reuse-running`

作用：

- 用 Playwright MCP 做真实页面交互验证
- 检查控制台错误、主导航、关键业务工作流
- 对项目资料，额外检查普通用户默认页面不暴露工程词、不保留假入口、不在保存前展示假统计

注意：

- 不要把所有页面默认都推进到重型 E2E
- 先跑最小 smoke，再决定是否需要完整交互验证

### Layer 5：Agent QC 运营证据

入口：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
npm run agent-qc:qcloop-job -- --risk P0 --output "./.lime/qc/qcloop-p0-job.json" --check
npm run agent-qc:export-evidence -- --job-id "<qcloop-job-id>" --output "./.lime/qc/agent-qc-evidence.json" --check
npm run agent-qc:release-summary -- --evidence "./.lime/qc/agent-qc-evidence.json" --require-scenario-manifest "internal/test/agent-qc-scenarios.manifest.json" --require-risk P0 --tag "<release-tag>" --output "./.lime/qc/release-agent-qc.md" --check
npm run agent-qc:audit
```

事实源：

- `internal/tests/agent-ops-qc.md`
- `internal/tests/agent-qc-p0-scenarios.md`
- `internal/tests/lime-agent-qc-rollout-plan.md`
- `internal/test/agent-qc-scenarios.manifest.json`
- `internal/test/agent-qc-evidence.schema.json`
- `internal/test/agent-qc-gui-flows.manifest.json`

作用：

- 把 Lime 的 Agent Runtime、GUI、行为评测和人工发布证据收敛成可审计场景清单
- 让 qcloop / 本地人工发布流程共享同一份 evidence contract；GitHub Actions 不执行 Agent QC 验证
- 防止测试标准自身漂移，例如 scenario 引用了不存在的 npm script

注意：

- `agent-qc:check` 是本地显式入口，不进入 `npm run test:contracts`；GitHub Actions 中的合同验证不再间接跑 Agent QC
- Agent QC 不替代 `verify:local`、`verify:gui-smoke` 或 `harness:eval`；它负责把这些入口编排成运营级证据链
- `agent-qc:qcloop-job` 只从 manifest 生成 qcloop payload，不启动 qcloop、不提交任务
- `agent-qc:export-evidence` 只转换 qcloop job 结果，不会替你跑测试；如果 qcloop item 仍是 `pending/running`，导出的 verdict 必须是 `blocked`
- `agent-qc:release-summary -- --check` 是本地 / 人工发布证据聚合；缺 Evidence Pack、Evidence Pack 非 `pass`，或未覆盖全部 P0 scenario id 时不能作为绿色 Agent QC 证据
- `.github/workflows/release.yml` 只创建或刷新 GitHub Release，不读取 Agent QC Evidence Pack
- `agent-qc:audit` 是完成度审计；真实 qcloop evidence、真实 GUI evidence 缺失，或 GitHub Actions 重新接入 Agent QC 时必须保持 `incomplete`

## 改动类型与最低门槛

| 改动类型                                                               | 至少运行                                                                                           | 额外要求                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 普通前端改动                                                           | `npm run verify:local`                                                                             | 如有用户可见变化，补稳定回归                    |
| Electron IPC / App Server / Bridge / mock / legacy desktop facade 改动 | `npm run verify:local`、`npm run test:contracts`                                                   | 必要时补 `npm run governance:legacy-report`     |
| Electron host / App Server current 测试迁移                            | `npm run test:bridge`、`npm run test:contracts`、相关 `packages/app-server-client` / Rust 定向测试 | GUI 主路径受影响时补 `npm run verify:gui-smoke` |
| GUI 壳 / Workspace / 页面主路径改动                                    | `npm run verify:local`、`npm run verify:gui-smoke`                                                 | 必须补对应 UI 回归                              |
| 运行时 handoff / 证据包导出改动                                        | `npm run test:contracts`、相关 `vitest`、Rust 定向测试                                             | 如入口落在工作台 UI，再补最小 GUI 续测          |
| 配置结构改动                                                           | `npm run verify:local`                                                                             | 同步 schema、消费者、文档                       |
| 版本相关改动                                                           | `npm run verify:app-version`                                                                       | 与发布配置一起核对                              |
| Rust 模块改动                                                          | 受影响 crate / 模块定向测试                                                                        | 再决定是否跑全量 `cargo test`                   |
| 真实页面交互验证                                                       | 先跑 `npm run verify:gui-smoke`                                                                    | 再进入 `playwright-e2e.md`                      |

补充说明：

- 如果这次改动新增或调整公开 CLI，或改变某个能力的 `typed local_cli` binding（例如 `@lime/cli`、`lime media ...`），至少补受影响 crate 的定向测试；媒体 `Lime CLI` 主链当前最低建议为 `cargo test --manifest-path lime-rs/Cargo.toml -p lime-media-runtime -p lime-cli`。如果 CLI 结果会回流 Workbench/Agent，再补对应 Rust 或前端定向回归。
- 如果这次改动把 `ServiceSkill -> automation_job -> agent_turn` 接到 Artifact 主线，除了常规 `verify:local` / `test:contracts` 之外，还应至少补一条稳定回归，证明 `content_id + request_metadata.artifact` 没在表单编辑或执行链路里丢失。
- 如果这次改动影响 `Claw` 与站点技能的直跑门禁，还应补回归证明：阻断停留在技能入口层，不再把浏览器准备态注入成对话里的继续执行确认。
- 如果这次改动把 `content_id` steady-state 从“每回合显式提交”后移到 `session/runtime`，除了契约检查之外，还应补 Hook/UI 回归，证明：
  - session 已有 `execution_runtime.recent_content_id` 时，前端不会重复提交相同 `harness.content_id`
- 如果这次改动涉及上下文压缩语义，至少要同时验证两条运行时链路：
  - 普通 App Server `agentSession/turn/start` 发消息链路
  - App Server `agentSession/action/respond` 的 ask-user / elicitation 恢复链路
    二者在 `workspace.settings.auto_compact=false` 时都不应再偷偷触发自动压缩，而应把“请手动压缩或新建会话”的错误显式投影到前端。
  - 切换到新 content 但 runtime 尚未同步时，前端仍会保留显式 `content_id`
- 如果这次改动把 `theme / session_mode` steady-state 从“每回合显式提交”后移到 `session/runtime`，除了契约检查之外，还应补 Hook/UI 回归，证明：
  - session 已有 `execution_runtime.recent_theme / recent_session_mode` 时，前端不会重复提交相同 `harness.theme / harness.session_mode`
  - 切换到新 theme 或 `general_workbench` 但 runtime 尚未同步时，前端仍会保留显式 `theme / session_mode`
- 如果这次改动影响 `harness.team_memory_shadow` 这类 repo-scoped Team 协作上下文，除了契约检查之外，还应补：
  - 前端发送边界回归，确认 `team_memory_shadow` 能随当前请求进入 App Server `agentSession/turn/start`
  - Rust `prompt_context` 定向测试，确认 shadow 只作为低优先级协作参考，不覆盖显式 `selected_team_*` 或 `recent_team_selection`
- 如果这次改动影响 App Server / RuntimeCore / `lime-rs/crates/agent` 子代理 current request surface，除了契约检查之外，还应补：
  - Rust 定向测试，确认显式 `name` 会覆盖 child session 展示名 / role hint 的 fallback
  - Rust 或前端回归，确认 `teamName` 必须与 `name` 搭配，并且只在现有 Team 上下文内写回成员关系
  - Rust 定向测试，确认当前 runtime 对非空 `mode / isolation` 会返回明确 unsupported，而不是静默忽略
  - 定向验证，确认绝对 `cwd` 会投影到 child `working_dir`，相对路径会在边界被拒绝
- 如果这次改动把 `accessMode` steady-state 从“只写 harness metadata”收敛到正式 turn context 与 `session/runtime`，除了契约检查之外，还应补 Hook/UI 回归，证明：
  - turn 提交始终携带正式 `approval_policy / sandbox_policy`
  - session 已有 `execution_runtime.recent_access_mode` 时，切换话题会恢复对应 accessMode，而不是回退到工作区默认值
  - execution_runtime 缺失但本地 shadow 已命中时，前端仍会回填 `recent_access_mode` 到 session
- 如果这次改动把 `gate_key / run_title` steady-state 从“每回合显式提交”后移到 `session/runtime`，除了契约检查之外，还应补 Hook/UI 回归，证明：
  - session 已有 `execution_runtime.recent_gate_key / recent_run_title` 时，前端不会重复提交相同 `harness.gate_key / harness.run_title`
  - 切换到新的通用工作区 gate 或运行标题、但 runtime 尚未同步时，前端仍会保留显式 `gate_key / run_title`
- 如果这次改动影响浏览器工作台里的站点采集链路，例如推荐区、资料自动选择、`site_get_adapter_launch_readiness` 门禁、`report_hint` 展示、`lime_site_recommend`，或“优先写回当前 `content_id` 而不是新建资源文档”的主线收敛，除了契约检查，还应补对应 `*.test.tsx` 回归并执行 `verify:gui-smoke`。
- 如果这次改动影响浏览器资料 / 环境预设的真实来源，还应补一次浏览器模式实测，确认控制台不再出现 `[Mock] invoke: list_browser_profiles_cmd` 或 `[Mock] invoke: list_browser_environment_presets_cmd`。
- 如果这次改动影响设置页“连接器”主路径或 Chrome 扩展导出链路，除了 `test:contracts`，还应补对应设置页回归，并在 GUI smoke 或 Playwright 续测里确认连接器页能打开、目录可选、扩展状态可读。
- 如果这次改动影响 App Server `agentSession/handoffBundle/export`、`evidence/export`、`agentSession/analysisHandoff/export`、`agentSession/reviewDecisionTemplate/export`、`agentSession/reviewDecision/save` 或 `agentSession/replayCase/export` 这条 Harness 导出 / 审核主链，除了契约检查，还应至少补：
  - `src/lib/api/agent.test.ts` 一类的网关回归，确认仍走 App Server current export method
  - `HarnessStatusPanel.test.tsx` 一类的 UI 回归，确认导出入口、保存弹窗、状态与制品展示正常
  - 受影响 Rust 服务 / 命令的定向测试，确认 `.lime/harness/sessions/<session_id>/...` 一类制品仍能生成
- 如果这次改动影响 `src/lib/api/agentRuntime/` 的 current 目录结构，例如 `types.ts`、分域 client或 compat 根入口 `agentRuntime.ts`，最低应补：
  - `npm run typecheck`
  - `npx eslint "src/lib/api/agentRuntime.ts" "src/lib/api/agentRuntime/*.ts" --max-warnings 0`
  - `npm test -- src/lib/api/agent.test.ts src/components/agent/chat/hooks/agentRuntimeAdapter.test.ts`
  - `npm run test:contracts`
    同时确认目录内实现没有再从 `../agentRuntime` 或 `@/lib/api/agentRuntime` 回绕 compat barrel 取类型。

## CI 事实源

主工作流：

- `.github/workflows/quality.yml`

关键事实源：

- `scripts/quality-task-planner.mjs`
- `scripts/quality-task-selector.mjs`
- `scripts/local-ci.mjs`

要求：

- 本地 `verify:local` 与 CI 使用同一套 changed-path 分类逻辑
- PR 前端快速门禁显式执行 `lint`、`typecheck`、`test:unit`、`test:contract`，避免把全量 Vitest 作为默认 TDD 反馈环
- `main` push 与手动触发继续执行 `test:frontend:all`、`test:rust`、`verify:gui-smoke`，作为合并后 / 发布前的全量质量面
- 最终由 `results` job 聚合为统一质量信号
- 对 GUI 产品来说，PR 门禁不能只覆盖静态检查；涉及命令 / Bridge 时必须补 `Bridge & Contracts`，涉及 GUI 壳 / Workspace / 主路径时必须补 `GUI Smoke`

## PR 前最小清单

发起 PR 前，至少自问这五件事：

1. 这次改动属于普通逻辑、协议边界、GUI 主路径还是治理收口？
2. 我是不是已经走过对应的最低校验？
3. 如果改了命令、配置或版本，相关文档与锁文件是否同步？
4. 如果改了用户可见 UI，是否补了稳定回归？
5. 如果改了 GUI 壳、Bridge、Workspace，是否真的跑过最小 smoke？

## 常用命令

```bash
# 本地统一校验
npm run verify:local
npm run verify:local:full

# GUI 最小冒烟
npm run verify:gui-smoke
npm run smoke:workspace-ready
npm run smoke:browser-runtime
npm run smoke:site-adapters
npm run smoke:agent-service-skill-entry

# 前端 / 桥接 / 契约
npm run test:unit
npm run test:component
npm run test:contract
npm run test:integration
npm run test:e2e
npm run test:layers:stats
npm run test:frontend:all
npm run test:resume
npm run test:related -- <files>
npm run test:changed -- <ref>
npm run test:rust:unit
npm run test:rust:changed
npm run test:rust:related -- <paths...>
npm run test:rust:integration
npm run test:rust:e2e
npm run test:rust:layers:stats
npm test
npm run test:bridge
npm run test:contracts
npm run bridge:health -- --timeout-ms 120000

# GUI / Electron 调试
npm run electron:dev
npm run verify:gui-smoke
```

## 相关文档

- `internal/aiprompts/commands.md`
- `internal/aiprompts/governance.md`
- `internal/aiprompts/playwright-e2e.md`

## 决策原则

只有一句话：

**Lime 是 GUI 桌面产品，工程质量不能只验证“代码能编译”，还要验证“应用壳、桥接、工作区主路径能运行”。**
