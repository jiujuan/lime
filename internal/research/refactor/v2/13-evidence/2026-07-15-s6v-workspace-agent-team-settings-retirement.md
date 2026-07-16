# S6v2 Workspace Agent Team Settings Retirement

日期：2026-07-15

## 事实源判断

`WorkspaceSettings.agentTeam` 没有 current GUI、App Server、RuntimeCore 或存储消费者，只有 TypeScript/Rust DTO、serde 正向测试和历史 GUI fixture。Multi-Agent 的 current owner 是 AgentControl 工具、canonical child Thread 与 Thread/Turn/Item projection，不是 workspace Team picker。

## 已删除

- TypeScript `WorkspaceTeamSelectionReference`、`WorkspaceAgentTeamRoleSettings`、`WorkspaceAgentCustomTeamSettings`、`WorkspaceAgentTeamSettings` 和 `WorkspaceSettings.agentTeam`。
- Rust 对应 Team DTO、`WorkspaceSettings.agent_team` 字段及默认值。
- Rust legacy snake_case/camelCase Team serde 正向断言。
- Workspace conversation/send/harness metadata 正向 Team fixture（shadow fixture 同时在前序 S6u 删除）。

## 保留边界

- `harnessRequestMetadata`、`submitOpRuntimeCompaction` 和 boundary tests 中的旧 Team key 只用于阻止回流，不能作为 producer/read model/正向 fixture。
- `subagentTeamTools` 是 AgentControl 工具能力可用性 current 字段，与被删除的 workspace Team 设置无关。

## 分类

- `current`：Workspace 通用设置、AgentControl/canonical child Thread。
- `compat -> dead`：workspace `agentTeam` 设置 DTO，已删除。
- `deprecated`：无新增。
- `dead`：Team picker/custom team workspace owner 及其正向 fixture。

## 退出条件

- `rg` 在 current 源码中不再命中 `WorkspaceAgentTeam*`、`WorkspaceTeamSelection*`、`agentTeam`、`agent_team`。
- Rust core workspace tests、TypeScript typecheck、contracts、governance scan 通过。
