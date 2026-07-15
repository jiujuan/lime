# S4i3 Skills Runtime Retired Raw Guard

## Fact Source

Agent external fixture backend 的 Tool lifecycle 必须与 current App Server EventStore 使用同一
canonical `item.started` / `item.completed` Tool Item。`tool.started`、`tool.result` 等 raw
product lifecycle 已是 `dead / forbidden-to-restore`。

## Change

- 把 `skills-runtime-fixture-scenario.mjs` 纳入既有 external backend retired Tool wire
  扫描，关闭此前只扫描 Approval 与通用 Tool/Skill backend 的守卫缺口。
- 未修改 active S4i2 持有的 canonical fixture 生成器或 assertions，也未增加 raw allowlist、
  compat alias、production fallback 或 provider credential 路径。

## Validation

- focused retired guard: 1/1 passed。
- `claw-chat-current-fixture-smoke.test.mjs`: 54/54 passed；验证的是包含 active S4i2
  canonical fixture patch 的当前工作树，不代表 S4i2 改动归本切片所有。
- exact ESLint: passed。
- scoped `git diff --check`: passed。
- `npm run governance:scripts`: passed，root/dir baseline 无新增。
- exact Prettier check 发现目标文件三处 committed baseline 排版差异；为保持窄写集，未把
  与守卫无关的 mechanical formatting 混入本切片。新增数组项本身符合现有格式。

## Classification

- `current`: canonical external fixture Tool Item 与 physical negative guard。
- `test-only`: Skills external backend scenario。
- `compat`: none。
- `deprecated`: none。
- `dead / forbidden-to-restore`: fixture raw `tool.started/tool.result` lifecycle。

## Next Cut

由 active S4i2 owner 完成 Skills fixture canonicalization 的专用 Electron Gate B、aggregate
复跑和 handoff；coordinator 再把中央计划中的“外部 Provider 鉴权”误判改为真实结论。
