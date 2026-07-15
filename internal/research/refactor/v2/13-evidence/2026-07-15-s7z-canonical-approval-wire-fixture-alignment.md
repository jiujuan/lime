# S7z Canonical Approval Wire Fixture Alignment

## 结论

S7y 后两个 API 层 fixture 仍断言 GUI alias，导致 batch 60 与 current projector 不一致。
本 slice 只把 terminal Approval `decline` 改为 canonical `denied`，把 resolved action
`allow_once` 改为 canonical `approved`。

canonical wire 继续只允许 `approved / approvedForSession / denied / timedOut / abort`；
`allow_once / allow_for_session / decline / expired / cancel` 仍只属于 GUI view-model
lowering。production projector 与 pending `available_decisions` 未修改。

## 分类

- `current`：canonical Approval wire 与 API projector fixture。
- `current GUI boundary`：现有 view-model lowering。
- `dead / forbidden-to-restore`：把 GUI terminal alias 写回 canonical wire。
- `compat / deprecated`：无。

## 验证

- 修复前 focused：27/29，两个 actual 分别为 `denied`、`approved`。
- 修复后 focused：2 files / `29/29`。
- fresh frontend batch 60：16 files / `147/147`。
- fresh frontend 110/110 batches、GUI smoke 与 legacy governance `0/0/0`：通过。
- ESLint、Prettier 与 claimed diff check：通过。
- `verify:local` changed-Rust 的外部 MCP stdio stack overflow 与本 test-only slice 无关。
