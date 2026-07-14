# S6l Thread-first SubAgent navigation and guards evidence

日期：2026-07-14

## 结论

S6j 的 Team runtime sidecar 删除方向成立，但原完成声明漏了两个产品阻塞：

1. `projectThreadFirstBoundary.test.ts` 仍读取三个已删除文件，未进入原 focused 集，独立运行必然 ENOENT。
2. canonical SubAgent activity 携带真实 child ThreadId，Renderer 却把它直接传给 session navigation；真实 `thread-*` 与 `agent-*` 不等。

S6l 不恢复 sidecar，也不给 canonical payload 伪造 sessionId。current 身份转换固定为：

```text
canonical activity child ThreadId
  -> canonical child roster sessionId（已存在时）
  -> App Server thread/read(turnsView=notLoaded)（缺失时）
  -> existing session view switchTopic(sessionId)
```

真实 legacy child session list 仍可直接使用其 session id；Thread identity mismatch、空 sessionId 或 read 失败均 fail closed。

## 实现与守卫

- `threadClient.ts` 新增 `readThreadSessionId`，复用既有 `thread/read`，严格校验 request/response ThreadId 与非空 sessionId，不新增 method/protocol/Electron bridge。
- Workspace navigation helper 区分 canonical child Thread、真实 child session 与缺 roster 的 ThreadId；导航前继续执行 recent metadata defer。
- timeline fixture 改为真实不等身份，不再用 `child-session-1` 冒充 canonical ThreadId。
- project-thread guard 改守 canonical reader、shared ThreadItem projection、timeline 与 thread/read identity，不再读取 deleted owner。
- legacy catalog 新增独立 `dead` monitor，阻止 Team sidecar、restored facts、本地 live maps 与 dead i18n key 回流。
- i18n unused 删除 `agentChat.teamWorkspace.control.` protected prefix；可执行 scenario registry 与 current roadmap 不再引用已删目录。

## 并行协调

- S6k canonical child roster 独立 claim 拥有 App Server `thread/list`、canonical child selector/hook、Harness roster 与 `AgentChatWorkspace` roster wiring。
- S6l 避让这些 owner；S6k 仅把 canonical children/session identity 接入 S6l navigation helper 和 boundary test，保留 S6l 的 fallback/fail-closed contract。
- raw `subagent_status_changed` API/projector 与 legacy roster DTO 删除明确不在本切片。

## 验证

- thread client/navigation/timeline focused：63/63；追加空 sessionId 负向断言后 client/navigation 49/49。
- project-thread guard：10/10。
- legacy catalog + scenario registry：213/213。
- focused ESLint：通过。
- `npm run i18n:check:json`：五语言、13 namespaces、0 issue。
- `npm run i18n:unused`：10408 resources、unused 0。
- `npm run governance:legacy-report`：边界违规 0、分类漂移 0、零引用候选 0。
- `git diff --check`：通过。
- S6k/S6l 统一 focused：91/91。
- stop direct-owner 回归修正后：1/1。
- `npm run typecheck`：通过。
- `npm run test:contracts`：290 checks 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario multi-agent-team --timeout-ms 180000`：真实 Electron/App Server、GUI/read model 与 Evidence Pack 导出通过。
- `npm run verify:gui-smoke`：通过。
- 完整 current aggregate：首页、Workbench、图片、cancel/continue、Approval、Inputbar 与 Plan history 通过；Skills Runtime 在外部 Provider 鉴权失败提示处 exit 1。首次 plain-image 因并发 build 瞬时缺失 `dist/index.html` 失败，定向和完整稳定复跑均通过。
- `test:related`：256/258；本主线 stop test 已修复并 1/1，剩余失败为无关 Skills mock 缺 `listExecutableSkills`。

## 治理分类

- `current`：canonical Thread/Turn/Item、canonical child roster、`thread/read` identity resolution、timeline 与 existing session view。
- `compat`：无新增。
- `deprecated`：raw status refresh/projector 与 legacy roster DTO，下一窄切片迁出。
- `dead / deleted / forbidden-to-restore`：Renderer Team sidecar、restored synthetic facts、本地 live/draft/tool/queue map、unavailable controls 与 dead i18n keys。

下一刀：把 `useAgentRuntimeSyncEffects` 的 raw status refresh 迁到 canonical notification/read control，再删除 raw listener/parser/projector；roster DTO 只在 canonical child selector 完全接管消费者后删除。
