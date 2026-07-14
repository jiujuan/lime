# S6j dead Team runtime sidecar evidence

日期：2026-07-14

## 结论

Renderer 的第二套 Team runtime 已删除。旧链路重复订阅
`agent_subagent_status:*` / `agent_subagent_stream:*`，维护本地 runtime、activity、draft、tool、
queue map，再把 restored/live facts 写回 `conversationProjectionStore`；这些状态没有通过
`useWorkspaceTeamRuntime` 暴露给 GUI，不能继续作为过渡 owner。

sidecar 删除后的目标 GUI 边界是：

```text
canonical Thread/Turn/Item -> shared projection -> timeline
canonical child Thread roster -> workspace visibility and session navigation
current main turn owner -> stop
```

## 删除范围

- 删除 `team-workspace-runtime/**` 的 projector、subscriptions、reconciler 及 tests。
- 删除 `useTeamWorkspaceRuntime` 和 restored synthetic status 写入。
- 删除 `teamWorkspaceRuntime` 的混合 runtime/activity/summary 状态模型。
- 删除 session/control wrappers；close/resume/wait/sendInput unavailable stubs 不再出现在产品路径。
- `useWorkspaceTeamRuntime` 只从真实 child sessions、parent context 与工具开关派生标题/可见性，
  `handleStopSending` 直接委托 current `stopSending`。
- 删除五语言无消费者的 liveRuntime/runtimeStatus/control keys 和正向 i18n 测试。
- 边界守卫禁止第二 runtime 的路径、hook、subscription 和 live map 回流；该守卫在 S6l 补齐目录级 catalog 后才构成完整回流证据。

当前共享树的 S6j scoped diff 约为 43 additions / 5478 deletions；与 S6i 共用的 owner/guard
文件在完整 diff 中合计为 110 additions / 5508 deletions。

## 验证

- focused Vitest：8 files，56/56，覆盖入口渲染、workspace selector、canonical reader/projection、
  flow guard 与 i18n。
- `npm run typecheck`：通过。
- `npm run i18n:check:json`：五语言、13 namespaces、0 issue。
- `npm run governance:legacy-report`：边界违规 0、分类漂移 0、零引用候选 0。
- scoped `git diff --check`：通过。
- `npm run verify:gui-smoke`：通过；Renderer、Electron Host/preload、真实 App Server sidecar、
  初始化、Claw shell 与 memory settings 均成功。
- `npm run smoke:agent-runtime-current-fixture`：history/stream/guard 与首页、Workbench、图片、
  cancel/continue、Approval、Inputbar、Plan history 等真实 Electron 场景通过；最终 Skills Runtime
  fixture Provider 鉴权失败，GUI 正确显示配置错误，命令 exit 1。

### 2026-07-14 follow-up correction

- 原 focused 集漏掉 `projectThreadFirstBoundary.test.ts`；该测试仍读取三个已删除文件，独立执行必然 ENOENT，因此 S6j 的 focused 完成口径不完整。
- canonical activity 的 `child_thread_id` 当时写入 display item 的 legacy `session_id` 字段并直接传给 `switchTopic`；真实 `thread-*` 与 `agent-*` 不等，原“child ThreadId navigation 保持 current”声明不成立。
- S6l 负责通过 current `thread/read` / canonical child roster 解析真实 sessionId，并把 project-thread guard、dead catalog、i18n unused 与可执行 scenario registry 补齐；完成前 S6j 状态应视为 `deletion-complete / navigation-and-guard-followup-active`。

## 治理分类

- `current`：canonical Thread/Turn/Item reader/projection、timeline 与 current main-turn stop；child navigation/roster 由 S6k/S6l 收口。
- `compat`：无新增。
- `deprecated`：raw `subagent_status_changed` projection、零生产 consumer 的专用 event source、旧
  roster DTO 仍待后续切片迁出。
- `dead / deleted / forbidden-to-restore`：`team-workspace-runtime/**`、本地 live/draft/tool/queue
  state、restored synthetic facts、Team unavailable controls 和对应 i18n。

下一刀：在 canonical child Thread summary selector 承接 roster/status 后，删除
`subagent_status_changed` projector、零 consumer 的 `listenSubagentStatus/listenSubagentStream` API 与
旧 Team/budget DTO 字段；GUI roster 壳继续保留。
