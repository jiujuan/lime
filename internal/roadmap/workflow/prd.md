# Workflow 标准化 PRD

> 状态：current planning source
> 更新时间：2026-07-03
> 作用：说明为什么要标准化 Workflow、用户立即获得什么收益，以及用户如何使用。

## 1. 背景

Lime 已经在多个位置出现 Workflow：

1. Plugin manifest 声明 `workflows` 和 `steps`。
2. Plugin worker 在 App Server 侧发出 `workflow.run.* / workflow.step.*` 审计事件。
3. 图片命令复用 workflow audit event 表达生成流程。
4. Skill catalog 暴露 `execution_mode=workflow` 和 `workflow_steps`。
5. General Workbench / Article Workspace 能读取某些 `workflow_runs / workflow_steps` 并展示运行过程。
6. 前端历史上存在旧 `useWorkflow` Hook 与 `WorkflowRuntimeHost` controlled DSL；P6 已将这两条旧实现物理删除，并通过治理目录册防回流。

问题不在于能力缺失，而在于这些能力没有同构合同：

- Definition schema 不统一。
- Run id / step id / task id / turn id 的关联不稳定。
- Step status 多套并存。
- Read model 对 workflow facts 的态度不一致。
- Evidence / Replay / GUI 需要在不同位置补 heuristics。
- Plugin iframe 与宿主 runtime 的 owner 边界容易混淆。

## 2. 即时收益

标准化后，用户和开发者应立即获得这些收益：

| 角色 | 即时收益 |
| --- | --- |
| 普通用户 | 看到“任务正在做什么、卡在哪、能否重试”，而不是只看到一段聊天或一个失败 toast。 |
| 内容创作者 | 写文章、配图、研究、发布等复杂任务可以恢复、重试、查看输出和证据。 |
| 插件开发者 | 只声明 workflow definition，不需要复制 Agent runtime 或前端 DSL。 |
| 维护者 | 可以用同一组 runtime facts 定位失败，不再分别查 message、tool log、artifact 和插件 storage。 |
| 测试与发布 | Workflow 可通过 fixture、event replay、read model 和 GUI smoke 同时验证。 |

## 3. 用户故事

| 编号 | 用户故事 | 验收口径 |
| --- | --- | --- |
| WF-01 | 作为用户，我输入“写一篇带封面的公众号文章”，希望系统自动完成检索、写作、配图和保存。 | 产生一个 workflow run，包含可读步骤、状态、产物和 evidence refs。 |
| WF-02 | 作为用户，我看到某一步失败时，希望能知道失败原因并重试该步或整个 workflow。 | `workflow.step.failed` 有稳定 reason，重试产生 `workflow.step.retrying / workflow.run.retrying`。 |
| WF-03 | 作为用户，我关闭并重新打开 Lime 后，希望还能看到刚才 workflow 的进度和结果。 | Workflow Read Model 可从 durable facts 恢复，不依赖前端内存状态。 |
| WF-04 | 作为插件开发者，我想在 manifest 中声明 workflow，不想自己写后端 worker。 | Manifest steps 被转换为统一 definition，并由 App Server RuntimeCore 执行。 |
| WF-05 | 作为专家/Skill 作者，我希望 workflow 步骤能引用 skill、subagent 和 expected output。 | Definition 支持 `skillRefs / subagentRef / expectedOutput`，执行时生成 step-level facts。 |
| WF-06 | 作为 QA，我想回放一次 workflow 失败。 | Evidence / Replay 使用同一个 `workflowRunId` 关联所有 step、tool、artifact 和 failure。 |
| WF-07 | 作为产品维护者，我不希望图片生成把内部 workflow 细节暴露给普通聊天区。 | 用户可见 UI 显示自然进度和结果，内部 workflow facts 只在运行详情/诊断面板可见。 |

## 4. 用户使用路径

### 4.1 内容 workflow

```text
用户输入目标
  -> Lime 识别内容工厂 workflow
  -> App Server 创建 workflow run
  -> Runtime 执行检索 / 写作 / 配图 / 证据记录
  -> Workspace 展示进度和产物
  -> 用户查看、编辑、导出或重试
```

### 4.2 插件 workflow

```text
用户打开插件入口
  -> 插件 manifest 提供 workflow definition
  -> Plugin surface adapter 提交 workflow.start
  -> App Server RuntimeCore 执行
  -> 插件 iframe 只订阅投影事件
  -> 结果写回 storage / artifacts / evidence
```

### 4.3 图片 workflow

```text
用户提出图片需求
  -> 图片意图解析进入 image_command_workflow
  -> Runtime 记录 workflow audit facts
  -> 图片任务 worker 执行
  -> 聊天区展示自然语言进度和最终图片
  -> 诊断 / Evidence 可追踪 workflowRunId
```

## 5. 功能范围

### 5.1 必须做

1. 定义统一 Workflow Contract：
   - `WorkflowDefinition`
   - `WorkflowRun`
   - `WorkflowStep`
   - `WorkflowEvent`
   - `WorkflowReadModel`
2. 统一 StepStatus：
   - `queued`
   - `running`
   - `waiting`
   - `completed`
   - `failed`
   - `canceled`
   - `retrying`
   - `skipped`
3. App Server RuntimeCore 创建和恢复 workflow run。
4. Plugin manifest steps 转换为统一 definition。
5. Skill workflow steps 只作为 definition source 或 catalog presentation，不再当执行合同。
6. Workflow facts 进入 durable read model。
7. Evidence / Replay / GUI 以 `workflowRunId` join。
8. 对 deprecated / dead 入口补治理守卫。

### 5.2 本阶段不做

1. 不做可视化拖拽 workflow builder。
2. 不把 workflow 做成云端多租户编排服务。
3. 不复制 Temporal、Airflow 或 GitHub Actions 的完整 DAG 能力。
4. 不让 Plugin iframe 自带生产 workflow runtime。
5. 不在普通聊天消息中展示内部 step rail。
6. 不一次性重写所有旧 Skill 和 Plugin 包；先做合同和 current 主链。

## 6. 产品原则

1. **用户看任务，不看内部实现。**
   普通体验只展示“正在检索 / 正在写作 / 已生成图片”等自然状态；内部 workflow facts 用于运行详情、诊断和证据。

2. **开发者声明目标，不复制 runtime。**
   Plugin / Skill / Expert 只声明 workflow 需要哪些能力，由 RuntimeCore 执行和审计。

3. **失败必须可解释。**
   每个 failed step 至少有 `reasonCode / message / retryPolicy` 中的稳定事实。

4. **恢复优先于漂亮动画。**
   先保证关闭重开后状态准确，再做更丰富的前端展示。

5. **可审计优先于一次性成功。**
   Workflow 的价值是长任务可追踪、可恢复、可回放，不是把多步过程藏在一条 assistant 消息里。

## 7. 验收指标

1. `workflow.run.started -> workflow.run.completed|failed|canceled` 成对出现率可由结构测试验证。
2. 任一 step terminal event 必须包含 `workflowRunId / stepId / status / updatedAt`。
3. GUI 运行详情不从 message 文本推断 workflow 状态。
4. Evidence summary 能列出 workflow run ids。
5. Plugin manifest workflow 与 App Server Workflow Definition 有一组 fixture 映射测试。
6. 旧 `useWorkflow` 不再作为新入口引用，且旧文件保持删除状态。
7. 前端 `WorkflowRuntimeHost` 不出现在生产 AI workflow 调用链，且旧 DSL runtime 文件保持删除状态。
