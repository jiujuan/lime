# Coding Profile 架构

> 状态：draft
> 更新时间：2026-06-12

## 目标架构

Coding profile 是 Agent Workbench 标准下的一个运行剖面。它拥有更强的文件、命令、补丁、测试和审阅能力，但不拥有独立 runtime。

```text
Product intent
  -> AgentRuntimeClient
  -> Desktop Host bridge / App Server JSON-RPC
  -> RuntimeCore
      -> CodingProfile resolver
      -> Provider / model slot resolver
      -> Tool inventory / policy resolver
      -> Thread / Turn / Task / Action / Event store
  -> ExecutionBackend
      -> file tool
      -> patch tool
      -> shell / test tool
      -> search / context tool
      -> MCP / browser tool
  -> RuntimeEvent stream + ReadModel
  -> AgentUI projection
  -> Coding Workbench UI
```

## 分层职责

| 层 | 职责 | 不负责 |
| --- | --- | --- |
| Product App | 提供用户意图、项目上下文、业务 refs。 | 写 runtime facts、拼 Provider 请求。 |
| AgentRuntimeClient | 统一传输、订阅事件、读取 read model、响应 action。 | UI 投影和 Provider 调用。 |
| App Server | JSON-RPC current API、Provider store、RuntimeCore owner。 | Electron 壳能力和产品页本地状态。 |
| RuntimeCore | session/thread/turn/task/action/event truth。 | 具体 shell/文件副作用执行。 |
| ExecutionBackend | 文件、补丁、命令、测试、MCP、浏览器等工具执行。 | 保存 UI 状态或解释产品文案。 |
| Policy service | sandbox、permission、approval、network、filesystem 决策。 | 让工具绕过 action.required。 |
| AgentUI projection | 把 facts 转为 messages/timeline/graph/tools/actions/artifacts。 | 从正文猜测执行结果。 |
| Coding Workbench UI | 渲染预览、文件、变更、输出、日志、审批、证据。 | 写事实、调 Provider、执行 shell。 |

## CodingProfile

后续实现应把 coding 需要的运行配置显式建模为 profile，而不是散落在 prompt、前端按钮和工具白名单里。

```ts
interface CodingProfile {
  profileId: "coding";
  modelSlots: {
    base?: string;
    coding?: string;
    review?: string;
    fast?: string;
    local?: string;
  };
  toolSurface: {
    file: boolean;
    patch: boolean;
    shell: boolean;
    test: boolean;
    search: boolean;
    browser: boolean;
    mcp: boolean;
  };
  policyProfile: {
    sandbox: "read_only" | "workspace_write" | "danger_full_access";
    approval: "never" | "on_request" | "on_failure" | "untrusted";
    network: "blocked" | "allowed" | "managed";
  };
}
```

字段名可按 Lime App Server 现有协议调整，但语义必须稳定：模型槽位、工具面和权限面是三组不同事实。

## 模型与 Provider

Coding 能力必须继续走 Lime 多模型主链。

| 能力 | 规则 |
| --- | --- |
| 模型选择 | 通过 Provider Store / Model Registry / profile slot 解析。 |
| 自定义端点 | 作为 Provider Store 的 provider/model entry，不写进产品页本地 key。 |
| coding 模型 | 是一个模型槽位，不等于固定供应商或固定协议。 |
| review 模型 | 可独立槽位，用于代码审阅、测试失败解释、补丁风险总结。 |
| fast 模型 | 可用于标题、摘要、轻量分类，不接管执行主 turn。 |
| fallback | 必须产生 routing / provider diagnostics，不能静默改走 mock。 |

## 工具与执行

Coding profile 的最小工具面：

| 工具 | Runtime facts | UI 投影 |
| --- | --- | --- |
| 读取文件 | `tool.started/result` + file ref | 文件查看、上下文引用。 |
| 写入文件 | `file.changed` + artifact/checkpoint ref | 变更列表、diff、恢复入口。 |
| 应用补丁 | `patch.started/applied/failed` | patch viewer、失败原因。 |
| 命令执行 | `command.started/output/exited` | 输出 / 日志 tab。 |
| 测试执行 | `test.started/completed` | 测试结果、继续修复入口。 |
| 搜索 | `tool.result` + context refs | 上下文来源和引用。 |
| 审批 | `action.required/resolved` | 审批卡，不进入正文。 |
| 沙箱阻断 | `sandbox.blocked` | 阻断状态和可恢复动作。 |

所有副作用都必须有 stable id：`toolCallId`、`actionId`、`artifactId`、`checkpointId` 或等价 owner id。

## 可借鉴并迁入的运行时能力

这些能力值得优先按 Lime 命名和边界重写或迁入：

- Thread / Turn / Item 生命周期。
- 输入队列与 active turn 状态机。
- 工具调用 start/progress/result/failure 配对。
- 补丁应用和 diff 归档。
- 命令执行 policy 和 approval 规则。
- sandbox / filesystem / network 权限 profile。
- 工作区上下文、项目规则和 instruction discovery。
- 大输出截断、spill ref、event projection。
- headless fixture replay 和 JSON event 输出思想。

迁入时必须落到 `lime-rs/crates/**` current owner，不能恢复旧目录或外部 crate 命名。

## 不可迁入的产品壳

以下内容只能参考，不应迁入：

- 原 CLI / TUI / terminal prompt 壳。
- 原 app-server protocol 作为 Lime protocol 替代品。
- 原 home/config 目录作为 Lime 数据根。
- 原单 Provider 认证路径。
- 外部产品的品牌命名、命令名、UI 组件名。
- 任何会让 UI 绕过 RuntimeCore 的本地状态机。

## 与既有 Lime 能力关系

| Lime 现有能力 | 分类 | Coding 目标 |
| --- | --- | --- |
| `code_orchestrated` | compat/current 入口语义 | 映射为标准 coding profile，不再依赖 command 文本。 |
| Project Shell | current execution surface | 接入 RuntimeEvent / policy / projection。 |
| file checkpoint | current artifact support | 作为 patch/file change 的 checkpoint owner。 |
| AgentUI sequence gate | current guard | 扩展覆盖 coding command/patch/test/action 配对。 |
| Workspace Harness 局部面板 | compat UI | 迁到 Coding Workbench shared surfaces。 |
| Agent App runtime projection | current consumer | 可复用 coding task/read model，不复制执行事实。 |

## 架构验收

一次 coding turn 至少能证明：

1. Provider/model 由 App Server current 主链解析。
2. 文件和命令工具执行有 RuntimeEvent。
3. 审批和沙箱阻断不进入正文状态机。
4. 变更、输出、证据能从 read model 恢复。
5. 前端刷新后可通过 hydration 恢复同一工作台状态。
