# S7i Vitest Smart Targeted State Isolation Evidence

## 结论

`vitest-smart` 的默认 state 现在只记录可恢复的 full、`--from-batch` 与 `--resume` 运行。
`--only-batch` 和 `--list-batches` 只作为定向诊断，不再创建、覆盖或中断写回
`.lime/test/vitest-smart-last-run.json`，因此定向失败不能破坏已有的全量续跑状态。

## 边界与行为

- `current`：full、`--from-batch`、`--resume` 继续持久化 running、failed、passed 与 signal
  interruption 状态，原退出码和续跑提示保持不变。
- `current diagnostic`：`--only-batch` 与 `--list-batches` 仍构造内存态并执行原选择逻辑，但所有
  state update 都通过 `persist: false` 保持只读。
- signal handler 只在当前 run 允许持久化时写回 state；targeted run 被中断时只输出只读诊断提示。
- `compat` / `deprecated`：无新增。
- `dead / forbidden-to-restore`：targeted 或 list 命令覆盖默认 resume state 的行为。

## 回归

新增单元回归用临时 state 文件写入 sentinel，然后以 `persist: false` 调用 `updateRunState`：

- 返回的内存 state 仍获得 `updated_at`；
- sentinel 文件字节保持不变；
- `shouldPersistRunState` 对 full 返回 `true`，对 targeted/list 返回 `false`。

本次 closeout 直接使用 focused Vitest，不经过 `vitest-smart` runner。默认 state 文件验证前后
SHA-256 均为：

```text
6dc1af8fb641b31f2a50af5ad4096c37f3707d083f87ad9ace2ef81b3ea168e2
```

## 验证

```text
npx vitest run scripts/lib/run-vitest-smart.unit.test.mjs
=> 1 file / 11 tests passed

npm run governance:scripts
=> passed; retiredRoot=0, retiredDirs=0, untrackedRoot=0, untrackedDirs=0

npx eslint scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed

npx prettier --check scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed

git diff --check -- scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed
```

## 范围

本切片未修改中央执行计划、默认 state 文件、应用生产代码、Rust、Electron、协议、Renderer、GUI
或其他 claim。现有 state 的历史状态也未被手工修复；后续续跑应由 full/from-batch runner 自己更新。

## 2026-07-15 复核

本轮再次用 direct focused Vitest 复核，没有经过 `vitest-smart` runner。复核前后默认 state 的
SHA-256 均为：

```text
4823ad2c674fb8811a4e4beaf20b11df1731ebb6c6ed79278ac9d7db0ee47a65
```

复核结果：

```text
npx vitest run scripts/lib/run-vitest-smart.unit.test.mjs
=> 1 file / 11 tests passed

npm run governance:scripts
=> passed; retiredRoot=0, retiredDirs=0, untrackedRoot=0, untrackedDirs=0

npx eslint scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed

npx prettier --check scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed

git diff --check -- scripts/run-vitest-smart.mjs scripts/lib/run-vitest-smart.unit.test.mjs
=> passed
```

原 closeout 记录的 `6dc1af...` 是当时真实的前后哈希；之后 coordinator 的 resumable suite 已合法
推进 state。此次复核只证明当前定向命令未改写当下的 resumable state，不把不同时点的哈希混为
同一次运行。

## 协调事实

- `S7i-vitest-smart-targeted-state-isolation` 与
  `S7i-plugin-runtime-thread-fixture-alignment` 是两个完整 canonical slice ID，不能用短号 `S7i`
  合并 claim、状态、写集或 evidence。前者已经 completed/released；后者仍有独立 active claim 与
  lock，本 evidence 没有触碰其文件。
- 复核时 `S7l-plugin-host-bridge-thread-fixture-alignment`、
  `S7m-image-workbench-boundary-guard-alignment`、
  `S7n-agent-chat-current-api-fixture-alignment` 均有 claim，但没有对应 lock owner 文件。这里仅记录
  协调事实，不代替 coordinator 补锁、释放或修改状态；并行避让继续依赖各 claim 的窄写集。

S7i targeted state isolation 完成度：`100%`。Refactor V2 仍在进行中，后续由 coordinator 继续处理
S7 其他 refinement closeout 与真实失败批次。
