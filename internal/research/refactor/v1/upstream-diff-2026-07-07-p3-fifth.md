# Upstream Diff 2026-07-07 P3 Fifth

> 状态：P3 fifth range check done / Codex rollback-aware signals recorded / opencode unchanged
> 更新时间：2026-07-07
> 目标：从第四次 P3 anchor 继续检查 Codex / opencode 远端，修正已被上游回滚的 `interleaved response items` 口径，并把新的 App Server / safety buffering 信号回挂 Lime v1 队列。

## 1. 结论

本轮只读外部仓库，不修改 Codex / opencode worktree，不接管 Lime 源码热区。

结果：

1. Codex `origin/main` 从 `8917244f7dcc1a945f3d5eba3dea53f6dbb16349` 前进到 `8268cbfb0e5f39cb4efff928264fe8f29ddacafb`，新增 `5` 个非 merge commit。
2. opencode `origin/dev` 仍为 `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c`，新增 `0` 个非 merge commit。
3. Codex 本轮有 `3` 个 adopt-now 信号：per-thread config warning、TUI/core exec-policy warning owner 收敛、safety buffering `retry_model`。
4. Codex 本轮有 `1` 个 rollback signal：`interleaved response items` 已被上游 revert，第四次文档中“Codex 已采纳 interleaved item”为过期口径。
5. Codex 本轮有 `1` 个 desktop-adapt/watch 信号：conditional `CODEX_HOME` dotenv；Lime 可参考启动期单线程环境 overlay 纪律，但不能直接照搬 CLI arg0 形态。

## 2. Range Evidence

| Source | Previous anchor | Fetched target | Non-merge commits | Worktree | 处理结论 |
| --- | --- | --- | ---: | --- | --- |
| Codex | `8917244f7dcc1a945f3d5eba3dea53f6dbb16349` | `origin/main@8268cbfb0e5f39cb4efff928264fe8f29ddacafb` | 5 | clean | 记录 per-thread config warning、interleaved rollback、safety buffering `retry_model`、exec-policy owner 收敛、conditional dotenv |
| opencode | `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` | `origin/dev@eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` | 0 | clean | 无新增；无 allowlist 采纳项 |

下一次 upstream diff 从本轮 fetched target 起算：

```text
Codex next range: 8268cbfb0e5f39cb4efff928264fe8f29ddacafb..<next-origin-main>
opencode next allowlist range: eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..<next-origin-dev>
```

## 3. Codex Range Review

| Commit | 事实 | Lime owner | 分类 | 动作 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| `8268cbfb0e` `Conditional codex_home dotenv` | Codex 在单线程 startup 期加载 `CODEX_HOME` 下 `.env.*` 条件 overlay，按 TCP 条件 set/unset env，并保护 `CODEX_*` 变量；overlay 在 runtime / workers / sessions / network clients 创建前完成 | Desktop Host sidecar startup env owner；provider/network config owner；App Server process bootstrap | `adapt-for-desktop / watch` | Lime 不直接照搬 Codex CLI `arg0` / `CODEX_HOME` overlay；若需要网络相关 provider proxy / env overlay，应放在 Desktop Host 启动 App Server sidecar 前的单一 owner，禁止运行时多线程 mutate env，且要保护内部保留变量 | Desktop Host sidecar env tests；provider connectivity fixture；Windows/macOS startup smoke |
| `8f5bb6171e` `Remove TUI exec-policy core exports` | Codex 移除 TUI 直接调用 core exec-policy 预检查；exec-policy warning 统一由 App Server configWarning flow 输出，避免远程 app-server 时检查错机器 | App Server configWarning owner；GUI config warning consumer；Desktop Host bridge | `adopt-now / reinforce-app-server-warning-owner` | Lime GUI / Desktop Host 不应直接读取 rules 或调用 core 检查 exec-policy；所有 malformed rules warning 应从 App Server current warning event 进入前端 | App Server warning tests；bridge event tests；GUI warning presentation tests |
| `dbf67f34a0` `Emit exec-policy warnings for freshly loaded thread config` | `thread/start` 会重新加载 cwd / project-local config 和 `.rules`，并把新出现的 exec-policy parse warning 只发给发起该 thread 的连接；若该 warning 已在 initialize 阶段发送过，则不重复发送 | App Server `thread/start`；workspace/project config loader；renderer configWarning event consumer | `adopt-now / app-server-thread-config-warning-owner` | Lime 的 App Server thread/start 应在 per-thread config reload 后重新校验 exec policy / rules，并向当前请求连接发送结构化 `configWarning`；不得只依赖 app-server 初始化时的一次性 warning，也不得把该 warning 扩散成全局 GUI toast | App Server thread/start tests；connection-scoped notification tests；GUI config warning smoke |
| `7b4e70d567` `Revert "[core] Support interleaved response items"` | Codex 回滚了 streamed item map 和 reasoning summary delta / section break 按 `item_id` 归属的实现，恢复 active item 处理路径 | P2 Realtime / Media handoff；Thread / Turn / Item invariant | `rollback-signal / watch` | 修正第四次 range check 和 Media handoff 口径：Lime 仍按自身 `itemId` invariant 设计稳定归属，尤其是 media/text delta 不跨 turn / item 混并；但不再把 Codex interleaved behavior 当作上游 current 采纳依据 | 文档 guard；后续 Item projection tests 只证明 Lime 自身 `itemId` 合并与 fail-closed，不写“Codex 已采纳 interleaved”断言 |
| `7094fa467e` `[codex] Read retry model from buffering events` | Responses safety buffering payload 的 retry target 字段是 `retry_model`；wire `retry_model` 优先，显式 `null` 表示 unset，缺失字段才 fallback 到旧 header `x-codex-safety-buffering-faster-model` | Provider stream / model-provider safety buffering parser；RuntimeEvent safety buffering projection；GUI safety buffering presentation | `adopt-now / provider-stream-buffering-owner` | Lime 若消费 safety buffering，需要读取 payload `retry_model`，不要继续找 `faster_model`；为了内部兼容可保留下游 `fasterModel` 命名，但 wire parser 必须区分 omitted 与 explicit null | provider stream parser tests；RuntimeEvent projection tests；safety buffering GUI tests |

## 4. opencode Range Review

opencode `origin/dev` 本轮无新增 commit。opencode 仍只允许作为 Provider / Model / Capability / ContentPart / media / provider lowering 参考；Session / Tool / UI / Effect runtime 继续 `reject-for-lime`。

## 5. 本轮 Action Queue

| 优先级 | 动作 | 原因 | 退出条件 |
| --- | --- | --- | --- |
| 1 | P2 App Server config warning owner | Codex 证明 warning 不能由 TUI/GUI 直接读 core，也不能只在 app-server initialize 阶段发一次；thread/start 会加载不同 cwd 的 rules | App Server initialize + thread/start warning flow 有 connection-scoped tests；GUI/bridge 只消费 warning event |
| 2 | P2 safety buffering `retry_model` parser | Codex 修正 wire 字段名和 null/omitted 语义；Lime 多模型 provider stream 不能误读字段 | provider stream / RuntimeEvent projection 能覆盖 retry_model 优先、null unset、missing fallback |
| 3 | 修正 Media Item projection handoff 的 interleaved 依据 | 上游已回滚 interleaved response items；继续把它写成 Codex current 会误导后续代码刀 | v1 文档统一使用 `rollback-aware / Lime invariant` 口径 |
| 4 | Desktop Host startup env overlay 观察项 | Codex conditional dotenv 与 Lime 多模型 provider proxy / network env 相关，但 CLI `arg0` 形态不适合直接照搬桌面端 | 只在需要 provider proxy / env overlay 时进入 Desktop Host sidecar startup owner；当前先 `watch` |
| 5 | 下一次 P3 loop 从本文件 anchor 继续 | P3 已能连续 range check，但仍未证明跨周 cadence 或脚本化入口 | 产出下一次 upstream diff 记录，或脚本化前先过 `scripts/` 冻结边界 |

## 6. 不变约束

- `current`：Codex 仍是 Agent 工程主原点；Lime 主链仍是 React GUI -> App Server JSON-RPC -> Thread / Turn / Item -> RuntimeCore / lime-agent -> read model / projection。
- `current`：opencode 只允许作为 Provider / Model / Capability / ContentPart / media / provider lowering 参考。
- `compat`：vendor Aster 仍只作为 executor / adapter / provider compatibility surface。
- `deprecated`：旧 `agent_runtime_*` production surface 不新增依赖。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper 继续 forbidden。
- rollback-aware：`interleaved response items` 不再作为 Codex current 行为引用；Lime 的 `itemId` invariant 仍来自本地 Thread / Turn / Item 设计，不依赖该回滚 commit。

## 7. 验证

已执行：

```bash
git -C "/Users/coso/Documents/dev/rust/codex" fetch origin
git -C "/Users/coso/Documents/dev/js/opencode" fetch origin
git -C "/Users/coso/Documents/dev/rust/codex" status --short
git -C "/Users/coso/Documents/dev/rust/codex" rev-parse origin/main
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "8917244f7dcc1a945f3d5eba3dea53f6dbb16349..origin/main"
git -C "/Users/coso/Documents/dev/rust/codex" log --oneline --no-merges "8917244f7dcc1a945f3d5eba3dea53f6dbb16349..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" status --short
git -C "/Users/coso/Documents/dev/js/opencode" rev-parse origin/dev
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c..origin/dev"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "dbf67f34a0a37be77d12e2801575f33946f7d629"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "7b4e70d567"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "7094fa467e"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "8f5bb6171e"
git -C "/Users/coso/Documents/dev/rust/codex" show --stat --oneline --no-renames "8268cbfb0e5f39cb4efff928264fe8f29ddacafb"
git -C "/Users/coso/Documents/dev/rust/codex" diff --name-only "8917244f7dcc1a945f3d5eba3dea53f6dbb16349..origin/main"
```
