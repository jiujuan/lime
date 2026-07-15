# S4al AgentControl cold-restart visible DOM Gate B

日期：2026-07-15

## 结论

`.lime/qc/s4al-agent-control-cold-restart-gate-b.json` 为真实 Electron Gate B，状态 `pass`。
它在完成六个 AgentControl 工具后关闭 Electron 与 App Server，再使用同一临时 user data / runtime
root 启动新进程，并从 `agentSession/read` 恢复同一 parent Thread。

- Electron PID：`8923 -> 9920`，确认不是 renderer `page.reload`。
- 六个 Tool 的 `(itemId, name, status)` 重启前后完全一致。
- Started、两条 Interacted、Interrupted 的 `(itemId, kind, childThreadId)` 完全一致。
- `agentSession/read` 与 `thread/list` 均为 `electron-ipc/success`。
- final assistant text 可见，console error `0`，invoke error `0`。
- pre/post 截图：
  - `.lime/qc/s4al-agent-control-cold-restart-gate-b-pre-restart-visible-dom.png`
  - `.lime/qc/s4al-agent-control-cold-restart-gate-b-cold-restart-visible-dom.png`

场景使用 localhost OpenAI-compatible provider fixture，只证明 Electron/App Server/RuntimeCore/read model
与 GUI 的 current 产品链，不证明 live provider 正确性。

## 本轮清理

- managed smoke 不再把 `page.reload` 当作 cold restart；AgentControl Gate B 必须显式使用
  `--cold-restart`。
- 增加重启前后 Tool/SubAgent/child Thread identity 对比，禁止重启后重新合成同名 DOM 通过。
- 首页封面改为唯一的组件 WebP bundle 资源，删除 12 个 `public/home-covers/*.jpg` 与 12 个
  同内容组件 JPG 副本；修复 Electron `file:///home-covers/...` 缺失资源。
- 未恢复 synthetic Team、status-to-tool inference 或 raw subagent sidecar。

## 验证

- `npm exec vitest run -- src/components/agent/chat/home/homeCoverAssets.unit.test.ts scripts/agent-runtime/tool-execution-smoke.test.mjs`：9/9。
- `npm run build:renderer:electron`：通过。
- `npm run smoke:agent-control-cold-restart-gate-b -- --output .lime/qc/s4al-agent-control-cold-restart-gate-b.json`：通过。
- scoped Prettier、`git diff --check`：通过。

`npm run verify:gui-smoke`：通过；`AgentChatWorkspace` command wiring 收口后 renderer、Electron
host/preload、App Server sidecar `1.104.0`、Claw workbench 与 memory settings 均正常就绪。

## 分类

- `current`：组件 WebP asset owner、managed Electron/App Server cold restart、canonical Tool/SubAgent identity。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / deleted / forbidden-to-restore`：public/组件重复 JPG、Electron 根路径 `/home-covers` 资源假设、热 reload 冒充 cold restart、旧 synthetic Team surface。

## 下一刀

继续收掉 `team_memory_shadow` 本地 shadow 链和无执行消费者的 `TeamDefinition/recent_team_selection`
compat 岛；写集必须拆成前端 metadata、共享 projection/package、Rust session/read-model 三段，按顺序
施工，不与 AgentControl runtime 热区交叉。
