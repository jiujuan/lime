# S7m Image Workbench Boundary Guard Alignment Evidence

## 结论

图片工作台边界守卫已对齐当前组合链：`AgentChatWorkspace` 只装配
`useWorkspaceSendSurfaceRuntime`，send surface 再委托 `useWorkspaceImageWorkbenchRuntime`。本切片只
修正 test-only 静态守卫，没有修改图片工作台、发送链、GUI、协议或 Rust 的生产行为。

## 边界

- `current`：`AgentChatWorkspace -> useWorkspaceSendSurfaceRuntime -> useWorkspaceImageWorkbenchRuntime`
  是唯一继续演进的组合链。
- 守卫要求顶层 workspace 不再直接调用 image-workbench owner，并要求 send surface 明确调用当前
  owner。
- 既有三段内部 glue 只能留在 `useWorkspaceImageWorkbenchRuntime`；它们不能回流到顶层 workspace
  或 send surface。
- owner 的小文件门槛继续保持 `< 160` 行，避免把拆出的实现重新堆回组合 owner。
- `compat` / `deprecated`：无新增。
- `dead / forbidden-to-restore`：顶层 workspace 或 send surface 重新拼装三段图片 glue 的路径。

## 验证

以下命令验证的是当前共享工作树，不单独声明相邻生产改动归属于本切片：

```text
npx vitest run \
  src/components/agent/chat/AgentChatWorkspace.imageWorkbenchRuntimeBoundaryGuard.test.ts
=> 1 file / 1 test passed

npx eslint \
  src/components/agent/chat/AgentChatWorkspace.imageWorkbenchRuntimeBoundaryGuard.test.ts
=> passed

npx prettier --check \
  src/components/agent/chat/AgentChatWorkspace.imageWorkbenchRuntimeBoundaryGuard.test.ts
=> passed

git diff --check -- \
  src/components/agent/chat/AgentChatWorkspace.imageWorkbenchRuntimeBoundaryGuard.test.ts
=> passed
```

这是 test-only 结构边界校验，不是 GUI smoke 或 Gate B；本切片没有用户可见行为变化，因此没有把
focused guard 冒充产品交付证据。

## 协调

- claim 声明的源码写集只有
  `AgentChatWorkspace.imageWorkbenchRuntimeBoundaryGuard.test.ts`；production image/send owners、
  canonical roster 热区和中央执行计划均为避让区。
- 复核时 S7l、S7m、S7n 的完整 canonical slice claim 均存在，但三个 slice 都没有对应 lock
  owner 文件。该事实不等于自动释放或互斥成立；并行施工仍必须按 claim 的窄写集避让。
- 本次证据收尾只写本 evidence，没有修改 claim、lock、handoff 或中央计划。

S7m focused boundary alignment 完成度：`100%`；smart suite 的继续续跑与 slice 状态同步由
coordinator 处理。

## 聚合收尾

- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed；S7m 为 1/1。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已推进并完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。
