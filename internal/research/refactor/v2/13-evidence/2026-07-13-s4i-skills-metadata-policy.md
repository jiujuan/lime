# S4i Skills metadata and policy

> status: typed-catalog-body-validated / Gate-B-fixture-blocked
> verified_at: 2026-07-13
> owner: refactor-v2-coordinator

## 主线关系

S4 退出条件要求 Skills metadata、selection、capability/authority/source policy 和
恢复证据统一到 current owner。此前只有 stable `scope:name` identity、局部
`allowed_tools` 与 session allowlist/capability seed；执行结果无法说明 policy
为何允许、由谁授权、缺少什么 capability，也没有正文 token-budget 状态。

## 已实现

- `tool-runtime::skill_gate` 新增可序列化 `SkillPolicyEvaluation`：
  - `decision=allow|deny`
  - stable reason 与 `source`/`authority`
  - required/missing capabilities
  - body token-budget 字段
- workspace runtime enable 的 source/approval 会进入 decision；普通 session gate
  显式使用 `session_skill_gate/session_runtime`。
- `check_skill_tool_access` 只委托 typed evaluation，保留现有 disabled/not-allowed
  边界错误，不新增 compat 路径。
- `run_skill_execution` 把 policy decision 写入成功结果和 preflight failure metadata，
  让 canonical Tool result/evidence consumer 可以读取同一事实。
- body token budget 当前明确为 `not_evaluated`，`estimatedTokens/maxVisibleTokens=null`；
  没有用 invocation args 长度冒充 `SKILL.md`/context body 预算。

### Typed metadata 与 selection/body policy

- `AgentSkillMetadata` 的 current shape 已显式包含：
  - stable `skillId=scope:name`
  - typed `source`、`authority`、`scope`、`enabled`
  - `interface`、`dependencies`、`policy`、`capabilities`
  - `directory/SKILL.md` 只作为 locator，不参与 identity
- explicit、catalog、plugin 与 implicit selection 只选择 enabled skill；同 scope/name
  的重复路径按 stable ID 去重。
- selection body evaluation 真实读取 `SKILL.md` 与最多 3 个受边界保护的
  `references/**`，使用累计 3000-token model-visible budget，输出：
  - `allow / skill_selection_allowed`
  - `omitted / skill_selection_body_omitted_by_token_budget`
  - `deny / skill_body_read_failed`
- App Server prompt 注入只消费 `allow` body；`omitted/deny` 不注入正文，runtime
  status `skill_body_read` 同步记录 `skillId/source/authority/capabilities/bodyTokenBudget`。

tool-runtime invocation gate 仍保持 `bodyTokenBudget=not_evaluated`：它不拥有本回合
选中的正文。真实正文预算由唯一 selection/body owner 评估，两个边界不互相伪造事实。

### Typed App Server catalog

- executable `skill/list` 使用 `SkillListResponse.skills: Vec<SkillSummary>`，
  `skill/read` 使用 typed `SkillDetail`；`Vec<Value>` 已从 executable contract 删除。
- management rich catalog 单独使用 `SkillManagementListResponse.skills: Vec<Value>`，
  不再与 executable response 共用同一 DTO。
- protocol schema、manifest、generated TypeScript、手写 client protocol、connection method
  与 Renderer gateway 已同步；gateway 对 stable ID、enum、dependencies、capabilities、
  locator 和 detail body fail closed，不再直接 cast unknown。
- `SkillReadParams.skillName` 仍是唯一残余 name-only 请求。当前 GUI 的 workbench
  evidence 只持有 skill name，本 slice 不引入 name→path fallback；下一刀应先让上游
  source ref 持有 stable skillId，再一次性迁移请求参数。

## 验证

```text
cargo test --manifest-path lime-rs/Cargo.toml -p tool-runtime skill_ --lib
PASS: 20 tests

cargo test --manifest-path lime-rs/Cargo.toml -p tool-runtime --lib
PASS: 260 tests

cargo check --manifest-path lime-rs/Cargo.toml -p app-server
PASS (6 existing dead-code warnings)

cargo test --manifest-path lime-rs/Cargo.toml -p lime-skills --lib
PASS: 65 tests

cargo test --manifest-path lime-rs/Cargo.toml -p app-server-protocol --lib
PASS: 41 tests

RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml \
  -p app-server agent_skills_ --lib
PASS: 23 tests

npx vitest run src/lib/api/skill-execution.test.ts
PASS: 5 tests

npm --prefix packages/app-server-client test
PASS: 62 tests

npm run check:protocol-types
PASS: 690 generated v0 types, no drift

npm run typecheck
PASS

npm run test:contracts
PASS: app-server-client 290 checks and all composed guards
```

`npm run test:rust:related -- <skill_gate.rs> <skill_execute.rs>` 扩展到
`agent-runtime/app-server/lime-agent/lime-mcp/lime-scheduler/lime-server/tool-runtime`：

- 首次在 App Server MCP stdio 测试默认线程栈溢出；同一测试使用
  `RUST_MIN_STACK=8388608` 后 1/1 通过，分类为 test-runner stack environment。
- 使用 8 MiB 栈重跑后，agent-runtime 110/110 通过，App Server 956/975 通过；
  19 个失败均位于 active S4h/S4d 旧 fixture：仍发送已禁止的 raw
  `tool.started`、仍期待已删除的 `tool.args`，以及相邻 queue/import fixture
  旧顺序。S4i 写集没有触碰这些文件，不能在本 slice 越权修复。

## Gate B 与未完成项

- 聚合 `smoke:agent-runtime-current-fixture` 已通过 history、stream terminal、fixture
  guards、home-hotpath、greeting、Coding Workbench、image command、plain image intent 与
  cancel-then-continue；随后 approval-resume 在 `action.required` 前被 fixture Provider
  鉴权失败阻塞，与既有 S4 approval blocker 相同。
- 专用 `skills-runtime` Gate B 也在首次 GUI submit 后、assistant/evidence export 前收到
  `fixture-provider` 鉴权失败。failure summary：
  `.lime/qc/gui-evidence/claw-chat-current-fixture/s4i-skills-metadata-policy-summary.json`。
  因未到达 `skill_body_read` evidence assertion，本 slice 不能声明 Gate B 通过。
- 剩余产品切片：把 `skill/read` 请求从 name-only 迁到 stable skillId；修复 external
  fixture Provider 后重跑专用 Skills Gate B。

## 治理分类

- `current`：stable skillId metadata、typed source/authority/scope/enabled/interface/
  dependencies/capabilities、session Skill gate、selection body policy、typed executable
  catalog、canonical Skill execution/runtime status metadata。
- `compat`：无新增。
- `deprecated`：`SkillReadParams.skillName` name-only request，退出条件为上游 source ref
  持有 stable skillId 后直接迁移。
- `dead`：executable `SkillListResponse.skills: Vec<Value>`、`SkillReadResponse.skill: Value`
  与 path-as-identity catalog shape 已移除。
- `dead / forbidden-to-restore`：用 invocation args 估算正文预算、path 作为 skill
  identity、GUI 本地 allow/deny 或 production mock fallback。
