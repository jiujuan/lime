# S7x Canonical Reasoning Position Only

## 结论

S7o 曾在相邻 Tool content part 没有可比较 position 时保留 Renderer 已有顺序。冷审确认 current production projector 只接受带 canonical event 的 Thread lifecycle，canonical Item reader 同时强制 `sequence` 与 `ordinal`；S7o 的 `Number.MAX_SAFE_INTEGER` Tool fixture 不可能来自 current 主链。

S7x 删除该 production 特判和 sentinel 正向测试。Reasoning 与 Tool 的相对顺序只由 canonical ordinal/sequence 和稳定 Item identity 决定；当没有更早的 comparable part 时，GUI 仍把 reasoning 放在最终正文前。

## 分类

- `current`：canonical Tool/Reasoning Item、ordinal-first merge、稳定 Item identity、reasoning-before-final-text GUI 规则。
- `compat / deprecated`：无。
- `dead / deleted / forbidden-to-restore`：无 position raw Tool card 的到达顺序参与 production reasoning 排序，以及对应正向 fixture。

## 验证

- focused Vitest：4 files / 55 tests passed，覆盖 reasoning sync、runtime handler、canonical reader 和 event-stream fail-closed。
- exact ESLint、Prettier 与 claimed diff check：passed。
- Gate B：`reasoning-first-visible` passed；Electron/preload/App Server JSON-RPC、current session start/read/list、GUI reasoning-before-answer、terminal GUI 与 read model assertions 全部为 true。
- `npm run smoke:agent-runtime-current-fixture` 的 unit/guard 阶段通过；首次被并行 Cargo sidecar 产物竞争阻断，重试进入 Electron 后首页 sampling 记录 `conversationStartedAtMs=409`，超过 250ms budget，但真实 pending preview paint trace 为 21ms，且无 flicker/layout drift/auxiliary request。该性能场景不作为 S7x 语义通过证据。

## Release closeout

发布复核首次运行 `npm run smoke:agent-session-history-electron-fixture` 时，oracle 在 Reasoning
节点刚出现但仍显示“思考中”时提前返回，随后 assertion 误报 reasoning summary 缺失；失败截图稍后
已经显示完整 summary，确认是 E2E readiness race，不是产品数据丢失。

history replay oracle 现在只在完整 DOM 同时满足以下条件后返回：User / Agent 文本可见、图片占位
消失且两个附件渲染、Reasoning summary 精确出现一次、MCP Item 与 tool row 已渲染。新增 unit
regression 锁定瞬态 Reasoning shell 不得视为 ready。

原始 Electron fixture 复跑通过：`ok=true`、reasoning summary 1 次、图片附件 2 个、MCP tool
row 1 个、console error 0。该 Gate B 继续经过 Electron、preload/IPC、
`app_server_handle_json_lines`、App Server JSON-RPC、runtime/read model 和用户可见 DOM。

## 并行边界

S7x 产品切片只修改 Renderer reasoning sync、对应 unit test 与协调文档；S2n Rust import
lifecycle 已独立完成并释放。release closeout 额外只修正 history Electron fixture 的 oracle
readiness 与对应回归，不改变 App Server projector/reader、protocol 或 GUI production semantics。

## 下一刀

S2n 已释放 Rust/App Server 热区；当前执行 fresh release aggregate gates。发布后继续 S5 root
compat barrel 的 22 个 production consumer file 分域迁移。
