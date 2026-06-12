# Lime Coding Workbench 路线图

> 状态：draft
> 更新时间：2026-06-12
> 范围：Lime 在 Agent Workbench 标准下的编程能力、执行运行时、文件/命令/补丁工具、前端 Coding Workbench 渲染与验收。

## 主目标

把 Lime 的编程能力收敛成 Agent Workbench 标准下的一个 `coding profile`，而不是新增第二套 runtime、第二套聊天入口或第二套 CLI 主链。

固定主链：

```text
User coding intent
  -> App Server JSON-RPC
  -> RuntimeCore thread / turn / task / action facts
  -> ExecutionBackend coding tools
  -> RuntimeEvent / ThreadReadModel / TaskSnapshot
  -> AgentUI projection
  -> Coding Workbench UI
```

外部参考只能提供实现素材和结构经验。进入 Lime 后，事实源、命名、协议、Provider、UI 投影和验证都必须服从 Lime current 架构。

## 标准事实源

| 层 | current 事实源 | 禁止方向 |
| --- | --- | --- |
| 标准 | `/Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench` | 把外部 SDK 或 CLI 协议当 Lime 标准。 |
| Runtime API | App Server JSON-RPC + RuntimeCore | 恢复 legacy desktop facade 或产品页本地 runtime。 |
| 执行 | ExecutionBackend + Tool inventory + Policy service | 让模型自由拼 shell 作为长期主路径。 |
| Provider | API Key Provider / Provider Store / Model Registry | 单 Provider 假设或产品应用直连模型 API。 |
| UI | AgentUI projection + shared Coding Workbench surfaces | 从 assistant prose 推断工具、文件、审批、测试状态。 |
| 证据 | Evidence pack / replay / review refs | UI 或日志后处理重新构造运行事实。 |

## 用户闭环

目标用户用自然语言让 Lime 创建、修改、测试、审阅或解释代码项目。

最小闭环：

1. 用户提交编程意图。
2. Runtime 选择 coding profile 与模型槽位。
3. Agent 读取上下文、执行文件/命令/补丁工具。
4. UI 实时展示计划、工具、文件变更、输出、审批和预览。
5. 用户审批、拒绝、继续修复或审阅变更。
6. Artifact / Evidence 可导出和回放。

完成标准不是“模型能改文件”，而是用户能在同一个工作台里看到：当前在做什么、改了哪些文件、命令输出如何、哪里被权限拦住、下一步如何继续。

## current / compat / deprecated / dead

### current

- Agent Workbench 标准下的 `coding profile`。
- App Server `agentSession/*` current 主链。
- RuntimeCore session / thread / turn / task / action / event facts。
- ExecutionBackend 的文件、命令、补丁、测试、搜索、MCP、浏览器执行面。
- `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack`。
- `@limecloud/agent-ui-contracts`、`@limecloud/agent-runtime-projection`、`@limecloud/agent-runtime-ui`、`@limecloud/agent-runtime-client`。
- Coding Workbench 只消费 AgentUI projection state。

### compat

- 旧 `code_orchestrated` scene runtime 可作为 coding profile 的现有入口语义，但后续必须映射到标准 RuntimeEvent / ReadModel。
- 外部 CLI agent 会话可作为 `external_harness` adapter，但只能输出 RuntimeEvent，不能拥有主事实。
- 现有 Workspace / Harness 局部状态可短期作为迁移缓存；接入标准 projection 后必须退出。

退出条件：同一状态能从 RuntimeEvent + ReadModel 重建后，删除本地缓存或只保留 UI collapse/focus/draft。

### deprecated

- 编程 UI 自建过程状态机。
- 从正文推断文件变更、工具结果、测试成功、审批完成。
- 产品页直接读取 Provider key 或环境变量。
- 把 CLI 当成模型规划层或长期执行入口。
- 为编程能力新增一组平行命令协议。

### dead

- 恢复 `lime-rs/src/**` 或旧 Tauri command wrapper。
- 新增第二套 app-server、第二套 Provider store、第二套 artifact/evidence truth。
- mock runtime 作为生产 fallback。
- 无 session/thread/turn/action/tool correlation 的编程事件。

## 文档索引

| 文档 | 作用 |
| --- | --- |
| [architecture.md](./architecture.md) | Coding profile 的运行时、工具、Provider、UI 和证据架构。 |
| [ui-projection.md](./ui-projection.md) | 前端 Coding Workbench 如何消费 AgentUI projection。 |
| [runtime-capability-map.md](./runtime-capability-map.md) | 外部参考能力到 Lime current 落点的迁移分类。 |
| [implementation-plan.md](./implementation-plan.md) | 分阶段落地计划、验收和测试入口。 |
| [reference-boundary.md](./reference-boundary.md) | 参考外部实现时的命名、许可、复制和禁止边界。 |

## 下一刀

第一刀只做标准和能力盘点：把已有 `code_orchestrated`、Project Shell、file checkpoint、AgentUI projection、runtime event sequence gate 与 coding profile 对齐，确认哪些能力已经 current，哪些仍是 compat 缓存。

之后再进入实现：优先补 RuntimeEvent / ReadModel / Projection fixture，不先堆 UI 或复制 CLI 壳。
