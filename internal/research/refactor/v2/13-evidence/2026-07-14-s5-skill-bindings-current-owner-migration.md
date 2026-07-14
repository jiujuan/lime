# S5 Skill Bindings Current Owner Migration

时间：2026-07-14

## 结论

Workspace skill-binding metadata 与读取 consumer 已从 Agent Runtime 聚合入口迁到明确 owner：

- `AgentRuntimeWorkspaceSkillBinding` 直接来自 `agentRuntime/toolInventoryTypes`。
- `listWorkspaceSkillBindings` 直接来自 `agentRuntime/inventoryClient`。
- `skillBindingsCurrentBoundary.test.ts` 同时禁止回绕 `agentRuntime` 根入口与 `agentRuntime/types` 聚合入口。

本切片不改变 binding request、runtime enable metadata、Harness request metadata 或 React hook 行为。

## 分类

- `current`：`toolInventoryTypes.ts`、`inventoryClient.ts` 与直接消费者。
- `compat`：Agent Runtime 根入口和 `types` 聚合入口仍服务尚未迁出的 consumer，本切片不扩展它们。
- `deprecated`：无新增。
- `dead`：已迁出的 skill-binding 聚合 import 对本领域为禁止回流；没有物理删除文件。

## 写集与避让

改动 `workspaceSkillBindingsMetadata`、`harnessRequestMetadata`、Workspace Harness metadata runtime、
Workspace skill-binding read hook 及对应 tests，新增一条 boundary guard。

没有触碰 S6n、AgentChatWorkspace、`useWorkspaceSendActions`、stream/send 热区、协议、Rust 或 Electron。

## 验证

- focused Vitest：4 files / 29 tests passed。
- 精确写集 ESLint：passed。
- 精确写集 Prettier check：passed。
- `npm run typecheck`：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- claimed write set `git diff --check`：passed。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，未升级到 GUI smoke。

## 下一刀

共享工作树当前有 159 个 Agent Chat root-barrel 精确 import。可继续迁出干净的 session/thread、queued-turn
或 execution-strategy consumer；legacy roster DTO 仍等待 S6n handoff 和 AgentChatWorkspace 写窗口。
