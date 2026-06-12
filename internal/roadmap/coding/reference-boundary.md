# Coding 参考边界

> 状态：draft
> 更新时间：2026-06-12

## 目标

本文件定义 Lime 借鉴外部编程 agent 项目时的边界：能复制什么、必须重写什么、哪些内容不能进入 Lime。

核心原则：

```text
参考实现可以提供算法、状态机、测试夹具和执行经验；
Lime 只能保留 Lime 的 owner、命名、协议、Provider、UI 和治理分类。
```

## 命名规则

新文档、crate、package、type、command、method、UI 文案中禁止保留外部产品品牌和品牌前缀。

推荐命名：

| 语义 | 推荐 |
| --- | --- |
| 编程剖面 | `coding profile` / `CodingProfile` |
| 执行器 | `ExecutionBackend` / `coding backend` |
| 外部 CLI 兼容 | `external_harness` |
| 补丁工具 | `patch tool` / `PatchView` |
| 命令工具 | `command tool` / `CommandOutputView` |
| 事件适配 | `runtime event adapter` |
| 多模型槽位 | `model slot` |

避免命名：

- 外部产品名。
- 外部 CLI command 名作为 Lime current API。
- `lime_` / `lime-` 品牌前缀，除非历史兼容或对外发布要求。

## 代码复制规则

| 来源类型 | 允许动作 |
| --- | --- |
| Apache-2.0 或兼容许可证 | 可复制小范围实现，但必须保留许可证要求、重命名、适配 Lime owner，并补测试。 |
| AGPL 或强 copyleft 来源 | 不复制代码，只参考设计和行为。 |
| 未明确许可证代码 | 不复制。 |
| 生成 schema / OpenAPI models | 不复制为 Lime 协议事实源，只可参考字段设计。 |
| 文档/README 思路 | 可转成 Lime 自有设计，但不得保留品牌、营销语或不适用架构。 |

复制前必须先回答：

1. 这个能力的 Lime owner 是谁？
2. 是否会形成第二套事实源？
3. 是否绕过 Provider Store、RuntimeCore、Artifact 或 Evidence owner？
4. 是否有许可证义务？
5. 是否能用 Lime 当前验证入口证明？

## 可复制/重写的内容

优先级从高到低：

1. 状态机：thread/turn/item、active turn、input queue。
2. 工具生命周期：start/progress/result/failure pairing。
3. 文件与补丁：patch apply、diff、checkpoint metadata。
4. 命令执行：PTY/process、stdout/stderr streaming、exit status。
5. 权限策略：approval、sandbox、command policy。
6. 事件投影：headless event、fixture replay、sequence verifier。
7. 上下文组装：project rules、workspace roots、instruction discovery。
8. 输出治理：truncation、spill refs、redaction。

复制后必须改成：

- Lime event family。
- Lime error category。
- Lime Provider slot。
- Lime artifact/evidence refs。
- Lime i18n presentation copy。

## 只能参考的内容

- 终端型产品的信息架构。
- 多 harness selection 的产品概念。
- 外部 CLI agent 的 session notification 协议。
- skill provider discovery 的目录优先级思想。
- 云端任务环境、worker、remote execution 的产品分层。
- UI 视觉和布局节奏。

这些内容进入 Lime 时必须重新设计，不能复制框架、组件、品牌、协议或服务端假设。

## 禁止进入 Lime 的内容

- 第二套 app-server 或 runtime owner。
- 第二套 Provider key 存储。
- 原 CLI/TUI 作为生产主入口。
- 以外部 home/config/data root 为 Lime 数据根。
- 产品页读取 local key、环境变量或外部 CLI 凭证作为生产 fallback。
- UI 组件直接调用 Provider SDK。
- mock backend 生产自动 fallback。
- secret-bearing raw payload 进入 projection state。
- 恢复 `lime-rs/src/**` 或旧 command wrapper。

## 多模型边界

Lime 的 coding 能力必须保持多模型。

| 问题 | 决策 |
| --- | --- |
| 是否绑定单一模型服务 | 否。coding 使用 Provider Store + model slots。 |
| 是否允许自定义 OpenAI-compatible 端点 | 允许，但作为 Provider Store entry。 |
| 是否允许不同槽位用不同模型 | 允许，base/coding/review/fast/local 分离。 |
| 是否允许外部 CLI 自己选模型 | 只在 compat adapter 内记录 diagnostics，不成为 Lime routing truth。 |
| 是否允许模型不可用时 mock | 生产不允许，必须 needs-setup / blocked。 |

## 前端边界

Coding Workbench 的 UI 只消费 projection：

```text
AgentUiProjectionState
  -> coding selectors
  -> Coding Workbench surfaces
```

禁止：

- 页面组件订阅 raw runtime stream 后自建状态。
- 页面组件直接调用 shell / file / Provider API。
- 页面组件从正文解析工具结果。
- 页面组件把审批结果只存 React state。

允许：

- 保存 selected tab、collapse、focus、scroll anchor、draft input。
- 通过 runtime client 提交 `turn/start`、`turn/cancel`、`action/respond`。
- 打开 artifact/evidence owner surface。

## 许可证与证据

后续任何代码迁入都必须在对应 PR 或执行计划中记录：

- 来源路径。
- 许可证。
- 迁入文件。
- 重命名和 owner 映射。
- 定向测试。
- 是否触及生产 Provider、文件系统、命令执行或权限。

如果来源许可证不清楚，默认只参考，不复制。

## 文档措辞

内部 roadmap 可使用能力描述：

- “执行型 Rust runtime”
- “终端型多 harness 客户端”
- “外部 CLI harness”
- “云端 orchestration layer”
- “多模型 Provider registry”

不要使用外部产品品牌来命名 Lime current 能力。历史分析可以留在聊天或研究笔记中，但进入 `internal/roadmap/coding/` 的路线图必须使用 Lime 语义。
