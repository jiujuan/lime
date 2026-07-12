# Codex 原点式快速对齐 v1

> 状态：current research baseline
> 更新时间：2026-07-07
> Codex 原点：`/Users/coso/Documents/dev/rust/codex`
> opencode 参照：`/Users/coso/Documents/dev/js/opencode`
> Lime 落点：`/Users/coso/Documents/dev/ai/aiclientproxy/lime`
> 目标：用一套可执行文档，把 OpenAI Codex 的 `Thread / Turn / Item` 第一原语和 protocol-first、runtime、event materialization、tool/context/state/plugin/fixture 等核心体系，以及 opencode 的多模型、多模态能力表达，快速映射到 Lime current 主链。

> Lime current-state 基线：[lime-current-state.md](./lime-current-state.md)

## 1. 固定判断

Lime 不从零重写，也不把 Codex 或 opencode 当作可直接覆盖的产品形态。Codex 是 Agent 工程主原点，opencode 只作为多模型、多模态能力代数参照，Lime 是桌面 GUI 产品。

本目录的最高准则是 Codex-first：除多模型 / 多模态的 provider、capability、media part、模型能力矩阵和 provider lowering 参考 opencode 外，其余命名、架构、实现和测试护栏都尽量按 Codex 对齐。Lime 当前存在的不合理命名、旧 `Agent` / `agent_runtime_*` 残留、临时 projection 或旧 UI 状态机不是 current 续命理由；后续每一刀应先判断如何向 Codex 的 Thread / Turn / Item、app-server、core runtime、event materialization、tool lifecycle、history hydrate 和 TUI fixture 收敛。

本目录回答的问题是：

```text
Codex 今天已经证明的 Thread / Turn / Item Agent 原语
  + Codex 围绕原语建立的 protocol / runtime / event / tool / context / state / plugin / fixture 工程体系
  + opencode 今天已经证明的多模型/多模态能力表达
  -> Lime 当前对应位置在哪里
  -> 哪些要快速对齐
  -> 哪些要桌面化改造
  -> 哪些只跟踪不动
  -> 后续如何跟上 Codex 上游变化和 opencode allowlist 变化
```

固定主链：

```text
React GUI
  -> src/lib/api/*
  -> AppServerClient / safeInvoke
  -> Electron Desktop Host bridge
  -> App Server JSON-RPC
  -> Protocol registry / serialization scope
  -> Thread / Turn / Item primitive model
  -> RuntimeCore / agent / services / domain crates
  -> Event materialization / item projection
  -> Projection Store / Evidence / Read Model
  -> Agent UI projection
```

任何参考 Codex 的实施，都不得新增第二套后端、第二套 transcript store、第二套前端状态机，或把 mock / legacy facade 接回生产主链。

## 2. 双参考源定位

| 参考源 | 角色 | Lime 应吸收 | Lime 不应照搬 |
| --- | --- | --- | --- |
| Codex | Agent 原语和工程主原点 | Thread / Turn / Item、Protocol-first、serialization scope、App Server、core session/task runtime、event materialization、turn/tool lifecycle、approval/sandbox、context/compaction、state/rollout/trace、plugin/skills/MCP、typed client、fixture/schema validation | TUI 产品形态、OpenAI-only 假设、rollout 作为 Lime runtime truth |
| opencode | 多模型、多模态能力参照 | Provider/Model catalog、模型 capability、provider-neutral LLM message/event、media part、provider lowering、cache/options 能力表达 | Session V2、Tool V2、UI 组件、协议治理、Effect/Bun 技术栈 |

优先级规则：

1. Agent runtime 内核问题先看 Codex 的 `Thread / Turn / Item` 原语，再看 protocol/runtime/event/tool/context/state/fixture 所在层。
2. 只有多模型、多 Provider、多模态 message/event、media input/output、模型能力矩阵和 provider lowering 问题必须同时看 opencode；其余 Agent 架构问题默认不看 opencode。
3. GUI 产品形态问题以 Lime 设计语言和 Codex 状态机为准，不参考 opencode UI。
4. opencode 不在 Provider / Model / Capability / ContentPart / LLMEvent / provider lowering 范围内的变化默认不参与。
5. 两个参考源冲突时，以 Lime current 主链、桌面产品约束和多模型多模态目标裁决。

## 3. 为什么新开 v1

仓库已有 `internal/refactor/` 和 `internal/roadmap/codeximport/` 等材料，但它们分别偏向结构重构、导入 Codex 历史会话、局部工程治理。

本目录的定位更上层：

1. 以 Codex 为 Agent 工程主原点，以 opencode 为多模型/多模态能力参照，而不是以 Lime 当前文件为原点。
2. 前期快速建立对齐基线，而不是慢慢做长期观察。
3. 把框架、协议、运行时、前端 UI、验证和后续跟进机制放在同一张图里。
4. 后续每一刀实施都能回到同一套模块对照表，不再靠临场判断。

## 4. 文档导航

| 文档 | 用途 |
| --- | --- |
| [prd.md](./prd.md) | 背景、目的、收益、用户故事、用户用例和验收口径 |
| [codex-origin-comparison.md](./codex-origin-comparison.md) | 以 Codex 模块为原点的系统性对照表 |
| [codex-architecture-map.md](./codex-architecture-map.md) | Codex 自身架构图谱：原语、协议、runtime、tool、context、state、TUI facade、fixture |
| [lime-current-state.md](./lime-current-state.md) | Lime 当前真实架构、current / compat / dead 分类、Codex 对齐缺口和多模型多模态现状 |
| [naming-alignment.md](./naming-alignment.md) | Codex 式短命名基线：Thread 管历史，Turn 管执行，Item 管投影 |
| [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) | P1 前置 invariant：所有 Agent 改动先回答 Thread、Turn、Item 归属 |
| [opencode-reference-comparison.md](./opencode-reference-comparison.md) | 以 opencode 模块为参照的多模型、多模态能力对照表 |
| [architecture.md](./architecture.md) | Lime 目标架构、事实源分类和分层边界 |
| [diagrams.md](./diagrams.md) | 总体架构图、时序图、流程图和上游跟进流程 |
| [module-alignment-plan.md](./module-alignment-plan.md) | 按模块推进的第一刀、验收和落点 |
| [fast-alignment-roadmap.md](./fast-alignment-roadmap.md) | P0/P1/P2/P3 快速对齐节奏 |
| [priority-tracking-plan.md](./priority-tracking-plan.md) | 按优先级跟进 P1/P2 推进状态、下一刀、验证入口和过程日志 |
| [quality-fixture-matrix.md](./quality-fixture-matrix.md) | P1 证据矩阵：协议、runtime、projection、GUI、governance 验证入口与热区归属 |
| [upstream-checkpoint.md](./upstream-checkpoint.md) | Codex / opencode 本地 HEAD checkpoint、allowlist 上游信号和下一次 diff 起点 |
| [upstream-diff-2026-07-06.md](./upstream-diff-2026-07-06.md) | P1-8 第八刀：从 checkpoint 到 fetched origin 的真实 Codex / opencode allowlist diff |
| [upstream-diff-2026-07-06-p3-loop.md](./upstream-diff-2026-07-06-p3-loop.md) | P3 第二次 range check：Codex 无新增，opencode 5 commits 无 allowlist 采纳项 |
| [upstream-diff-2026-07-07.md](./upstream-diff-2026-07-07.md) | P3 第四次 range check：Codex 新增 interleaved response items / plugin readiness 等历史信号，opencode 无 allowlist 采纳项；其中 interleaved 口径已被第五次回滚覆盖 |
| [upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md) | P3 第五次 range check：Codex 新增 configWarning owner 收敛、safety buffering `retry_model`、conditional dotenv watch，并把 interleaved response items 改为 rollback-aware |
| [p2-runtime-skeleton.md](./p2-runtime-skeleton.md) | P2 深层能力骨架：Tool、Context、Plugin、Media 的 owner / first slice / verification |
| [p2-tool-approval-sandbox-handoff.md](./p2-tool-approval-sandbox-handoff.md) | P2 第一代码刀 handoff：Tool / Approval / Sandbox typed owner、窄写集、接管条件和验证门槛 |
| [p2-media-item-projection-handoff.md](./p2-media-item-projection-handoff.md) | P2 Media Item projection handoff：把 RuntimeCore `contentParts` 接到 Item/read model/Workbench 的文件级施工单 |
| [p2-codex-fifth-signal-handoff.md](./p2-codex-fifth-signal-handoff.md) | P2 / P3 第五次 Codex 信号 handoff：App Server `configWarning`、provider safety buffering `retry_model`、Desktop Host startup env overlay |
| [completion-audit.md](./completion-audit.md) | 整体完成审计：把 PRD / roadmap 验收项映射到当前证据、缺口和下一刀 |
| [follow-up-strategy.md](./follow-up-strategy.md) | Codex 上游持续跟进策略和分类规则 |

## 5. v1 范围

v1 只做“快速对齐基线”：

- 建立 Codex `Thread / Turn / Item` 原语和核心体系模块地图。
- 建立 opencode 多模型/多模态参照地图。
- 建立 Lime current 对照落点。
- 明确 P0/P1/P2 优先级。
- 明确每类变化的验证入口。
- 明确后续跟进 Codex 上游和 opencode 多模型/多模态 allowlist 的固定流程。

v1 不做：

- 不改产品代码。
- 不重命名 Lime 协议版本。
- 不把 Codex TUI 当 Lime UI 目标。
- 不恢复 `lime-rs/src/**` 或旧 Tauri command wrapper。
- 不在 Electron 里新增后端业务逻辑。
- 不用 Codex rollout JSONL 替代 Lime read model。

## 6. 分类语言

每个 Codex 参考点和 opencode allowlist 参考点必须落入下面四类之一。opencode 非 allowlist 变化默认不分类进入 backlog，最多记录为 `reject-for-lime`。

| 分类 | 含义 | 处理方式 |
| --- | --- | --- |
| `adopt-now` | Codex 模式可直接进入 Lime current 主链 | 进入 P0/P1 队列，绑定 Lime owner 和验证命令 |
| `adapt-for-desktop` | Codex 思路正确，但 Lime 需要 GUI / Electron / i18n / artifact 改造 | 进入模块计划，先定义桌面化边界 |
| `watch` | 值得持续跟踪，但当前不阻塞 Lime | 记录上游路径和触发条件 |
| `reject-for-lime` | 适合 Codex CLI/TUI，不适合 Lime current 产品 | 明确拒绝原因，防止反复讨论 |

## 7. 本轮推进原则

1. **先快后细**：先把 Codex 原点对照和 P0/P1 队列立起来，再做精细实现。
2. **先原语后骨架**：先明确 Thread / Turn / Item，再推进 protocol-first、serialization scope、runtime、event materialization、projection、Workspace 分层。
3. **先 current 后 compat**：新增能力只进入 current 主链；compat 只允许迁移期薄委托。
4. **先结构化事件后 UI 文案**：前端显示不得靠自然语言正则判断 reasoning、tool、final answer。
5. **先模型能力矩阵后 Provider 适配**：Lime 是多模型、多模态产品，任何模型/Provider 改动必须明确 input/output/tool/reasoning/media 能力。
6. **先验证入口后扩面**：每个模块都必须绑定最小验证命令。
