# Coding Runtime 能力映射

> 状态：draft
> 更新时间：2026-06-12

## 分类规则

| 分类 | 含义 |
| --- | --- |
| `copy` | 可按等价结构迁入或重写，必须改成 Lime 命名与 owner。 |
| `rewrite` | 思路可复用，但需要按 Lime 架构重写。 |
| `reference` | 只参考产品或协议设计，不复制实现。 |
| `forbidden` | 不得迁入，不得作为 current 主链。 |

`copy` 不表示保留外部命名。任何迁入都必须进入 Lime current crates / packages，并补许可证和边界审查。

## 核心运行时能力

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| Thread / Turn / Item 生命周期 | RuntimeCore session/thread/turn/item | copy | 可复用状态机结构，统一映射 `RuntimeEvent`。 |
| Input queue / active turn | RuntimeCore queue / turn state | copy | 用于 queue-if-busy、steer、cancel、resume。 |
| Turn context builder | `lime-rs/crates/agent` prompt/context services | rewrite | 必须融合 Lime memory、skills、workspace、Provider slots。 |
| Tool lifecycle pairing | RuntimeEvent sequence gate | copy | `tool.started -> result/failed` 必须机械校验。 |
| Headless event projection | AgentUI event adapter / fixture replay | copy | 输出到 Lime event family，不保留外部 JSON shape。 |
| Context compaction | RuntimeCore history / memory compaction | rewrite | 对齐 Lime memory / evidence / read model。 |
| Review mode | coding review profile / task kind | rewrite | 作为模型槽位和 task mode，不新增 runtime。 |

## 文件、补丁、命令

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| File read/write abstraction | ExecutionBackend file tool + artifact owner | copy | 所有写入产生 `file.changed` 和 checkpoint。 |
| Patch apply engine | Patch service / file artifact / diff owner | copy | 失败必须结构化，不只写日志。 |
| Diff summary | AgentUI projection `PatchView / FileChangeView` | rewrite | UI 从 patch/file facts 派生。 |
| Shell command execution | Project Shell / ExecutionBackend command tool | copy | 必须接 policy、approval、output spill。 |
| PTY resize/write/terminate | Project Shell APIs | reference | 仅用于用户显式 shell 或工具执行面。 |
| Test output parsing | ExecutionBackend test tool | rewrite | 不从自由文本猜测，需要 status/exit/output refs。 |
| Large output truncation | output ref / evidence ref | copy | 大输出进 ref，不重复刷 event。 |

## 权限与安全

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| Permission profile | App Server policy + Desktop Host snapshot | copy | 显式表达 read/write/network/shell。 |
| Command approval policy | Policy service + `action.required` | copy | 用户选择必须回写 action owner。 |
| Sandbox blocked event | `sandbox.blocked` RuntimeEvent | copy | UI 显示 blocked，不当作 assistant 文本。 |
| Dangerous command rules | policy catalog / command classifier | rewrite | 使用 Lime policy owner，不让模型自行判定。 |
| Network policy | Provider / tool policy | rewrite | 联网能力由 runtime tool policy 决定。 |
| Secret redaction | evidence / projection sanitation | copy | raw payload 不得进入 UI projection。 |

## Provider 与多模型

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| Model list / model metadata | Model Registry | reference | 不复制单供应商 catalog。 |
| Custom endpoint models | API Key Provider / Provider Store | rewrite | 支持 alias、stable model id、capability tags。 |
| Model slot selection | CodingProfile model slots | rewrite | base/coding/review/fast/local 分离。 |
| Streaming request adapter | Provider adapters | copy | 只迁入协议无关的 SSE/stream 健壮性。 |
| Usage / rate limit facts | RuntimeEvent diagnostics / Provider telemetry | rewrite | 不进入正文，不影响 UI 状态机。 |

## Skills / MCP / 外部 Harness

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| Skill directory discovery | Skill Catalog importer | rewrite | 可识别多生态目录，但事实源是 Lime catalog。 |
| Skill front matter parser | Skill standard parser | copy | 只迁通用 markdown/front matter 解析思路。 |
| MCP client transport | `lime-rs/crates/mcp` / tool inventory | reference | 以 Lime MCP owner 为准。 |
| External CLI session event | `external_harness` adapter -> RuntimeEvent | reference | 只能作为 compat adapter，不主导 runtime。 |
| CLI plugin installer | forbidden | forbidden | 不把第三方 CLI 插件作为 Lime 生产依赖。 |

## UI / 产品形态

| 参考能力 | Lime current 落点 | 分类 | 说明 |
| --- | --- | --- | --- |
| 中央预览 + 右侧对话 | Coding Workbench | reference | 只借结构，不复制视觉和框架。 |
| CLI agent session side panel | external harness diagnostics | reference | 可显示外部 harness 状态，不作为主链。 |
| Terminal-first UI | forbidden | forbidden | Lime 是 GUI 桌面产品，不退化成终端壳。 |
| Native UI framework | forbidden | forbidden | Lime 继续 Electron + React + AgentUI packages。 |

## 迁移优先级

### P0：先 copy / rewrite runtime spine

- Thread / Turn / Item 生命周期。
- Tool lifecycle pairing。
- Patch apply / file change facts。
- Command execution policy。
- Permission / sandbox facts。

### P1：再补 coding profile 投影

- FileChangeView。
- PatchView。
- CommandOutputView。
- TestRunView。
- ApprovalView。
- CodingDiagnosticsView。

### P2：最后接外部 harness

- 外部 CLI agent 只作为 `external_harness`。
- 事件必须转成 Lime RuntimeEvent。
- 不允许外部 harness 直接写 artifact/evidence truth。

## 禁止清单

- 引入外部 app-server 为 Lime current runtime。
- 引入外部 home/config/data root。
- 让外部 CLI 决定 Provider / model routing。
- 在文档、命名、crate、command、UI 文案中保留外部品牌。
- 复制 AGPL 来源代码。
- 复制任何 secret-bearing logging / raw payload 投影方式。
