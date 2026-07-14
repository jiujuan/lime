# S7b current Electron guard alignment evidence

## 结论

两个 Electron guard 已改为验证当前事实：

- packaged renderer 的 App Server client alias 指向 current `browser.ts`，不再要求旧 `index.ts`。
- 根规则只检查仓库级 owner/禁止旁路；retired Rust command 细节继续由 internal/roadmap guard 检查。
- quality guard 检查 Gate A/B、真实 GUI、`verify:gui-smoke` 和生产 no-mock 语义，不绑定已删除的固定旧句。

生产 `vite.config.ts`、`AGENTS.md`、`internal/aiprompts/**`、skills、Electron 和 App Server 均未修改。

## 验证

- focused `current-entrypoints.test.mjs` + `current-rules-guard.test.mjs`：25/25 passed。
- smart Vitest 后续在 batch 15/16 再次覆盖两 guard：passed。
- `npm test -- --only-batch 12` 当前分片：16 files / 151 tests passed。
- claimed diff `git diff --check`：passed。

## 分类

- `current`：`vite.config.ts` browser entry、仓库级规则、aiprompts 领域事实源、Gate A/B 质量证据。
- `test-only`：两份 Electron current guard。
- `dead`：`index.ts` renderer alias 旧断言、要求根文件复制 retired 细节和固定旧句的断言。
- `compat / deprecated`：本切片无保留项。
