# Codex 命名对齐

> 状态：current naming baseline
> 更新时间：2026-07-05
> 目标：让 Lime 后续 Agent 设计尽量使用 Codex 式短命名，先统一语义，再分阶段迁移代码。

## 1. 命名结论

Lime 后续 Agent 主链统一使用这句短表达：

```text
Thread owns history.
Turn owns execution.
Item owns projection.
```

中文口径：

```text
Thread 管历史，Turn 管执行，Item 管投影。
```

这三个词是架构词，不是 UI 文案。

命名迁移执行 Codex-first：除 `ContentPart`、`ModelCapability`、provider capability、media part 等多模型 / 多模态术语可以参考 opencode 外，Agent runtime、history、turn lifecycle、tool lifecycle、projection、MCP、Skills 和 Multi-Agent 默认使用 Codex 语义。Lime 现有不合理命名只能作为 `current legacy-name`、`compat` 或迁移残留解释，不能作为新设计继续扩散的依据。

## 2. Canonical Terms

| 目标名 | Codex 来源 | Lime 当前名 | 语义 | 规则 |
| --- | --- | --- | --- | --- |
| `Thread` | `Thread` | `agentSession` / `thread_id` / `SessionDetail` | 长期会话、历史、fork、resume、sub-agent tree | 新文档和新设计优先说 `Thread`；旧协议命名暂不硬改 |
| `Turn` | `Turn` | `turn_id` / `turn_execution` / active stream | 一次用户输入驱动的执行边界 | 不叫 `run`、`request`、`loading` |
| `Item` | `ThreadItem` | `RuntimeEvent` materialized item / read model `items` / `TimelineItem` | 可持久化、可更新、可投影的最小语义单元 | 架构层叫 `Item`；Codex Rust 类型可写 `ThreadItem` |
| `Event` | core event | provider wire event / `LLMEvent` / `RuntimeEvent` | 运行时发生的事实 | Event 不是 UI state；必须 materialize 成 Item |
| `Notification` | `ServerNotification` | typed notification / JSON-RPC notification | 推给客户端的协议消息 | Notification 不是持久化事实源 |
| `Projection` | history / item projection | read model / Timeline / Workbench projection | 面向读取和 UI 的派生视图 | Projection 不反向写 runtime truth |
| `ReadModel` | thread read / history | `ProjectionStore` / `read_model` | GUI、Evidence、Replay 的读取事实 | 不用 UI transcript 拼历史 |

## 3. 保留名

这些名字当前可以保留，因为它们是 Lime 产品或现有协议事实：

| 名称 | 保留原因 | 使用边界 |
| --- | --- | --- |
| `agentSession/*` | App Server v0 current method namespace 已存在 | 写实现证据时可保留；讲架构时映射为 `Thread` |
| `SessionDetail` | 当前 read model 类型名 | 作为现状名；目标语义是 `Thread read model` |
| `ContentPart` | 多模型、多模态内容片段 | 继续用于 provider-neutral content，不替代 `Item` |
| `ModelCapability` | 多模型能力矩阵 | 来自 Lime/opencode allowlist，不用 Codex 改名 |
| `TimelineItem` | 前端 UI 投影类型 | 只用于 UI projection，不作为 runtime 原语 |

## 4. 禁用表达

| 不建议名 | 应改为 | 原因 |
| --- | --- | --- |
| `chat id` | `Thread` | chat id 太前端化，丢失 history / fork / resume 语义 |
| `conversation` | `Thread` | 含义过宽，不表达 runtime ownership |
| `run` | `Turn` | run 不能表达 steer / interrupt / terminal |
| `loading state` | `TurnStatus` | loading 是 UI 状态，不是执行事实 |
| `message shape` | `Item` / `ContentPart` | message 不能覆盖 tool、file、reasoning、media |
| `timeline object` | `ItemProjection` | timeline 是 UI 视图，不是事实源 |
| `raw provider event` | `LLMEvent` -> `RuntimeEvent` -> `Item` | provider event 不能直通 GUI |

## 5. 迁移规则

1. 新研究文档、计划、PRD：优先使用 `Thread / Turn / Item`。
2. 新 runtime / projection 设计：必须写清 `threadId / turnId / itemId`。
3. 新 App Server method：先进入 method registry / serialization scope，再评估是否从 `agentSession/*` 迁到 `thread/*`、`turn/*`、`item/*`。
4. 旧 `agentSession/*`：当前视为 `current legacy-name`，不因命名不优雅而裸改协议；但不得继续扩散到新域名、新类型或新 UI 状态机。
5. UI 类型：继续区分 `Item` 和 `TimelineItem`；前者是事实，后者是视图。

## 6. P1 命名退出条件

| 检查项 | 通过条件 |
| --- | --- |
| 架构表达 | 新增 Agent 文档默认使用 `Thread / Turn / Item` |
| 代码设计 | 新能力先回答 Thread、Turn、Item 归属 |
| 协议迁移 | 不再新增 `agentSession` 风格的新域名；确需沿用时写明兼容原因 |
| UI 投影 | 组件只消费 projection，不把 `TimelineItem` 当 runtime truth |
| 多模型多模态 | `ContentPart / ModelCapability / LLMEvent` 保留，不被误改成 Agent 原语 |

## 7. 一句话审查

```text
新增 Agent 能力如果说不清 Thread、Turn、Item，就不能进入主链。
```
