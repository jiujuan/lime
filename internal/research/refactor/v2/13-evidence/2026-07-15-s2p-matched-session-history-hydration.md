# S2p Matched Session History Hydration Evidence

## 结论

侧栏点击当前 session 时，只要 Message / Item 可见时间线为空，就必须执行 canonical history hydrate。
已恢复的 Turn 元数据不能证明消息历史已经加载，也不能阻止 `switchTopic(forceRefresh)` 进入
`agentSession/read`。

## 根因与修复

旧 guard 要求 `messages=0 && items=0 && turns=0` 才 hydrate。App Server session summary 可以先恢复
Turn 元数据，而 Renderer 的 Message / Item 尚为空；此时 `turns>0` 让 same-session navigation 被
`matched-current` 短路，用户看到空对话，正确的 canonical ordinal 也无法进入 GUI。

修复删除 `turnsLength` 这一错误前置条件。guard 继续保留：

- draft hot path pending 时不 hydrate；
- initial session 必须与 current session 匹配；
- Message 或 Item 已可见时不重复 hydrate；
- topic summary 声明有历史，或当前 session 尚未进入 topic list 时才 hydrate。

## 写集

- `useWorkspaceTaskCenterDraftStateRuntime.ts`：Turn 元数据不再阻止空时间线 hydrate。
- `AgentChatWorkspace.tsx`：删除已无语义的 `turnsLength` 参数。
- `useWorkspaceTaskCenterDraftStateRuntime.test.tsx`：覆盖“有 Turn、无 Message/Item”与已有内容不重复
  hydrate。
- 未修改侧栏 action、App Server read model、protocol、i18n 或 root barrel active slice。

## 验证

```text
npx vitest run useWorkspaceTaskCenterDraftStateRuntime.test.tsx
=> 2/2 passed

npm run typecheck
=> passed

exact Prettier / ESLint
=> passed
```

- 真实 Electron CDP 从“你好”切到 ORDER 会话再切回，观察到两个不同 session 的
  `agentSession/read`，均为 `electron-ipc/success`。
- 返回 ORDER 会话后 reasoning 在 answer 前，输入框 enabled，invoke error count 为 0。
- 真实窗口截图：`.lime/qc/gui-evidence/s2p-matched-session-history-hydration/real-electron-order.png`。
- `npm run smoke:agent-session-history-electron-fixture` passed。
- `npm run verify:gui-smoke -- --reuse-running` passed。
- changed-Rust `rustfmt --check` 与 `git diff --check` passed。

## 治理分类

- `current`：same-session explicit navigation -> force refresh -> App Server `agentSession/read` ->
  canonical Message/Item timeline。
- `compat`：无新增。
- `deprecated`：以 Turn summary 代替 history hydrate 的 presentation shortcut。
- `dead / forbidden-to-restore`：`turnsLength > 0` 被视为 Message / Item 已加载。

## 路线图关系

S2p 让 S2o 已修正的 canonical Item 顺序真正进入历史 GUI，补齐“侧栏可点 -> 正文恢复 -> 思考先于
回答 -> 输入框可继续”的用户闭环。
