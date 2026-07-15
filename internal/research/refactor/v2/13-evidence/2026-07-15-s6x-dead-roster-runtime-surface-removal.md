# S6x Dead Roster Runtime Surface Removal

## 结论

经用户明确确认，S6w 识别的三组零 consumer surface 已从编译图和前端类型门面物理删除：

- 删除 `thread-store/src/subagent_tree.rs` 及 crate root module 行，canonical roster 继续由
  `AgentGraphStore` 持有；
- 删除 `agent/src/team_runtime_governor.rs` 及 crate root module/re-export，team/runtime 控制
  继续走 App Server AgentControl 与 canonical AgentGraph 主链；
- 删除 `requestTypes.ts` 中旧 spawn/send/wait/resume/close subagent DTO、status snapshot 与
  仅被这些 DTO 使用的 frontmatter hook 类型。

累计删除 `742` 行，新增 `59` 行物理缺失 guard；没有新增 compat wrapper、alias、fallback
或生产 mock。

## 分类

- `current`：ThreadStore `AgentGraphStore`、App Server AgentControl、canonical
  Thread/Turn/Item projection。
- `dead / deleted / forbidden-to-restore`：旧 subagent facade DTO、ThreadStore
  `subagent_tree`、lime-agent `team_runtime_governor`。
- `compat / deprecated`：无新增；`parentSessionId` 历史/证据残余仍留给独立 slice。
- `test-only`：`agentMigrationBoundary.test.ts` 的物理路径、crate export 与 retired type name
  负向守卫。

## 守卫

`agentMigrationBoundary.test.ts` 新增一条聚合 guard：

- 两个 Rust dead 文件必须物理不存在；
- crate root 不得恢复 `subagent_tree` 或 `team_runtime_governor` module/export；
- `requestTypes.ts` 不得恢复 14 个旧 subagent/frontmatter type name。

同一测试文件中的 Runtime session hydration guard 是隔壁进程并行改动，本 slice 完整保留但
不声明所有权。

## 验证

- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts`：`13/13`。
- `npm run test:rust:related -- lime-rs/crates/thread-store lime-rs/crates/agent`：
  `agent-runtime`、`app-server`、`lime-agent`、`lime-scheduler`、`lime-server`、
  `thread-store` 全部通过；可见核心计数包括 `116/116`、`263/263`、`18/18`。
- `npm run typecheck`：Renderer 与 Node 双 tsconfig 通过。
- 精确 ESLint、Prettier、`git diff --check`：通过。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移 `0`、边界违规 `0`。
- `npm run test:contracts`：generated types `700` 无漂移、App Server client `288`
  checks、command/harness/modality/scripts/release/docs guard 全部通过。
- `rg` 对 deleted type/module names 的生产扫描为零。
- `rustfmt --config skip_children=true` 精确检查两个被修改的 crate root：通过。

全 workspace/package `cargo fmt --check` 仍会递归命中隔壁 MCP owner 的
`lime-rs/crates/agent/src/mcp_bridge.rs` 格式漂移；该文件不在本 slice 写集，未替其格式化。

## 并行边界

本轮没有修改 `legacySurfaceCatalog.json`、`parentSessionId` compat 残余、S2s/S4i4 media
实现或 MCP 文件。S2s 与 S4i4 已由各自 owner 释放；本 slice 仅保留其完成事实，不冒领
实现。
