# Agent App v3 技术基线：Electron Desktop Host + App Server

更新时间：2026-06-23
状态：Draft

## 1. 结论

Agent App v3 的核心底座不再是 Tauri 小应用、iframe 承载或旧 `agent_app_*` 命令族。v3 current 技术基线固定为：

```text
Agent App package
  -> App Center verification / readiness
  -> Electron Desktop Host controlled surface
  -> Capability SDK / Host Bridge
  -> App Server JSON-RPC
  -> RuntimeCore / services / artifact / evidence
  -> Claw conversation + Right Surface Product Profile
```

旧 Tauri 生态 App 不再作为 Lime current 兼容目标。能迁移到 Electron Desktop Host + App Server bridge 的 App 可以重新上架；迁移失败、依赖旧 Tauri command、依赖 iframe 旁路或无法通过 readiness 的 App 应从应用中心下架，而不是继续保留兼容通道。

## 2. Current / Deprecated / Dead 分类

| Surface | 分类 | 规则 |
| --- | --- | --- |
| Electron Desktop Host | `current` | 负责窗口、preload、IPC 白名单、受控 WebContentsView / BrowserWindow、session partition、sidecar 生命周期和 renderer-safe projection。 |
| App Server JSON-RPC | `current` | Agent task、session、turn、action、artifact、evidence 和 product workspace 的后端事实源。 |
| Capability SDK / Host Bridge | `current` | App 唯一可见的宿主能力入口；App 不感知 Electron IPC、App Server transport、sidecar 路径或 provider key。 |
| WebContentsView Right Surface | `current` | 需要内嵌 App 自有 UI 时的首选承载方式，用宿主持有的 native view 挂到右侧 Profile 占位区域。 |
| Host builtin renderer | `current` | 文章、图片组、storyboard、checklist 等标准产物的首选渲染方式，适合 Claw 深度协作。 |
| Controlled BrowserWindow App Shell | `current` | 独立 App Shell 或完整页面工作流；不用于 Claw 中间对话区。 |
| iframe App surface | `deprecated` | 只允许低风险预览、测试夹具或历史迁移窗口；不作为新的 Agent App 主承载方式。 |
| `<webview>` | `dead for new work` | Electron 官方不建议作为新路径；不得作为 v3 App surface 默认承载。 |
| BrowserView | `dead for new work` | 已被 WebContentsView 取代；不得新增。 |
| Tauri adapter / raw Tauri command | `deprecated / external-compat` | 只可作为旧宿主迁移参考或外部兼容说明；Lime current 不为它保留上架承诺。 |
| 旧 `agent_app_*` Tauri lifecycle facade | `dead` | 不得重新接回 App Center、DevBridge、mock 或 Runtime 主链。 |

## 3. 为什么不继续用 iframe

早期 Agent App 受 Tauri/WebView 能力限制，iframe 是一种无奈的沙箱选择。迁到 Electron 后，iframe 不应继续承担完整 App 工作台：

1. iframe 受 CSP、焦点、拖拽、快捷键、剪贴板、下载、窗口打开和跨源通信限制影响明显。
2. iframe 容易让业务 App 在 DOM 内部形成第二套运行边界，难以和 Claw 的右侧 surface 状态机、历史恢复和 artifact/evidence 主链对齐。
3. Electron 已有更贴近桌面产品的承载方式：`WebContentsView` 可作为宿主管控的独立 webContents 嵌入主窗口，配合 `contextIsolation`、`sandbox`、preload allowlist 和独立 session partition。

iframe 仍可用于 artifact HTML preview、低风险静态预览或历史 fixture，但不能作为内容工厂、Agent App Workbench Profile 或 App Center 上架 App 的新默认技术路线。

## 4. 右侧 Product Profile 的承载策略

Claw 布局不变量：

```text
中间：Claw 对话 / 运行过程 / 审批 / timeline
右侧：Product Profile / Right Surface / 产物对象交互
```

右侧承载分两级。物理右侧区域始终只有一个 dock，但 dock 内可以像 Codex 一样打开多个 tab：

| 级别 | 用法 | 适用场景 |
| --- | --- | --- |
| Host builtin renderer | 宿主在 `productProfile` tab 内用标准 renderer 渲染 `articleDraft`、`imageGenerationSet`、`videoStoryboard`、`deliveryChecklist`。 | 内容工厂 MVP、历史恢复、产物审阅、轻量编辑、标准 action。 |
| App Surface WebContentsView | 宿主在 `productProfile` tab 的 pane 中挂载 App UI runtime 的 `WebContentsView`，只注入 Capability SDK。 | App 需要自定义复杂 UI，但仍必须围绕当前 selected product object 工作。 |

tab 模型：

```text
Right Surface Dock
  -> productProfile tab
      -> artifact / runtime / evidence / expertInfo / appSurface panes
  -> file tab
  -> evidence tab
  -> terminal tab
  -> browser tab
  -> sideChat tab
```

互斥只发生在 dock 层：不能出现两个右侧物理栏；dock 内的多个 tab 可以保留状态。

无论哪一级，Right Surface 都不能直接调用 provider API、文件系统、secret 或旧 desktop facade。所有写动作必须回流到：

```text
surface action intent
  -> Claw action router
  -> agentSession/action/respond 或 agentSession/turn/start
  -> RuntimeCore
  -> artifact / product workspace snapshot
```

## 5. WebContentsView App Surface 形态

v3 需要新增的不是“内嵌浏览器”，而是 Agent App Surface Host：

```text
React RightSurfaceHost placeholder
  -> Electron main 计算并同步 bounds
  -> WebContentsView(app runtime entryUrl)
  -> preload 暴露 window.lime / lime.agentApp.bridge
  -> App UI 只收 product object read model + SDK events
```

实现约束：

1. 每个 App surface 使用独立 `partition`，默认不共享 cookie、localStorage 和 cache。
2. `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`。
3. preload 只暴露 typed Capability SDK，不暴露 `ipcRenderer`、Electron 对象、Node API、文件路径或 App Server endpoint。
4. window open、下载、剪贴板、外链、文件选择等能力统一走 Host policy。
5. App Server 不可用时 fail closed，不能用 mock 或本地 UI state 伪造 task 成功。
6. WebContentsView 的生命周期绑定对应 tab / pane；切走 tab 时隐藏或暂停，不销毁其它 tab，也不新开第二个右栏。

## 6. App Center 上架 / 下架规则

App Center 不再为旧 Tauri App 提供“还能打开就算兼容”的承诺。上架检查必须包含：

1. package / manifest hash 校验通过。
2. `APP.md` / `app.*.yaml` 可投影为 current Agent App contract。
3. 使用 `agentRuntime.bridge.kind=app-server-json-rpc` 的 App 能完成 App Server bridge readiness。
4. 需要右侧工作台的 App 必须声明 Workbench Profile、production objects、object surfaces、materializers 和 history restore。
5. App surface 不依赖 raw Tauri API、旧 Tauri command、`src-tauri`、旧 DevBridge mock fallback 或 iframe-only runtime。

处置规则：

| 检查结果 | App Center 处理 |
| --- | --- |
| 通过 current readiness | 可上架 / 可安装 / 可激活。 |
| 可迁移但缺字段 | `needs-migration`，仅开发者可见，不对用户推荐。 |
| 依赖旧 Tauri command 或 iframe-only runtime | `delisted`，从应用中心下架，保留迁移说明。 |
| package 无法验证或生产路径依赖 mock | `blocked`，禁止安装和打开。 |

## 7. 内容工厂适用口径

`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 是内容工厂 current 产品仓库。它应按以下规则开发：

1. 不复用 `content-studio` 程序，只参考文章、图片、视频脚本 / 分镜这些业务能力。
2. 默认通过 App Center 发布安装，不在 Lime 内硬编码入口。
3. Claw 中间保持对话和运行过程；右侧 Product Profile 展示产物。
4. MVP 优先用 host builtin renderer；确需复杂自定义 UI 时再接 WebContentsView App Surface。
5. Classic 独立页面只作为 `deprecated fallback`，不继续扩展为主路径。

## 8. Electron 依据

当前选型依据 Electron 官方方向：

- `BrowserView` 已被 `WebContentsView` 取代。
- Electron 官方不建议把 `<webview>` 作为新路径，建议考虑 iframe、WebContentsView 或避免嵌入内容的架构。
- 受控通信应使用 `contextIsolation`、`contextBridge`、preload allowlist 和 `MessageChannelMain` / MessagePort 这类明确边界。

落到 Lime 的工程口径是：新 Agent App surface 首选 `WebContentsView`，简单产物首选 host builtin renderer；iframe 只作预览或历史兼容，不再作为 Agent App 核心承载。
