# Harness Engine

Harness 的唯一事实源是 App Server 导出链：

```text
runtime thread/session
  -> evidence/export
  -> agentSession replay / analysis / review export
  -> trend / cleanup / dashboard
  -> GUI
```

运行时 current owner 固定为 `App Server -> lime-agent -> agent-runtime -> model-provider / tool-runtime -> Thread / Turn / Item projection`。Electron 只承接 desktop host；外部 AI 只消费导出制品并给出建议，不成为运行时 owner。

## 约束

- Agent loop、状态机、Thread / Turn / Item、工具生命周期、MCP、Skills、history hydrate 和 GUI 护栏参考 `/Users/coso/Documents/dev/rust/codex`。
- 多模型、多模态 content part、capability 与 provider lowering 只参考 opencode，并收敛到 `model-provider`。
- 已删除的旧 runtime、compat crate、vendor/workspace crate、迁移目录和旧 Tauri 路径属于 `dead / deleted / forbidden-to-restore`，不得作为文档、测试或产品入口。
- evidence、replay、analysis、review、GUI 只消费导出链，不得重建平行的运行时事实。

## 当前入口

- [Harness Engine 治理](../../aiprompts/harness-engine-governance.md)：导出链、信号适用性与最低验证要求。
- [状态、历史与遥测](../../aiprompts/state-history-telemetry.md)：session/thread/turn/read model 与 evidence 的事实源。
- [质量工作流](../../aiprompts/quality-workflow.md)：contract、Rust、GUI 与 Gate B 验证入口。
- [外部分析交接](./external-analysis-handoff.md)：可脱敏的分析输入与人工决策边界。
- [Harness Evals](../../test/harness-evals.md)：replay case、grader 与趋势入口。
