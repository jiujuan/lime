# Upstream Diff 2026-07-06 P3 Loop

> 状态：P3 third range check done / no new adoptable signal
> 更新时间：2026-07-06
> 目标：从上一轮 fetched target 再跑一次 Codex / opencode range check，验证 P3 可以按 checkpoint 继续，而不是只停留在一次性 diff。

## 1. 结论

本轮只读外部仓库并 fetch 远端引用，不修改 Codex / opencode worktree，不接管 Lime 源码热区。

结果：

1. Codex `origin/main` 未前进，range 为空。
2. opencode `origin/dev` 从上一轮 anchor 前进 `5` 个非 merge commit。
3. opencode 当前 allowlist 路径无命中；5 个 commit 均不进入 Lime backlog。
4. P3 从 `one real diff recorded` 推进为 `third range checked / no-action recorded`，但仍未证明跨周 cadence 或脚本化流程。
5. 2026-07-06 第三次检查中，Codex `origin/main` 与 opencode `origin/dev` 都没有前进；opencode 只有 `execute-prompt-audit`、`interrupted-note`、`v2` 等非目标分支更新，不进入本轮 allowlist。

## 2. Range Evidence

| Source | Previous anchor | Fetched target | Non-merge commits | Worktree | 处理结论 |
| --- | --- | --- | ---: | --- | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d` | `origin/main@be33f80bc65159c094ecd06bf155afa3061ce23d` | 0 | clean | 无新信号 |
| opencode | `be73f465df6b20e0c3091f49ab83e89c0ede3b35` | `origin/dev@e0ec9be238a1495454e46426665323af25273b63` | 5 | clean | 无 allowlist 采纳项 |

下一次 upstream diff 建议从本轮 fetched target 起算：

```text
Codex next range: be33f80bc65159c094ecd06bf155afa3061ce23d..<next-origin-main>
opencode next allowlist range: e0ec9be238a1495454e46426665323af25273b63..<next-origin-dev>
```

## 2A. Third Range Evidence

记录时间：2026-07-06。

| Source | Previous anchor | Fetched target | Non-merge commits | Worktree | 处理结论 |
| --- | --- | --- | ---: | --- | --- |
| Codex | `be33f80bc65159c094ecd06bf155afa3061ce23d` | `origin/main@be33f80bc65159c094ecd06bf155afa3061ce23d` | 0 | clean | 无新信号 |
| opencode | `e0ec9be238a1495454e46426665323af25273b63` | `origin/dev@e0ec9be238a1495454e46426665323af25273b63` | 0 | clean | 目标分支无新增；非目标分支更新不进入 allowlist |

## 3. opencode Range Review

| Commit | 事实 | Lime 分类 | 动作 |
| --- | --- | --- | --- |
| `e0ec9be23` | 更新 nix `node_modules` hashes | `reject-for-lime` | 依赖产物维护，不进入 v1 架构队列 |
| `2b34df94f` | MCP paginated tool discovery 保留 output schema metadata；修改 SDK patch 和 MCP catalog tests | `reject-for-lime` for opencode | opencode MCP / Tool runtime 不参与 Lime Tool 架构；若 Lime 需要 MCP output schema，必须从 P2 Plugin / Skills / MCP current owner 进入 |
| `68f225a11` | OpenRouter small model 不再把 weakest reasoning `low` 降成 `none` | `watch / no backlog` | 路径在 `packages/opencode/src/provider/transform.ts`，不在当前 allowlist；语义可作为 provider-specific reasoning transform 观察项，但 Lime current owner 仍是 `modelReasoningPolicy` + Rust request consumer |
| `e9f5d3409` | TUI home tips 文案缩短 | `reject-for-lime` | opencode UI 不参与 Lime GUI 主线 |
| `d3459eb74` | MCP tests 从 module mocks 改为 real servers，并新增 browser service layer | `reject-for-lime` for opencode | 测试纪律可观察，但 opencode MCP / Effect layer 不是 Lime runtime 事实源；不进入 backlog |

## 4. 本轮 Action Queue

| 优先级 | 动作 | 原因 | 退出条件 |
| --- | --- | --- | --- |
| 1 | 等隔壁源码热区移交后继续 P2 Tool / Approval / Sandbox 第一代码刀 | `agent_tools/**` 与 App Server runtime 仍在并行写集；本进程不夹写 | `ToolExecutionLifecycleSnapshot` typed owner + tool lifecycle / orchestrator tests |
| 2 | 下一次 P3 loop 从本文件 anchor 继续 | 本轮无采纳项，但证明 range 可以连续推进 | 产出下一次 upstream diff 记录，或脚本化前先过 `scripts/` 冻结边界 |
| 3 | 若未来 opencode provider transform 路径持续承载 model capability，再单独评估 allowlist 是否需要更新 | 当前 allowlist 不包含 `packages/opencode/src/provider/**`，不能临时放宽规则 | 更新 `follow-up-strategy.md` 后再采纳，不在聊天里临时例外 |

## 5. 不变约束

- `current`：Codex 仍是 Agent 工程主原点；Lime 主链仍是 React GUI -> App Server JSON-RPC -> Thread / Turn / Item -> RuntimeCore / lime-agent -> read model / projection。
- `compat`：无新增。
- `deprecated`：旧 `agent_runtime_*` production surface、旧 shell alias 入口不新增依赖。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。
- opencode 非 allowlist 变化不进入 Lime backlog；本轮没有新增 `adopt-now` 或 `adapt-for-desktop`。

## 6. 验证

已执行：

```bash
git -C "/Users/coso/Documents/dev/rust/codex" fetch origin
git -C "/Users/coso/Documents/dev/js/opencode" fetch origin
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "be73f465df6b20e0c3091f49ab83e89c0ede3b35..origin/dev"
git -C "/Users/coso/Documents/dev/rust/codex" diff --name-only "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main" -- <Codex high-value paths>
git -C "/Users/coso/Documents/dev/js/opencode" diff --name-only "be73f465df6b20e0c3091f49ab83e89c0ede3b35..origin/dev" -- <opencode allowlist paths>
git -C "/Users/coso/Documents/dev/js/opencode" show --name-only --format="commit %h%n%s" --no-renames <5 commits>
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "e0ec9be238a1495454e46426665323af25273b63..origin/dev"
rg -n "[ \t]+$" "internal/research/refactor/v1/upstream-diff-2026-07-06-p3-loop.md" "internal/research/refactor/v1/README.md" "internal/research/refactor/v1/upstream-checkpoint.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md" "internal/research/refactor/v1/priority-tracking-plan.md"
```
