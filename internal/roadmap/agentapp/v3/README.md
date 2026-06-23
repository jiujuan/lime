# Agent App v3 路线图

更新时间：2026-06-23
状态：Draft

## 定位

v3 聚焦 **Workbench 型 Agent App**：Agent App 不只是一组可安装页面、worker 或专家入口，而是可以在 Claw 工作台内驱动真实业务生产的应用形态。v2 解决“Agent App 能独立安装并复用 Lime Runtime”；v3 解决“Agent App 运行后产生的业务对象如何进入工作台、右侧 surface 和历史任务恢复”。

```text
Agent App v2：App 是产品，Runtime 是底座
Agent App v3：Claw 是工作台，App 声明业务对象与生产任务
```

v3 不替代 v2。旧的完整 App / standalone / runtime-backed 能力继续保留；v3 新增 `Workbench App Profile`，用于内容工厂这类需要文章、图片、视频、交付物持续生产和复盘的业务应用。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [`prd.md`](./prd.md) | v3 产品需求文档，定义 Workbench Profile、内容工厂、历史产物恢复和验收口径。 |
| [`architecture.md`](./architecture.md) | v3 架构设计，固定 Claw、Agent App、Runtime、Right Surface 和 Session Product Workspace 边界。 |
| [`electron-app-server-technical-baseline.md`](./electron-app-server-technical-baseline.md) | v3 技术基线，固定 Electron Desktop Host、WebContentsView、App Server JSON-RPC、App Center 上架 / 下架规则。 |
| [`interface-contracts.md`](./interface-contracts.md) | v3 接口契约，定义 production objects、workbench tasks、object surfaces、history restore 和 surface actions。 |
| [`implementation-plan.md`](./implementation-plan.md) | v3 可执行开发切片、写集建议、测试和 GUI smoke 验收。 |
| [`content-factory-workbench-prd.md`](./content-factory-workbench-prd.md) | 内容工厂 Workbench Profile dogfood PRD。 |
| [`content-factory-development.md`](./content-factory-development.md) | 内容工厂 App 在 Lime / Claw 内的落地开发指南。 |
| [`history-product-workspace.md`](./history-product-workspace.md) | 历史任务恢复产物工作区的产品与工程要求。 |

## 当前决策

- `content-studio` 只作为业务参考，不复用代码、Electron main service、IPC、renderer、store、样式或打包流程。
- `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 是内容工厂 v3 的独立 Agent App 仓库和 current 事实源。
- 内容工厂通过 Lime 应用中心发布、安装、激活和打开；Claw 只消费 Agent App manifest / Workbench contract / Runtime read model。
- v3 current 技术基线是 Electron Desktop Host + WebContentsView / controlled BrowserWindow + Capability SDK + App Server JSON-RPC；旧 Tauri App 不再作为 Lime current 兼容目标。
- 旧 Tauri / iframe-only App 如果不能迁移到 current readiness，应从应用中心下架，而不是继续保留兼容入口。
- v3 不重做 Claw。Claw 继续负责对话、任务运行、审批、runtime facts、artifact / evidence 和历史会话。
- Right Surface 只承载业务对象渲染和结构化交互，不成为第二套 Claw 或完整 App 壳。
- Agent App 负责声明业务对象、任务、workflow、默认 skill / prompt、对象生命周期、surface contract 和历史恢复策略。
- 历史任务恢复产物是 Workbench Profile 的必选能力：打开历史对话时必须能看到当时的主产物、选中对象和布局。
- 内容工厂 v3 dogfood 先聚焦文章、图片、视频脚本 / 分镜，不复刻 `content-studio` 独立桌面应用。

## 双 Profile

| Profile | 适用场景 | 主体体验 | 保留能力 |
| --- | --- | --- | --- |
| Classic App Profile | 独立应用、管理后台、轻量工具、完整页面工作流 | App 自己有 page / panel / worker / storage / standalone 壳 | v1 / v2 全部能力 |
| Workbench App Profile | 内容工厂、交付生产、审核复盘、需要和 Claw 深度协作的业务 | Claw 是主工作台，App 声明任务和业务对象，Right Surface 渲染对象 | 复用 Runtime、Capability SDK、artifact、evidence、overlay |

## 硬目标

| 目标 | 开发含义 | 不合格信号 |
| --- | --- | --- |
| 业务对象一等公民 | App 必须声明 production object schema、主对象、版本和来源 turn。 | 产物只是一段 assistant 文本，历史任务无法恢复。 |
| 工作台而非页面壳 | 内容工厂类 App 优先进入 Claw session / Right Surface，不要求完整 page route。 | 把完整 App UI 塞进右栏，或在 Lime 内重做一套 Claw。 |
| 历史可继续工作 | 历史 session 必须恢复主产物、选中对象、布局和可执行动作。 | 打开历史只剩聊天记录，产物需要重新生成或手动查找。 |
| 交互回流 Runtime | surface action 只能通过 session/action 或受控业务 route 回流。 | 右侧面板直接绕过 runtime 写业务结果或调用工具。 |
| Provenance 可追溯 | 每个产物能关联 task、turn、artifact、输入和 evidence。 | 产物无法解释来源，审核和复盘无法成立。 |

## 开发者阅读顺序

1. 先读 [`prd.md`](./prd.md)，确认 v3 的产品目标和非目标。
2. 再读 [`electron-app-server-technical-baseline.md`](./electron-app-server-technical-baseline.md)，确认 Electron-first 和下架规则。
3. 再读 [`architecture.md`](./architecture.md)，确认 Workbench Profile 的模块边界。
4. 实现前对照 [`interface-contracts.md`](./interface-contracts.md)，先固定 contract 再改 UI。
5. 切任务按 [`implementation-plan.md`](./implementation-plan.md) 的 P0-P5 执行。
6. 做内容工厂 dogfood 时读 [`content-factory-workbench-prd.md`](./content-factory-workbench-prd.md)。
7. 做历史恢复时读 [`history-product-workspace.md`](./history-product-workspace.md)。
