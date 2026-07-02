# 图片能力 v2 路线图

更新时间：2026-07-02
状态：current 重构中
Owner：Agent Runtime / Command Runtime / Media Runtime / Workspace

## 结论

图片能力 v2 不再把 `@配图` 的成功交给模型自由决定是否调用工具，也不把缺参数当成失败。`@配图`、`@修图`、`@重绘`、文稿 inline 配图和显式图片模型标签都统一进入可恢复 command workflow：

```text
IntentDetected -> NeedsContext/ReadyToSubmit -> App Server ImageCommandWorkflow -> Media Runtime worker -> UI projection
```

Agent 仍可以参与理解、寒暄式确认、补参、生成更好的 prompt 和记录过程，但不能拥有“是否创建图片任务”的最终决定权。只要参数满足最小合同，后端必须创建标准 `.lime/tasks/image_generate/*.json` task artifact；参数不足则进入明确的 `NeedsContext/action_required` 或 `runtime_status` 状态；其中 `project_root_path` 属于系统上下文，会先自动补齐默认项目，不会要求用户手填。创建失败才暴露真实错误。

## 为什么需要 v2

当前图片主链已经具备 Provider catalog、App Server worker、Media Runtime adapter、任务恢复和 UI task card。但 `@配图` 首发路径曾保留几个核心缺陷：

1. 旧链路把图片命令伪装成 `Skill(image_generate)` 首发，成功依赖模型自觉调用工具。
2. 缺少项目、prompt、参考图或模型配置时，系统把可恢复补参当成 `tool.failed`，最终又被“模型未输出最终答复”守卫误判。
3. 图片 Provider / 图片模型可能污染普通 Agent Chat 的 `providerPreference/modelPreference`。
4. `.lime/tasks/**/*.json` 内部快照曾被当成普通聊天 artifact，干扰图片轻卡。

这是架构问题，不是单点 bug。图片命令是产品确定性工作流，不是开放式 Agent 自由对话。开发期没有历史包袱，因此 v2 直接替换旧首发链路，不做长期双轨兼容。

## 设计文档

- [产品需求](./product-requirements.md)
- [架构方案](./architecture.md)
- [流程与时序](./flows.md)
- [Workflow 审计转译规则](./workflow-reference.md)
- [实施与清理计划](./implementation-plan.md)
- [进度记录](./progress.md)

## 外部参考原则

本设计采用的原则：

- workflow 用于路径固定、验收明确的产品动作。
- agent 用于开放式推理、规划、补参和调用可选工具。
- 必须产生业务状态的动作不能依赖自然语言 prompt 诱导。
- 缺参数是 `input_required / action_required`，不是失败；失败和等待用户输入必须分开。项目上下文先由系统自动补齐默认项目，不把内部 `project_root_path` 暴露给用户。
- 内部 tool/task metadata 只能进入 `_meta` / read model / 诊断明细，不应暴露成聊天正文。
- 复杂流程用渐进披露：主 UI 只展示当前阶段、结果和下一步，技术明细默认收纳。

参考资料：

- Microsoft Human-AI Interaction Guidelines：`https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/`
- Model Context Protocol Tasks / Elicitation：`https://modelcontextprotocol.io/specification/draft/client/elicitation`
- OpenAI Apps SDK tool results / `_meta`：`https://developers.openai.com/apps-sdk/reference/`
- NN/g Progressive Disclosure：`https://www.nngroup.com/articles/progressive-disclosure/`

## v2 范围

必须覆盖：

- `@配图`
- `@修图`
- `@重绘`
- 普通自然语言图片意图，例如“画一张广州夏天的图”
- 统一目录声明的图片模型标签，例如 `@Nano Banana 2`、`@GPT Images 2`
- 文稿 inline 配图、封面图、图片工作台变体 / 编辑
- Provider / model 默认值解析
- task artifact 创建、worker 执行、恢复和 UI 投影

不再保留为 current：

- `Skill(image_generate)` 作为首发执行事实源
- prompt 强约束模型“必须调用工具”作为成功条件
- fast-response direct answer 下的图片命令纯文本成功
- 前端直接创建图片任务绕过 Agent turn 记录
- renderer-side worker 直连图片服务
- `model=default`、`provider_id=null`、`executor_mode=direct` 等假任务占位
- `image_task.parameters.required -> tool.failed -> empty final` 的失败化补参链路
- 图片模型 Provider 写入普通聊天 `providerPreference/modelPreference`

## 完成标准

v2 不能只以单测通过为完成。完成必须同时满足：

1. 图片命令发送后，App Server 侧确定性产生 `image_task.created` 或明确补参 / 失败状态。
2. UI 在同一 turn 内必定看到图片任务轻卡或可解释错误，不再只出现纯文本“正在生成”。
3. 普通文本 Expert Panel / Agent Chat follow-up 不继承图片 Provider / 图片模型。
4. `Skill(image_generate)` 从 current 首发链路退场，仅允许作为迁移 guard 或手工兼容入口短期存在。
5. `npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000` 通过。
6. `npm run smoke:agent-runtime-current-fixture` 通过，且不允许 live provider / mock backend / renderer fallback。

## 参考图的正确用法

参考图不作为视觉复刻对象。它值得吸收的是 workflow 信息结构：

```text
用户请求
  -> assistant 给出本次生成计划摘要
  -> 一个父级生成运行
  -> 多个可独立完成的结果分支
  -> 每个分支有状态、产物和后续动作
```

落到 Lime 后，应表达为 `ImageCommandRunSnapshot`，而不是移动端聊天卡：

- 父级运行：本次图片命令，例如“生成 2 张淘宝主图”。
- 阶段步骤：解析需求、确认路由、创建任务、生成分支、回填结果，只进入 JSONL 审计流。
- 结果分支：标准白底 / 浅灰底主图、轻氛围感电商主图等，可以在 JSONL 中独立排队、运行、成功、失败或重试。
- 结果卡：消费 task artifact / output preview，不从 assistant 文本生成。
- 后续动作：继续生成同风格、替换模型、重试失败分支、回填到文稿或工作台，作为内部动作状态和审计记录保留。

Lime 不应复刻参考图里的移动端顶部 tab、紫色气泡、窄屏大卡样式；聊天区只保留自然铺垫、轻量图片卡、最终图片和 caption，右侧也不展示 workflow 步骤、分支导轨、task id、artifact path 或原始 JSON。workflow/run/step/branch 只写入 JSONL 审计流，供未来排查和 fixture 断言使用。具体转译规则见 [Workflow 审计转译规则](./workflow-reference.md)。
