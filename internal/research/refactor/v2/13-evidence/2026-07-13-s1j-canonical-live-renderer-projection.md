# S1j canonical live Renderer projection

> status: completed / coordinator-validated / Gate-B-passed
> verified_at: 2026-07-13
> owner: refactor-v2-coordinator

## 目标与结果

- 生产 Renderer 的 Thread/Turn/Item lifecycle 只从 notification
  `canonicalEvent` 读取 canonical entity。
- canonical Item GUI lowering 覆盖 Tool、MCP、Approval、Command、File、Media、
  SubAgent、ContextCompaction 与 Extension。
- Approval terminal 从 canonical Item 投影为 `action_resolved`；sequence gate 只对
  canonical terminal Approval 放行已有 action 的恢复场景。
- raw lifecycle fixture 仅通过 test-only
  `projectRawAppServerAgentEventPayloadForTests`；生产路径未恢复 raw fallback。
- Coding Workbench 审查默认选择按 canonical sequence 取最新 runtime change；显式
  用户选择及当前文件的真实 baseline diff 继续优先，旧 document preview 不再覆盖终态 artifact。

## 根因闭环

首次 `gui-coding-input` Gate B 中，App Server `thread_read.artifacts` 已包含
`coding-target.ts`，Logs/Outputs 也能读取该事实，但 Changes 默认选中了更早的
`greeting.ts`。根因是审查选择器在没有显式选择时取首个/相邻 runtime evidence，
没有利用 canonical sequence 的最新顺序。修正后，latest runtime change 成为默认；
已有 baseline 的当前 runtime 文件和用户显式点击不受影响。

## 验证

```text
canonical Renderer projection focused Vitest       104/104 PASS
Changes view-model + Workbench component            18/18 PASS
workspace coding scene/projection                    21/21 PASS
agent-runtime-projection node:test                   41/41 PASS
npm run typecheck                                          PASS
npm run test:contracts                         290 checks PASS
npm run build:renderer:electron:smoke                       PASS
```

Gate B：

```text
node scripts/electron/code-artifact-workbench-fixture-smoke.mjs \
  --scenario gui-coding-input \
  --prefix s1j-canonical-live-renderer-projection-selection-fix \
  --timeout-ms 180000
PASS
```

Evidence：

- `.lime/qc/gui-evidence/code-artifact-workbench-electron-fixture/s1j-canonical-live-renderer-projection-selection-fix-summary.json`
- `ok=true`，19 项 assertions 全为 true。
- 首轮失败与 recovery 后成功的 Changes/Outputs/Logs 均命中
  `coding-target.ts`；backend 只发 current terminal，未发 legacy terminal。
- `consoleErrors=[]`、`pageErrors=[]`、无 invoke error。

`npm run smoke:agent-runtime-current-fixture` 的 history、stream terminal、
Electron fixture guard 前端分段分别通过 31、32、54 项；随后重编 App Server sidecar
时被并行 S4j 中间态阻塞：`ImportedToolDraft` 已无 `metadata` 字段，
`conversation_import/commit_events/tool_lowering.rs` 仍有 18 个相关编译错误。
该热区不在 S1j 写集，本轮未越界修改。因而 S1j 可判完成，但整个共享工作树尚未达到
release 门槛，需 S4j owner 收口后重跑聚合 smoke 与 `verify:gui-smoke`。

## 治理分类

- `current`：canonical Thread/Turn/Item Renderer lifecycle、canonical terminal
  Approval、latest runtime change 审查默认选择。
- `compat`：无新增。
- `test-only`：冻结 raw lifecycle fixture helper。
- `deprecated`：rich `AgentSession` presentation envelope，等待 S5/S6 删除。
- `dead / forbidden-to-restore`：生产 raw Thread/Turn/Item lifecycle fallback、raw Tool
  terminal fanout、未知 raw lifecycle。

S1j 完成度：`100%`。v2 全局完成度不在本记录中上调，继续以中央状态表为准。
