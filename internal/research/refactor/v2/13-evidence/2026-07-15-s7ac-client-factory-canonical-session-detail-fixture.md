# S7ac Client Factory Canonical Session Detail Fixture

## 结论

`appServerSessionClient` 已按 current 边界在 `agentSession/read` 缺少 canonical
`detail` 时 fail closed，但 `clientFactory.test.ts` 的集成 mock 仍只返回退役的
`session + turns` 形状，导致 factory 组合测试稳定失败。

本 slice 只为该 mock 的 `result` 与 JSON-RPC `response.result` 补齐同一份 canonical
session detail。production client、协议、Renderer fallback 和全局测试状态均未修改。

## 分类

- `current`：`agentSession/read.detail` 是会话展示的 canonical 事实源。
- `test-only`：clientFactory App Server 集成 mock。
- `dead`：把 `session + turns` 当作可合成展示详情的旧 fixture 语义已移除。
- `compat / deprecated`：无新增 surface。

## 验证

- fresh `clientFactory.test.ts`：`10/10`。
- fresh frontend batch 60：16 files / `113/113`。
- claimed file ESLint、Prettier 与 diff check：通过。
