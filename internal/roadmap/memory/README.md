# Lime 文件化记忆路线图

> 状态：current planning source
> 更新时间：2026-06-18
> 主目标：把 Lime 记忆主线收敛到文件化 memory store、稳定摘要注入、专用记忆工具、backend 抽象和可重建检索层；Soul 继续作为用户可编辑的交互身份与沟通节奏配置保留。

## 1. 本路线图回答什么

本目录只回答 Lime 记忆系统后续如何收敛：

1. 记忆事实源如何从数据库式长期对象收敛到可读、可审计、可版本化的 memory folder。
2. 运行时如何只注入稳定 `memory_summary.md`，而不是把历史、召回结果或诊断全量塞进 prompt。
3. Agent 如何通过 `memory_list` / `memory_read` / `memory_search` / `memory_add_note` 访问记忆。
4. 记忆读、写、整理、清空如何拆成独立边界。
5. Soul 如何作为 `memory.soul` 配置保留，并通过 `SOUL.md` 导入 / 复制和 generation brief 参与交互风格。
6. SQLite 如何只保留线程状态、stage data、清理标记和索引元数据，不承担语义检索事实源。
7. 如果未来需要向量或全文索引，如何作为可删除、可重建的派生索引接入，而不是成为第二套记忆真相。

## 2. 当前裁决

### 2.1 `current`

Lime 后续记忆主线只允许向这组边界收敛：

1. `memory store`：平台无关 App data / workspace scoped 记忆目录，由统一路径入口解析。
2. `memory_summary.md`：每轮默认可注入的稳定摘要，必须有 token 上限。
3. `MEMORY.md`：人工和后台整理后的记忆登记册，作为搜索入口。
4. `rollout_summaries/`：会话 / 运行证据摘要，只在被 `MEMORY.md` 指向时读取。
5. `extensions/ad_hoc/notes/`：用户或 Agent 显式添加的待整理备注。
6. `MemoryBackend` trait：统一承接 list/read/search/add note，当前实现是本地文件系统。
7. `memory tools`：Agent 通过工具读取和搜索记忆，结果必须带 path/line/citation。
8. `prompt contributor`：只把截断后的 summary 作为 developer policy/context 注入。
9. `memory.soul` / `MemorySoulConfig`：用户可编辑的交互身份、沟通节奏和 artifact voice 配置。
10. `SOUL.md`：`memory.soul` 的导入和复制快照；运行时使用保存后的配置，不依赖该文件路径。

### 2.2 `dead`

这些内容本轮直接退出：

1. `internal/roadmap/memory/make-next-generation-more-like-me.md`
2. 新增 `inspiration_*` 平行长期事实源。
3. 旧 `unified_memory_*` 长期记忆主线。
4. 旧 `memory_runtime_*` 默认召回主线。
5. 旧 MemoryPage 灵感库 / 高级诊断混合视图。
6. SQLite embedding BLOB 与全表余弦扫描。
7. active memory recall preview。
8. auto organization / dreaming 实验。
9. external memory provider。
10. 默认引入任何具体外部索引库或向量数据库。
11. 旧 `companion_*` 桌宠命令链路。
12. 把旧 `lime-rs/src/**` 或旧 Tauri command wrapper 写回记忆路线图。
13. 把外部 provider 或向量索引当成 memory current truth。

## 3. Soul 边界

Soul 继续支持，但它不是长期记忆本体：

1. Soul 是 `memory.soul` 配置，负责交互身份、语气、解释深度、挑战方式、避免项和 artifact voice。
2. `SOUL.md` 是导入 / 复制快照，导入时保留 `project_rules`、`local_path`、`secret_like`、`too_long` 等风险提示。
3. artifact voice 只生成 `generation_brief_only`，不得写入 `MEMORY.md`、`memory_summary.md` 或长期记忆文件。
4. 专家 persona 可以继承全局 Soul 的 `communication_rhythm`，但不得回写全局 Soul。
5. Soul 与旧 `companion_*` 桌宠命令链路无关；后者按 `dead` 处理。

## 4. 核心工程形态

关键不是“搜索更高级”，而是边界清楚：

1. 记忆先是文件，不是黑盒数据库。
2. summary 小而稳定，默认注入；原文按需工具读取。
3. 搜索先做轻量文本匹配，命中后再读取精确行范围。
4. backend 是 trait，当前本地文件系统，后续可替换远端或索引实现。
5. 写入必须显式、可追踪、可审核；后台整理不能直接污染当前 turn。
6. SQLite 只保存线程状态、配置、stage data、清理标记和派生索引元数据，不做记忆语义事实源。

## 5. 文件分工

1. [prd.md](./prd.md)：产品与工程需求，定义 P0/P1/P2 和非目标。
2. [architecture.md](./architecture.md)：目标架构、事实源分类、backend 与数据生命周期。
3. [diagrams.md](./diagrams.md)：读路径、工具路径、写路径、Soul 路径和清理路径图。
4. [rollout-plan.md](./rollout-plan.md)：分阶段实施计划、验证和退出条件。
5. [acceptance.md](./acceptance.md)：验收标准和不通过判定。

## 6. 必须避免

1. 为了补性能，直接把向量库接成记忆事实源。
2. 在旧记忆或旧灵感库上继续追加新一代记忆语义。
3. 让前端页面自己扫描磁盘或拼装 prompt。
4. 把 raw recall、外部 provider、active recall 当默认能力。
5. 让自动整理候选在用户确认前影响当前生成。
6. 把 Soul 错判为旧 companion 桌宠链路。
7. 在文档或实现里恢复 `lime-rs/src/**` 旧路径。

## 7. 这一步如何服务主线

本轮收口把 memory 路线图从“旧灵感库 + 旧记忆实现延续”改成单一文件化记忆主线，并已把 `MemoryBackend` / 本地 memory store / `memoryStore/*` 前端网关接入 App Server current 边界。`memory_summary.md` 已通过 RuntimeCore turn start 读取并以受控 prompt contributor 注入；Soul 已作为保存后的 `memory.soul` current 配置注入受控交互片段；`memory_list` / `memory_read` / `memory_search` / `memory_add_note` 已注册为 App Server runtime native tools，并真实调用 current `MemoryAppDataSource`。旧 MemoryPage 灵感库、旧 `unifiedMemory` 网关、旧 `memoryRuntime` 召回网关和旧 memory crate 已进入 `dead / deleted / forbidden-to-restore`。

下一刀转入 Phase 3/4：继续证明旧记忆与旧灵感库只剩 guard/test-only 残留，并补 memory reset / health / tool telemetry 的用户控制闭环；不要再恢复旧记忆或旧灵感库入口。
