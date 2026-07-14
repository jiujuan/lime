# S6i dead Team formation / preview evidence

日期：2026-07-14

## 结论

发送前的 Renderer Team formation 与 dispatch preview 已删除。旧链路按输入长度/正则和
selected Team 直接生成 `formed`，再伪造成员 AgentUI event、user/assistant 消息和 layout
preview；它既不执行真实 spawn，也不来自 canonical Thread/Turn/Item，是第二事实源。

current 链保持：

```text
用户发送
  -> App Server / RuntimeCore current turn
  -> AgentControl spawn/send/followup/interrupt
  -> canonical Collab/SubAgent ThreadItem
  -> GUI timeline / child Thread navigation
```

## 删除范围

- 删除 `useRuntimeTeamFormation` 及 40 字符/正则编队策略。
- 删除 `teamFormationAgentUiProjection` 与虚拟 member/work-board event。
- 删除 `runtimeTeamCollaborationCopy` 与 formation preview 文案组装器。
- 删除 send path 的 prepare callback、preview state、伪消息和失败回写。
- 删除 shell 的 `hasTeamDispatchPreview` 宽度输入和 reset 的 formation 空操作。
- 删除对应正向测试，边界测试改为禁止上述符号和物理路径回流。

本切片涉及 19 个生产/测试文件，scoped diff 为 61 additions / 1801 deletions。

## 验证

- focused Vitest：5 files，188/188。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：边界违规 0、分类漂移 0、零引用候选 0。
- `git diff --check`：收尾执行。

后续 aggregate Gate：`npm run verify:gui-smoke` 已通过；current fixture 已通过多个真实 Electron
场景，最终被 Skills Runtime fixture Provider 鉴权失败阻断。该外部 blocker 不改变本切片删除结论。

## 治理分类

- `current`：RuntimeCore AgentControl、canonical Collab/SubAgent ThreadItem、GUI timeline 与 child
  Thread navigation。
- `compat`：无新增。
- `deprecated`：`team-workspace-runtime/**` raw status/stream 第二投影链，下一切片删除。
- `dead / deleted / forbidden-to-restore`：本地 formation、虚拟 members、formation projection、
  dispatch preview 与伪 assistant 消息。

下一刀：让 `useWorkspaceTeamRuntime` 直接派生标题/可见性并直接调用主输出 stop，随后删除
`useTeamWorkspaceRuntime`、`team-workspace-runtime/**` 与 unavailable Team control stubs。
