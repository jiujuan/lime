# 快速对齐路线图

> 状态：current research baseline
> 更新时间：2026-07-05
> 目标：前期快速对齐，后续稳定跟进。Codex 是 Agent 工程主原点，opencode 只参照多模型、多模态。

## 1. 路线图原则

这条路线图按“先快后稳”执行。

1. 前期不追求覆盖 Codex 和 opencode 全仓；Codex 先抓 [codex-architecture-map.md](./codex-architecture-map.md) 中的核心体系：`Thread / Turn / Item`、protocol-first、serialization scope、event materialization、core runtime、tool/approval/sandbox、context/compaction、persistence/replay/trace、plugin/skills/MCP、TUI facade、fixture；opencode 只抓 provider capability / multimodal ContentPart / LLMEvent / provider lowering。
2. 先对齐骨架，不先做低杠杆 polish。
3. 每一阶段都必须产出 repo 内 artifact。
4. 每一阶段都要封住 legacy / mock 回流。

## 2. P0：3-5 天，建立快速基线

目标：

```text
Codex 原点地图
  + Codex architecture map
  + Thread / Turn / Item 原语映射
  + protocol-first / serialization scope
  + event materialization / projection
  + opencode 多模型/多模态参照地图
  -> Lime current owner 对照表
  -> P0/P1 gap 排序
  -> 第一刀和验证入口
```

交付物：

- `internal/research/refactor/v1/*` 文档集。
- Codex-only 架构图谱覆盖原语、协议、runtime、tool、context、state、plugin、TUI facade、fixture。
- Lime current-state 文档覆盖当前主链、Rust workspace、Agent session / turn / item read model、多模型多模态现状、current / compat / dead 分类和 Codex 对齐缺口。
- Codex 原点对照表覆盖高价值模块。
- opencode 参照表覆盖 Provider/Model、LLM ContentPart/Event、model capability、provider options 和 provider lowering。
- P0/P1 对齐队列。
- 优先级跟进计划，记录当前完成度、P1/P2 队列、下一刀和过程日志。
- 后续 Codex upstream diff 工作流。

P0 模块：

| 模块 | 第一刀 | 验收 |
| --- | --- | --- |
| Codex architecture map | 以 Codex 核心体系作为所有文档共同事实源 | 文档对照完成 |
| Codex Agent 原语 | 明确 `Thread -> agentSession`、`Turn -> turn execution`、`Item -> projection item`；新设计使用 Codex 短命名 | 文档对照完成 |
| 协议骨架 / serialization scope | 明确 method definition registry 和 request serialization scope 方向 | 文档对照完成 |
| Turn lifecycle | 明确结构化终态和 turn/item 归属口径 | 文档对照完成 |
| Event materialization | 明确 provider/core event 到 item/history/projection 的转换链 | 文档对照完成 |
| UI projection | 明确 ContentPart / RuntimeEvent / TimelineItem 投影方向 | 文档对照完成 |
| Persistence / Replay / Trace | 明确 Codex import 只进 Lime read model，trace/telemetry 绑定 turn | 文档对照完成 |
| 多模型/多模态 | 明确 provider/model capability map 和 ContentPart 方向 | 文档对照完成 |
| Workspace 分层 | 明确不再向巨型组件堆逻辑 | 文档对照完成 |
| Quality / Fixture | 明确 contract、runtime fixture、GUI smoke 三类证据 | 文档对照完成 |
| 跟进机制 | 明确 upstream diff 分类法 | 文档对照完成 |

## 3. P1：1-2 周，快速工程对齐

目标：

```text
先把最容易导致分叉的骨架锁住
```

过程跟进统一写入 [priority-tracking-plan.md](./priority-tracking-plan.md)。路线图只定义节奏和优先级，计划文件记录当前状态、每次推进证据和下一刀。

建议顺序：

1. **Thread / Turn / Item 原语第一刀**
   - 建立 Lime current primitive mapping。
   - 后续所有 Agent 协议、runtime、projection、Evidence 改动先说明 thread/session、turn、item 三层归属。
   - 新文档和新设计优先使用 Codex 短命名；现有 `agentSession/*` 协议名不裸改。
   - 命名基线见 [naming-alignment.md](./naming-alignment.md)。
   - 前置 invariant 见 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md)。

2. **协议 registry / serialization scope 第一刀**
   - 为新增 method 建单一 definition registry。
   - method metadata 同步声明 serialization scope。
   - 不一次性迁完所有旧 method。
   - 先让新能力不再扩散。

3. **Event materialization / Turn 终态第一刀**
   - 梳理 `turn.completed / failed / interrupted` 到前端 active stream 的投影。
   - 固化 provider event -> LLMEvent -> runtime event -> item projection。
   - 覆盖 stale terminal event、cancel-then-continue、history hydrate。

4. **Core session / task runtime 第一刀**
   - 确认 turn queue、task lifecycle、model stream、tool execution、context assembly 都在 RuntimeCore / agent domain。
   - App Server processor 只接线，不承接 Agent loop。

5. **UI projection 第一刀**
   - 把 MessageList / StreamingRenderer / Timeline 共享的 item classification 抽成纯 projection。
   - 禁止通过正文文案判断 lifecycle。

6. **Persistence / Replay / Trace 第一刀**
   - Codex import source 只进 canonical bundle 和 Lime read model。
   - Evidence / replay / requestTelemetry 都能关联 session/thread/turn。

7. **Workspace 拆分第一刀**
   - 继续从 `AgentChatWorkspace.tsx` 抽出一个高风险 runtime domain。
   - 优先抽“状态机 / 副作用 / projection”，不是抽纯 JSX 小块。

8. **Provider/Model capability 第一刀**
   - 只参考 opencode provider/model spec 和 `packages/llm` schema。
   - 明确 Lime input/output/tools/reasoning/cache/media capability 字段。
   - UI 根据 capability 控制附件和输出模式。

9. **Quality fixture 第一刀**
   - 协议走 contract。
   - runtime 走 current fixture。
   - GUI 主路径走 smoke / Playwright。

P1 验收：

- `npm run test:contracts` 覆盖协议改动。
- turn / projection 有定向单测。
- Agent runtime 改动通过 `npm run smoke:agent-runtime-current-fixture`。
- GUI 主路径改动通过 `npm run verify:gui-smoke`。

## 4. P2：2-4 周，补齐深层能力

目标：

```text
把 Codex 深层能力转成 Lime 桌面产品可用的 runtime 纪律
```

当前执行入口见 [p2-runtime-skeleton.md](./p2-runtime-skeleton.md)。P2 已先完成 owner / first slice / verification 骨架，后续不再重开大段论证；源码热区释放后按骨架每次只做一个垂直切片。

范围：

| 模块 | 重点 |
| --- | --- |
| Tool lifecycle | shell/MCP/web/patch/browser/artifact domain projection |
| Approval / sandbox | action required 与 Desktop 权限分离 |
| Context / token | bounded fragment、sidecar/evidence 分流 |
| Multimodal lowering | provider-specific media/tool/cache lowering |
| Plugin / skills | manifest、runtime binding、UI runtime 三层边界 |
| Realtime / media / collaboration | media item、realtime event、collaboration projection 仍落回 ThreadItem / ContentPart |
| Replay / evidence | evidence/export 和 replay 消费 current read model |

P2 验收：

- 各 domain 有单测或 Rust 定向测试。
- GUI 可见变更有稳定回归。
- 新文案五语言覆盖。
- legacy / mock 回流守卫通过。

## 5. P3：长期，每周跟进 Codex upstream 和 opencode allowlist

目标：

```text
Codex 每天更新，但 Lime 每周只吸收高价值变化；opencode 只跟进多模型 / 多模态 allowlist，不被上游节奏打散
```

固定动作：

1. 更新本地 Codex 仓库。
2. 更新本地 opencode 仓库，但只计算 allowlist 路径。
3. 比较上次记录 commit。
4. Codex 只看高价值路径，opencode 只看多模型 / 多模态 allowlist。
5. 归类为 `adopt-now / adapt-for-desktop / watch / reject-for-lime`。
6. `adopt-now` 和高价值 `adapt-for-desktop` 进入 Lime backlog。
7. 结论写入 repo。

## 6. 快速对齐优先级

| 排序 | 事项 | 原因 |
| --- | --- | --- |
| 1 | Codex 核心体系图谱 | 防止只学原语或 App Server，遗漏 protocol、event、runtime、fixture 等关键层 |
| 2 | Thread / Turn / Item 原语 | Codex Agent 的第一骨架，决定 runtime、history、projection、Evidence 的语义归属 |
| 3 | 协议 registry / serialization scope | 防止新增能力继续多点同步，也防止请求并发靠 UI 兜底 |
| 4 | Event materialization / Turn lifecycle | 直接影响 Agent 是否可用，以及事件能否正确落成 item/history/UI |
| 5 | Persistence / Replay / Trace | 防止 import、Evidence、Replay、Telemetry 分叉 |
| 6 | UI projection | 直接影响 GUI 可靠性和渲染正确性 |
| 7 | Provider/Model capability | Lime 多模型、多模态产品的基础 |
| 8 | Workspace 拆分 | 防止最大前端文件继续膨胀 |
| 9 | Context/token | 降低 token 成本和缓存破坏 |
| 10 | Tool/approval | 提升复杂任务可靠性 |
| 11 | Plugin/skills | 支撑长期能力生态 |
| 12 | Realtime/media | 支撑多模态深层体验，依赖前面几层稳定 |

## 7. 退出条件

快速对齐阶段完成的判断：

1. 新增协议能力有固定 registry 和 contract 路径。
2. method metadata 能表达 serialization scope。
3. Thread / Turn / Item 有 Lime current 映射，后续 Agent 改动能说明三层归属。
4. event materialization 链路明确，turn streaming 不靠 UI timeout 或自然语言文案收尾。
5. 前端 timeline projection 有统一输入模型。
6. Persistence / Evidence / Replay / Telemetry 能回到 session/thread/turn。
7. Provider/Model capability 能驱动多模态输入、输出和工具可用性。
8. Workspace 新逻辑不再进入巨型组件。
9. 每周 Codex upstream diff 和 opencode 多模型/多模态 allowlist diff 能稳定产出 repo 内记录。
