# S7a Electron IPC contract ordering evidence

## 结论

`ELECTRON_APP_SERVER_TRUTH_BRIDGE_COMMANDS` 的 production catalog 无缺项、无新增、无路由变化。
失败来自测试先对 actual 排序，却把 expected 的前三项保留为非字典序。S7a 只重排 expected，
没有修改 Electron Host、preload、App Server、catalog、mock 或 Renderer gateway。

## 验证

- `npm exec vitest run electron/ipcChannels.test.ts`：4/4 passed。
- `npm test -- --only-batch 9`：16 files / 132 tests passed。
- claimed diff `git diff --check`：passed。

## 分类

- `current`：`electron/ipcChannels.ts` truth-bridge catalog 与 Desktop Host projection。
- `test-only`：`electron/ipcChannels.test.ts` exact-set sorted expectation。
- `compat / deprecated / dead`：本切片没有新增或恢复任何 surface。
