# Refactor v2 skeleton closeout

> date: 2026-07-14
> owner: root
> status: skeleton-complete / refinement-open / not-archive-ready

## 收口结论

v2 的快速完整骨架已经完成收口：Agent 产品链只保留
`Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item -> GUI`，
Electron 不承接第二业务后端，Renderer 不再维护第二套 Team runtime、raw SubAgent channel
或 synthetic formation truth。

本结论是 skeleton closeout，不是 v2 全部完成或 release/archive ready。S5 仍有 Agent Chat
compat consumer 需要按领域迁出；S6o 已删除 team-memory roster shadow，但 Harness fallback、subtask stats
与 session detail legacy roster contract 仍需继续收口。最终门禁也保留了四个明确阻塞。

## 架构与唯一事实源

- Agent loop、状态机、Thread/Turn/Item、工具生命周期、MCP、Skills、Multi-Agent、历史恢复和 GUI 护栏按 Codex current 语义收敛。
- Lime 是 GUI 产品：Codex TUI 交互只复制语义和状态机，Renderer 继续负责 GUI 模态、时间线、工作台、导航和五语言展示。
- provider capability、provider-specific lowering、多模型和多模态 message part 按 OpenCode owner 边界收敛。
- copy/adapt/delete 已形成单轨：复制成熟 contract，适配 GUI 产品边界，删除 Team sidecar、fake formation、raw status/stream channel 和 raw status type/projector/package/fixture family。

## Fresh Gate B 证据

fresh Electron Approval cancel 场景已通过真实产品链：

- `recordCount=1`
- Turn 状态为 `canceled`
- `pendingRequestCount=0`
- GUI composer 恢复可输入状态

聚合 `smoke:agent-runtime-current-fixture` 已越过 Approval resume/decline/cancel、取消后继续、图片、
Workbench、队列、Plan、首页、历史和 Inputbar rich restore 等场景；最终停止在 Skills Runtime
外部 Provider 鉴权失败。该结果不冒充 aggregate 全通过，也不归因于 SubAgent/Approval GUI 回归。

## 当前工作树验证

| 校验 | 结果 | 口径 |
| --- | --- | --- |
| `npm run lint` | 通过 | 当前工作树 |
| `npm run typecheck` | 通过 | 当前工作树 |
| `git diff --check` | 通过 | 当前工作树 |
| `npm run verify:gui-smoke` | 通过 | 真实 Electron Desktop Host fixture；GUI 主链可启动 |
| `npm run governance:legacy-report` | 通过 | 零引用候选 0、分类漂移 0、边界违规 0 |
| `npm run governance:scripts` | 通过 | scripts 冻结边界无回流 |
| `npm run test:contracts` | 主体通过，最终失败 | protocol/client 与命令主体 gate 通过；被并行 `internal/exec-plans/release-v1.102.0-plan.md` 的 docs-boundary 阻断，本轮未修改该文件 |
| `npm run governance:architecture-confirmation` | 未通过 | 本地无 PR event/body/base SHA，无法执行 PR 级判定；架构确认已写入中央计划，进入 PR 时仍需复制到 PR body |
| `npm run verify:local` | 未全绿 | 前置 app-version/i18n/lint/typecheck 进入 `npm test` 前通过；Vitest 109 批中 1-8 批通过，第 9 批 149/150，通过之外唯一失败为 `electron/ipcChannels.test.ts:208` 的已提交数组排序期望；10-109 批未执行 |

`verify:local` 第 9 批失败不属于 S7 产品回归或环境故障。实际 bridge command 集合无缺项；
生产集合排序后以 `get_default_provider` 开头，已提交测试仍按未排序顺序期望
`get_runtime_provider_selection`。该基线来自提交 `56e4e7d9a`，目标测试和实现均不在 S7 写集。
第 1-8 批共 23 个文件通过，第 9 批 16 个文件中只有 1/150 assertion 失败，后 100 批
共 1598 个文件保持 pending。

本次 local-ci 因 fail-fast 没有继续运行 contracts、Rust 和 GUI smoke；这些边界按上表的独立命令证据记录，
不能被解释为同一次 `verify:local` 已完成。

## 治理分类

- `current`：Electron Host、App Server JSON-RPC、RuntimeCore、canonical Thread/Turn/Item、ProjectionStore/thread-store、model-provider、tool-runtime、canonical child roster 和 GUI projection。
- `compat`：S5 登记的 207 个 Agent Chat presentation/barrel consumers；只能迁出和委托，不得新增业务逻辑。
- `deprecated`：S6o 剩余 Harness roster fallback、subtask stats 和 session detail legacy roster DTO contract；AgentSession presentation adapter 只允许继续迁出。
- `dead`：Renderer Team runtime sidecar、fake Team formation/preview、`agent_subagent_status:*`、`agent_subagent_stream:*`、raw status parser/type/projector/package/fixture、team-memory child/sibling roster shadow、已退役 runtime vendor/crate/migration/skill。
- `test-only`：retired 名称仅允许存在于 negative guard 和历史 evidence。

## 已知阻塞与归因

1. `verify:local` 被 committed Electron IPC 数组排序测试阻断；修复应由 Electron contract owner 独立认领，随后从第 9 批续跑。
2. `test:contracts` 被并行 release plan 的 docs-boundary 阻断；S7 不接管或修改 release 文件。
3. aggregate Agent fixture 被外部 Skills Provider 鉴权阻断；没有降级到 mock 或生产 fallback。
4. architecture confirmation 缺 PR event/body/base；进入 PR 后必须运行真实门禁。

## 后续细化

1. Rust cold read 把 Approval response 统一输出为结构化 `{ decision, decision_scope, reason_code }`；取消使用 `decision: "cancel"`，不新增前端 legacy 字符串解析。
2. 完成 S6o Harness canonical-list fallback、subtask stats 与 session detail legacy roster DTO contract 的迁出和物理删除。
3. 继续把 S5 Agent Chat compat consumers 按领域迁到 current typed owner，禁止新增 root compat barrel consumer。
4. 由 Electron contract owner 修正 `ipcChannels.test.ts` 的排序断言，使用 `test:resume` 或 batch 9 续跑剩余 Vitest。
5. PR 阶段补 architecture confirmation，并在外部 Skills Provider 可用时重跑 aggregate fixture。

快速骨架阶段完成度为 100%；post-skeleton refinement 保持开放，v2 不标记 archive-ready。
