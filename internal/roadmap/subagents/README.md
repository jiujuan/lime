# Subagents 路线图

## 目标

`/subagents` 对齐成熟终端代理的 subagents 行为：它是本地 slash command，用于启用、展示或切换子代理线程状态；它不是 Team 选择器，不是任务分工弹窗，也不是协作画布 / dock / workbench。

参考事实：

- `/subagents` 是本地 TUI 事件，不把命令文本发给模型。
- `/agent` 与 `/subagents` 都进入本地 agent picker，picker 标题使用 `Subagents`。
- Subagents 导航只维护 thread entry、稳定顺序、label、running/closed 状态和 active thread，不提供 Team profile 配置 UI。

## 当前事实源

### current

- 聊天输入中的 `/subagents` 是本地 slash action，命中后只调用 `onOpenSubagents`，不发送给模型，不走 mock，不新增 Electron IPC 或 App Server JSON-RPC 命令。
- 输入栏 plus menu 的 Subagents 状态只表达当前 turn 可使用 Subagents/thread runtime，不打开 Team picker、Team profile editor 或协作工作台。
- Subagents 运行态展示继续收敛到 runtime projection / workspace scene runtime：
  - `src/components/agent/chat/team-workspace-runtime/liveRuntimeProjector.ts`
  - `src/components/agent/chat/team-workspace-runtime/runtimeEventSubscriptions.ts`
  - `src/components/agent/chat/team-workspace-runtime/runtimeStateReconciler.ts`
  - `src/components/agent/chat/workspace/useWorkspaceTeamSessionRuntime.ts`
- App Server / RuntimeCore 后续若提供 first-class subagent thread list，前端只允许接到 Subagents/thread projection，不得恢复 Team 配置面。

### compat

- `TeamDefinition`、`selectedTeam`、`recent_team_selection`、`teamWorkspaceRuntime`、`useTeamWorkspaceRuntime`、`lime.chat.team_selection.v1.general` 仍是历史兼容命名，只能承载现有 runtime metadata / session projection。
- 兼容字段可以继续被发送边界读取，但不允许重新变成用户可见 Team 概念、profile 编辑器、任务分工模板或自定义 Team 存储入口。
- 退出条件：App Server / RuntimeCore 提供 current `SubagentThread` / `SubagentProfile` 事实源后，将上述 compat 命名迁成 subagent/thread 语义，并删除不再被 current projection 使用的存储 key。

### dead

- `TeamSelector`、`TeamSelectorPanel`、`inputbarTeamSelectorCopy`。
- `TeamSuggestionBar`、`teamSuggestion` 主动评分推荐条、`onEnableSuggestedTeam` / `handleEnableSuggestedTeam` / `enableSuggestedTeam` 旧 preset 写入口。
- Team 选择弹窗、Team profile editor、自定义分工的新建 / 编辑 / 删除 / 复制入口。
- 自定义 Team 克隆 / 本地写入入口：`cloneTeamDefinitionAsCustom`、`saveCustomTeams`、`buildWorkspaceSettingsWithCustomTeams`、`lime.chat.custom_teams.v1`。
- Team 画布、Team workspace board、Team dock 与 Team summary panel。
- Team memory shadow card / panel、AgentUI 旧协作操作 surface 以及 `team-workspace-board/` 整个目录。
- `empty-state-team-selector`、`team-selector-stub` 等旧 test id / DOM surface。
- `agentChat.inputbar.teamSelector.*` 与 Team canvas / board / dock / formation / selectedSession / activityPreview / operations / canvasLane / teamPreset i18n key。
- `agentChat.inputbar.teamSuggestion.*` i18n key 与 `team-suggestion-bar` DOM surface。

## 实施约束

1. `/subagents` 必须保持本地 command：执行后返回 handled，不调用 `rawSendMessage`，不把 `/subagents` 文本送入模型。
2. UI 只展示 Subagents/thread/runtime 状态；不得弹 TeamSelector Popover，不得打开 TeamSelectorPanel，不得出现 Team 画布或旧协作工作台。
3. 新增用户可见文案必须使用 Subagents / 子代理语义，并覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
4. 治理守卫必须阻止旧 Team UI 文件、路径、props、test id 和 i18n key 回流。
5. 保留的 `team*` compat 命名必须标明用途和退出条件，不能继续承接新功能。

## 本轮实施切口

1. 删除 Team selector/panel/canvas/workbench/dock 用户可见实现和测试。
2. `/subagents` 接到本地 executor 与输入栏 Subagents 状态，不再走弹窗式 Team 配置。
3. 清理 Team selector/canvas/workbench i18n key 与组件索引。
4. 补治理目录册和质量脚本守卫，防止旧 Team UI surface 回流。
5. 用定向单测、i18n 测试、治理报告和 contract 测试验证本地 command 与旧入口清退。

## 2026-06-10 实施记录

- 已删除 `TeamSelector` / `TeamSelectorPanel` / `inputbarTeamSelectorCopy`，`/subagents` 保持本地 command，不再触发任务分工弹窗。
- 已删除 Team 画布、Team workspace board、dock、summary panel、memory shadow card 和 `team-workspace-board/` 目录；Subagents 展示回到 runtime projection / thread 状态主链。
- 已删除 `TeamSuggestionBar` 与 `teamSuggestion` 主动推荐链；复杂输入不再弹出或插入推荐条，Subagents 只通过显式 `/subagents`、工具状态和线程展示进入。
- 已删除未使用的自定义 Team 克隆与本地 `custom_teams` 写入入口；workspace settings 中的历史 `customTeams` 只保留只读 compat 解析。
- 已把用户可见文案从 `Team current tools`、`Team Memory`、`Team member`、`teammate` 等改为 Subagents / 子代理语义；兼容 key 仅保留在协议、storage 和 runtime metadata 边界。
- 已补 `legacySurfaceCatalog` dead surface 守卫，覆盖旧文件、路径、props、test id、Team 画布术语和旧展示文案，防止后续恢复。

## 后续退出条件

- Runtime 提供 first-class Subagents thread/profile schema 后，迁掉 `TeamDefinition` / `selectedTeam` / `recent_team_selection` 等 compat 命名。
- `agentTeamWorkspace` namespace 只剩 current runtimeStatus / liveRuntime / control 文案后，评估是否改名为 Subagents namespace。
- 若 `teamMemorySnapshot` 仍只作为历史 metadata 展示，保持只读 compat；若无 current 消费，按 `dead` 删除并补守卫。
