# Lime 文件化记忆目标架构

> 状态：current architecture plan
> 更新时间：2026-06-18
> 目标：以文件化 memory store 为唯一记忆事实源，App Server 提供受控工具和 prompt contributor，Soul 作为独立交互配置保留，SQLite 只保留状态与清理边界。

## 1. 架构原则

### 1.1 单事实源

记忆内容只认：

```text
memory store folder
```

默认上下文只认：

```text
memory_summary.md
```

按需读取只认：

```text
memory tools -> MemoryBackend
```

交互身份只认：

```text
memory.soul -> MemorySoulConfig
```

派生索引只认：

```text
index/ 可删除、可重建、可降级
```

### 1.2 读写分离

```text
read path:
  memory_summary.md -> prompt contributor
  MEMORY.md / rollout_summaries -> memory tools
  memory.soul -> interaction contributor / generation brief

write path:
  explicit user request -> ad-hoc note
  turn/session evidence -> rollout summary
  background consolidation -> MEMORY.md / memory_summary.md
  Soul editor / SOUL.md import -> memory.soul config
```

写入不得在同一 turn 里立即改变当前 prompt。Soul 的 artifact voice 只影响明确的 generation brief，不回写长期记忆。

### 1.3 数据库边界

SQLite 允许保存：

1. thread / turn 状态。
2. memory mode / stage data。
3. 旧实现清理标记。
4. derived index metadata。
5. reset / rebuild 记录。

SQLite 不允许保存：

1. 下一代记忆 canonical content。
2. embedding BLOB 作为默认检索事实源。
3. 多套 provider 输出的 raw recall truth。
4. Soul artifact voice 的长期记忆副本。

## 2. 目标目录结构

```text
memories/
  memory_summary.md
  MEMORY.md
  rollout_summaries/
    <thread-id>.jsonl
    <thread-id>.md
  skills/
    <skill-name>/
      SKILL.md
      references/
  extensions/
    ad_hoc/
      notes/
        <timestamp>-<slug>.md
  index/
    manifest.json
    local-search/
```

规则：

1. 目录根通过统一 path resolver 获取。
2. workspace 级记忆与全局记忆必须可区分。
3. 工具层只暴露相对路径。
4. hidden path、symlink、path traversal 默认拒绝。
5. `index/` 可被删除并重建，不影响记忆本体。
6. `SOUL.md` 是导入 / 复制快照，不是 memory store 的 canonical 文件。

## 3. 核心接口

```rust
trait MemoryBackend: Clone + Send + Sync + 'static {
    fn add_ad_hoc_note(&self, request: AddAdHocMemoryNoteRequest) -> Future<Result<AddAdHocMemoryNoteResponse>>;
    fn list(&self, request: ListMemoriesRequest) -> Future<Result<ListMemoriesResponse>>;
    fn read(&self, request: ReadMemoryRequest) -> Future<Result<ReadMemoryResponse>>;
    fn search(&self, request: SearchMemoriesRequest) -> Future<Result<SearchMemoriesResponse>>;
}
```

P0 backend：

```text
LocalMemoryBackend
```

P2 可选 backend / index：

```text
IndexedMemoryBackend(LocalMemoryBackend + DerivedIndex)
RemoteMemoryBackend
```

任何 backend 必须保持同一输出合同，不能把 provider-specific 字段泄露给普通调用方。

## 4. 层级划分

### 4.1 Store Layer

职责：

1. 创建和校验 memory folder。
2. 读取 / 写入 memory 文件。
3. 路径 canonicalize 与越界防护。
4. reset 与 rebuild 的文件级操作。

### 4.2 Prompt Contributor

职责：

1. 读取 `memory_summary.md`。
2. 按 token 预算截断。
3. 生成 developer policy fragment。
4. 当 summary 缺失或为空时返回空。

不允许：

1. 在 prompt contributor 里搜索全量 memory。
2. 在 prompt contributor 里调用 embedding provider。
3. 注入 raw rollout summary。
4. 把 Soul artifact voice 写入 summary。

### 4.3 Tool Contributor

职责：

1. 注册 `memory_list`、`memory_read`、`memory_search`、`memory_add_note`。
2. 将工具参数转换为 backend request。
3. 记录工具调用 telemetry。
4. 输出 JSON 与 citation 字段。

### 4.4 Soul Contributor

职责：

1. 读取保存后的 `memory.soul` 配置。
2. 为交互身份、沟通节奏和解释深度提供 prompt 片段。
3. 为 artifact voice 生成 `generation_brief_only` 元数据。
4. 支持 `SOUL.md` 导入预览、warning 和复制输出。

不允许：

1. 把 `SOUL.md` 文件路径当运行时事实源。
2. 把 artifact voice brief 写入长期记忆。
3. 让专家 persona 回写全局 Soul。
4. 重新接回旧 `companion_*` 桌宠命令链路。

### 4.5 Consolidation Pipeline

职责：

1. 把 ad-hoc note 和 rollout summary 整理进 `MEMORY.md`。
2. 生成或刷新 `memory_summary.md`。
3. 执行 secret / injection scan。
4. 生成 diff 或 change record，便于审计。

不允许：

1. 无用户确认时保存凭证或敏感原文。
2. 直接写旧 `unified_memory_*` 作为下一代事实源。
3. 把 consolidation 失败变成 turn 失败。
4. 从旧记忆表批量生成 current 文件。

### 4.6 Derived Index Layer

职责：

1. 对 memory folder 建派生索引。
2. 支持健康检查、删除、重建。
3. 索引缺失或损坏时降级到文本扫描。

候选实现类型：

1. 内嵌全文索引。
2. 嵌入式搜索索引。
3. 可选向量索引。
4. 远端索引适配器。

固定规则：这些都不是 P0 current truth，只是 P2 之后的派生检索实现。

## 5. 目标分类

### 5.1 `current`

1. `memory store folder`
2. `MemoryBackend`
3. `LocalMemoryBackend`
4. `memory_summary.md` prompt contributor
5. `memory tools`
6. `ad-hoc note` 写入队列
7. `rollout_summaries` 证据摘要
8. `memory.soul` / `MemorySoulConfig`
9. `SOUL.md` 导入 / 复制快照
10. `memory.soul.artifact_voice` generation brief

### 5.2 `dead`

1. `inspiration_*` 新长期事实源。
2. `make-next-generation-more-like-me.md` 旧扩展路线图。
3. `unified_memory_*` 旧长期记忆主线。
4. `memory_runtime_*` 旧默认召回主线。
5. 旧 MemoryPage 灵感库 / 高级诊断混合视图。
6. 旧 `companion_*` 桌宠命令链路。
7. 旧 `lime-rs/src/**` 记忆路径引用。
8. 生产路径依赖 mock memory backend。

## 6. 生命周期

### 6.1 Thread Start

```text
thread/start
  -> load memory config
  -> resolve memory store root
  -> read memory_summary.md
  -> truncate
  -> load memory.soul config
  -> inject developer policy fragment
```

### 6.2 Tool Read

```text
model decides memory is relevant
  -> memory_search
  -> MEMORY.md hit
  -> memory_read exact path/line
  -> answer with memory citation metadata
```

### 6.3 Soul Use

```text
settings.memory.soul
  -> MemorySoulConfig
  -> interaction contributor
  -> expert persona inherits communication_rhythm only
  -> artifact voice produces generation_brief_only
```

### 6.4 Explicit Write

```text
user says remember / add note
  -> memory_add_note
  -> extensions/ad_hoc/notes/<timestamp>-slug.md
  -> consolidation pending
  -> later MEMORY.md / memory_summary.md refresh
```

### 6.5 Reset

```text
memory/reset
  -> clear memory folder
  -> clear derived index
  -> reset SQLite memory stage data
  -> keep or reset memory.soul according to user-selected scope
```

### 6.6 Old Path Cleanup

```text
old unified/runtime memory entry
  -> reject new write
  -> fail-fast or retired guard
  -> no data import into memory store
  -> guard prevents reactivation
```

## 7. 第一刀边界

第一刀只需要完成：

1. 文档和事实源收口。
2. `MemoryBackend` 合同设计。
3. memory folder layout 设计。
4. prompt contributor 预算规则。
5. memory tools 参数和输出合同。
6. Soul current 边界说明。
7. 旧路线图引用清理。

第一刀不需要实现：

1. 向量索引。
2. 外部 provider。
3. 旧灵感库产品页重做。
4. 旧数据导入。
