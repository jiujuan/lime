# Hooks 目录

全局共享的 React Hooks。

历史 `useUnifiedChat.ts` compat Hook 已删除。
新 Agent 工作台统一走 `src/components/agent/chat/hooks/index.ts` 暴露的 `useAgentChatUnified`；
底层实现为 `src/components/agent/chat/hooks/useAsterAgentChat.ts`；
如果未来要恢复 General / Creator 能力，也应基于 App Server `agentSession/*`
current 主链重建，不得恢复旧 `agent_runtime_*` 命令入口。

## 相关文档

- 架构设计：`internal/prd/chat-architecture-redesign.md`

## Skill 执行

旧 `useSkillExecution` Hook 与 `SkillExecutionDialog` 独立执行入口已删除。新 Skill
执行必须通过 Agent Runtime turn / SkillTool current 主链，不要在组件或 Hook 中重新接回
旧 `execute_skill` 独立命令。
