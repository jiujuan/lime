# Memory / Compaction 主链

## 这份文档回答什么

本文件定义 Lime 当前记忆与压缩治理边界，主要回答：

- 文件化记忆、summary 注入、工具读取和后台整理分别由哪条 current 主链负责
- Soul 如何继续作为用户可编辑的交互身份配置保留
- 旧 `unified_memory_*`、`memory_runtime_*`、旧 MemoryPage 灵感库和旧命中预演如何清理
- App Server `agentSession/compact` 与记忆文件主链如何保持分离，避免把压缩续接做成第二套记忆系统

它是 **记忆与压缩边界的 current 文档**。旧数据库记忆、旧灵感库和旧 runtime recall 只能作为清理对象或 retired guard 出现，不再定义当前记忆事实源。

## 什么时候先读

遇到以下任一情况时，先读本文件：

- 调整 memory store、`memory_summary.md`、`MEMORY.md`、memory tools 或 `MemoryBackend`
- 调整 App Server `agentSession/compact`、summary cache 或 overflow compaction
- 调整 `memory.soul`、`SOUL.md` 导入 / 复制、artifact voice generation brief
- 清理 `unified_memory_*`、`memory_runtime_*`、旧 MemoryPage 灵感库或旧命中预演
- 讨论“这条信息应该进入长期记忆、项目资料、Soul 还是压缩摘要”的边界归属

如果一个需求同时碰到“summary 注入 + 工具读取”“压缩续接 + 记忆整理”“Soul + artifact voice”中的两项以上，默认属于本主链。

## 固定主链

后续 Lime 的记忆能力只允许向下面这条主链收敛：

```text
memory store folder
  -> memory_summary.md 默认注入
  -> MEMORY.md / rollout_summaries / ad-hoc notes 按需工具读取
  -> MemoryBackend + memory tools
  -> 后台 consolidation 刷新 MEMORY.md / memory_summary.md
  -> memory.soul 独立提供交互身份和 artifact voice brief
```

固定判断：

1. `memory store folder` 是长期记忆 canonical content。
2. `memory_summary.md` 是每轮默认注入的唯一记忆摘要；原文只能按需通过 memory tools 读取。
3. `MemoryBackend` 是 list/read/search/add note 的唯一后端合同。
4. `memory.soul` / `MemorySoulConfig` 是交互身份、沟通节奏和 artifact voice 的 current 配置。
5. `SOUL.md` 只是导入 / 复制快照，运行时读取保存后的 app config，不依赖该文件路径。
6. App Server `agentSession/compact` 仍是压缩入口；压缩摘要不能替代 memory store，也不能把旧 runtime recall 重新接成 current。
7. 项目资料继续走 project memory / knowledge 当前边界，只能作为资料附属层，不抢长期记忆事实源。

固定规则只有一句：

**新增记忆能力必须进入 memory store + MemoryBackend + memory tools + prompt contributor；旧 `unified_memory_*`、`memory_runtime_*` 和旧 MemoryPage 灵感库只允许删除、fail-fast 或 retired guard。**

## 代码入口地图

### 1. 文件化记忆 current

目标落点：

- App Server / RuntimeCore current 主链
- `MemoryBackend`
- `LocalMemoryBackend`
- memory tools：`memory_list`、`memory_read`、`memory_search`、`memory_add_note`
- prompt contributor：只读 `memory_summary.md`
- memory store layout：`memory_summary.md`、`MEMORY.md`、`rollout_summaries/`、`extensions/ad_hoc/notes/`、`index/`

固定规则：

1. 路径必须通过统一 app path / workspace path resolver 获取。
2. 工具层只暴露相对路径，拒绝 hidden path、symlink、path traversal。
3. 搜索 P0 先做文本扫描；派生索引只能可删除、可重建、可降级。
4. `memory_add_note` 只写 ad-hoc note，不直接修改 `MEMORY.md` 或 `memory_summary.md`。
5. consolidation 必须有 secret / injection scan，失败不能阻塞当前 turn。

### 2. Soul current

当前保留：

- `src/lib/api/memoryRuntimeTypes.ts` 中的 `MemorySoulConfig`
- `src/lib/soul/soulConfig.ts`
- `src/components/settings-v2/general/memory/index.tsx` 的 Soul 设置、模板、`SOUL.md` 导入 / 复制
- 专家 persona 对全局 Soul `communication_rhythm` 的只读继承

固定规则：

1. Soul 不是长期记忆本体，不写 `MEMORY.md`、`memory_summary.md` 或 ad-hoc note。
2. `SOUL.md` 导入必须先预览，再保存到 `memory.soul`。
3. 导入 warning 至少保留 `project_rules`、`local_path`、`secret_like`、`too_long`。
4. artifact voice 只生成 `generation_brief_only`，不能回写长期记忆。
5. expert persona 不得回写全局 Soul。
6. 旧 `companion_*` 桌宠命令链路与 Soul 无关，按 `dead` 清理。

### 3. 压缩 current

当前保留：

- App Server `agentSession/compact`
- RuntimeCore / Aster shared compaction core
- summary cache / overflow compaction 的运行时治理边界

固定规则：

1. 压缩是会话上下文治理动作，不是长期记忆事实源。
2. 手动压缩继续走 App Server `agentSession/compact`。
3. 旧 `agent_runtime_compact_session` 只允许 retired guard / test-only evidence。
4. 压缩结果如需进入长期记忆，必须通过 rollout summary / consolidation 写入 memory store。

### 4. 旧记忆与旧灵感库 cleanup

清理对象：

- `unified_memory_*`
- `unifiedMemory/*`
- `memory_runtime_*`
- 旧 MemoryPage 灵感库 / 高级诊断混合视图
- `inspiration_*` 平行事实源
- SQLite embedding BLOB 与全表余弦扫描
- active memory recall preview / raw hit layer / external provider

固定规则：

1. 不再新增兼容层，不做旧数据导入。
2. 旧入口删除前只能 fail-fast 或 retired guard。
3. 旧 API、旧页面、旧文案和旧命令名不得作为正向产品证据。
4. 统计、搜索、审计、报表等旁路不得继续读取旧数据库记忆作为 current truth。
5. 如果短期无法删除某个旧入口，必须登记 owner、原因、退出条件和验证入口。

## current / compat / deprecated / dead

### `current`

- memory store folder
- `memory_summary.md`
- `MEMORY.md`
- `rollout_summaries/`
- `extensions/ad_hoc/notes/`
- `MemoryBackend`
- `LocalMemoryBackend`
- memory tools
- prompt contributor
- `memory.soul` / `MemorySoulConfig`
- `SOUL.md` 导入 / 复制快照
- `memory.soul.artifact_voice` generation brief
- App Server `agentSession/compact`
- project memory / knowledge 资料附属层

### `compat`

- `src/lib/api/memory.ts`
- `src/lib/workspace/projectPrompt.ts`

保留原因：

- 这组路径仍承接角色、世界观、大纲和项目资料 prompt 的附属层能力。
- 它们不得被写成长期记忆、runtime recall 或灵感库事实源。

退出条件：

- 若后续资料层完全进入 knowledge current resolver，再删除或收窄这些入口。

### `deprecated`

当前不保留长期 deprecated 记忆主线。旧记忆、旧 runtime recall 和旧灵感库直接按 `dead` 清理。

### `dead`

- `unified_memory_*`
- `unifiedMemory/*`
- `memory_runtime_*`
- 旧 MemoryPage 灵感库 / 高级诊断混合视图
- `inspiration_*` 平行事实源
- SQLite embedding BLOB 与全表余弦扫描
- active memory recall preview / raw hit layer / external provider
- 旧 `companion_*` 桌宠命令链路
- 旧 `lime-rs/src/**` 记忆路径引用

## 最低验证要求

如果本轮改动涉及本主链，至少按边界选择最贴近的验证：

- 纯文档 / 分类回写：`npm run harness:doc-freshness` 或定向 `rg` 扫描
- 改 App Server JSON-RPC / front-end API gateway / command catalog：相关前端测试 + `npm run test:contracts`
- 改 memory store / tools / prompt contributor：Rust 定向测试 + 对应前端 API 测试
- 改 Soul：`src/lib/soul/soulConfig.unit.test.ts`、设置页 memory 测试、专家 persona metadata 测试
- 改 GUI 主路径：补现有 `*.test.tsx` 稳定断言；必要时再补 `npm run verify:gui-smoke`

## 这一步如何服务主线

当前主线目标是：

**把 Lime 记忆系统收敛到文件化 memory store，并清理旧记忆 / 旧灵感库入口，同时保留 Soul。**

后续解释记忆系统时：

- 解释长期记忆，回到 memory store / `MEMORY.md`
- 解释默认注入，回到 `memory_summary.md`
- 解释按需读取，回到 memory tools / `MemoryBackend`
- 解释交互身份，回到 `memory.soul`
- 解释压缩续接，回到 App Server `agentSession/compact`
- 解释旧记忆或旧灵感库，回到 `dead / cleanup`
