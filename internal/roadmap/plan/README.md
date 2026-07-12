# Lime Plan Roadmap

> 状态：current planning source
> 更新时间：2026-06-23
> Owner：Lime Agent Runtime / AgentUI / App Server

## 目标

本目录用于沉淀 Lime Plan 能力路线图：把 Codex 的自然计划体验完整对齐到 Lime current 主链，包括 Plan Mode、`update_plan`、`<proposed_plan>`、流式计划事件、计划轨 UI、实施确认、历史恢复、多模型能力协商和 thinking / reasoning 过程展示。

核心目标不是新增一条平行 planner，而是把已有 Lime Agent Runtime 能力补齐为统一计划主链：

```text
Inputbar / 自然语言意图
  -> App Server agentSession/turn/start
  -> RuntimeCore / RuntimeBackend
  -> ModelCapabilityResolver / ProviderRequestAdapter
  -> Plan Mode prompt / update_plan tool / proposed_plan parser
  -> plan.delta / plan.final / reasoning.delta / model.effective / turn read model
  -> AgentUI 计划轨 / 对话内计划块 / thinking 过程行 / 模型推理档位 / 实施确认
```

Codex 是 Plan 主架构参考；opencode 只作为多 Provider request、reasoning event、model variant 和 todo dock 交互的补充参考，不照搬它的 plan file / plan_exit 文件工作流。

## 文档

- [PRD](./prd.md)：完整产品需求、用户故事、用例、Codex/opencode 对齐矩阵、架构、流程、时序、多模型能力设计、thinking/reasoning 事件链、代码结构和验收标准。
- [Implementation Plan](./implementation-plan.md)：骨架优先的实施拆分、阶段退出条件、写集边界和验证入口。

## 边界

本路线图只允许落在 current 主链：

- Rust 后端：`lime-rs/crates/**`，优先 App Server / RuntimeCore / RuntimeBackend / agent tool owner。
- 前端：`src/lib/api/agentRuntime*`、`src/lib/api/agentProtocol.ts`、`src/components/agent/chat/**`。
- 模型事实源：current `model/list`、`modelProvider/*`、`modelProvider/catalog/list`、`modelProvider/fetchModels`，不回退本地旧 catalog。
- 协议：App Server JSON-RPC、AgentEvent、ThreadReadModel、AgentUI projection、`model.effective`、`reasoning.delta/final`。
- UI：AgentChatWorkspace、MessageList、General Workbench task rail、Inputbar、计划实施确认、模型选择、reasoning 档位、thinking 过程行。

禁止新增或恢复旧路径：

- 不恢复 `lime-rs/src/**` 或旧 Tauri command wrapper。
- 不新增 `agent_runtime_*` 作为新业务事实源。
- 不让生产路径回退 mock 或 renderer fallback。
- 不把计划能力做成独立于 Agent Runtime 的第二套任务系统。
- 不伪造 thinking；模型不支持 reasoning 时只降级过程展示，Plan Mode 仍然可用。
- 不把 Provider 私有字段暴露给普通 UI；私有 options 只存在后端 request adapter 边界。

## 验证入口

实现阶段至少覆盖：

```bash
npm run smoke:agent-runtime-current-fixture
npm run test:contracts
```

涉及 GUI 计划轨、输入栏或实施确认时补：

```bash
npm run verify:gui-smoke
```

涉及 Rust runtime / RuntimeBackend 计划事件时先跑受影响 Rust 定向测试，再按风险补全量校验。

涉及多模型与 thinking / reasoning 时补：

```bash
npm run test:contracts
```

并增加覆盖 Codex/OpenAI、Anthropic、Gemini、OpenAI-compatible、无 reasoning 模型的 current fixture 或定向单测。
