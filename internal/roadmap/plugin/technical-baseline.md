# Lime 插件技术基线：Electron Host + App Server + Right Surface

更新时间：2026-06-25  
状态：Draft

## 1. 结论

插件体系的技术基线不是新的内嵌页面框架，也不是把业务 UI 做进主窗口里的一块大 iframe。current 基线固定为：

```text
Plugin package
  -> Plugin manifest / readiness
  -> Electron Desktop Host controlled surface
  -> Capability SDK / Host Bridge
  -> App Server JSON-RPC
  -> Runtime / artifact / evidence / session workspace
  -> Claw conversation + Right Surface dock
```

插件是否可安装、可激活、可继续工作，最终都要落到 Host 能否安全承载其 renderer 和 runtime contract。

## 2. Current / Deprecated / Dead

| Surface | 分类 | 规则 |
| --- | --- | --- |
| Electron Desktop Host | `current` | 负责窗口、preload、IPC 白名单、受控 view、session partition 和 renderer-safe projection。 |
| App Server JSON-RPC | `current` | 插件激活、session、turn、action、artifact、evidence 和 workspace 的后端事实源。 |
| Capability SDK / Host Bridge | `current` | 插件唯一可见的宿主能力入口；插件不感知 Electron IPC、App Server transport 或 provider key。 |
| Right Surface dock / tabs | `current` | 唯一右侧工作区，承载插件产物、局部编辑和受控 action。 |
| Host builtin renderer | `current` | 文章、图片、storyboard、checklist 等标准产物的首选渲染方式。 |
| App declared pane | `current` | 复杂插件 UI 的受控挂载方式，只能作为 dock 内 pane。 |
| WebContentsView surface | `current` | 需要复杂自定义 UI 时的承载方式，仍由 Host 持有生命周期和 bounds。 |
| Semantic guessing activation | `deprecated` | 只允许历史说明，不作为新激活机制。 |
| iframe-only plugin runtime | `deprecated` | 只允许低风险预览或历史兼容，不作为主路径。 |
| `<webview>` | `dead for new work` | 不得作为新插件 surface 默认承载。 |
| BrowserView | `dead for new work` | 不得新增。 |
| 旧 `agent_app_*` 用户入口 | `deprecated` | 只允许保留历史语义，不能继续扩展根产品。 |
| 旧 旧内容工作台 程序 | `dead` | 只允许作为业务参考，不得复用代码、IPC、store、renderer 或打包流程。 |

## 3. 为什么不能让插件自己包一套壳

1. 复杂插件会复刻一整套 tab、history、selection、layout、permission 和 fallback 逻辑。
2. 右侧工作区一旦分裂，就会再次出现“谁拥有当前产物”的冲突。
3. 历史恢复、证据链和继续生成会变成各插件自己定义，无法统一治理。

插件的 UI 可以强，但强的方式应该是“插件提供 renderer，Host 提供壳子”，而不是“插件自带整个工作台”。

## 4. 右侧产物 Profile 策略

| 级别 | 用法 | 适用场景 |
| --- | --- | --- |
| Host builtin renderer | 宿主在 `productProfile` 或等价插件 tab 内渲染 `articleDraft`、`imageGenerationSet`、`videoStoryboard`、`deliveryChecklist`。 | 内容工厂 MVP、历史恢复、产物审阅、轻量编辑。 |
| App declared pane | 宿主在受控 pane 中挂载插件自定义 UI。 | 复杂业务对象、专属编辑器、需要自定义交互的插件。 |
| WebContentsView surface | 宿主在 pane 中挂载插件独立 UI runtime，但仍只注入 Capability SDK。 | 独立 工作台应用 UI、小程序型插件、复杂工作台。 |

tab 模型：

```text
Right Surface Dock
  -> productProfile tab
      -> artifact / runtime / evidence / appSurface panes
  -> file tab
  -> evidence tab
  -> terminal tab
  -> browser tab
  -> sideChat tab
```

物理右栏只有一个 dock，dock 内可以按统一工作区模型打开多个 tab。

## 5. App Surface 承载要求

1. 每个 App surface 使用独立 session partition，默认不共享 cookie、localStorage 和 cache。
2. `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、`webSecurity=true`。
3. preload 只暴露 typed Capability SDK，不暴露 `ipcRenderer`、Electron 对象、Node API、文件路径或 App Server endpoint。
4. window open、下载、剪贴板、外链、文件选择等能力统一走 Host policy。
5. App Server 不可用时 fail closed，不能用 mock 或本地 UI state 伪造 task 成功。
6. Surface 生命周期绑定对应 tab / pane；切走 tab 时隐藏或暂停，不销毁其它 tab，也不新开第二个右栏。

## 6. 适用内容工厂

内容工厂作为首个重型插件，应按这条技术基线开发：

1. 文章、图片、视频脚本 / 分镜优先用 Host builtin renderer。
2. 独立 工作台应用 UI 仅在需要复杂交互时用 WebContentsView surface。
3. 业务动作必须通过 App Server 和 workspace snapshot 回流。
4. 不复用 `旧内容工作台` 旧实现，不允许回到旧 Tauri command 体系。

## 7. 选型依据

- Electron 官方方向已经把复杂内嵌能力收敛到受控 view 和明确边界。
- Right Surface 已经提供单 dock、多 tab 的宿主模型，插件只需要向其中提供 object surface。
- App Server 是统一事实源，可以同时承接插件安装、激活、任务、artifact 和历史恢复。
- 最终目标是“插件化工作台”，不是“插件内部再造宿主”。

## 8. 插件中心与上架规则

插件中心可以复用当前 App Center 的安装 / 升级 / 卸载壳，但必须满足 current readiness 才允许作为用户可见插件进入主路径：

1. package / manifest hash 校验通过。
2. manifest 能投影出插件 contract、激活入口、renderer contract 和 history restore。
3. 需要右侧工作台的插件必须声明 plugin workspace、object surfaces 和 materializers。
4. App surface 不得依赖 raw Tauri API、旧 command 或 iframe-only runtime。

处置规则：

| 检查结果 | 处理 |
| --- | --- |
| 通过 current readiness | 可安装 / 可激活 / 可继续工作。 |
| 可迁移但缺字段 | `needs-migration`，仅开发者可见。 |
| 依赖旧 Tauri command 或 iframe-only runtime | `delisted`，从用户主路径下架。 |
| package 无法验证或生产路径依赖 mock | `blocked`，禁止安装和打开。 |

## 9. 与现有 App Center 的关系

1. 当前实现如果仍保留 App Center 页面，可以继续承载插件分发，但产品语义必须切到“插件”。
2. 插件卡片展示的是插件能力、工作台应用、skills 和 renderer，而不是单纯 App 页面。
3. 安装成功后，默认交互应进入 Claw 工作台和 Right Surface，不再只回到一个独立 App 页面。
