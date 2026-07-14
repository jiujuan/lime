# S5 Sidebar Session Compat Barrel 迁移证据

> date: 2026-07-14
> slice: S5-sidebar-session-compat-migration
> owner: root

## 事实源

Sidebar 和 archived conversations 的会话链固定为：

```text
React Sidebar / Settings
  -> agentRuntime/sessionClient
  -> appServerSessionClient
  -> App Server agentSession/list/read/update/delete
```

会话 DTO 只从 `agentRuntime/sessionTypes` 读取。`src/lib/api/agentRuntime.ts` 只做
compat re-export，不是本域的行为或类型 owner。

## 已迁移

- `AppSidebar`、11 个 `app-sidebar` 生产模块和 archived conversations 设置页的
  `AgentSessionInfo` 均改为直接导入 `sessionTypes`；
- session list、update、delete 与 `AGENT_RUNTIME_SESSIONS_CHANGED_EVENT` 均改为直接导入
  `sessionClient`；
- 对应测试夹具和 archived conversations mock 改为 mock `sessionClient`，不再 mock root barrel；
- `AppSidebar.current-boundary.test.ts` 新增本域 19 个 source/test 文件的负向 import guard。

静态扫描结果：本域 root barrel import 为 `0`，分域 current import/mock 为 `23`。

## 验证

- `npx vitest run src/components/AppSidebar.current-boundary.test.ts src/components/AppSidebar.conversations.test.tsx src/components/app-sidebar/AppSidebarConversationRow.test.tsx src/components/app-sidebar/sidebarConversationGroups.test.ts src/components/app-sidebar/sidebarSessionFormatting.test.ts src/components/app-sidebar/sidebarSessions.test.ts src/components/settings-v2/general/archived-conversations/index.test.tsx`：69 tests 通过；
- 精确写集 `npx eslint ... --max-warnings 0`：通过；
- `npm run typecheck`：通过；
- `node scripts/electron/smoke.mjs`：Electron renderer loaded、App Server ready、claw workbench shell ready、memory settings ready；
- 精确写集 `git diff --check`：通过。

`AppSidebarConversationRow` 两条既有测试仍输出 React `act` 环境 warning；测试本身通过，且本 slice
不修改渲染时序。

## 分类

- `current`：`agentRuntime/sessionClient`、`agentRuntime/sessionTypes`、App Server
  `agentSession/*` gateway；
- `compat`：`src/lib/api/agentRuntime.ts`，尚有 `185` 个生产 root-barrel consumer，必须按
  域迁移完成后再删除；
- `deprecated`：本 slice 未新增；
- `dead / forbidden-to-restore`：本 Sidebar 会话域对 root compat barrel 的 import 或 mock。

## 后续

中央实施计划由活跃 S4w owner 持有，本 slice 没有夹写。协调者应在 S4w 释放后将本 evidence 与
local handoff 汇入 S5/S6 状态；根 barrel 的其余 consumer 继续按不交叠领域分批迁移。
