# S7af Coding Workbench recovery Turn identity fixture

## 结论

Coding Workbench Electron fixture 的恢复轮不再复用首轮失败执行的 canonical Item / operation identity。首轮失败的 command、test 与 output ref 只作为 `coding_workbench_recovery` source refs；恢复轮的 tool、file change、patch、command、test 以及关联 output / diff / checkpoint ref 均绑定真实 recovery `turnId`。

这不是 RuntimeCore、ThreadStore 或 read model 修复。S2v canonical projection fail-closed 正确拒绝跨 Turn Item identity；本轮删除的是 fixture 中被旧 warning-and-continue 掩盖的非法身份复用。

## 改动

- external backend fixture 在 recovery Turn 为以下执行身份追加真实 `turnId`：
  - tool call Item / call ID
  - file change Item ID
  - patch ID
  - command ID
  - test run ID
  - output、diff、content 与 checkpoint refs
- 首轮失败仍保留原基础 command/test/output ID，恢复请求的 `sourceIds` / `outputRefs` 继续精确指向首轮失败事实。
- backend ledger 新增每轮 `executionIds`，Gate B 运行时断言五类 recovery execution ID 全部以 recovery `turnId` 结尾。
- backend ledger 证据由单一 helper 落盘；成功和失败路径都会覆盖 evidence 文件。即使 JSONL 读取失败，也先以空数组替换旧文件并把读取错误写入 summary，不再遗留上一轮 ledger。
- fixture guard 删除固定 tool/patch/command/test ID 的正向要求，新增 recovery turn scope、source ref 保留和失败 ledger 落盘顺序守卫。

## Gate B 证据

- summary：`.lime/qc/s7af-code-artifact-recovery-turn-identity-final-summary.json`
- backend ledger：`.lime/qc/s7af-code-artifact-recovery-turn-identity-final-backend-ledger.json`
- session：`code-artifact-workbench-electron-1784097186030-98524`
- initial Turn：`2e6f3682-5ac5-44c4-9379-076aa140ad75`，`latestTurnStatus=completed`
- recovery Turn：`603112fb-7dd2-4a80-8ffd-205c506a86c2`，`latestTurnStatus=completed`
- recovery source refs 保持首轮失败 identity：
  - command：`code-artifact-workbench-electron:command:test`
  - test：`code-artifact-workbench-electron:test:unit`
- recovery execution identity 使用 recovery Turn scope：
  - tool：`code-artifact-workbench-electron:tool:webfetch:603112fb-7dd2-4a80-8ffd-205c506a86c2`
  - file：`code-artifact-workbench-electron:coding-target:603112fb-7dd2-4a80-8ffd-205c506a86c2`
  - patch：`code-artifact-workbench-electron:patch:coding-target:603112fb-7dd2-4a80-8ffd-205c506a86c2`
  - command：`code-artifact-workbench-electron:command:test:603112fb-7dd2-4a80-8ffd-205c506a86c2`
  - test：`code-artifact-workbench-electron:test:unit:603112fb-7dd2-4a80-8ffd-205c506a86c2`
- `recoveryExecutionIdsTurnScoped=true`，全部 Gate B assertions 为 true。
- Electron IPC invoke error、renderer console error、page error 均为 `0`。
- backend 两轮均发出 current `turn.completed`，没有 legacy terminal。

## 验证

- `npm exec vitest run scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs --silent=passed-only --disableConsoleIntercept`：`6/6` passed。
- 两个 claimed `.mjs` 的 `node --check`：passed。
- 两个 claimed `.mjs` 的 Prettier check：passed。
- 两个 claimed `.mjs` 的 scoped `git diff --check`：passed。
- `npm run governance:scripts`：passed，`retiredRoot=0`、`retiredDirs=0`。
- Coding Workbench `gui-coding-input` Electron Gate B：passed。

## 治理分类

- `current`：每次 backend execution 使用 Turn-scoped Item / operation identity；recovery source refs 只引用上一轮失败事实。
- `dead / deleted / forbidden-to-restore`：跨 Turn 复用固定 tool/file/patch/command/test execution identity，以及失败时保留旧 backend ledger evidence。
- `compat` / `deprecated`：无新增。
- 架构影响：非重大。仅修复 deterministic Electron fixture 与证据采集，不修改生产 RuntimeCore、ThreadStore、read model、协议或 GUI owner。
- 完成度：`100%`。
