# S4ae / S6i aggregate Gate resume evidence

日期：2026-07-14

## 结论

S4ae 的 ENOSPC blocker 已关闭，S6i 的 Renderer fake Team formation 删除也已完成。
fresh Renderer + Electron 证据证明通用 GUI 主路径可用；完整
`smoke:agent-runtime-current-fixture` 尚未全绿，当前唯一已观察 blocker 是独立
`skills-runtime` fixture 进入 Provider 鉴权失败，而不是 SubAgent、Team 删除或 bridge 回归。

建议状态更新为：

`implementation-complete / GUI-smoke-and-home-hotpath-validated / aggregate-skills-fixture-blocked`

## 并发构建根因

首次恢复 aggregate Gate 时，Vite 正在读取 S6i active write set。`AgentChatWorkspace.tsx`、
`useWorkspaceTeamRuntime.ts` 和 `useWorkspaceSendActions.ts` 的 mtime 落在构建窗口内；生成 bundle
因此捕获到删除中的中间态，启动时报 `setRuntimeTeamDispatchPreview is not defined`。

这不是缺少兼容 setter。S6i 完成后的源码与 boundary guard 均禁止
`runtimeTeamDispatchPreview`，fresh bundle 也不再包含该符号。稳定构建后的 home-hotpath 重新运行：

- summary `ok=true`。
- Electron/preload、App Server JSON-RPC、external fixture backend、GUI user/assistant message、
  terminal read model 与输入框恢复等全部注册断言为 true。
- actionable console error 为 0。

因此根因是共享 `dist` 在 active source write 期间构建，不应通过恢复 dead setter 修补。

## Aggregate fixture

稳定产物上的 aggregate run 已通过 14 个已落 summary 的场景，包括 home、image、approval、
cancel/continue、inputbar queue/restore 和 plan history hydrate。随后 `skills-runtime` 失败：GUI
显示 Provider API Key / Base URL 鉴权错误，未得到 fixture 期望的 assistant summary；该场景
summary `ok=false`，aggregate 在此停止，后续场景未冒充执行。

该 blocker 与 S4ae canonical SubAgent GUI、S6i fake Team preview 删除没有共享事实边界，应由
Skills fixture / provider setup owner 单独处理。

## GUI smoke

`npm run verify:gui-smoke`：exit 0。

- Renderer loaded。
- App Server ready：`protocol=appserver.v0`、`version=1.102.0`。
- App Server initialized。
- Claw workbench shell ready。
- memory settings ready。

构建期间 `install_name_tool` 曾报告一次 target binary 临时 rename 竞争，但 smoke 仍使用已准备
sidecar 完成真实初始化并 exit 0。后续共享 Gate 应继续保持单一 Cargo / Electron build owner，
避免把 artifact race 当产品回归。

## 治理与下一刀

- `current`：RuntimeCore AgentControl、canonical SubAgent Item、fresh Renderer 与真实 App Server GUI
  主链。
- `compat`：无新增。
- `deprecated`：S6i handoff 已登记的 `team-workspace-runtime/**` 第二状态/stream sidecar。
- `dead / deleted / forbidden-to-restore`：Renderer Team formation、dispatch preview、虚拟 member event
  与伪消息。

下一刀按 S6i handoff 进入 S6j：删除 `useTeamWorkspaceRuntime`、`team-workspace-runtime/**`、
session/control wrapper 和 unavailable stub；同时由 Skills fixture owner修复独立鉴权配置后续跑
aggregate。执行计划仍是其他已完成切片的脏共享事实源，本轮只提供新 evidence/handoff，等待
coordinator 合并状态，避免夹写。
