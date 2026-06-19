# Lime 文件化记忆系统 PRD

> 状态：current PRD
> 更新时间：2026-06-18
> 产品口径：普通用户不需要理解记忆系统；Agent 通过受控工具使用文件化记忆；Soul 继续承接用户可编辑的交互身份和沟通节奏。

## 1. 背景

Lime 当前已有 SQLite / `unified_memory_*` / `memory_runtime_*` 等记忆相关能力，但路线图继续沿这些对象扩展，会把长期资产、运行时召回、诊断、灵感库和语义检索混在一起。

本次裁决改为文件化记忆主线：

```text
memory folder
  -> memory_summary.md 默认注入
  -> MEMORY.md 作为登记册
  -> memory tools 按需 list/read/search/add note
  -> backend trait 隔离本地文件系统和未来索引
  -> memory.soul 保存交互身份和沟通节奏
  -> SQLite 只保存线程状态、stage data、清理标记和派生索引元数据
```

旧记忆实现不做数据导入。旧数据只作为删除前的历史状态，不进入新的 canonical store。

## 2. 用户与场景

### 2.1 普通用户

普通用户只关心 Lime 是否能保持一致，不需要管理数据库或索引。

必须支持：

1. 清楚知道“Lime 可能使用已保存记忆帮助保持一致”。
2. 可以关闭或清空某个 workspace / 全局记忆。
3. 可以查看和删除可读的记忆文件或条目。
4. 记忆错误时，有明确入口添加修正备注。
5. 可以继续编辑 Soul，或通过 `SOUL.md` 导入 / 复制交互身份快照。

### 2.2 Agent / 运行时

Agent 需要轻量、可审计地读取记忆。

必须支持：

1. 每轮自动收到截断后的 `memory_summary.md`。
2. 只有在任务相关时才搜索 `MEMORY.md` 和被指向的明细文件。
3. 读取结果必须包含 path、line range、content、truncated。
4. 最终回答如使用记忆，必须能生成引用数据。
5. Soul 只作为交互节奏和 artifact voice generation brief 参与，不替代 memory tools。

### 2.3 开发者 / 诊断用户

开发者需要解释记忆是否被使用、用了什么、为什么没有命中。

必须支持：

1. 查看 memory store 路径和健康状态。
2. 查看 summary 注入预算与截断状态。
3. 查看 memory tools 的调用记录和 citation。
4. 查看派生索引状态。
5. 查看 Soul 当前是否启用、来自手工配置还是 `SOUL.md` 导入快照。

## 3. P0 目标

1. 定义 `MemoryBackend` 合同：`list` / `read` / `search` / `add_ad_hoc_note`。
2. 定义平台无关 memory store 布局，不硬编码 macOS / Windows 路径。
3. 默认只注入 `memory_summary.md` 的截断内容。
4. 提供本地文件系统 backend。
5. 提供 dedicated memory tools。
6. 搜索先使用文本匹配和行窗口，不引入向量数据库。
7. 新写入只进入 ad-hoc note 或待整理区，不直接改 summary。
8. 保留 SQLite 作为线程状态和清理状态存储，不作为语义检索主线。
9. 保留 `memory.soul`、`SOUL.md` 导入 / 复制、模板和导入 warning。

## 4. P1 目标

1. 增加 memory reset：清空 memory folder，并重置 SQLite stage data。
2. 增加 citation 输出合同，支持最终回答回挂记忆来源。
3. 增加后台 consolidation：把 ad-hoc notes 和 rollout summaries 整理进 `MEMORY.md` / `memory_summary.md`。
4. 删除旧 `unified_memory_*` / `memory_runtime_*` 的产品入口、写入入口和默认召回入口。
5. 给暂未物理删除的旧命令名补 fail-fast / retired guard。
6. 专家 persona 仅继承 Soul 的 `communication_rhythm`，不得回写全局 Soul。

## 5. P2 目标

1. 增加可选派生索引，用于大 memory folder 的快速检索。
2. 派生索引必须可删除、可重建、可降级到文本扫描。
3. 派生索引可以是内嵌全文索引、嵌入式搜索索引、可选向量索引或远端索引适配，但不得成为 canonical store。
4. 增加索引健康检查和 rebuild 入口。

## 6. 非目标

本 PRD 不做：

1. 不新增或保留 `inspiration_*` 长期表。
2. 不把 `unified_memory_*` 继续作为下一代记忆事实源。
3. 不把 `memory_runtime_*` 继续作为默认召回主线。
4. 不把旧记忆或旧灵感库数据批量导入为新事实源。
5. 不默认引入向量数据库。
6. 不实现 external memory provider。
7. 不实现 active recall / dreaming / auto organization。
8. 不把普通用户主导航做成记忆诊断工作台。
9. 不把 Soul 当作旧 `companion_*` 桌宠链路。
10. 不恢复任何 `lime-rs/src/**` 旧路径。

## 7. 功能需求

### 7.1 Memory Store

目标布局：

```text
memories/
  memory_summary.md
  MEMORY.md
  rollout_summaries/
  skills/
  extensions/
    ad_hoc/
      notes/
  index/
```

要求：

1. 根路径必须通过统一 app path / workspace path resolver 取得。
2. 所有工具返回相对路径。
3. 默认跳过隐藏文件、symlink 和越界路径。
4. 非 UTF-8 文件不报错扩散，按不可读跳过。

### 7.2 Prompt 注入

要求：

1. 只读取 `memory_summary.md`。
2. 空文件不注入。
3. 超预算必须截断。
4. 注入内容标明它是记忆摘要，不是用户本轮输入。
5. summary 不得包含凭证、完整密钥、未脱敏个人敏感信息。

### 7.3 Memory Tools

P0 工具：

1. `memory_list`
2. `memory_read`
3. `memory_search`
4. `memory_add_note`

要求：

1. `memory_search` 支持多 query、match mode、case sensitive、normalized、cursor、context lines。
2. `memory_read` 支持 line offset、max lines、max tokens。
3. `memory_add_note` 只写 ad-hoc note，不直接改 `MEMORY.md`。
4. 所有工具输出 JSON，并保留 citation 所需字段。

### 7.4 Soul

要求：

1. `memory.soul` 继续保存 `MemorySoulConfig`。
2. `SOUL.md` 导入必须先预览，再应用到草稿并保存。
3. `SOUL.md` 导入保留 `project_rules`、`local_path`、`secret_like`、`too_long` warning。
4. `SOUL.md` 复制输出只是快照；运行时使用保存后的 app config。
5. `artifact_voice` 只生成 `generation_brief_only`，不得写入 `MEMORY.md` 或 `memory_summary.md`。
6. 专家 persona 可以继承全局 Soul 的沟通节奏，但不得回写全局 Soul。

### 7.5 写入与整理

要求：

1. 用户显式要求“记住”时，写入 ad-hoc note。
2. 会话结束或空闲时可生成 rollout summary。
3. consolidation 只在后台或明确操作中更新 `MEMORY.md` / `memory_summary.md`。
4. 自动候选必须经过 secret / injection scan。
5. 写入当前 turn 后不应立即改写同一 turn 的 prompt。

### 7.6 旧实现清理

要求：

1. 删除旧 `unified_memory_*` 新增写入入口。
2. 删除旧 `memory_runtime_*` 默认 recall 入口。
3. 删除旧 MemoryPage 灵感库 / 高级诊断混合视图入口。
4. 旧 embedding BLOB 不成为新事实源。
5. 清理状态可以记录到 SQLite，但不能把 SQLite 变回语义记忆 store。
6. 旧入口被删除前只允许 fail-fast / retired guard，不允许新增兼容业务逻辑。

## 8. 成功指标

1. 每轮默认注入 token 稳定，不随历史线性增长。
2. 记忆工具读取结果都能追溯到 path / line。
3. 关闭或清空 memory store 后，不再读取旧记忆。
4. 旧记忆和旧灵感库入口被删除或 retired guard 封住。
5. Soul 导入 / 复制、模板、warning 和 artifact voice brief 仍可用。
6. 派生索引损坏时，系统能降级到文本扫描。
7. 普通用户无需理解向量库、provider、hit layer 或 runtime prefetch。

## 9. 风险

1. 文本搜索召回不如向量搜索。
   缓解：P0 先保证可审计；P2 再加可重建派生索引。

2. 文件化记忆被误写敏感内容。
   缓解：写入前扫描；summary 生成前二次脱敏；用户可清空。

3. 旧记忆系统与新 memory folder 并存过久。
   缓解：旧实现只允许删除或 retired guard，不提供兼容续命。

4. Agent 过度搜索记忆。
   缓解：prompt 中设置 quick pass 预算；工具层限制分页和结果数。

5. Soul 被误归为旧桌宠链路。
   缓解：文档和验收明确 `memory.soul` 是 current 交互配置，`companion_*` 才是 dead。
