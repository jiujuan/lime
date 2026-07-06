# Upstream Checkpoint

> 状态：P3 fifth range check done / current anchors advanced / interleaved rollback-aware
> 更新时间：2026-07-07
> 目标：把 Codex / opencode 本地上游跟进从“临时看一眼”变成可复用 checkpoint；后续 diff 只从这里记录的 HEAD 继续。

## 1. 固定边界

Codex 是 Agent 工程主原点；opencode 只参考多模型、多模态能力表达。

本文件只记录经过 allowlist 过滤的上游信号：

- Codex：Thread / Turn / Item、protocol、runtime、tool、context、state、plugin、fixture、model policy。
- opencode：Provider / Model / Capability / ContentPart / media part / provider lowering。

不进入 Lime backlog：

- opencode Session / Tool / UI / protocol generated client / Effect runtime。
- Codex TUI 视觉形态、OpenAI-only 产品入口、rollout JSONL 作为 Lime runtime store。
- 任何需要恢复 `lime-rs/src/**`、旧 `agent_runtime_*` production surface 或生产 mock fallback 的路径。

## 2. 初始 checkpoint

P1-8 第三刀只读本地仓库，没有拉取远端。

| Source | Branch | HEAD | Worktree |
| --- | --- | --- | --- |
| Codex | `main` | `db887d03e1f907467e33271572dffb73bceecd6b` | clean |
| opencode | `dev` | `17166b271fb9d7bf7128f0e63732dde0c10dd963` | clean |

P1-8 第八刀前，上游跟进从这两个 HEAD 起算：

```text
Codex next range: db887d03e1f907467e33271572dffb73bceecd6b..<next>
opencode next allowlist range: 17166b271fb9d7bf7128f0e63732dde0c10dd963..<next>
```

## 2A. 2026-07-06 真实 diff 记录

P1-8 第八刀已从上述 checkpoint 到 fetched origin 产出真实 diff：[upstream-diff-2026-07-06.md](./upstream-diff-2026-07-06.md)。

| Source | Diff range | 非 merge commit | 处理结论 |
| --- | --- | ---: | --- |
| Codex | `db887d03e1f907467e33271572dffb73bceecd6b..be33f80bc65159c094ecd06bf155afa3061ce23d` | 15 | 记录 response metadata、plugin version、multi-agent lifecycle、tool timing、model availability 等 high-value 信号 |
| opencode | `17166b271fb9d7bf7128f0e63732dde0c10dd963..be73f465df6b20e0c3091f49ab83e89c0ede3b35` | 328 | 只采纳多模型 / 多模态 allowlist；Session / Tool runtime / UI / Effect 层显式拒绝 |

下一次 upstream diff 建议从 fetched target 起算：

```text
Codex next range: be33f80bc65159c094ecd06bf155afa3061ce23d..<next-origin-main>
opencode next allowlist range: be73f465df6b20e0c3091f49ab83e89c0ede3b35..<next-origin-dev>
```

该基线推进只代表上游扫描已完成，不代表 diff 表中的动作已经实现到 Lime。

## 2B. 2026-07-06 P3 repeat check

P3 第二次 range check 见 [upstream-diff-2026-07-06-p3-loop.md](./upstream-diff-2026-07-06-p3-loop.md)。

| Source | Diff range | 非 merge commit | 处理结论 |
| --- | --- | ---: | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d..be33f80bc65159c094ecd06bf155afa3061ce23d` | 0 | 无新信号 |
| opencode | `be73f465df6b20e0c3091f49ab83e89c0ede3b35..e0ec9be238a1495454e46426665323af25273b63` | 5 | 无 allowlist 采纳项；provider transform 变化只记录为 `watch / no backlog` |

下一次 upstream diff 建议从本轮 fetched target 起算：

```text
Codex next range: be33f80bc65159c094ecd06bf155afa3061ce23d..<next-origin-main>
opencode next allowlist range: e0ec9be238a1495454e46426665323af25273b63..<next-origin-dev>
```

## 2C. 2026-07-06 P3 third no-action check

第三次 range check 继续记录在 [upstream-diff-2026-07-06-p3-loop.md](./upstream-diff-2026-07-06-p3-loop.md)。

| Source | Diff range | 非 merge commit | 处理结论 |
| --- | --- | ---: | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d..be33f80bc65159c094ecd06bf155afa3061ce23d` | 0 | 无新信号 |
| opencode | `e0ec9be238a1495454e46426665323af25273b63..e0ec9be238a1495454e46426665323af25273b63` | 0 | 目标分支无新增；非目标分支更新不进入 allowlist |

下一次 upstream diff 继续从当前 fetched target 起算：

```text
Codex next range: be33f80bc65159c094ecd06bf155afa3061ce23d..<next-origin-main>
opencode next allowlist range: e0ec9be238a1495454e46426665323af25273b63..<next-origin-dev>
```

## 2D. 2026-07-07 P3 fourth range check

第四次 range check 见 [upstream-diff-2026-07-07.md](./upstream-diff-2026-07-07.md)。注意：其中 `interleaved response items` 的 `adopt-now` 口径已被第五次 range check 的 Codex revert 覆盖，后续只作为历史信号保留。

| Source | Diff range | 非 merge commit | 处理结论 |
| --- | --- | ---: | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d..8917244f7dcc1a945f3d5eba3dea53f6dbb16349` | 3 | 新增 interleaved response items、delegate MCP startup private event、plugin guidance readiness 三个 high-value 信号 |
| opencode | `e0ec9be238a1495454e46426665323af25273b63..eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` | 13 | 无多模型 / 多模态 allowlist 采纳项 |

下一次 upstream diff 从本轮 fetched target 起算：

```text
Codex next range: 8917244f7dcc1a945f3d5eba3dea53f6dbb16349..<next-origin-main>
opencode next allowlist range: eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..<next-origin-dev>
```

## 2E. 2026-07-07 P3 fifth range check

第五次 range check 见 [upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md)。

| Source | Diff range | 非 merge commit | 处理结论 |
| --- | --- | ---: | --- |
| Codex | `8917244f7dcc1a945f3d5eba3dea53f6dbb16349..8268cbfb0e5f39cb4efff928264fe8f29ddacafb` | 5 | 新增 per-thread config warning、exec-policy owner 收敛、safety buffering `retry_model` 三个 `adopt-now` 信号；`interleaved response items` 被回滚，改为 `rollback-signal / watch`；conditional dotenv 记为 `adapt-for-desktop / watch` |
| opencode | `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` | 0 | 无新增；无 allowlist 采纳项 |

下一次 upstream diff 从本轮 fetched target 起算：

```text
Codex next range: 8268cbfb0e5f39cb4efff928264fe8f29ddacafb..<next-origin-main>
opencode next allowlist range: eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..<next-origin-dev>
```

## 3. Codex 高价值信号

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `8268cbfb0e` Conditional codex_home dotenv | Codex 启动期在 runtime / worker / session / network client 创建前加载 TCP-gated `.env.*` overlay，并保护 `CODEX_*` 内部变量 | Desktop Host sidecar startup env owner；provider/network config owner | `adapt-for-desktop / watch` | Lime 不直接照搬 CLI `arg0` / `CODEX_HOME` 形态；若后续需要 provider proxy / env overlay，应在 Desktop Host 启动 App Server sidecar 前完成，禁止运行时多线程 mutate env | Desktop Host startup env tests、provider connectivity fixture |
| `8f5bb6171e` Remove TUI exec-policy core exports | Codex 移除 TUI 直接 core exec-policy 检查，统一依赖 App Server `configWarning`，避免远程 app-server 检查错机器 | App Server configWarning owner；GUI / Desktop Host bridge consumer | `adopt-now / reinforce` | Lime GUI / Desktop Host 不得直接解析 rules 或调用 core exec-policy 检查；warning 应从 App Server current event 进入 GUI | App Server warning tests、bridge event tests |
| `dbf67f34a0` Emit exec-policy warnings for freshly loaded thread config | Codex `thread/start` 会对 per-thread config reload 后的 exec-policy rules parse warning 发送 connection-scoped `configWarning`，且不重复 initialize 阶段已发送的同一 warning | App Server `thread/start` config warning owner；Desktop/GUI config warning consumer | `adopt-now` | Lime thread/start 需要在 cwd / project-local rules reload 后重新校验 warning，并只通知当前请求连接；不能只依赖 app-server initialize warning | App Server thread/start notification tests、GUI warning smoke |
| `7094fa467e` Read retry model from buffering events | Responses safety buffering payload 使用 wire 字段 `retry_model`；payload 值优先，显式 null 表示 unset，字段缺失才 fallback 旧 header | Provider stream safety buffering parser；RuntimeEvent projection；GUI safety buffering presentation | `adopt-now` | Lime safety buffering parser 不应继续读取 wire `faster_model`；内部兼容命名可保留，但 wire contract 必须区分 null 与 omitted | provider stream tests、runtime projection tests、GUI safety buffering tests |
| `7b4e70d567` Revert interleaved response items | Codex 回滚第四次记录的 streamed item map / reasoning summary 按 `item_id` interleave 支持 | P2 Realtime / Media handoff；Thread / Turn / Item invariant | `rollback-signal / watch` | 第四次 `interleaved response items` 不再作为 Codex current 依据；Lime 仍按自身 invariant 保持有 `itemId` 时稳定归属 | v1 文档 guard、后续 Item projection invariant tests |
| `80f54d1266` Treat max as a first-class reasoning effort | `ReasoningEffort::Max` 成为一等枚举；`Ultra` request 映射到 `Max`，不再写成 custom `"max"` | `src/lib/model/modelReasoningPolicy.ts`、Rust request consumer | `adopt-now` / 已前端覆盖 | 前端已把 `max` 放进 known effort 并保留开放字符串；第三十八刀 Rust consumer 需确认 `model_request_policy.reasoning_policy` 不把 `max` 降级成 opaque custom | `modelReasoningPolicy.test.ts`、`codexModelReasoningPolicyOrigin.test.ts`、第三十八刀 Rust turn context fixture |
| `6b5f5743b3` Use model metadata for skills usage instructions | skills usage instructions 开始消费 model metadata，影响 skill/tool 注入语义 | P2 Plugin / Skills / MCP，后续 skill prompt owner | `adapt-for-desktop` | 不照搬 Codex skill UI；在 Lime skill / app manifest 主链里评估“模型能力影响 skill instruction 注入”的 owner | skill registry tests、runtime prompt fixture |
| `328e95110c` Preserve namespaces on custom tool calls | custom tool call namespace 被保留，影响 tool payload identity 和 router | P2 Tool / Approval / Sandbox；第三十八刀 native tool consumer | `adopt-now` / 等热区 | agent/tool 热区释放后，检查 Lime tool call payload 是否保留 namespace，避免 provider lowering 后丢失 tool identity | tool payload Rust tests、`npm run test:contracts` |
| `a107b84967` define missing rollout turn items | Codex 补齐 rollout turn items，并同步 thread history materialization | P1-3 Event materialization / read model / UI projection | `adopt-now` | 后续对比 Codex `v2/item.rs` 与 Lime Item family，找出 Lime 仍缺的 typed Item，而不是用 UI 文案补洞 | App Server projection tests、UI projection Vitest、agent runtime smoke |
| `f72976a5f1` add optional `turn_id` to `thread/fork` | fork 可以绑定具体 turn，强化 Thread / Turn 的可追溯关系 | Thread / Turn / Item invariant、future fork workflow | `adapt-for-desktop` | Lime 若实现 fork / branch，不应只 fork thread id；必须保留 turn anchor 和 item projection 证据 | protocol serialization tests、thread read / fork fixture |
| `5267e805fb` add `history_mode` to thread | Thread metadata 增加 history mode，并贯穿 state / thread-store / TUI facade | Persistence / Replay / Trace，future resume / fork policy | `watch` | 当前不急于新增 Lime 字段；等 Lime thread history / resume 策略进入 P2 时再判断是否需要桌面化 history mode | thread read / resume / evidence export tests |

## 4. opencode allowlist 信号

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `d5980b47e` add video and audio media support to Gemini protocol | Gemini lowering 从 image-only 扩展到 `MEDIA_MIMES`，包含 image / video / audio，并提高 media size limit | `modelInputModalityPolicy.ts`、media ContentPart / provider lowering | `adapt-for-desktop` | Lime 已把 `audio/video/pdf` 纳入 input modality 词表；后续不能只在 UI 放开，必须等 provider lowering、size limit、runtime request part 一起落地 | `modelInputModalityPolicy.test.ts`、send gate tests、provider lowering fixture |
| `4898263de` map providers to integrations | provider catalog availability 绑定 integration 映射 | model provider registry / provider availability | `watch` | 只参考多模型 catalog availability；不引入 opencode session runner | provider registry tests、model provider settings tests |
| `17f312d53` simplify model requests | 涉及 `packages/schema/src/model-request.ts`、`model.ts` 与 core model request 简化 | Model request schema | `watch` | 只看 schema / model request 的能力字段变化；`session/runner` 相关变化按 opencode 非 allowlist 拒绝 | model registry / request metadata tests |
| `5f61d2148` pass strict through tool definitions for Codex parity | 主要是 tool definition strict 透传，虽命中 provider lowering 文件，但语义是 tool schema | 不从 opencode 采纳；若需要从 Codex tool owner 进入 | `reject-for-lime` for opencode | opencode 只参考多模型 / 多模态，本变化不进入 Lime opencode backlog；若 Codex tool strict 需要对齐，单独挂 P2 Tool | Codex tool tests，而不是 opencode 参考 |

## 5. 当前结论

1. P3 已从一次性 upstream diff 推进到第五次 range check；当前可继续起算的 anchor 是 Codex `8268cbfb0e5f39cb4efff928264fe8f29ddacafb` 与 opencode `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c`。
2. Codex 第五次 range check 新增 per-thread exec-policy config warning、TUI/core exec-policy warning owner 收敛与 safety buffering `retry_model` 三个 `adopt-now` 信号；它们分别回挂 App Server configWarning owner 与 provider stream safety buffering parser。
3. Codex 第四次 `interleaved response items` 已被第五次 revert 覆盖；Lime 仍按本地 Thread / Turn / Item invariant 保持 `itemId` 稳定归属，但不能再把该上游 commit 当作 current 采纳依据。
4. Conditional `CODEX_HOME` dotenv 只作为 desktop-adapt/watch：Lime 若需要 provider proxy / env overlay，应落到 Desktop Host sidecar startup owner，不直接照搬 Codex CLI `arg0`。
5. opencode 第五次 range check 没有新增 commit；opencode Session / Tool / UI / Effect runtime 继续 `reject-for-lime`。
6. 下一刀若热区释放，应优先做 `message.delta.contentParts -> Item/read model -> Workbench`，但验证口径改为 Lime 自身 `itemId` / contentParts 稳定归属；否则继续只读 P3 loop 或文档化 handoff，不夹写 App Server / projection / GUI 热区。
7. 上游 diff 尚未机械化脚本；若后续脚本化，必须先遵守 `scripts/` 冻结边界。

## 6. 下一次 diff 模板

```markdown
## YYYY-MM-DD Upstream diff

Codex range: `<previous-codex-head>..<new-codex-head>`
opencode allowlist range: `<previous-opencode-head>..<new-opencode-head>`

| Source | Commit | Path | Fact | Lime owner | Classification | Action | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | ... | ... | ... | ... | adopt-now | ... | ... |
| opencode | ... | ... | ... | ... | adapt-for-desktop | ... | ... |
```
