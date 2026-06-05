# 前端切换到 Electron 方案

> 状态：current implementation source
> 更新时间：2026-06-05
> 作用：定义 Lime 前端从 Tauri webview 切换到 Electron renderer 时的边界、改动点、阶段顺序和验收口径。
> 关联：[architecture.md](./architecture.md)（`ElectronClient` 路径）、[consumer-integration.md](./consumer-integration.md)（Electron main 消费 sidecar）。

## 1. 结论

前端**业务组件代码几乎不改**。Lime 前端从一开始就把 Tauri 隔离在一层抽象后面，Electron 化的工作集中在「重建后端桥接层」，不是「改 UI」。

2026-06-05 起，本版本的 Lime Desktop GUI 宿主由 Electron 全面接管：

1. `npm run dev / build / preview` 默认进入 Electron。
2. `npm run verify:gui-smoke` 默认验证 Electron GUI。
3. `tauri:*` npm 入口进入 deprecated gate，不再作为 GUI 主路径。
4. `lime-rs/` 仍保留为 Rust Runtime / App Server workspace；它不是 Lime Desktop 前端宿主事实源。

证据（已核实）：

| 检查项 | 实际情况 | 含义 |
| --- | --- | --- |
| 直接 `import { invoke } from "@tauri-apps/api/core"` 的组件 | `0` 个 | 没有任何业务代码裸调 Tauri |
| 全部 IPC 调用 | `187` 处，全部走 `safeInvoke()` | 单一收口入口 |
| `@tauri-apps/*` 子包 import | `82` 个文件，但被 vite alias 重定向 | 编译期不直连 Tauri |
| event 通道 | 统一走封装的 `listen / emit` | 已抽象 |

关键锚点：

1. `vite.config.ts` 把 `@tauri-apps/api/core`、`/event`、`/window`、`plugin-dialog`、`plugin-shell`、`plugin-global-shortcut`、`plugin-deep-link` 全部 alias 重定向到 `src/lib/desktop-host/`。前端写的 `@tauri-apps/...` 编译时连的是本仓库自己的 Desktop Host 兼容层，不是 Tauri GUI 宿主。
2. `src/lib/dev-bridge/safeInvoke.ts` 的 `safeInvoke()` 已收敛为多通道设计：**Electron IPC → legacy Tauri IPC → HTTP Bridge → Desktop Host mock**，后续新增能力默认走 Electron/App Server current。
3. `src/lib/desktop-host/event.ts` 的 `listen / emit` 是统一事件入口；legacy `tauri-mock` 只保留退役守卫语境。

## 2. 边界声明

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `不改` | 业务组件、页面、hook、View Model | 只消费 `safeInvoke` 和封装后的 `listen` |
| `小改` | `safeInvoke.ts` | 增加一条 Electron IPC 通道分支 |
| `小改` | `desktop-host/event.ts` | `listen / emit` 桥接到 `ipcRenderer` |
| `新增` | Electron `main` + `preload` | 进程壳、IPC 转发、sidecar 生命周期 |
| `重写` | `plugin-dialog / plugin-shell / plugin-global-shortcut / plugin-deep-link` | 用 Electron 原生 API 实现，接口契约复用现有 mock 文件 |
| `下沉` | `lime-rs` Rust 业务命令 | 不重写，编译成 `app-server` sidecar，按 App Server roadmap 接入 |
| `deprecated` | Tauri GUI 宿主 npm 入口 | `tauri:*` 只输出下线提示，不再作为开发、构建或 smoke 主路径 |

禁止方向：

1. 不在 renderer 直接 `spawn` sidecar 或读写 stdout（见 [consumer-integration.md](./consumer-integration.md) §4）。
2. 不在迁移期引入第二套 IPC 收口入口，所有命令仍只走 `safeInvoke`。
3. 不把 Tauri plugin 的语义直接平移成 Electron 全局对象，必须保持现有 mock 文件暴露的函数签名。
4. 不再用 Tauri GUI smoke 证明 Desktop 可交付；GUI 验收以 Electron smoke 为准。

## 3. 运行时路径

```text
目标形态：
Renderer (React, 不变)
  -> safeInvoke / listen        前端唯一入口
  -> window.electronAPI         preload 注入的 IPC 投影
  -> Electron main
  -> AppServerClient
  -> app-server sidecar --stdio
  -> RuntimeCore -> ExecutionBackend
```

与现有 Tauri 形态对照：

```text
legacy (Tauri GUI):
  Renderer -> safeInvoke -> window.__TAURI__.core.invoke -> Tauri command -> runtime

target (Electron):
  Renderer -> safeInvoke -> window.electronAPI.invoke -> Electron main -> app-server sidecar -> runtime
```

`safeInvoke` 已经为这种切换留好了位置：它先探测 `window.__TAURI__`，探测不到再走后续通道。Electron 分支只需插在同一探测链上。

## 4. 改动点明细

### 4.1 `safeInvoke.ts`：增加 Electron IPC 分支

当前 `safeInvoke()` 第一段探测 `window.__TAURI__?.core?.invoke`。Electron 下在其之前（或并列）增加：

```ts
// Electron renderer：preload 注入的 IPC
if (typeof window !== "undefined" && (window as any).electronAPI?.invoke) {
  try {
    const result = (await (window as any).electronAPI.invoke(cmd, args)) as T;
    recordInvokeTrace(cmd, args, "electron-ipc", "success", startedAt);
    finishInvokeTiming(timingId, cmd, "electron-ipc", "success");
    return result;
  } catch (error) {
    recordInvokeError(cmd, args, error, "electron-ipc");
    recordInvokeTrace(cmd, args, "electron-ipc", "error", startedAt, error);
    finishInvokeTiming(timingId, cmd, "electron-ipc", "error");
    throw error;
  }
}
```

要点：

1. 复用现有 trace / error / timing 记录，保持可观测性一致。
2. transport 标签新增 `electron-ipc`，便于排障区分通道。
3. HTTP Bridge 和 Mock 两条 fallback 保持不变，浏览器纯前端开发体验不受影响。

### 4.2 `desktop-host/event.ts`：桥接 Electron 事件

`listen / once / emit` 当前是 `Map` 内存模拟。Electron 下：

1. `listen(event, handler)`：在内存订阅之外，同时 `window.electronAPI.on(event, handler)`，返回的 unlisten 同步解绑两侧。
2. `emit`：renderer 主动 emit 的场景转发到 `window.electronAPI.send`，由 main 决定是否广播。
3. 后端推送的事件由 main `webContents.send(event, payload)`，preload 收下后调用已注册的内存 handler，复用现有分发逻辑。

保持现有导出签名（`listen / once / emit / UnlistenFn`），业务侧调用不变。

### 4.3 Electron `preload`：注入 `electronAPI`

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("app:invoke", cmd, args),
  on: (event: string, handler: (payload: any) => void) => {
    const listener = (_e: unknown, payload: any) => handler({ event, payload });
    ipcRenderer.on(`evt:${event}`, listener);
    return () => ipcRenderer.removeListener(`evt:${event}`, listener);
  },
  send: (event: string, payload?: unknown) =>
    ipcRenderer.send("app:emit", event, payload),
});
```

约束：开启 `contextIsolation`，不暴露完整 `ipcRenderer`，只暴露白名单方法。

### 4.4 Electron `main`：命令转发与 sidecar 生命周期

main 进程职责（与 [consumer-integration.md](./consumer-integration.md) §4 一致）：

1. `resolve binary path`（复用 `app-server-client::resolveSidecarBinaryPath`）。
2. `spawn` sidecar、`initialize / initialized` 握手。
3. `ipcMain.handle("app:invoke", ...)` 把命令转成 App Server JSON-RPC。
4. notification fanout：sidecar 事件 → `webContents.send("evt:<name>", payload)`。
5. crash / restart / backoff、stderr 日志路由。

### 4.5 Tauri plugin 能力重写

下列能力没有 Rust runtime，靠 Tauri plugin 提供，Electron 下需原生重写。接口契约直接照现有 mock 文件：

| 能力 | 现有 mock 文件 | Electron 替换 |
| --- | --- | --- |
| 对话框 | `desktop-host/plugin-dialog.ts` | `dialog.showOpenDialog / showSaveDialog / showMessageBox` |
| 外部打开 / 命令 | `desktop-host/plugin-shell.ts` | `shell.openExternal / openPath`，命令执行走 main |
| 全局快捷键 | `desktop-host/plugin-global-shortcut.ts` | `globalShortcut.register` |
| 深链 | `desktop-host/plugin-deep-link.ts` | `app.setAsDefaultProtocolClient` + `open-url` / `second-instance` |
| 窗口 | `desktop-host/window.ts` | `BrowserWindow` API |
| 文件 URL | `convertFileSrc`（`desktop-host/core.ts`） | 自定义 `app://` protocol 或 `file://` 映射 |

## 5. 阶段顺序

```text
阶段 A：前端壳替换（已作为默认宿主入口落地）
  - safeInvoke 增加 electron-ipc 分支
  - event.ts 桥接 ipcRenderer
  - 新建 Electron main + preload
  - dev / build / preview / verify:gui-smoke 默认切到 Electron
  - Tauri GUI npm 入口下线为 deprecated gate
  退出条件：Electron 窗口能完整渲染所有页面，命令走 electron-ipc / HTTP Bridge / mock 数据不报错

阶段 B：后端 sidecar 化（依赖 App Server P2-P4）
  - 等 RuntimeCore / app-server backend 脱离 Tauri host state
  - main 通过 app-server-client spawn sidecar，真实 session / turn / event 打通
  退出条件：真实 Agent flow、事件投影、cancel / shutdown、crash / backoff 跑通

阶段 C：平台能力补齐
  - dialog / shell / global-shortcut / deep-link / window / convertFileSrc 原生重写
  退出条件：五类 plugin 能力在 Electron 下行为对齐，回归测试通过
```

## 6. 当前阻塞点

[consumer-integration.md](./consumer-integration.md) §3.1 后续已经推进 standalone external backend。Electron GUI 宿主不再依赖 Tauri webview，但真实 Aster backend 仍需要继续从 Desktop host state 中解耦；在配置 `APP_SERVER_BIN` 或 packaged resources 前，Electron renderer 的 App Server 命令会继续回到现有 HTTP Bridge / mock fallback，不伪造真实 Agent 完成。

含义：

1. 阶段 A 已成为 Desktop GUI current 主路径。
2. 阶段 B 的真实 Agent 执行优先走 App Server sidecar / external backend；AsterBackend 脱离旧 Desktop host state 仍是后续主缺口。
3. Electron main 只接管宿主和 sidecar 生命周期，不把 runtime 业务逻辑复制进 main。

## 7. 验收口径

1. 业务组件零改动：`git diff` 不触及 `src/components`、`src/pages` 的命令调用逻辑。
2. IPC 单一入口：仍然 `0` 个组件直接 import Tauri `invoke`，全部走 `safeInvoke`。
3. `safeInvoke` 通道完整：`electron-ipc → http-bridge → mock` 三级 fallback 可用，trace 能区分通道。
4. event 双向打通：main 推送事件能被 renderer 现有 `listen` handler 收到。
5. plugin 能力对齐：五类 Tauri plugin 能力在 Electron 下签名不变、行为对齐。
6. 不 import Lime Rust crate：renderer 只消费 preload IPC projection（对齐 [consumer-integration.md](./consumer-integration.md) §12）。
7. 默认 GUI 入口：`npm run dev / build / preview / verify:gui-smoke` 均不再启动 Tauri。
