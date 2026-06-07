# 背景与战略判断

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 背景

Lime 已经拥有较完整的本地 Agent runtime：会话、线程、回合、工具、技能、MCP、workspace、memory、artifact、evidence、review、policy、task、subagent 和 GUI 工作台都已形成基础能力。

过去这些能力主要服务 Lime Desktop 和 Claw 工作台。随着 Agent Apps、content-studio、独立 App、服务端运行形态、移动 App、微信小程序和更多垂直工作流出现，继续把 runtime 绑定在单个桌面壳内会带来明显问题：

1. 每个 App 复制一套 AgentRuntime，执行事实源会分裂。
2. 工具审批、artifact、evidence、workspace 权限、sandbox、网络边界和模型策略会不一致。
3. 前端会不断为同一种 timeline、tool step、action card、artifact preview 重写 UI。
4. 服务端、移动 App 和小程序会被迫重新发明 session、turn、事件订阅、审批和 artifact 预览协议。
5. Lime Desktop 的历史 command glue 会继续阻碍服务化。
6. 后续替换壳层、接入独立 App、扩展移动端或升级 Agent App 发布形态时，每次都要重新适配 runtime。

## 2. Codex-rs 借鉴口径

本方向借鉴 `/Users/coso/Documents/dev/rust/codex/codex-rs/` 的工程分层，但只借鉴可以在本地代码和公开文档中验证的部分：

```text
protocol crate
  -> app-server
  -> app-server-client
  -> transport / daemon
  -> core runtime
  -> permissions / sandboxing / approval
  -> CLI / IDE / rich clients
```

对 Lime 的映射是：

```text
app-server-protocol
  -> app-server
  -> app-server-client
  -> app-server-daemon / transport
  -> RuntimeCore
  -> ExecutionBackend
  -> Lime Desktop / Claw / Agent Apps / content-studio / Mobile / Mini Program / Server Mode
```

边界：

1. 可以强借鉴 Codex-rs 的 protocol、transport、client、server processor、初始化门禁、事件流和 rich client 接入方式。
2. 不直接复制 Codex App UI、ChatGPT UI 或闭源 ChatGPT 后端假设。
3. 不把 Codex-rs 的所有内部模型原样映射为 Lime 协议；Lime 应保留 `AgentSession / AgentTurn / AgentEvent` 等已有语义。
4. 必须借鉴 Codex 的 sandbox / approvals 分层：app-server 只是入口，permission profile、filesystem / network policy、sandbox manager、platform backend、approval escalation 和 audit 才是执行安全闭环。
5. 不用“像 Codex”作为设计理由；所有方案必须落回 Lime current 主链和可验证验收。

## 3. Lime 当前机会

Lime 已经具备四类资产：

1. **服务端资产**：`lime-rs`、App Server crate 家族、RuntimeCore、ExecutionBackend、AsterBackend、Tool / Skill / Evidence / Artifact 能力。
2. **产品资产**：Claw 工作台、Agent Apps、content-studio、设置页、模型 / Provider 管理、Knowledge / Skills / Automation。
3. **前端资产**：Agent timeline、message list、tool process step、runtime strip、artifact card、action request card、projection、ViewModel 和大量回归测试。
4. **远程入口资产**：消息渠道 runtime、浏览器连接器 / ChromeBridge、Connect deep link、webhook / callback 等入口雏形。

战略上，Lime Next 要把这些资产从“Lime Desktop 内部实现”升级为“受治理的 Runtime 平台能力”，让桌面端、本地独立 App、服务端、移动 App 和微信小程序都消费同一组 runtime facts。

## 4. 核心矛盾

当前最需要避免的是三种错误：

1. **只抽后端，不抽前端规范**：App Server 统一了 runtime，但各 App 仍重复写 Agent UI 和 projection。
2. **只抽本地，不看远端**：本地 sidecar 可用，但服务端、移动 App、小程序又重新发明另一套协议。
3. **先抽前端包，后定义事实源**：共享组件提前脱离 runtime facts，最后只能靠 props 兼容和 mock 填洞。

正确顺序是：

```text
协议 facts 与 permission profile 先稳定
  -> sandbox / approval / audit 边界稳定
  -> headless projection 稳定
  -> UI primitives 稳定
  -> shell adapters 自由组合
  -> 物理抽包
```

## 5. 北极星判断

Lime Next 的北极星不是“做一个更大的 Claw”，而是：

1. Claw 继续作为最完整的旗舰 Agent 工作台。
2. `lime-rs` App Server 成为跨 App runtime 底座。
3. 客户端与服务端都采用 sandbox-first：permission profile、sandbox manager、approval / escalation 和 audit 是执行安全主轴。
4. AgentRuntime UI 逐步沉淀为可复用 projection 和组件库。
5. Agent Apps / content-studio / 未来独立 App 通过 client、projection、UI primitives 复用能力。
6. 服务端、移动 App、微信小程序通过 Remote Runtime Gateway、端无关 projection 和受控 capability 复用能力。
7. legacy desktop command 和 UI-only runtime 状态持续退场。

## 6. 当前不做什么

为了避免过度设计，现在不做：

1. 不立刻把 Claw 整页抽成 npm 包。
2. 不把所有 `src/components/agent/chat/*` 都改成 public API。
3. 不复制 Codex App 或 ChatGPT 的产品 UI。
4. 不为 content-studio、移动 App 或微信小程序写专用 runtime 分支。
5. 不让 Agent Apps 用 UI runtime 生命周期替代 Agent turn runtime。
6. 不把服务端模式理解为简单把 Electron Host 或本地 sidecar 搬到云上。
7. 不把 Docker / Kubernetes 当成 sandbox 本身；它们只是服务端 worker isolation / scheduling 的承载选项。

## 7. 立即应该做什么

从现在开始，新增 AgentRuntime 前端代码必须自然满足未来共享：

1. projection / selector / reducer 先纯化。
2. 组件只接 props 和 callbacks。
3. App Server facts 是唯一数据事实源。
4. Claw shell、Agent App shell、content-studio shell、移动 shell、小程序 shell 各自负责导航、业务对象和宿主能力。
5. ToolRuntime / ExecutionBackend 必须先解析 permission profile，再经 sandbox manager 选择客户端或服务端 backend。
6. 服务端 / remote gateway 只复用 RuntimeCore facts 和协议语义，不新增第二套 runtime。
7. 当前没有第二消费者时，先在仓库内守住边界，不提前发布包。
