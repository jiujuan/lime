# 治理判断手册

## 这份文档回答什么

本文件定义 Lime 仓库的治理判断标准，主要回答：

- 什么才算“统一事实源”，而不是“又补了一套更新版本”
- 哪些路径还能继续演进，哪些路径只能收口、下线或删除
- 遇到新旧并存时，应该先做什么，而不是先补功能再说
- 如何用仓库现有守卫阻止 compat / deprecated 路径继续膨胀

它是 **仓库治理规则**，不是某个 AI 工具、reviewer、sub-agent 或外部流程的说明书。

## 第一原则

**同一种能力，在同一时期只能存在一个继续演进的事实源。**

其余实现必须被明确归类。

生产路径不能 mock。mock 只允许作为测试夹具、契约守卫或已标明测试场景的本地 fixture；如果生产入口需要靠 `defaultMocks`、`mockPriorityCommands`、`invokeMockOnly`、renderer mock fallback 或 App Server mock backend 才能跑通，该入口应判为阻塞缺口，而不是可交付降级。

用户问“结论 / 复核 / 是否能删 / 是否 dead”时，先给短结论和关键证据，不自动扩展成全量治理清理。目录级旧实现如果同时满足：已脱离构建 / workspace manifest、当前工作树已物理删除或 staged delete、已有 current owner 承接、边界守卫能防回流，可直接按目录级 `dead / deleted / forbidden-to-restore` 处理；不要求逐文件证明“业务语义无价值”。执行计划历史 checkpoint、旧路线图和 git history 里的旧路径默认是 evidence，不是 current owner 残留，除非它们正在当前规则或 active checklist 中被当成现役落点。

`lime-rs/src/**` 旧主 crate / legacy facade / 迁移来源目录已于 `2026-06-10` 物理删除，当前 Cargo workspace 只以 `lime-rs/crates/**` 为 Rust 事实源。不得恢复该目录、不得新增 bootstrap / runner / compat facade / tombstone / stub，也不得把历史路径当新增后端业务、领域服务、runtime 分支、API adapter、数据访问或跨 App 复用能力的落点。需要参考旧实现时只读 git history / 执行计划，落地必须进入 App Server、RuntimeCore、services、core、agent、协议/client crate 或 Electron Desktop Host。

`lime-rs/src/commands/**` 已随 `lime-rs/src/**` 删除；旧 Tauri command wrapper、runner / dispatcher / catalog / mock 注册只能作为 retired guard / 历史引用存在。新增 Rust 后端能力必须进入 App Server crates / RuntimeCore / services 等 current 事实源；桌面壳能力进入 Electron Desktop Host。任何恢复旧 wrapper、fail-closed stub、compat wrapper 或退场 stub 的改动都应被视为旧路回流。

非生成代码文件接近 `800` 行时进入拆分预警，超过 `1000` 行时必须把它视为治理风险。触碰这类文件前，优先按领域、职责、数据边界或协议边界拆成小模块，并复用项目已有的 facade + 子模块、service / repository 分层、projection / selector / helper 分离等模式；如果本轮无法拆分，必须在执行计划登记原因、风险、退出条件和下一次拆分入口。不得因为“顺手加一点”继续向巨型文件追加新业务逻辑。

## 立即替换优先原则

如果用户已经明确下面任一前提：

- 上一版无人使用
- 不需要兼容
- 旧实现正在阻碍 current 路线图主线
- 要最好的选择，而不是沿用现有方案
- 旧实现只是 MVP / mock / 临时占位
- 历史包袱已经让流程变慢、变长或变复杂

则额外遵守：

1. 先判断能否本轮直接替换；能替换就直接替换，不先设计长期收口期
2. 不要因为旧实现“还能跑”就默认保留它
3. 与 current 规划直接冲突的旧实现，优先判成 `dead`；只有本轮确实无法一次替换且存在外部兼容约束时，才判成带明确退出条件的 `deprecated`
4. `legacy current reference` 只表示“它曾经是实现锚点”，不表示“后续还能继续在这条旧实现上长功能”
5. 不要为了减少表面 diff，把旧页面、旧命令、旧协议包装成新的 compat 壳继续留在主链旁边
6. 不要把“先平移成新壳、后面再清理”当作默认工程步骤；这只允许用于无法一次替换的高风险数据迁移、外部协议兼容或跨版本发布约束

适合立即替换、而不是长期收口的典型场景：

- **临时 UI / MVP UI**：textarea、静态预览、占位 Profile、假按钮、只读卡片等已经被正式编辑器、正式工作台或真实 workflow 取代时，直接替换入口和测试断言，不保留双 UI
- **编辑器 / 渲染器选型**：已经确定 Tiptap / ProseMirror、Canvas、Monaco、Three.js 等唯一事实源时，旧自研简化版、旧 Markdown textarea、旧 iframe / webview renderer 直接下线
- **mock / fallback 生产路径**：生产入口依赖 mock backend、renderer mock fallback、defaultMocks、invokeMockOnly、模板假数据时，直接替换为 current App Server / Desktop Host /真实 fixture 链；mock 只能留在测试夹具
- **硬编码策略**：浏览器要求、插件触发、@ 命令、技能路由、artifact 类型判断、内置应用列表等硬编码已经有 registry / manifest / catalog 事实源时，直接删硬编码分支，不再包一层适配
- **重复组件 / Hook / ViewModel**：新旧组件表达同一业务对象，且没有真实外部消费者时，直接把调用迁到 current 组件并删除旧组件；不要让父层同时支持两套 props
- **旧命名阻碍产品语义**：旧命名暴露实现词、历史品牌、内部协议或错误业务概念时，直接改到 current 领域命名；只有外部协议或数据迁移需要时才保留映射层
- **插件 / Agent App 标准变更**：插件 manifest、skills、子 Agent、renderer contract、workflow schema 已确定新标准时，旧 `app.md`、旧本地包结构、旧安装入口、旧 renderer 占位直接删除或迁移，不做双标准
- **命令 / API 无外部兼容者**：旧 Electron IPC、legacy command、前端 API 网关、App Server 方法如果没有外部调用契约，直接替换到 current JSON-RPC / gateway；旧命令只允许 retired guard / negative test
- **数据结构无存量或可一次迁移**：本地表、缓存、artifact payload、profile schema 若无真实存量，或能在启动 / 读取边界一次迁完，直接替换 schema；不要长期双读双写
- **路由 / 页面入口换代**：旧页面、旧导航、旧插件中心、旧工作台入口已经和 current 产品路径冲突时，直接从导航、路由、测试和文档中移除
- **依赖栈替换**：已经选择更成熟的库或现有标准库时，旧自研实现和同类新旧依赖不并行维护；除非迁移风险来自外部数据格式，否则直接替换调用点
- **文档规则和实现冲突**：路线图、技术文档、skill 与代码主线不一致时，直接更新文档事实源和对应 skill；不要用聊天结论充当长期例外

仍然可以分阶段 `deprecated` 的场景必须同时满足：

- 有真实外部用户、插件、持久化数据或发布版本依赖旧协议
- 本轮直接删除会造成不可恢复的数据损坏或生产不可用
- 已写清退出条件、最后删除入口、验证命令和下一次替换时间点

不满足以上条件时，默认就是 **直接替换 + 删除旧入口 + 补回流守卫**。

## 路线图任务防跑偏

如果用户明确绑定了某份路线图，尤其是要求“按顺序继续”“对齐目标”“先完成主线”，治理动作必须服从路线图主线，而不是反过来主导路线图。

执行时额外遵守：

1. 先重述当前路线图的 **主目标 / 当前阶段 / 下一刀**
2. 只有当 dead / compat / deprecated surface **直接阻碍主线收口** 时，才优先做治理减法
3. 不要把“还能删一点旧代码”误当成“继续推进目标”
4. 连续两轮主要都在删零引用或补文档时，必须重新打开路线图，改选尚未完成的主链项
5. 汇报治理结果时，必须补一句“这一步如何服务路线图主线”；如果说不出来，就说明这一步不该先做
6. 已经选定本轮主线后，除非该问题直接阻塞当前交付、会让新入口变成假入口，或用户明确要求，否则不要为了顺手问题偏航
7. 同一轮如果发现多个可清理项，默认只收最直接阻塞主线的一刀；其余先登记，再立即回到主线
8. 用户追问“是否完成”时，先回答主线目标是否完成；治理边角、额外清理和可选补强不要混成同一个完成状态

## 分类语言

治理默认使用这四类：

- `current`：当前唯一主路径，后续需求只允许继续向这里收敛
- `compat`：兼容层，只允许委托、适配、告警，不允许继续长新逻辑
- `deprecated`：废弃层，只允许迁移与下线，不允许新增依赖
- `dead`：已停用或确认无入口，优先删除

仓库脚本还可能给出一些辅助信号，例如：

- `dead-candidate`
- `unused-file`
- `unused-export`
- `zero-inbound`

这些信号 **不是正式分类本身**。例如 `dead-candidate` 代表“很可能可以删”，但不是自动等于 `dead`，仍需要人工确认。

## 什么时候先读

出现以下任一情况时，先读本文件，再决定是否改代码：

- 新旧 Hook、新旧组件、新旧命令并存
- 前端已经切到新入口，Rust / 数据 / 旁路系统还在继续走旧路径
- 新服务已落地，但旧表、旧 DAO、旧目录兼容仍被依赖
- 需求迭代后，AI 倾向沿旧实现继续生成
- 团队想“先补功能，后面再统一”

## 治理工作流

### 1. 先盘点，再修改

开始改动前，先盘点这项能力在 4 层中的分布：

- 入口层：页面、组件、Hook、前端 API
- 服务层：Electron Desktop Host bridge、App Server JSON-RPC、legacy desktop facade、Service、Workflow、事件入口
- 存储层：表、DAO、Repository、缓存、迁移
- 旁路层：统计、记忆、搜索、审计、报表、任务系统

如果没有盘点清楚，禁止直接开始“统一”。

### 2. 先定事实源，再谈迁移

必须先明确一句话：

> 从现在开始，这个能力以后只允许向哪里收敛？

事实源可以是：

- 一个 Hook
- 一个组件入口
- 一组 Rust 命令
- 一个 Service / Repository
- 一组数据表

没有唯一事实源，任何迁移都会继续长出新分支。

### 3. 先分类，再动刀

盘点完成后，把实际路径标成以下类型之一：

- `current`
- `compat`
- `deprecated`
- `dead`

并为 `compat` / `deprecated` 写清退出条件：

- 迁完哪些调用即可删
- 哪个版本或阶段必须删
- 删除前要看哪些扫描结果或指标

没有退出条件的 compat，最终都会常驻。

如果当前任务已经明确“无兼容需求”，分类时额外遵守：

- 不要把“现在还有调用”自动翻译成必须保留 compat
- 先判断这些调用是不是也属于同一批应迁或应删的旧实现
- 只要同轮能迁完或删完，就直接替换并按 `dead` 删除旧入口，不要再补一层过渡包装

### 4. 优先做减法

默认优先执行这些动作，而不是再加一层抽象：

- 把散落逻辑收回单一边界
- 把 legacy 判断收回 `Repository` / `Database` / `app_paths`
- 让 compat 层只做委托与适配
- 删除零引用入口
- 把运行时 fallback 改成启动期迁移或边界短路

除非用户明确要求保留兼容，否则不要新增新的 compat 层。

如果路线图已经切换，而旧实现又在阻碍主线，优先级进一步固定为：

1. 删掉或下线阻碍主线的旧实现
2. 封住旧路回流
3. 再把 current 主链补完整

不要把“先让旧实现也顺手支持一下”当成折中方案。

### 5. 先封旧路，再谈“推荐新路”

治理不能靠口头约定，必须靠守卫机制。

当前仓库优先使用：

```bash
npm run governance:legacy-report
npm run test:contracts
```

它们分别用于：

- `governance:legacy-report`
  - 扫描已被判定为 `deprecated` / `dead-candidate` 的前端入口
  - 检查 legacy desktop facade 是否仍被限制在指定 API 网关，且没有重新承接 current 能力
  - 找出已经零引用、可进入删除候选的兼容壳
  - 规则事实源优先看 `src/lib/governance/legacySurfaceCatalog.json`
- `test:contracts`
  - 检查前端 `safeInvoke(...)` / `invoke(...)` 的实际调用
  - 检查 Electron Host bridge / App Server JSON-RPC / legacy host 的实际注册或协议
  - 检查 `src/lib/governance/agentCommandCatalog.json` 中的命令治理口径
  - 检查 `mockPriorityCommands` 与 `defaultMocks` 是否同步
  - 检查 mock 是否只停留在测试夹具 / 契约守卫；生产入口不得把 mock 当 fallback

原则只有一句：

**不是鼓励走新路，而是先封住老路。**

这同样适用于已经删除的旧 UI 壳或旧组件路径：

- 删除旧文件后，仍应在治理目录册里补 import / 文本守卫，防止后续 AI 或人工把旧路径重新接回主链
- 如果已经把重复 UI 的扁平 props 收口为共享契约，也应补对应文本 / 正则守卫，防止父层透传和子层接口一起长回旧面
- 如果共享契约还依赖单独的构造器或归一化 helper，应继续限制只有事实源边界能调用它，不要让运行时代码到处重新拼装
- 如果多个页面或面板展示的是同一份状态，也要把状态文案收敛到共享 helper，不要让首页、下拉面板、状态徽标各自重新命名

### 6. 主链路和旁路一起治理

如果只迁：

- 页面
- Hook
- 主命令

但没有迁：

- 统计查询
- 记忆系统
- 搜索召回
- 报表分析
- 审计与任务类旁路

那么旧表、旧命令、旧 DAO 最终都删不掉。

治理完成的标准不是“页面能跑”，而是“系统生态已经收口”。

### 7. 验证后再删

只有当以下条件同时满足时，才允许删除旧路径：

- 新增依赖已经被封住
- 调用量或引用已清零
- 旁路系统已经迁完
- 边界检查与定向验证通过

## Lime 特别关注的边界

### 0. `scripts/` 目录治理

`scripts/` 根目录和一级领域目录是冻结的脚本治理边界，不再作为新增脚本或新增领域目录的默认落点。

- `current`：`scripts/lib/` 共享实现、已登记在基线内的 `scripts/<domain>/` 领域脚本、被 `package.json` / CI 明确引用且仍在基线内的根入口脚本
- `compat`：仍在根目录、但后续需要按领域迁移的历史入口脚本
- `deprecated`：只服务旧迁移、旧发布或旧宿主证据的脚本，只能下线或并入 current 入口
- `dead`：已删除脚本、旧产物路径、只允许作为 fail-fast fixture 出现的旧脚本名

新增可执行脚本默认放到已有 `scripts/<domain>/`、`scripts/lib/` 或所属 package。只有公开稳定入口且无法归入已有领域子目录时，才允许新增根脚本或一级领域目录例外；例外必须同步 `scripts/README.md`、`scripts/script-root-governance-baseline.json` 与执行计划退出条件。本地缓存目录如 `scripts/**/__pycache__/` 和 `*.pyc` 只能作为 ignore/warn 对象，不得进入基线或发布候选；一旦被 git 跟踪，守卫必须失败。

根目录回流守卫：

```bash
npm run governance:scripts
```

该守卫用冻结基线拒绝新增 tracked 根脚本和新增 tracked 一级领域目录；未跟踪根脚本 / 目录只作为并行工作区警告，不得直接写入基线。

### 1. Electron 打包事实源

Electron packaging / installer / signing / notarization / updater metadata 只能继续向 `forge.config.mjs`、`electron-forge package`、`electron-forge make` 与 Forge 官方 maker 收敛。

- `current`：`forge.config.mjs`、`electron/forge/*`、Forge CLI、release workflow、staging / verifier / docs / contract guards
- `current`：`electron/updateHost.ts` + Electron 内置 `autoUpdater`，只负责运行时更新检查、下载和安装会话
- `current`：macOS `MakerDMG` / `MakerZIP` 产物与 `RELEASES.json`，Windows `MakerSquirrel` 产物与 `RELEASES` / `.nupkg` / Setup
- `dead`：旧 builder 配置 / CLI、自定义 Windows installer maker、旧 YAML / blockmap updater metadata、把旧打包链当 current 的文档或 i18n evidence
- `dead / deleted`：旧 Rust / Tauri updater command 面，包括旧 `update_cmd` 文件、`commands::update_cmd::*` runner 注册、`UpdateInstallSessionState` 管理和 Rust 后台更新检查任务；不得以 stub 或 compat wrapper 形式恢复到 `lime-rs/src/commands/`

发现新引用旧 builder 配置 / CLI、自定义 Windows installer maker、旧 YAML / blockmap updater metadata 时，默认先判为旧路回流，而不是新增 compat。
发现新引用旧 Rust / Tauri updater command、`update_cmd.rs` 或 Rust 后台更新检查任务时，也按 updater 旧路回流处理；current 修复必须回到 Electron Desktop Host updater 链路。

### 2. 命令边界

只要改动涉及 Electron IPC、App Server JSON-RPC、Bridge、mock、前端 API 网关或 legacy desktop facade，至少同时看这几处：

- 前端 `safeInvoke(...)` / `invoke(...)`
- Electron Desktop Host bridge / preload 白名单或 App Server JSON-RPC 协议
- legacy desktop facade 注册（仅在触碰兼容层时）
- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/dev-bridge/mockPriorityCommands.ts`
- `src/lib/desktop-host/` / legacy mock path

命令边界的详细规则，直接看：

- `internal/aiprompts/commands.md`

### 2A. 前端 DevBridge 治理

`src/lib/dev-bridge/**` 需要按职责拆分治理，不得被简单等同于 Rust / Tauri `lime-rs/src/dev_bridge`：

- `current`：`safeInvoke`、DevBridge HTTP client、bridge availability / event listener capability、`app_server_handle_json_lines` App Server JSON-RPC 传输和 timeout profile。
- `compat / deprecated`：仍在 `commandPolicy.ts` 中服务迁移期 fail-closed 的 legacy command truth / no-mock fallback 分类。
- `dead`：已迁 Electron Desktop Host 或 App Server current 的旧命令名；不得重新进入 `bridgeTruthCommands`、`mockPriorityCommands`、治理 catalog、前端生产 API 或 desktop-host 默认 mock。
- `test-only`：负向测试、retired guard、显式夹具；只能证明旧路未回流，不能证明产品可交付。

因此，后续治理应优先清旧命令 policy / mock / fallback 残留，而不是删除整个 `src/lib/dev-bridge` 目录。目录级退场必须另行证明已有替代 renderer bridge 事实源覆盖 `safeInvoke`、`app_server_handle_json_lines`、事件监听、可用性探测和错误追踪；否则删除目录会破坏 current App Server 传输链。

执行计划涉及命令迁移时，必须把 `src/lib/dev-bridge` 纳入后续治理检查：

- 每个旧命令组迁到 App Server / Electron Desktop Host current 后，同轮检查 `commandPolicy.ts`、`mockPriorityCommands.ts`、desktop-host mock、retired guard 与旧 smoke，确保旧命令没有留在 production truth 或 mock fallback 中。
- 如果只保留旧命令字符串作为负向测试或 explicit fixture，文档和测试名必须标明 `retired` / `fail-closed` / `test-only`，不能把它写成可交付的正向路径。
- 若暂时删不掉某条 `compat / deprecated` policy，必须在对应执行计划登记命令名、原因、退出条件和下一次验证入口；跨命令组或会长期存在的 residual 还必须同步回挂 `internal/exec-plans/tech-debt-tracker.md` 的 `CCD-012`，不得只写“后续清理”。

### 3. 运行时路径边界

涉及用户数据、日志、缓存、凭证、workspace、历史目录兼容时，优先收口到统一路径入口，例如 `app_paths` 或等价边界。

不要在上层继续手写：

- `~/Library/...`
- `C:/Users/...`
- `~/.lime/...`

路径兼容是边界问题，不应该变成业务层到处散落的字符串问题。

### 4. 数据迁移与语义暴露

一旦历史数据迁移已接入启动流程：

- 运行时主链路必须优先按“迁移完成标记”短路旧表读取
- 旧表只允许服务迁移、审计与回放
- 业务层优先消费 `pending_*` 等迁移态语义

不要在多个 service 或 command 里重复写：

- `is_migrated`
- `legacy_*`
- 手工分叉短路逻辑

过渡期对外暴露的命名，也应该体现“迁移态”语义，例如：

- `pending_*`

不要继续让业务层直接依赖：

- `legacy_*`
- `general_chat_*`
- 只体现历史实现、不体现迁移语义的模块名

## Lime 的典型判断方式

### 命令与会话主链

遇到 Agent / 聊天 / 会话相关新旧并存时，至少问这几个问题：

- 前端唯一入口是不是已经收敛到现役 API 网关
- 新增服务化能力是不是已经收敛到 App Server JSON-RPC；旧 `agent_runtime_*` 是否只作为 retired guard、历史 evidence、test-only fixture 或受控迁移残留
- 旧 `chat_*`、`general_chat_*`、历史 helper 是否还在继续长逻辑
- 命令契约五个事实源之间有没有漂移

只要其中任意一个答案是否定的，就说明治理还没完成。

### Harness Engine 主链

遇到 handoff、evidence pack、replay、review、外部诊断交接相关改动时，至少问这几个问题：

- 运行时事实是不是继续收敛到 App Server `evidence/export`
- replay / analysis / review / GUI 是否只是在消费 evidence pack，而不是重新拼装一套摘要
- gap 是否只来自“当前线程真实适用但尚未导出”的信号，而不是历史硬编码模板
- request telemetry 是否已经按 `session/thread/turn` 真实关联导出；如果当前线程没有匹配请求，是否导出空摘要而不是继续保留 `unlinked`

只要其中任意一个答案是否定的，就说明 Harness Engine 还在继续长平行事实源。

### 记忆与旁路

遇到记忆系统治理时，至少同时看：

- 长期记忆是否继续收敛到文件化 memory store、`MEMORY.md` 与 `memory_summary.md`
- 按需读取是否继续收敛到 `MemoryBackend` 与 memory tools
- Soul 是否仍只作为 `memory.soul` 交互配置，而不是长期记忆本体
- 统计、搜索、审计等旁路是否还在读旧 `unified_memory_*` / `memory_runtime_*` / 旧灵感库路径

不要为了补一个功能，再造第二套记忆入口，也不要把旧记忆或旧灵感库包装成 compat 续命。

## 自动 reviewer / sub-agent 的角色

如果未来为 Lime 增加 reviewer、hook 或额外 sub-agent，它们只能做 **执行器**，不能成为新的治理事实源。

它们至少应该检查：

- 是否新增了与 `current` 平级的第二套实现
- 是否让 `compat` 长了新业务逻辑
- 是否只迁主链路却漏掉旁路
- 是否出现新的旧入口引用或旧命令回流
- 是否补了守卫与验证

它们的输出，也必须回到本文件的分类语言：

- 哪些是 `current`
- 哪些仍是 `compat`
- 哪些进入 `deprecated`
- 哪些只是 `dead-candidate`，哪些已经能确认是 `dead`

## 明确禁止

出现以下行为，视为违反治理原则：

- 在旧 Hook / 旧组件 / 旧命令上继续叠加新需求
- 新增与现役路径平级的第二套实现
- 前端迁了新入口，但 Rust 仍保留旧主逻辑继续演进
- 已有统一 Service，却继续让命令层各自写 SQL
- 主链路改到新表，旁路系统仍直接查旧表
- 看到“旧代码还能用”，就继续让 AI 沿旧上下文生成

## 汇报要求

涉及治理类改动时，汇报结果至少应包含：

1. 本次收掉了哪些 surface
2. 当前改动分别属于 `current` / `compat` / `deprecated` / `dead` 中哪一类
3. 补了哪些守卫和验证
4. 剩余最值得继续优化的一刀是什么

如果仍保留 `dead-candidate`、延期白名单或临时例外，必须写明：

- 具体对象
- 当前原因
- 退出条件

## 相关文档

- `internal/aiprompts/commands.md`
- `internal/aiprompts/harness-engine-governance.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/aiprompts/project-heatmap.md`

## 一句话总结

**治理不是继续写一个“更新版本”，而是让系统以后只能向一个版本收敛。**
