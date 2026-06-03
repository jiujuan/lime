# Lime Soul 个性化图谱

> 状态：current diagrams
> 更新时间：2026-06-03
> 目标：用架构图、流程图和时序图固定 Soul 与 Memory、SOUL.md、Generation Brief 的边界。

## 1. 总体架构图

```mermaid
flowchart TB
  User[用户] --> Settings[AI 个性 / 声线设置]
  Advanced[进阶用户] --> Import[SOUL.md 导入 / 导出]
  Creator[创作者] --> Create[正式创作任务]
  ExpertUser[专家用户] --> ExpertPlaza[Expert Plaza / 专家广场]

  Settings --> SoulConfig[Global Soul Config]
  Import --> Adapter[SOUL.md Adapter]
  Adapter --> Preview[导入预览 / 风险提示]
  Preview --> Confirm{用户确认?}
  Confirm -- 是 --> SoulConfig
  Confirm -- 否 --> Drop[不写入配置]

  SoulConfig --> PromptService[memory_profile_prompt_service]
  MemoryProfile[memory.profile] --> PromptService
  MemorySources[memory sources] --> PromptService
  PromptService --> RuntimeTurn[runtime_turn]
  RuntimeTurn --> Chat[普通聊天回复]

  ExpertPlaza --> ExpertMeta[Expert Runtime Metadata]
  ExpertMeta --> RuntimeTurn
  ExpertMeta -.不写回.-> SoulConfig

  Create --> Intent[任务意图识别]
  Intent --> Unified[unified_memory_* / knowledge evidence]
  SoulConfig --> Guard[personality_boundary_guard]
  Unified --> Guard
  Guard --> Brief[Generation Brief]
  Brief --> RuntimeTurn
  RuntimeTurn --> Artifact[正式 artifact]

  Companion[Companion Soul] --> Bubble[Companion 气泡]
  Companion -.不进入.-> Artifact
  SoulConfig -.默认不进入.-> Artifact
  ExpertMeta -.默认不进入.-> Artifact

  classDef product fill:#EFF6FF,stroke:#3B82F6,color:#1E3A8A;
  classDef runtime fill:#FFF7ED,stroke:#F97316,color:#7C2D12;
  classDef store fill:#F8FAFC,stroke:#64748B,color:#0F172A;
  classDef guard fill:#FDF2F8,stroke:#DB2777,color:#831843;

  class User,Advanced,Creator,ExpertUser,Settings,Import,Preview,Confirm,Drop,Chat,Artifact,Bubble,ExpertPlaza product;
  class PromptService,RuntimeTurn,Intent,Guard,Brief,ExpertMeta runtime;
  class SoulConfig,MemoryProfile,MemorySources,Unified,Companion store;
```

固定判断：

1. `SOUL.md Adapter` 只写 current config，不成为 runtime 输入源。
2. `Global Soul Config` 默认只通过 prompt service 影响普通聊天。
3. 正式 artifact 只从 `Generation Brief` 接收 Creator / Brand Voice。
4. Companion Soul 只影响气泡。
5. Expert Persona 通过 expert runtime metadata 影响当前专家会话，不写回 Global Soul。

## 2. Soul / Memory 边界图

```mermaid
flowchart LR
  subgraph Evidence[证据与长期偏好]
    UM[unified_memory_*]
    MP[memory.profile]
    KP[knowledge / brand profile]
  end

  subgraph Personality[Personality Layer]
    GS[Global Soul]
    EP[Expert Persona]
    CV[Creator / Brand Voice]
    CS[Companion Soul]
  end

  subgraph Runtime[运行时边界]
    Prompt[memory_profile_prompt_service]
    Guard[personality_boundary_guard]
    GB[Generation Brief]
    Turn[runtime_turn]
  end

  MP --> GS
  UM --> CV
  KP --> CV
  GS --> Prompt
  EP --> Turn
  CV --> Guard
  Guard --> GB
  Prompt --> Turn
  GB --> Turn
  CS --> Bubble[Companion Bubble]

  GS -.不直接.-> GB
  EP -.不写回.-> GS
  EP -.需经 guard.-> GB
  CS -.不进入.-> GB
```

固定判断：

- Memory 保存证据。
- Soul 投影交互人格。
- Expert 投影当前会话的专业角色和能力包。
- Voice 通过 guard 进入正式创作。
- Companion 不反写 artifact。

## 3. 全局 Soul 设置流程图

```mermaid
flowchart TD
  Start[打开 AI 个性 / 声线设置] --> Load[读取 current Soul config]
  Load --> Exists{已有配置?}
  Exists -- 否 --> Empty[展示默认空态 / 模板建议]
  Exists -- 是 --> Form[展示现有配置]
  Empty --> Edit[用户编辑]
  Form --> Edit
  Edit --> Validate{字段有效?}
  Validate -- 否 --> InlineError[展示字段提示]
  Validate -- 是 --> Preview[生成回复预览]
  Preview --> Save{保存?}
  Save -- 否 --> Edit
  Save -- 是 --> Persist[写入 current config]
  Persist --> NextTurn[下一轮普通聊天生效]
  NextTurn --> Runtime[由 prompt composition 注入]
```

验收重点：

1. 不编辑文件。
2. 空配置不注入。
3. 保存后下一轮生效。
4. 关闭后下一轮取消注入。

## 4. SOUL.md 导入流程图

```mermaid
flowchart TD
  Start[用户选择 / 粘贴 SOUL.md] --> Read[读取 Markdown 内容]
  Read --> Empty{内容为空?}
  Empty -- 是 --> Reject[不覆盖现有配置]
  Empty -- 否 --> Scan[基础风险扫描]
  Scan --> Classify[分类 voice / style / avoid / project rules]
  Classify --> ProjectRules{包含明显项目规则?}
  ProjectRules -- 是 --> Warn[提示迁移到项目规则 / 知识库]
  ProjectRules -- 否 --> Draft[生成 Soul draft]
  Warn --> Draft
  Draft --> Preview[展示导入预览]
  Preview --> Confirm{用户确认导入?}
  Confirm -- 否 --> Cancel[放弃导入]
  Confirm -- 是 --> Persist[写入 current Soul config]
  Persist --> Done[后续运行不依赖原文件]
```

验收重点：

1. 导入前必须预览。
2. 导入后不保留原始文件路径依赖。
3. 项目规则不自动混入 Soul。
4. 空文件不覆盖现有配置。

## 5. 普通聊天注入时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant UI as Chat UI
  participant Config as Soul / Memory Config
  participant Prompt as memory_profile_prompt_service
  participant Runtime as runtime_turn
  participant Model as 模型

  U->>UI: 发送普通聊天
  UI->>Runtime: agent_runtime_submit_turn
  Runtime->>Config: 读取 memory profile / Global Soul
  Config-->>Prompt: 配置投影
  Prompt->>Prompt: 构建用户画像 + 全局交互人格 section
  Prompt-->>Runtime: merged system prompt
  Runtime->>Model: 调用模型
  Model-->>UI: 返回回复
  UI-->>U: 展示符合 Soul 的交互语气
```

验收重点：

1. Global Soul 与 memory profile 在同一 prompt composition 边界。
2. 稳定 marker 防止重复注入。
3. 当前用户指令优先。
4. 关闭 Soul 后不渲染 Soul section。

## 6. 正式创作声线时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant Create as 创作入口
  participant Toggle as 本轮创作声线开关
  participant Metadata as artifactGenerationBriefMetadata
  participant Intent as Intent Classifier
  participant Evidence as unified_memory_* / knowledge
  participant Soul as Global Soul Config
  participant Guard as personality_boundary_guard
  participant Request as artifact_request_metadata_service
  participant Brief as Generation Brief Compiler
  participant Runtime as runtime_turn
  participant Model as 模型

  U->>Create: 发起正式创作任务
  Create->>Soul: 读取已保存的 memory.soul.artifact_voice
  Soul-->>Create: saved voice candidate
  U->>Toggle: 本轮开启 / 关闭创作声线
  Create->>Metadata: 显式 Creator / Brand Voice metadata
  Toggle-->>Metadata: enabled_for_turn
  Metadata->>Metadata: 无显式 generation_brief 且本轮开启时应用 saved fallback
  Metadata->>Metadata: 归一化为 artifact.generation_brief
  Metadata->>Metadata: 清理互斥 creator / brand voice ID
  Metadata->>Metadata: 写入 diagnostics.soul_artifact_voice
  Create->>Intent: 识别任务类型 / 输出渠道
  Intent-->>Create: task_intent / output_shape
  Create->>Evidence: 读取相关个人 / 品牌声线 evidence
  Evidence-->>Guard: creator / brand voice candidates
  Soul-->>Guard: product soul context
  Guard->>Guard: 判断哪些 personality 可进入本轮
  Guard-->>Brief: allowed creator / brand voice fields
  Metadata-->>Request: request metadata
  Request->>Request: 补默认边界 / alias normalize
  Request->>Request: 后端再次清理互斥 voice ID
  Request-->>Brief: normalized generation_brief
  Brief->>Brief: 编译 Generation Brief 声线边界
  Brief-->>Runtime: prompt augmentation
  Runtime->>Model: 调用模型
  Model-->>Create: artifact
```

验收重点：

1. Product Soul 不默认进入 artifact。
2. Creator / Brand Voice 必须经过 guard。
3. 所有 voice 字段有 evidence 或显式配置。
4. Companion Soul 不参与。
5. 只携带 `generation_brief` 时不触发 Artifact Stage / Schema 合同。
6. 已保存声线只能在 `memory.soul.artifact_voice.enabled=true` 且本轮“创作声线”开关开启时作为发送 fallback；本轮显式 `generation_brief` 优先。
7. 同一份 Generation Brief 不允许同时保留个人和品牌声线 ID。
8. `diagnostics.soul_artifact_voice` 只解释来源、开关和 guard 结果，不作为模型 prompt 事实源。

## 7. 临时 personality overlay 时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant UI as Chat UI
  participant Session as Session State
  participant Runtime as runtime_turn
  participant Model as 模型

  U->>UI: 选择临时模式
  UI->>Session: 写入 session-scoped overlay
  Session->>Session: 追加风格切换 marker
  U->>UI: 发送下一条消息
  UI->>Runtime: submit turn with session overlay
  Runtime->>Model: Global Soul + overlay pivot
  Model-->>UI: 按临时模式回复
  U->>UI: 清除临时模式
  UI->>Session: remove overlay
```

验收重点：

1. overlay 不默认写入长期 Soul。
2. 切换不清空历史。
3. 清除后回到 Global Soul。
4. 用户确认后才可沉淀为长期配置。

## 8. 专家会话联动时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant Plaza as Expert Plaza
  participant Expert as Expert Runtime Metadata
  participant Soul as Global Soul Config
  participant Runtime as runtime_turn
  participant Model as 模型

  U->>Plaza: 选择专家并开始对话
  Plaza->>Expert: 生成 personaRef / memoryTemplateRef / skillRefs / workflowRefs
  Plaza->>Runtime: submit turn with expert metadata
  Runtime->>Soul: 读取全局交互人格
  Runtime->>Runtime: 专家角色优先，Global Soul 只调整沟通节奏
  Runtime->>Model: 调用模型
  Model-->>U: 返回专家会话回复
```

验收重点：

1. Expert Persona 不写回 Global Soul。
2. 专家角色只影响当前专家会话或专家任务。
3. Global Soul 可影响解释节奏，但不能覆盖专家职责。
4. 专家输出进入正式 artifact 前仍需 `Generation Brief`。

## 9. SOUL.md 导出流程图

```mermaid
flowchart TD
  Start[用户点击导出 SOUL.md] --> Read[读取 current Soul config]
  Read --> Enabled{有可导出配置?}
  Enabled -- 否 --> Empty[提示暂无可导出内容]
  Enabled -- 是 --> Render[渲染 Markdown]
  Render --> Scrub[移除诊断 / 路径 / 敏感字段]
  Scrub --> Preview[展示导出预览]
  Preview --> Save[保存到用户选择位置]
```

验收重点：

1. 导出来自 current config。
2. 导出不包含运行时诊断。
3. 导出文件不会反向成为事实源。
