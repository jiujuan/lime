# 服务模型原子选择与配置单写者证据

> date: 2026-07-13
> slice: S5 GUI / Electron
> status: covered-electron
> plan: `internal/exec-plans/media-model-selection-atomic-persistence-plan.md`

## 问题与根因

图片服务模型跨 Provider 切换会同步触发 Provider 与模型两次完整配置保存。两次保存都基于旧 React state，后一次把旧 Provider 与新模型组合后覆盖前一次，Gate A 预修复稳定复现为：

```text
before: Lime-images / gpt-image-2
after:  Lime-images / agnes-image-2.1-flash
```

该状态与用户截图一致。问题不在模型候选点击命中，而在配置写入不是原子操作且缺少单写者。

## Current 实现

1. `appConfig.updateConfig(updater)` 串行执行函数式配置 mutation，后一笔读取前一笔成功保存后的 current cache。
2. `ModelSelector.setProviderAndModel` 将 Provider 与首个模型作为一次用户 intent 提交。
3. 图片、视频、语音服务偏好统一经过 `updateMediaPreference`；服务模型页自身的模型与图片数量更新也进入 `updateConfig`。
4. 未新增命令、compat wrapper、renderer mock 或第二套配置事实源。

## Gate A

普通 Chrome 打开 `http://127.0.0.1:1420/`，属于 browser mirror，只证明 renderer projection。`save_config` 在页面外拦截，未修改用户实际配置。

结果：

```text
before: Lime-images / gpt-image-2
action: select Agnes
after:  Agnes / agnes-image-2.1-flash
save_config count: 1
selection consistent: true
```

控制台仅出现 browser mirror 访问语音模型目录的 CORS 环境噪音；图片切换本身无 error。

## Gate B

使用全新隔离 userData、真实 Electron、preload/contextBridge、Electron IPC、App Server unavailable backend 与 current Provider store。fixture 只使用假 key，不调用 live Provider。

断言：

- `window.__LIME_ELECTRON__ === true`
- `Boolean(window.electronAPI?.invoke) === true`
- App Server trace 包含 `modelProvider/list`、`model/list`、`modelPreferences/list`、`modelSyncState/read`
- 可见选择从 `Gate B Lime Images / gpt-image-2` 变为 `Gate B Agnes / agnes-image-2.1-flash`
- 持久化 Provider / 模型与目标一致
- 重载后仍显示 `Gate B Agnes / agnes-image-2.1-flash`
- `save_config`: `transport=electron-ipc`, `status=success`
- invoke error: 0
- console error: 0

Gate B 证明设置 GUI、Provider current read、Electron preload/IPC、配置 store 与重载恢复闭环；不证明 live Provider 商业网络质量或真实图片生成质量。

## 自动化验证

- 8 files / 78 focused tests passed
- bridge: 2 files / 37 tests passed
- additional current boundary: 3 files / 11 tests passed
- target ESLint passed
- `git diff --check` passed
- `npm run verify:gui-smoke` passed

仓库级 `typecheck` 与 `test:contracts` 仍被本轮避让的并行 Agent / MCP 热区阻断，具体记录见执行计划；本任务写集没有对应失败。

## 分类

- `current`：配置函数式单写者、媒体 preference updater、原子 Provider / 模型 intent。
- `compat / deprecated`：无新增。
- `dead / retired`：无恢复。
- `test-only`：browser mirror save interception、隔离 Electron Provider fixture。
