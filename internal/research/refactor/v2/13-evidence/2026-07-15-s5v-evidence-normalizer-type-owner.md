# S5v Evidence Normalizer Type Owner

## 结论

六个 evidence projection/normalizer modules 已从 `./types` compat barrel 迁到
`./evidenceTypes` current owner。Evidence Pack、index、observability、verification、analysis、replay
和 review decision normalization 行为未改变。

## 分类

- `current`：`agentRuntime/evidenceTypes`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：六个 normalizer/projection imports。

## 验证

- focused Vitest：2 files / `16/16` 通过，覆盖 App Server evidence projection 与 export client。
- exact ESLint、Prettier、typecheck、compat-types scan 与 diff check：通过。
- claimed real compat consumer：`6 -> 0`。

## 下一刀

继续把 clean Workspace skill tests/helpers 迁到 `toolInventoryTypes`，并按 session/request/media owner
拆分 agentRuntime 内部 modules；避让 dirty `useWorkspaceSendActions.ts`。
