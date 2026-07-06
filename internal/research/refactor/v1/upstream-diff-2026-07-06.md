# Upstream Diff 2026-07-06

> 状态：P1-8 第八刀 done
> 更新时间：2026-07-06
> 目标：从已记录 checkpoint 真实跑一次 Codex upstream diff 与 opencode allowlist diff，证明 P3 不是只有静态 checkpoint。

## 1. 结论

本刀只读外部仓库，不修改 Codex / opencode worktree，也不接管 Lime 源码热区。

结果：

1. Codex `origin/main` 相对 checkpoint 前进 `15` 个非 merge commit，其中 `9` 个命中 v1 high-value 路径。
2. opencode `origin/dev` 相对 checkpoint 前进 `328` 个非 merge commit；allowlist 后只采纳 `Provider / Model / Capability / ContentPart / media / provider lowering / LLM event reducer` 相关信号。
3. P3 从 `one checkpoint done` 推进为 `one real diff recorded`；但每周循环、下一次 range diff 和自动化脚本仍未证明。
4. P1-7 第三十八刀仍是最高优先级：Rust runtime/request consumer 还没有消费 `request_metadata.harness.model_request_policy`。

本刀不把 opencode 的 Session、Tool runtime、UI、Effect/Bun 层迁入 Lime。opencode 只作为多模型 / 多模态能力代数参照。

## 2. Range Evidence

| Source | Previous checkpoint | Local HEAD after fetch | Fetched target | Worktree | 本刀处理 |
| --- | --- | --- | --- | --- | --- |
| Codex | `db887d03e1f907467e33271572dffb73bceecd6b` | `db887d03e1f907467e33271572dffb73bceecd6b` | `origin/main@be33f80bc65159c094ecd06bf155afa3061ce23d` | clean | 记录 diff 并推进 next diff anchor |
| opencode | `17166b271fb9d7bf7128f0e63732dde0c10dd963` | `17166b271fb9d7bf7128f0e63732dde0c10dd963` | `origin/dev@be73f465df6b20e0c3091f49ab83e89c0ede3b35` | clean | 只按多模型 / 多模态 allowlist 过滤 |

下一次 upstream diff 建议从本刀 fetched target 起算：

```text
Codex next range: be33f80bc65159c094ecd06bf155afa3061ce23d..<next-origin-main>
opencode next allowlist range: be73f465df6b20e0c3091f49ab83e89c0ede3b35..<next-origin-dev>
```

这只是上游扫描基线推进，不代表表中 `adopt-now` / `adapt-for-desktop` 项已经实现到 Lime。

## 3. Codex High-Value Diff

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `be33f80bc6` | response event safety buffering 开始读取 metadata；涉及 SSE / WebSocket response event materialization | P1-3 Event materialization、P1-6 Trace / Evidence | `adapt-for-desktop` | Lime runtime event 不应丢弃 provider response metadata；后续 read model / GUI projection 应保留 typed metadata，不靠 UI 文案猜测 | Runtime projection Rust tests、UI projection Vitest、`smoke:agent-runtime-current-fixture` |
| `d206a5d68f` | `PluginSummary` 增加 remote plugin `version`，协议、schema、TS、App Server plugin processor 同步 | P2 Plugin / Skills / MCP | `adapt-for-desktop` | Lime plugin / app manifest 后续必须区分 installed identity、remote version、share metadata；不把版本只放 UI 展示层 | plugin registry tests、MCP / skills contract |
| `da4c8ca57d` | `MultiAgentMode` 增加 configurable hint text，贯穿 config、protocol schema、session multi-agent context | P2 Subagent / Team runtime、session policy | `watch` | 仅在 Lime 团队运行时进入 P2 时采纳；不得混入 P1-7 model capability 或通用 prompt 文案 | session runtime policy fixture |
| `beca198b8a` | structured direct tool-call timing telemetry 进入 `core/src/tools/parallel.rs` 与 App Server logging tests | P2 Tool / Approval / Sandbox、P1-6 Trace | `adapt-for-desktop` | Lime tool trace 应记录 tool call lifecycle timing，落到 Evidence / Trace，而不是只写 UI status | tool trace Rust tests、evidence export tests |
| `b35d4b6b9d` | WebSocket incremental requests 忽略 metadata，避免 streaming 增量请求重复携带初始 metadata | App Server runtime request lifecycle | `adapt-for-desktop` | Lime `model_request_policy` 应在 submit / turn context 进入，stream incremental path 不应重复或覆盖 metadata | runtime request lifecycle tests |
| `cbdd7f0047` | Bedrock model catalog 修正 inherited availability metadata | P1-7 Provider / Model registry | `adapt-for-desktop` | 多 provider catalog 需要把 inherited availability/status 收敛到 registry owner；不要让 UI 自行拼状态 | model registry tests、provider availability tests |
| `6ff670bd03` | per-request TTFT completion telemetry 进入 client 与 OTEL event | P1-6 Trace / Evidence | `watch` | Lime 若补 request telemetry，应按 session/thread/turn 关联，而不是新增 unlinked 旁路指标 | evidence export telemetry tests |
| `129ea2aaf5` | multi-agent communication lifecycle 写入 core agent control、communication、session handler 与 subagent notification tests | P2 Subagent / Team runtime | `adapt-for-desktop` | 子 Agent 消息生命周期应成为 typed event / Item projection，不应只靠 log 或 UI toast | subagent runtime tests、UI projection tests |
| `a98a21798c` | Consolidate multi-agent v2 communication sends，集中 agent control send path | P2 Subagent / Team runtime | `adapt-for-desktop` | Lime 团队 runtime 后续应有单一 communication owner，避免每个 tool / child agent 自己发事件 | communication owner tests |
| `042e61726d` | Rendezvous WebSocket liveness 加 watchdog / relay tests | P2 Realtime / Remote runtime | `watch` | Lime 远程 runtime 若接 WebSocket / relay，需要 typed liveness state；当前不阻塞 P1 | remote runtime smoke |
| `1f17e7512f` | path-backed feedback attachments MIME type 修正 | P2 Media / Multimodal | `watch` | 只作为附件 MIME resolution 参考；不改变 Lime 当前多模态主链 | media attachment tests |

### 3.1 Codex Low-Value / No-Action

| Commit | 分类 | 原因 |
| --- | --- | --- |
| `98d28aab54` | `reject-for-lime` | 移除 git-cliff 配置，非 Agent 架构信号 |
| `319d03056e` | `reject-for-lime` | install metadata 复用，属于 Codex 安装路径 |
| `0ccb676dd0` | `watch` | quick-xml security advisory 只作为依赖安全信号，不进入 v1 架构队列 |
| `d059658ad1` | `reject-for-lime` | 文档 fenced code tag，不影响 Lime 对齐 |

## 4. opencode Allowlist Diff

opencode 本 range 变化很大，但 Lime 只采纳多模型 / 多模态能力表达。下面只记录 allowlist 命中项。

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `373cd08b9` | GitHub Copilot provider honor advertised model endpoints，模型可声明走 `chat` 或 `responses` endpoint | P1-7 Provider / Model route metadata | `adapt-for-desktop` | Lime route defaults / model request policy 应允许 provider advertised endpoint 参与 route lowering；不得只按 provider 名硬编码 | model route tests、registry projection tests |
| `18466b802` | LLM protocol 增加 tool schema projection，按 provider / model 投影 schema 兼容形态 | P1-7 model compatibility metadata，P2 Tool schema | `watch` | 只参考“模型兼容性 metadata”部分；不引入 opencode Tool runtime 架构 | tool schema compatibility fixture |
| `f7eeb0894` | route transport 收窄 raw overlays，配合 request prepare precedence | Provider route / raw options boundary | `watch` | Lime request overrides 应有白名单，不让 raw provider overlay 绕过 route defaults | request prepare tests |
| `08c5a2a5e` | request precedence 固定为 route defaults -> model defaults -> request | P1-7 RouteDefaults / Model defaults | `adopt-now` | 复核 Lime `RouteDefaults` 与 `model_request_policy` 的优先级，避免 request 侧覆盖执行安全 gate | route defaults tests、request metadata tests |
| `1fd8bf526` | 增加 `ModelDefaults` / `ModelCompatibility` 数据 | P1-7 Provider / Model capability | `adapt-for-desktop` | Lime registry 可参考 defaults / compatibility 分层；不得把 picker DTO 混入 execution route | model registry tests、capability boundary tests |
| `48fc9e3cc` | 增加 LLM response reducer 与 reducer law tests | P1-3 Event materialization、P1-5 UI projection | `adapt-for-desktop` | provider-neutral LLM event reducer 可作为 Lime Item materialization 参考；不引入 opencode Session runner | event reducer tests、projection tests |
| `11d2f3e5f` | Gemini / OpenAI Chat reasoning 在 response 前显式结束 | P1-3 reasoning event materialization | `adapt-for-desktop` | Lime reasoning stream terminal 应为 typed event，不靠 final answer 到达推断 | reasoning projection tests |
| `f25447604` | OpenAI Responses stateless response item IDs 不再回放 stale id | P1-3 Item materialization、P1-6 Replay | `adapt-for-desktop` | Lime replay / provider lowering 需要区分 stateless provider item id 与 Lime Item id | replay fixture、Item projection tests |
| `55552c521` | OpenAI reasoning variants 被 provider transform 强制归一 | P1-7 reasoning policy | `watch` | 只作为 provider reasoning capability transform 参考；Lime current owner 仍是 `modelReasoningPolicy` 与 Rust consumer | reasoning policy tests |
| `3a669d528` | Sonnet 5 adaptive thinking 被 provider transform 打开 | P1-7 reasoning output / effort policy | `watch` | 作为 provider-specific reasoning capability 参考，不改变 Codex-first policy owner | reasoning output tests |
| `f1407e41c` | GitHub Copilot Responses input conversion 停止回放 stale item IDs | P1-3 Item materialization、Provider lowering | `adapt-for-desktop` | 与 `f25447604` 一起要求 Lime provider lowering 不把 provider transient id 当 Thread Item identity | provider lowering fixture |
| `ded29f03f` | small model defaults 被 refined | P1-7 Model defaults | `watch` | 只参考 defaults 数据分层，不照搬 opencode catalog | model defaults fixture |
| `d71454c70` | models.dev modes 暴露为 models | Provider / Model catalog | `watch` | Lime 若支持 provider mode as model variant，需要先落 registry owner，不走 UI 临时分组 | model catalog tests |
| `9903abc70` | provider config 允许 empty default | provider availability / auth config | `watch` | Lime provider availability 可参考 empty/default config 语义；不影响 current P1 | provider settings tests |
| `850a0dfe7` | prompt attachment MIME types 解析进入 prompt input schema / SDK generated types | P2 Media / Multimodal ContentPart | `adapt-for-desktop` | Lime 多模态 ContentPart 需要统一 MIME resolution，不能只靠文件扩展名或 UI 附件类型 | media ContentPart tests |
| `6ca60d920` | Cerebras SDK reasoning replay 更新 | Provider reasoning replay | `watch` | 只作为 provider-specific reasoning replay 参考；不引入 opencode session replay | provider reasoning fixture |

Supporting tests / generated commits such as `e5101d965` and `b0151e1d0` only证明 response reducer law；`chore: generate` 和 release sync 不单独进入 Lime backlog。

### 4.1 opencode Explicit Rejections

| 变化类别 | 分类 | 原因 |
| --- | --- | --- |
| Session V2 / durable session history / session UI / tab behavior | `reject-for-lime` | Lime 的 Thread / Turn / Item、read model、GUI projection 以 Codex 原语和 Lime current 主链为准 |
| Tool runtime / code mode / OpenAPI tool adapter / generic agent tool | `reject-for-lime` | opencode Tool 不参与 Lime 工具架构；工具生命周期先看 Codex Tool / Approval / Sandbox |
| Effect runtime / layer node / Bun harness refactor | `reject-for-lime` | Lime 是 Electron + App Server JSON-RPC + Rust workspace，不迁移 opencode 技术栈 |
| opencode UI / TUI / desktop papercut | `reject-for-lime` | Lime UI 按桌面产品和现有设计语言推进，不参考 opencode UI 形态 |

## 5. Lime Action Queue

| 优先级 | 动作 | 原因 | 退出条件 |
| --- | --- | --- | --- |
| 1 | 等热区释放后继续 P1-7 第三十八刀 Rust consumer | `model_request_policy` 已到 submit metadata，但执行侧未消费 | `lime-agent` typed owner + request/tool consumer tests + `smoke:agent-runtime-current-fixture` |
| 2 | 把 opencode request precedence 对照到 Lime `RouteDefaults` / `model_request_policy` | 这是多模型 request lowering 的核心顺序 | 前端 / Rust request prepare tests 证明 route defaults、model defaults、request overrides 优先级 |
| 3 | P2 Tool / Trace 时吸收 Codex direct tool-call timing 与 multi-agent lifecycle | Codex 把 tool / subagent lifecycle 结构化为可追踪事件 | Evidence / Trace tests 能按 session/thread/turn/tool 关联 |
| 4 | P2 Plugin / Skills / MCP 时吸收 plugin `version` 字段 | Codex 已把 remote plugin version 提升为协议字段 | plugin registry schema / client / GUI projection 同步 |
| 5 | P2 Media / Multimodal 时吸收 MIME resolution 与 media lowering | opencode 的 MIME / media signal 与 Lime 多模态目标直接相关 | ContentPart / provider lowering tests 覆盖 image/audio/video/pdf |

## 6. 不变约束

1. `current`：Lime Agent 主链仍是 React GUI -> App Server JSON-RPC -> Thread / Turn / Item -> RuntimeCore / lime-agent -> read model / projection。
2. `compat`：无新增。
3. `deprecated`：无新增。
4. `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden / retired guard-only。
5. opencode 非 allowlist 变化不进入 Lime backlog，最多作为拒绝记录。

## 7. 验证

本刀只改 `internal/research/refactor/v1` 文档，未运行源码测试。

已执行的只读 / 文档验证入口：

```bash
git status --short --ignored -- "internal/research/refactor"
git diff --name-only -- "internal/research/refactor"
git -C "/Users/coso/Documents/dev/rust/codex" status --short
git -C "/Users/coso/Documents/dev/js/opencode" status --short
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "db887d03e1f907467e33271572dffb73bceecd6b..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "17166b271fb9d7bf7128f0e63732dde0c10dd963..origin/dev"
```

收尾还需执行 scoped whitespace / link presence 检查，并记录到最终汇报。
