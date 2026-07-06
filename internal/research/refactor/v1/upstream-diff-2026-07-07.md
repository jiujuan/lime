# Upstream Diff 2026-07-07

> 状态：P3 fourth range check done / Codex signals recorded / opencode no allowlist adoption
> 更新时间：2026-07-07
> 目标：从上一轮 P3 anchor 继续检查 Codex / opencode 最新远端，记录可进入 Lime v1 队列的上游信号，并继续证明上游跟进流程可以重复执行。

> 后续修正：第五次 range check 已确认 Codex commit `7b4e70d567` 回滚本文件记录的 `interleaved response items`；本文件保留第四次当时证据，当前口径以 [upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md) 为准。

## 1. 结论

本轮只读外部仓库并 fetch 远端引用，不修改 Codex / opencode worktree，不接管 Lime 源码热区。

结果：

1. Codex `origin/main` 从 `be33f80bc65159c094ecd06bf155afa3061ce23d` 前进到 `8917244f7dcc1a945f3d5eba3dea53f6dbb16349`，新增 `3` 个非 merge commit。
2. opencode `origin/dev` 从 `e0ec9be238a1495454e46426665323af25273b63` 前进到 `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c`，新增 `13` 个非 merge commit。
3. Codex 本轮有 `3` 个 high-value 信号：interleaved response items、delegate MCP startup private events、plugin guidance world-state readiness。
4. opencode 本轮没有命中多模型 / 多模态 allowlist 路径；provider dialog、desktop onboarding、review pane、codemode、TUI 等变化全部拒绝进入 Lime backlog。
5. P3 从 `third range checked` 推进为 `fourth range checked with Codex backlog signals`；仍未证明跨周 cadence 或脚本化入口。

## 2. Range Evidence

| Source | Previous anchor | Fetched target | Non-merge commits | Worktree | 处理结论 |
| --- | --- | --- | ---: | --- | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d` | `origin/main@8917244f7dcc1a945f3d5eba3dea53f6dbb16349` | 3 | clean | 记录 `interleaved response items`、delegate MCP startup 过滤、plugin guidance readiness |
| opencode | `e0ec9be238a1495454e46426665323af25273b63` | `origin/dev@eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` | 13 | clean | 无 allowlist 采纳项 |

下一次 upstream diff 建议从本轮 fetched target 起算：

```text
Codex next range: 8917244f7dcc1a945f3d5eba3dea53f6dbb16349..<next-origin-main>
opencode next allowlist range: eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..<next-origin-dev>
```

Codex fetch 过程中出现本地 `.git/gc.log` / loose object housekeeping warning，不影响本轮远端引用和 diff 结论；本轮不对外部仓库做 `git gc` 或清理。

## 3. Codex Range Review

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `8917244f7d` `[core] Support interleaved response items` | Responses stream 开始用 item id 跟踪 streamed items；reasoning summary delta / part added 携带 `item_id`，允许 reasoning summary 在后续 item 已开始后继续归属原 item；TUI replay 去重 interleaved reasoning / final answer | P2 Realtime / Media / Collaboration；App Server Item/read model；`packages/agent-runtime-projection`; GUI MessageList / Workbench | `adopt-now / blocked-by-hot-zone` | 下一次 Media Item projection 代码刀必须把 `message.delta.contentParts` 与 reasoning/text interleaving 一起纳入 Item/read model 归属，避免用 active item 猜测；RuntimeCore parser 只是 payload owner，consumer 仍 pending | App Server Item projection tests；agent-runtime-projection tests；GUI contentParts / reasoning interleave tests；GUI media smoke |
| `bce481fdcb` `Fix cancelled review leaving MCP startup busy` | delegate 子会话的 `McpStartupUpdate` / `McpStartupComplete` 不应转发给父会话 busy state；forward_events 过滤 private startup events，避免 cancel 后父会话仍判忙 | P2 Tool / Approval / Sandbox；Multi-Agent / subagent state；runtime event projection | `adapt-for-desktop` | Lime 子代理 / review / delegate 类执行需要隔离 child runtime startup/private state；父 thread 只能消费需要投影成 Item 的事件，不用 child startup 事件驱动全局 busy | subagent/runtime projection tests；agent UI projection tests；cancel/resume fixture |
| `9c5be7e1d5` `Make plugin guidance react to environment readiness` | MCP config 和 plugin availability 来自同一 runtime projection；`plugins_available` 进入 `McpRuntimeSnapshot`，并由 World State `PluginsInstructionsState` 动态渲染 plugin usage guidance，避免 static initial-context 缺失或重复 | P2 Plugin / Skills / MCP；`runtimeCapabilities` snapshot；Context / Token world-state owner | `adopt-now / skill-mcp-runtime-consumer-pending` | Lime 已有 plugin `runtimeCapabilities` snapshot 和 App Center consumer；下一刀应接 skill prompt injection / MCP runtime consumer，把 plugin guidance 放进 runtime world-state / context packet，而不是 UI 卡片或 legacy refs 推断 | App Server plugin runtime tests；context packet / evidence export tests；MCP contract / skill registry tests |

## 4. opencode Range Review

本轮 opencode 13 个非 merge commit 的 changed files 不命中当前 allowlist：

- `packages/llm/**`
- `packages/opencode/src/provider/**`
- `packages/schema/**`
- `packages/sdk/js/src/gen/**`
- `packages/sdk/js/src/v2/gen/**`

| Commit / Area | 事实 | Lime 分类 | 动作 |
| --- | --- | --- | --- |
| provider dialog / settings UI | `dialog-connect-provider`、`dialog-select-provider`、settings provider UI 重构 | `reject-for-lime` | opencode UI 不参与 Lime GUI 架构；Lime 多模型 owner 仍是 current model registry / provider capability |
| desktop onboarding / titlebar / shortcut flash | Desktop shell 与 onboarding 行为 | `reject-for-lime` | 不进入 Lime Agent runtime backlog |
| review pane virtualization / file tree perf | Review UI performance | `reject-for-lime` | UI 性能做法可观察，但不属于多模型 / 多模态 allowlist |
| codemode catalog signatures | Codemode tool runtime / signature | `reject-for-lime` | opencode Tool / codemode runtime 不参与；若 Lime tool signature 需要对齐，应从 Codex Tool owner 进入 |
| TUI OpenTUI upgrade | TUI dependency / prompt dialog | `reject-for-lime` | Lime 是桌面 GUI，不采纳 opencode TUI 形态 |

## 5. 本轮 Action Queue

| 优先级 | 动作 | 原因 | 退出条件 |
| --- | --- | --- | --- |
| 1 | P2 Realtime / Media Item projection 接管后补 `itemId` invariant tests | 第五次 range check 已回滚 Codex interleaved response items；Lime 当前 `RuntimeMessageDeltaContent` parser 尚未接到 Item/read model，仍需按 Lime 自身 invariant 保证不同 `itemId` 不互相吞并 contentParts | App Server / projection / GUI 目标文件干净或明确移交；补 `message.delta.contentParts` + `itemId` 合并 / fail-closed tests |
| 2 | P2 Plugin skill/MCP runtime consumer | Codex plugin guidance 已从 static initial context 移到 world-state readiness；Lime 只完成 snapshot 和 App Center projection，不足以证明 runtime prompt consumer | skill prompt injection / MCP runtime import 消费 `runtimeCapabilities`，并有 App Server / context packet tests |
| 3 | 子代理 / delegate private event boundary | Codex 修复 child MCP startup 泄漏到 parent busy state；Lime GUI/agent projection 当前有大量 subagent/runtime 状态改动，应在热区释放后补 guard | cancel/review/subagent fixture 不因 child startup event 错置全局 busy |
| 4 | 下一次 P3 loop 从本文件 anchor 继续 | 本轮有 Codex 采纳项，opencode 无采纳项；仍需跨周 cadence 或脚本化入口 | 产出下一次 upstream diff 记录，或脚本化前先过 `scripts/` 冻结边界 |

## 6. 不变约束

- `current`：Codex 仍是 Agent 工程主原点；Lime 主链仍是 React GUI -> App Server JSON-RPC -> Thread / Turn / Item -> RuntimeCore / lime-agent -> read model / projection。
- `current`：opencode 只允许作为 Provider / Model / Capability / ContentPart / media / provider lowering 参考。
- `compat`：vendor Aster 仍只作为 executor / adapter / provider compatibility surface。
- `deprecated`：旧 `agent_runtime_*` production surface 不新增依赖。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper 继续 forbidden。
- opencode 非 allowlist 变化不进入 Lime backlog；本轮没有新增 opencode `adopt-now` 或 `adapt-for-desktop`。

## 7. 验证

已执行：

```bash
git -C "/Users/coso/Documents/dev/rust/codex" status --short
git -C "/Users/coso/Documents/dev/rust/codex" rev-parse HEAD
git -C "/Users/coso/Documents/dev/rust/codex" rev-parse --abbrev-ref HEAD
git -C "/Users/coso/Documents/dev/rust/codex" fetch origin
git -C "/Users/coso/Documents/dev/rust/codex" rev-parse origin/main
git -C "/Users/coso/Documents/dev/js/opencode" status --short
git -C "/Users/coso/Documents/dev/js/opencode" rev-parse HEAD
git -C "/Users/coso/Documents/dev/js/opencode" rev-parse --abbrev-ref HEAD
git -C "/Users/coso/Documents/dev/js/opencode" fetch origin
git -C "/Users/coso/Documents/dev/js/opencode" rev-parse origin/dev
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "e0ec9be238a1495454e46426665323af25273b63..origin/dev"
git -C "/Users/coso/Documents/dev/rust/codex" diff --name-only "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main" -- <Codex high-value paths>
git -C "/Users/coso/Documents/dev/js/opencode" diff --name-only "e0ec9be238a1495454e46426665323af25273b63..origin/dev" -- <opencode allowlist paths>
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "8917244f7dcc1a945f3d5eba3dea53f6dbb16349"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "bce481fdcb"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "9c5be7e1d5"
git -C "/Users/coso/Documents/dev/js/opencode" diff --name-only "e0ec9be238a1495454e46426665323af25273b63..origin/dev"
```
