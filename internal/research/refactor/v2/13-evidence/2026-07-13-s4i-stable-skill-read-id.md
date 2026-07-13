# S4i stable skill read identity

> status: stable-id-current-and-Gate-B-validated
> verified_at: 2026-07-13
> owner: refactor-v2-coordinator

## 主线关系

本 slice 关闭 S4i typed Skills catalog 的最后一个 name-only transport：
`skill/read` 必须消费 catalog 发出的 stable `scope:name` identity，并从同一 snapshot
winner 的 locator 读取正文。Electron 仍只做 JSONL 转发，不承接 Skill catalog 或解析逻辑。

## 实现

- `SkillReadParams` 从 `skillName` 直接替换为 `skillId`；Rust schema、generated TS、
  Rust/TS client 与 Renderer gateway 同步，不保留 wire alias。
- App Server catalog 删除 `find_skill_by_name` 和 path 对照，按 snapshot exact
  `skill_id` 找 metadata，再读取其 `skill_file_path`；空、缺失、disabled 与 name-only
  ID 均 fail closed。
- 同 scope/name 跨 provider root 使用 snapshot 的 first-provider precedence；`skill/list`
  去重 winner 与 `skill/read` locator 由同一 snapshot 顺序决定，并有一致性回归。
- default Skill roots 不再按扁平数组下标猜 scope；9 个 project provider roots、9 个
  user provider roots和 app root分别从既有 typed path API构造。
- Renderer 先读 typed catalog：exact stable ID 优先；裸 slash/source ref name 仅在 enabled
  catalog 中唯一时 lower；重名/缺失/duplicate exact ID 与 read response identity mismatch
  均拒绝，不补 `project:`，不使用 path fallback。
- `skills-current` smoke 从 `skill/list` 首个 enabled item 取 `skillId` 调 `skill/read`，
  断言 request/response identity roundtrip；network evidence 将 Markdown 正文替换为
  `[redacted]`。

## 验证

```text
cargo test -p lime-skills
PASS: 66 tests

cargo test -p app-server-protocol
PASS: 43 lib tests + 1 schema fixture integration test

cargo test -p app-server-client
PASS: 24 tests

cargo test -p app-server local_data_source::skills::catalog::tests --lib
PASS: 4 tests

npm --prefix packages/app-server-client test
PASS: 62 tests

npx vitest run src/lib/api/skill-execution.test.ts \
  src/components/agent/chat/workspace/useWorkspaceGeneralWorkbenchSidebarRuntime.test.tsx
PASS: 15 tests

npm run typecheck
PASS

npm run test:contracts
PASS: app-server-client 290 checks and all composed guards

npm run verify:gui-smoke
PASS: renderer, App Server initialize, Claw shell and memory settings

node scripts/skills-current-smoke.mjs --prefix s4i-stable-skill-read-id
PASS: skill/list -> skill/read {skillId} -> matching metadata.skillId through Electron Host
```

Gate B evidence:

- `.lime/qc/gui-evidence/skills-current/s4i-stable-skill-read-id-summary.json`
- `.lime/qc/gui-evidence/skills-current/s4i-stable-skill-read-id-network-invoke.json`

该 smoke 不提交 Provider 请求，只证明真实 Electron、preload/IPC、
`app_server_handle_json_lines`、App Server JSON-RPC、typed catalog/read 与 identity response。
S4i body selection 的 Provider fixture blocker 仍保留在上一份 evidence，不由本结果覆盖。

## 治理分类

- `current`：typed root scope、stable `skillId` protocol/catalog/client、exact locator read、
  Renderer unique catalog lowering、redacted Electron current smoke。
- `compat`：仅 GUI 边界接受用户可见 slash name 或已有 backend `source_ref` 裸 name，
  且只能通过 catalog 唯一解析；不会进入 wire contract。
- `deprecated`：无。
- `dead`：`SkillReadParams.skillName`、catalog name/path lookup、按扁平 root index 猜 scope。
- `dead / forbidden-to-restore`：默认 `project:` scope、path identity、response identity
  mismatch 容忍、Renderer/production mock fallback。

下一刀回到 S4 broader control plane：MCP Turn snapshot 或真实 multi-agent mailbox/edge
persistence，不再扩写 Skills 平行 owner。
