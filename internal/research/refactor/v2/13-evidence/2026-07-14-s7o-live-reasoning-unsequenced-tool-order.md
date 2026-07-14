# S7o Live Reasoning Unsequenced Tool Order Evidence

> Superseded by `S7x-canonical-reasoning-position-only`. S7x confirmed that the no-position Tool input cannot pass the current canonical reader, so this historical behavior is `dead / deleted / forbidden-to-restore`, not a current GUI rule.

## 结论

reasoning Item 完成时，旧逻辑会先移除已存在的 thinking part；当相邻 tool part 都没有
可比较的 canonical position 且正文尚未出现时，fallback 会把 reasoning 追加到工具之后，
破坏已经正确的 `Tool -> Reasoning -> Tool` 实时顺序。

S7o 在无可比较 position 时原位更新已经位于首段正文之前的 reasoning；一旦存在 canonical
position，仍由 canonical ordinal/sequence 决定顺序。若临时 thinking 已落在正文之后，仍会
移动到正文之前。

## 写集与分类

- `current`：canonical Thread Item position 与 live content part 既有顺序共同决定投影。
- 修改：`agentStreamReasoningContentSync.ts` 及其 unit test。
- 只读：runtime handler 集成 fixture 与 history position helper。
- `compat / deprecated`：无新增。
- `dead / forbidden-to-restore`：无 position 时无条件移除并尾插 reasoning 的旧 fallback。

## 验证

- reasoning unit：8/8 passed。
- runtime handler integration：7/7 passed。
- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。

## Gate B 边界

- `reasoning-first-visible`：`ok=true`，证明 reasoning 在最终回答前可见。
- `web-tools-rendering` 初跑与复跑：`ok=false`。失败点是完成后的过程组默认折叠，未展示
  search/fetch 展开态；两次底层 content parts 均保持
  `text|WebSearch|thinking|WebFetch|text`。

因此 S7o 只关闭 content part 排序目标，不宣称 web-tools 可视展开 Gate B 通过；后者属于独立
GUI 产品 follow-up。
