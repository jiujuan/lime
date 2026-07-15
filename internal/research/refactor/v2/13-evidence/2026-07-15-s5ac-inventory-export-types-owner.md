# S5ac Inventory / Export Types Owner

## 结论

`inventoryClient.ts` 已直连 `toolInventoryTypes`，`exportClient.ts` 已直连 `evidenceTypes`。
client request、normalization 与 export behavior 未改变。

## 验证

- focused Vitest：2 files / `17/17`。
- exact ESLint、Prettier、compat scan 与 diff check：通过。
- shared typecheck、App Server client contract `288` 与完整 `test:contracts`：通过。

direct owners 为 `current`；两个旧 `./types` imports 为 `dead / forbidden-to-restore`。
