# S7ag Final Local Gates And ProjectShell Environment Normalization

时间：2026-07-15

## 范围

- `slice`: `S7ag-final-local-gates-and-project-shell-env`
- `owner`: `root / refactor-v2-coordinator`
- `current owner`: `lime-rs/crates/app-server/src/project_shell.rs`
- `产品边界`: Electron Desktop Host 的项目 Shell PTY；不新增 Renderer、IPC、App Server method 或第二 runtime。

本 slice 修复了 PTY 启动时环境变量“已设置但为空”不会使用默认值的问题。`COLORTERM`、`CLICOLOR`、`FORCE_COLOR`、`LSCOLORS` 现在统一经过空白值归一化；既有 `TERM`、尺寸和 shell 解析行为保持不变。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:resume` | 通过；smart suite `110/110` batches，`failed_batch: null` |
| `npm run test:rust:changed`（首次并发运行） | 记录为失败：App Server `1116 passed / 3 failed`；两个 Plugin worker 1 秒 I/O 用例受并发资源影响，ProjectShell 用例暴露空 `COLORTERM` 缺口 |
| Plugin worker 两条 exact 重跑 | `1/1` + `1/1` 通过 |
| ProjectShell exact 重跑（修复后） | `1/1` 通过；`COLORTERM=truecolor`、`CLICOLOR=1`、`FORCE_COLOR=1`、`LSCOLORS` 均可见 |
| `npm run test:rust:changed`（修复后） | 通过；App Server `1119/1119`，所有 changed-scope package test summaries 通过 |
| `rustfmt --edition 2021 --check lime-rs/crates/app-server/src/project_shell.rs` | 通过 |
| `npm run governance:legacy-report` | 通过；零引用候选 `0`、分类漂移候选 `0`、边界违规 `0` |
| `npm run verify:gui-smoke` | 通过；renderer build、Electron main/preload、sidecar、JSONL 初始化、claw workbench 与 memory settings smoke 均完成 |
| `git diff --check` | 通过 |
| `npm run governance:architecture-confirmation` | 按预期阻塞：本地没有 PR event 或 `--body-file`，无法读取责任开发者确认 |

## 治理分类

- `current`: `ProjectShellManager` 的 PTY 环境归一化；Codex-first GUI 主链不变。
- `compat`: 无。
- `deprecated`: 无。
- `dead`: 本 slice 未新增 dead surface；S7ae/S7af 的删除与回流守卫继续由各自 evidence 负责。

## 退出条件

本地门禁已完成。仍保留 `not-archive-ready`，因为架构确认必须在真实 PR body/base 上运行；不得用本地伪造 event 替代该证据。
