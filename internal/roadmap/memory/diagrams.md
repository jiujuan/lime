# Lime 文件化记忆图谱

> 状态：current diagrams
> 更新时间：2026-06-18
> 目标：用图固定文件化记忆、summary 注入、工具读取、Soul 配置、后台整理和旧路径清理边界。

## 1. 总体架构

```mermaid
flowchart TB
  User[用户] --> Thread[thread/start 或 turn/start]
  Thread --> Config[读取 memory config]
  Config --> Store[Memory Store Root]
  Config --> Soul[memory.soul]
  Store --> Summary[memory_summary.md]
  Summary --> Budget[Token Budget / Truncation]
  Soul --> Interaction[Interaction Contributor]
  Budget --> Prompt[Developer Policy Fragment]
  Interaction --> Prompt
  Prompt --> Agent[Agent Loop]

  Agent --> NeedMemory{需要更多记忆?}
  NeedMemory -- 否 --> Answer[继续生成]
  NeedMemory -- 是 --> Tools[Memory Tools]
  Tools --> Backend[MemoryBackend]
  Backend --> Files[(MEMORY.md / rollout_summaries / notes)]
  Backend --> Index[(Derived Index 可选)]
  Files --> Tools
  Index --> Tools
  Tools --> Agent

  User --> Note[显式要求记住]
  Note --> AddNote[memory_add_note]
  AddNote --> Adhoc[extensions/ad_hoc/notes]
  Adhoc --> Consolidation[后台整理]
  Consolidation --> MemoryMd[MEMORY.md]
  Consolidation --> Summary

  User --> SoulEditor[Soul 编辑 / SOUL.md 导入]
  SoulEditor --> Soul
  Soul --> Brief[artifact voice generation brief]
  Brief --> Agent

  classDef current fill:#E8FFF6,stroke:#10B981,color:#064E3B;
  classDef optional fill:#FFF7ED,stroke:#F97316,color:#7C2D12;
  classDef store fill:#F8FAFC,stroke:#64748B,color:#0F172A;

  class Summary,Budget,Prompt,Tools,Backend,Consolidation,Soul,Interaction,Brief current;
  class Index optional;
  class Store,Files,Adhoc,MemoryMd store;
```

固定判断：

1. 默认 prompt 只注入 summary 和受控 Soul 片段。
2. 原文记忆只通过工具按需读取。
3. Soul 是交互配置，不是 memory store 文件本体。
4. 派生索引可选，不能替代文件事实源。

## 2. Read Path

```mermaid
sequenceDiagram
  autonumber
  participant Runtime as App Server Runtime
  participant Store as Memory Store
  participant Prompt as Prompt Contributor
  participant Soul as Soul Contributor
  participant Agent as Agent Loop
  participant Tools as Memory Tools
  participant Backend as MemoryBackend

  Runtime->>Store: resolve memory root
  Runtime->>Soul: load saved memory.soul
  Prompt->>Store: read memory_summary.md
  Store-->>Prompt: summary text
  Prompt->>Prompt: truncate to budget
  Soul-->>Agent: interaction rhythm fragment
  Prompt-->>Agent: developer policy fragment
  Agent->>Tools: memory_search({ queries })
  Tools->>Backend: search(request)
  Backend-->>Tools: matches(path,line,content)
  Tools-->>Agent: JSON hits
  Agent->>Tools: memory_read(path,lineOffset)
  Tools->>Backend: read(request)
  Backend-->>Tools: content + citation fields
  Tools-->>Agent: JSON content
```

验收重点：

1. summary 读取失败不阻塞 turn。
2. search/read 输出必须可引用。
3. 工具不能返回绝对路径。
4. Soul 缺失或关闭时不影响 memory tools。

## 3. Search Path

```mermaid
flowchart TD
  Search[memory_search] --> Validate[参数校验]
  Validate --> Scope[resolve scoped path]
  Scope --> HasIndex{派生索引健康?}
  HasIndex -- 是 --> Indexed[Indexed search]
  HasIndex -- 否 --> Text[Text scan fallback]
  Indexed --> Normalize[排序 / 分页 / 截断]
  Text --> Normalize
  Normalize --> Result[SearchMemoriesResponse]

  Validate --> RejectEmpty[拒绝空 query]
  Scope --> RejectPath[拒绝 symlink / hidden / traversal]
```

P0 固定：

1. 文本扫描是 baseline。
2. 派生索引只是优化。
3. 索引坏了不影响读取记忆。

## 4. Write Path

```mermaid
sequenceDiagram
  autonumber
  participant User as 用户 / Agent
  participant Tool as memory_add_note
  participant Store as Memory Store
  participant Scan as Safety Scan
  participant Queue as Ad-hoc Notes
  participant Job as Consolidation Job
  participant Memory as MEMORY.md
  participant Summary as memory_summary.md

  User->>Tool: add note(filename,note)
  Tool->>Scan: validate filename and content
  Scan-->>Tool: safe / warning
  Tool->>Queue: write extensions/ad_hoc/notes/file.md
  Queue-->>User: note accepted
  Job->>Queue: read pending notes
  Job->>Memory: propose/update entries
  Job->>Summary: refresh compact summary
```

固定判断：

1. 写 note 不等于立即改 summary。
2. 后台整理失败不应让当前 turn 失败。
3. 敏感内容必须停在待审状态。

## 5. Soul Path

```mermaid
flowchart TD
  Settings[settings.memory.soul] --> Config[MemorySoulConfig]
  Import[SOUL.md import] --> Preview[parse + warnings + preview]
  Preview --> Apply[apply draft and save]
  Apply --> Config
  Config --> Interaction[interaction identity / communication rhythm]
  Config --> ArtifactVoice{artifact_voice enabled?}
  ArtifactVoice -- 是 --> Brief[generation_brief_only]
  ArtifactVoice -- 否 --> NoBrief[no artifact voice brief]
  Interaction --> Runtime[Runtime prompt contributor]
  Brief --> Runtime
  Expert[Expert persona] --> Scope[inherit communication_rhythm only]
  Scope --> Runtime
```

固定判断：

1. `SOUL.md` 是导入 / 复制快照，运行时事实源是保存后的 `memory.soul`。
2. 导入 warning 不能被跳过。
3. artifact voice 只进入 generation brief，不写 `MEMORY.md` / `memory_summary.md`。
4. expert persona 不回写全局 Soul。

## 6. Old Path Shutdown

```mermaid
flowchart LR
  OldUnified[unified_memory_*] --> RemoveUnified[remove entrypoints]
  OldRuntime[memory_runtime_*] --> RemoveRuntime[remove default recall]
  OldPage[old mixed MemoryPage / inspiration library] --> RemovePage[remove page and routes]
  OldInspiration[inspiration_*] --> RemoveInspiration[forbidden to restore]
  RemoveUnified --> Guard[fail-fast / retired guard / negative tests]
  RemoveRuntime --> Guard
  RemovePage --> Guard
  RemoveInspiration --> Guard
  Guard --> Current[Memory Store + Tools + Soul]
```

清理规则：

1. 旧数据不批量导入为 canonical truth。
2. 旧 embedding 不进入 canonical truth。
3. 旧入口只允许删除、fail-fast 或 retired guard，不允许只读续命。
4. 旧灵感库不再作为产品入口或旁路事实源。

## 7. Reset Path

```mermaid
flowchart TD
  Reset[memory/reset] --> Confirm[确认范围]
  Confirm --> ClearStore[清空 memory folder]
  Confirm --> ClearIndex[删除 index]
  Confirm --> ResetSqlite[重置 SQLite stage data]
  Confirm --> SoulScope{是否包含 Soul?}
  SoulScope -- 是 --> ResetSoul[重置 memory.soul]
  SoulScope -- 否 --> KeepSoul[保留 memory.soul]
  ClearStore --> Done[返回成功]
  ClearIndex --> Done
  ResetSqlite --> Done
  ResetSoul --> Done
  KeepSoul --> Done
```

要求：

1. reset 必须明确全局 / workspace 范围。
2. reset 不应误删线程历史。
3. reset 后下一轮不再注入旧 summary。
4. Soul 是否重置必须由用户选择的范围决定，不能被 memory folder 清空隐式删除。
