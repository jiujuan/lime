# Refactor v2 测试体系第二期执行计划

> status: active / LIV-03 Agnes multimodal closed; DeepSWE scoring and Windows/L8 blocked
> owner: quality-workflow
> created: 2026-07-15
> last_updated: 2026-07-17
> source: `internal/research/refactor/v2/**`
> architecture_impact: confirmed in `internal/aiprompts/architecture.md` 6.1/6.2/6.3; developer/PR diagram confirmation still required

## 1. 主目标

以 Refactor v2 完成后的唯一产品链为测试对象，删除重构前的 Benchmark runner、外部数据集门禁和失真测试指南，建立可执行的第二期测试计划：

```text
Electron Desktop Host
  -> App Server JSON-RPC
  -> RuntimeCore
  -> Thread / Turn / Item projection
  -> GUI
```

第二期不继承旧 Benchmark 的通过状态。旧报告只能作为历史 evidence，不能作为当前候选门禁。

## 2. 本轮写集

- `internal/roadmap/benchmark/**`
- `internal/test/**`
- `internal/aiprompts/quality-workflow.md`
- `scripts/agent-qc/benchmark*.mjs`
- `package.json` 中 `agent-qc:benchmark*` 命令
- `internal/exec-plans/refactor-v2-test-phase-2-plan.md`
- `internal/exec-plans/README.md`
- `.gitignore` 中本计划的精确跟踪例外
- `scripts/harness/deepswe-*.mjs`
- `lime-rs/crates/{core,skills,model-provider,agent-runtime,agent,tool-runtime,app-server}/**` 中由真实 DeepSWE trajectory 直接定位的 owner 修复

## 3. 避让集

- conversation import、Plugin、App Server protocol/client 与 GUI 并行热区
- `internal/research/refactor/v2/13-evidence/verification.md` 的并行修改
- `internal/exec-plans/project-gate-a-b-acceptance-plan.md` 及其证据目录
- `package.json` 中非 Benchmark 的当前工作树改动

## 4. 执行阶段

| 阶段                | 状态      | 退出条件                                                                                                                                          |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0 旧基线退役       | completed | 旧 Benchmark runner、manifest、npm 入口和重复文档退出 current 导航                                                                                |
| R1 策略重写         | completed | 质量规则、测试分层、测试作者规则和证据等级对齐 v2/Codex                                                                                           |
| R2 第二期路线图     | completed | 场景矩阵、实施切片、owner、门禁、退出条件和删除账本完整                                                                                           |
| R3 引用收口         | completed | current 文档无悬空链接，历史 evidence 不再被导航为 current                                                                                        |
| R4 验证             | completed | JSON、文档守卫、脚本治理、合同与定向测试通过；跨写集阻塞已精确记录                                                                                |
| R5 DeepSWE 缺陷发现 | completed | Agnes 主测与 gpt-5.5 对照在仓库外隔离 workspace 完成 terminal；确定性 Lime 缺陷已回归；Pier evidence 齐全或 blocker 明确                          |
| R6 MCP 故障闭环     | completed | MCP-02 reverse JSON-RPC Gate B 与 MCP-03 单 server 故障隔离 fresh evidence 通过；暴露的 Desktop Host JSON-RPC error 转发缺陷在 current owner 修复 |
| R7 GUI/ELN 首批闭环 | completed | GUI-01/02、ELN-01/03 fresh Gate B/packaged evidence 通过；Gate B probe identity 误配与 App Server smoke 用户 data root 污染已关闭                 |
| R8 PRV/transport 闭环 | completed | PRV-06 capability/WebSocket/session fallback、App Server 默认栈 dispatcher、stdio 非 turn 并发及完整 Electron current fixture 通过              |

## 5. 删除裁决

- `dead`：重构前 `benchmark-release-v1`、旧 Terminal-Bench/DeepSWE true-run、旧 Managed Objective differential manifest 及配套 runner/test。
- `dead`：旧 dataset selection、版本测试计划和按日期追加的 progress 日志。
- `deprecated -> rewrite`：旧测试总览、单元/集成/E2E/Agent evaluation 指南。
- `current`：Rust related tests、App Server public JSON-RPC integration、current runtime fixture、Gate A、真实 Electron Gate B、live provider 显式 lane。
- `current / adapter v4`：DeepSWE v2 Smoke 10 / Release 20、仓库外 task workspace、current-chain adapter、逐步 provider usage、真实 request tool catalog、runtime step/token cap、wall time 兜底、partial patch 和分层 failure evidence；诊断 true run 已完成，Pier verifier 阻塞。

## 6. 完成定义

1. 新测试策略以 current 产品链为唯一事实源。
2. Agent runtime 逻辑变更默认要求公共边界集成测试，不以组件 mock 或脚本拼装替代。
3. 场景覆盖正常、失败、取消、排队、恢复、分页、过期事件、工具审批和跨进程可见状态。
4. 所有门禁写明能证明和不能证明的内容。
5. 旧 Benchmark 命令、manifest 和 current 导航引用归零。
6. 本轮只完成测试体系基线重建；第二期测试实现按路线图切片继续推进，不伪报覆盖完成。

## 7. 验证记录

### 7.1 已通过

| 命令/检查                                                                                                                                                                       | 结果                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:contracts`                                                                                                                                                        | 通过                                                                                                                                  |
| `npm run governance:scripts`                                                                                                                                                    | 通过                                                                                                                                  |
| `npm run docs:boundary`                                                                                                                                                         | 通过                                                                                                                                  |
| `npm run governance:legacy-report`                                                                                                                                              | 通过；零引用候选 0、分类漂移 0、边界违规 0                                                                                            |
| `npx vitest run scripts/harness/deepswe-coding-slice.test.mjs`                                                                                                                  | 3/3 通过；source、Smoke 10、Release 20 合同有效                                                                                       |
| `npx vitest run scripts/harness/deepswe-adapter.test.mjs scripts/harness/deepswe-coding-slice.test.mjs`                                                                         | 24/24 通过；精确 base、仓库外 workspace、runtime step/token owner、wall-timeout 终态取消、累计 usage、failure owner 与 verifier blocker 有回归 |
| `cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime`                                                                                                                | 118/118 通过；`max_turns=2` 在第三次 sampling 前停止，provider request/step 均严格为 2                                                |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server session_config_projects_bounded_deepswe_provider_step_budget`                                                      | 通过；DeepSWE step budget 投影到 current `AgentSessionConfig.max_turns`，且不能扩大默认上限                                           |
| `cargo build --manifest-path lime-rs/Cargo.toml -p app-server`                                                                                                                  | 通过；Agnes stdio true run 使用新构建 current App Server                                                                              |
| `cargo test -p agent-runtime provider_turn`                                                                                                                                     | 12/12 通过；cwd 注入及 commentary/final phase 通过                                                                                    |
| `cargo test -p model-provider current_client`                                                                                                                                   | 29/29 通过；空 tool placeholder、SSE idle timeout 和 error chain 通过                                                                 |
| App Server coding projection 定向测试                                                                                                                                           | 4/4 通过；commentary/final、取消和失败 item terminal 通过                                                                             |
| App Server current tool inventory / confirmation 定向测试                                                                                                                       | 3/3 通过；删除 `Bash` 正向 fixture 残留，改为 `exec_command` + `cmd`，并验证 approval resume 后投影为 canonical `Command` item        |
| App Server session/projection blocker 定向测试                                                                                                                                  | 4/4 通过；WebSearch canonical item 合同、failed-delete 原子性、empty-prefix crash-tail 修复和 orphan child restart cleanup 已闭环     |
| Gate B `inputbar-pending-steer-rich-restore`                                                                                                                                    | 通过；真实 Electron/IPC/App Server/read model/GUI identity 一致，rich text/image/path/skill 恢复断言全通过，console/page error 为 0   |
| `npm run harness:deepswe:preflight`                                                                                                                                             | 通过；Release 20 共 61 项 source/schema/verifier/image 检查通过                                                                       |
| `npx vitest run scripts/harness/deepswe-adapter.test.mjs`                                                                                                                       | 21/21 通过；runtime token terminal 可由 evidence 反推，wall timeout 会取消并等待真实 terminal；step/token metadata 同步下发             |
| `cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime provider_token_budget -- --nocapture`                                                                           | 1/1 通过；预算恰好耗尽后 provider request=1、工具执行=0、request/step trace 仅 attempt 1                                              |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server session_config_projects_bounded_deepswe_provider_step_budget -- --nocapture`                                       | 1/1 通过；只投影有界正整数 step/token budget，越界 step 与零 token fail closed                                                        |
| Agnes Rust run `20260716T120650Z-fd-deterministic-multi-key-sorting`                                                                                                            | 2 request / 2 step，15,065/12,000 tokens；attempt 2 的 4 个工具调用零执行，无 attempt 3，runtime 自主 cancel                          |
| `cargo test --manifest-path lime-rs/Cargo.toml -p model-provider current_client -- --nocapture`                                                                                  | 33/33 通过；公开 `CurrentProvider.stream` capture 证明 401/429 单次 terminal、501/505 后第 3 次成功、最终 503 分类正确                 |
| `cargo test --manifest-path lime-rs/Cargo.toml -p agent-runtime provider_failure_trace_preserves_auth_rate_limit_and_server_categories -- --nocapture`                           | 1/1 通过；auth/rate_limit/server 与 retryable/non-retryable rejection 进入 current provider trace                                    |
| `npm run smoke:agent-runtime-multimodal-capture`                                                                                                                                | 通过；provider wire 收到 data URL、tools=0、max_tokens=128、enable_thinking=false，canonical read/evidence 只保留 sidecar reference 且无 base64 |
| Agnes LIV-03 `smoke:agent-runtime-multimodal-capture -- --allow-live-provider ...`                                                                                              | 通过；`agnes-2.0-flash` 在 25.5 秒内识别 apple/red，真实 App Server turn 为 completed，read/evidence 无 inline base64                  |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server input_media -- --nocapture`                                                                                        | 2/2 通过；inline 图片落 sidecar、provider-only hydrate、无 sidecar/非法 payload fail closed                                           |
| `npm run test:rust:related -- <DeepSWE owner paths>`                                                                                                                            | 通过；agent-protocol 30/30、agent-runtime 118/118、app-server 1159/1159，全部 scoped 反向依赖 crate 为 0 failed                       |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server provider_history -- --nocapture`                                                                                   | 11/11 通过；batch parts、同 item completed suffix、commentary/final turn-wide full snapshot 完整且不重复                           |
| `npm run test:rust:related -- lime-rs/crates/app-server/src/runtime/provider_history.rs`                                                                                        | 1169/1169 通过；App Server current provider history 反向边界无回归                                                                  |
| `npx vitest run scripts/electron/current-entrypoints.test.mjs scripts/lib/electron-fixture-build.test.mjs`                                                                      | 23/23 通过；renderer smoke build 保留共享 `dist`，build freshness/lock 合同有效                                                       |
| approval resume + renderer concurrent build                                                                                                                                     | 通过；构建期间完整 approval/respond/second no-prompt Gate B 闭环通过，未再出现 `ERR_FILE_NOT_FOUND`                                   |
| `npm run smoke:agent-runtime-current-fixture`                                                                                                                                   | 通过；history/terminal、approval、cancel/continue、queue/hydrate、Coding Workbench、MCP、Skills 与真实 Electron current fixture 全绿  |
| `cargo test -p app-server agent_mailbox_delivery`                                                                                                                               | 9/9 通过；多 Result identity、Result failed terminal、partial delta retry 和 terminal-only ack 回归通过                               |
| `cargo test -p app-server agent_terminal_activity`                                                                                                                              | 15/15 通过；child result、wait/restart/recovery 和 parent mailbox activity 全绿                                                       |
| `cargo test -p app-server agent_control`                                                                                                                                        | 24/24 通过；Codex AgentControl spawn/list/send/follow-up/interrupt/wait/restart 合同全绿                                              |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib agent_control::tests`                                                                                        | 26/26 通过；AGT-04 双 child 同时运行、mailbox 路由、Result 一次聚合、混合 failed/completed 终态和 list 状态隔离全绿                   |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib canonical_message_lifecycle`                                                                                 | 10/10 通过；canonical UserMessage 在 synthesized terminal snapshot 后保留原始 task content，AgentMessage/reasoning fail-closed 未回归 |
| `cargo test --manifest-path lime-rs/Cargo.toml -p app-server --lib commits_large_codex_command_history_within_linear_time_budget`                                               | 通过；1200 commands、fidelity 零丢项，current 增量实现独立耗时 3.51s，低于 30s owner budget                                           |
| `npm run test:rust:related -- <event-store/materializer/performance owner paths>`                                                                                               | 1157/1157 通过；sequence/tool lifecycle fail-closed、canonical notification/read model 与 import 性能反向依赖全绿                     |
| `npm run test:rust:related -- lime-rs/crates/app-server/src/runtime/agent_mailbox_delivery.rs lime-rs/crates/app-server/src/runtime/event_store/canonical_message_lifecycle.rs` | 1152/1152 通过；反向依赖未回归                                                                                                        |
| `npm run smoke:agent-control-cold-restart-gate-b -- --cold-restart`                                                                                                             | 通过；真实 Electron 冷重启后 6 个工具、terminal mailbox Result、child identity、visible DOM 和截图一致                                |
| `node --test scripts/electron/current-docs-guard.test.mjs`                                                                                                                      | 12/12 通过                                                                                                                            |
| Electron current rules guard                                                                                                                                                    | 10/10 通过                                                                                                                            |
| `npm run test:bridge`                                                                                                                                                           | 37/37 通过                                                                                                                            |
| `npx vitest run electron/appServerHost.test.ts scripts/mcp/current-smoke.test.mjs`                                                                                              | 34/34 通过；Desktop Host 业务错误保持 JSON-RPC response，MCP failure isolation guard 有回归                                           |
| `npm run smoke:mcp-current -- --allow-write-fixture`                                                                                                                            | 通过；MCP-03 fresh current evidence 覆盖失败 start、stopped 状态及健康 server 的 status/tool/resource 连续可用                        |
| `npm run smoke:mcp-elicitation-gate-b`                                                                                                                                          | 通过；MCP-02 真实 Electron reverse JSON-RPC、Renderer form、MCP accept ledger 与 provider continuation 全绿                           |
| Claw `complete` fresh Gate B                                                                                                                                                    | 通过；GUI-01/ELN-01 Electron/preload/IPC/App Server/runtime/read model/DOM identity 一致，legacy/mock/page error 为 0                 |
| Claw `cancel-then-continue` fresh Gate B                                                                                                                                        | 通过；GUI-02 cancel、canceled read model、输入恢复与同 session 后续 turn complete 全绿                                                |
| Claw `terminal-failed-after-answer` fresh Gate B                                                                                                                                | 通过；ELN-03 backend failure 保留 partial answer、read model failed、GUI 输入恢复，legacy/mock/page error 为 0                        |
| 四条 App Server stdio/external/packaged smoke                                                                                                                                   | 通过；每条使用隔离临时 `dataDir`，unavailable fail-closed、success、packaged lifecycle 与 packaged backend crash 全绿                 |
| Claw Gate B contract + smoke guards                                                                                                                                             | 66/66 通过；已知 turnId 只接受精确 evidence 匹配，后续 event-read probe 不得冒充产品 turn                                             |
| `npm run test:resume` 的批次 36-109                                                                                                                                             | 全部通过；未重复运行已完成批次                                                                                                        |
| `git diff --check`                                                                                                                                                              | 通过                                                                                                                                  |
| 旧 Benchmark 入口扫描                                                                                                                                                           | 仅命中本计划的删除账本和 DeepSWE 迁移说明，无 current 命令/manifest/runner 命中                                                       |

`npm run verify:local` 已通过版本一致性、i18n、lint 和 typecheck；前端 smart suite 首轮受并行工作区失败中断，随后从批次 36 续跑到 109 并全部通过。

### 7.2 当前阻塞

- 原 3 条 App Server session/projection 失败已关闭：`WebSearch` 旧断言改为 canonical `web_search` item；failed-delete 测试在 durable pending-spawn 依赖恢复后验证内存原子性；empty-prefix crash tail 在无 terminal 有效前缀时只截断安全尾部，不放宽 projection watermark fail-closed。
- Gate B `inputbar-pending-steer-rich-restore` 已独立通过，先前 `identityConsistent=false` 未复现。该旧 evidence 不能继续作为 current blocker。
- live provider preflight 发现真实用户数据中存在 open child + identity + pending mailbox、但 session event/projection history 缺失的 orphan。此前 App Server 启动会以 `SessionNotFound` 退出；current recovery 现删除 unusable child 的 mailbox、identity、session data 和 graph edge，定向回归通过。
- Agnes DSW-02 run `20260716T020910Z-go-genai-streamed-function-args` 在 1,200,000ms 内产生 1,763 个 event、15 个 coding tool item、0 tool failure，但没有任何文件写入，最终为 `budget` + empty patch。它证明 current cwd、command/Read、provider stream 和隔离 workspace 可用，同时再次暴露 Agnes 长 reasoning/只读探索吞吐不足。
- provider usage evidence 缺陷已关闭：current runtime 现在每个 sampling step 投影 `provider.step`，multi-step usage 在 lime-agent 累计，并由 App Server 写入 trajectory/turn terminal；timeout/cancel 不再丢失已消耗 usage。
- adapter v3 Agnes run `20260716T033001Z-go-genai-streamed-function-args` 在 16-provider-step 预算内产生 2,350 个 App Server event、33 个 trajectory item 和 16 个 tool call；16/16 step usage 完整，累计 input 268,495、output 3,829、budget 272,324 tokens。第 16 步经 current cancel 进入 `canceled`，failure owner 为 `budget`，patch 为 0 bytes。
- 该 run 唯一工具失败来自 Agnes 在命令正文中少写临时 cwd 片段；工具实际 `cwd` 正确，随后 15 次工具调用成功。这进一步把无 patch 归到 Agnes coding 吞吐，而不是 Lime cwd、sandbox、transport 或 App Server。
- provider request tool catalog 缺口已关闭：`provider.request.started` 直接携带每次 sampling 的稳定去重工具名，不再用 turn 前未初始化的 inventory 近似。Agnes 同题 3 次旧 request 和 2 次 v4 request 都完整下发 27 个工具，`apply_patch` 每次存在。
- provider step 越界已关闭：旧 2-step run `20260716T081020Z-go-genai-streamed-function-args` 在 adapter 轮询取消前启动 attempt 3；v4 把上限投影到 current reply loop，fresh run `20260716T083349Z-go-genai-streamed-function-args` 只有 attempt 1、2，`budgetCancellation=null`，不存在第 3 次 sampling。
- provider token 越界已关闭：旧 Rust run `20260716T113222Z-fd-deterministic-multi-key-sorting` 在 7 个 completed step 累计 158,754/150,000 tokens 后仍启动 attempt 8；fresh run `20260716T120650Z-fd-deterministic-multi-key-sorting` 在 attempt 2 累计 15,065/12,000 后停止，attempt 2 的 4 个工具调用未执行且不存在 attempt 3。
- MCP-03 首次 current smoke 已关闭：App Server 正确生成 `mcpServer/start` JSON-RPC error，但 Electron `handleJsonLines` 把 `AppServerRequestError` 抛成 IPC/DevBridge error，renderer 原 request 收不到 error line。current Host 现只在 JSONL 转发边界恢复 error response 和原 request id；fresh evidence 证明健康 server 不受失败 server 影响。
- MCP-02 fresh Gate B 已关闭：runtime stdio connection 的 elicitation capability、Renderer form submit、MCP accept ledger、provider final text、真实 Electron/preload/App Server 均通过；management connection 未错误广告 capability，legacy MCP 命中为零。
- `smoke:agent-runtime-current-fixture` 与 `verify:gui-smoke` 本轮均已完整通过；前者覆盖真实 Electron Gate B 的 cancel/continue、approval、queue、MCP、Skills、media contentParts 和 Coding Workbench，后者证明默认 GUI 启动、preload/IPC、App Server sidecar 和 shell 健康。
- Pier `0.3.0` 仍缺少 Docker/Podman/nerdctl/Colima；没有 non-empty candidate 时也没有可交给 verifier 的 patch。当前仍无有效 DeepSWE 分数。

## 8. 完成度与下一刀

- 本轮“测试体系基线重建”完成度：`100%`。R0-R4 均已完成，旧基线已退出，v2/Codex 场景矩阵和 DeepSWE Coding 切片已落库。
- “第二期测试实现”整体完成度：`80%`。确定性 T0-T8 已形成主要 current 证据，CTX-02、PRV-06、App Server transport 与 LIV-03 已关闭；T9 仍是缺陷诊断而非有效评分，T10 的 EVAL-01 与 T11 Windows/L8 未闭环。
- DeepSWE 当前状态：`diagnostic_true_runs_blocked`。adapter v4 缺陷发现闭环已完成；已有 Agnes TS/Go/Rust 主测和 gpt-5.5 对照 trajectory，逐步 usage、真实 request tool catalog 与 runtime step/token cap 证据完整。Agnes 在三种语言任务中均能稳定消费 current coding tools，但在固定预算内无 patch，本机无容器 verifier，尚无有效 Lime App Server DeepSWE 分数。
- current App Server blocker、queue/restore Gate B 和 LIV-03 已关闭；第二期仍未达到完成口径，因为 DSW-02 未产生 non-empty candidate，DSW-03 Smoke 10 calibration 尚未开始，Windows/L8 也未验证。
- AGT-04 owner 场景与 Codex import 性能阻塞均已关闭；App Server related gate 当前为 1157/1157。性能修复没有提高 30s 阈值，而是把独立 1200-command commit 从 106.7s 降到 3.51s。
- 下一刀：Windows RC 与 L8。DeepSWE 只在 Agnes 能产生 non-empty candidate 且具备容器 verifier 时恢复 scoring，不再重复运行已确认的 0-byte 只读 trial。

## 9. DeepSWE 继续实施记录

2026-07-15 用户要求继续清理 `dead/deleted` 并完成 DeepSWE Coding：

- 已物理删除 `.lime/benchmark/runs` 的 45 个旧运行目录（约 27 MB）；保留固定 source cache。
- 已新增 `harness:deepswe:preflight` 与 `harness:deepswe:run`，不恢复 `agent-qc:benchmark*`。
- adapter 使用 `workspace/ensure -> agentSession/start/update/turn/start/read -> evidence/export`，输出 run context、trajectory、Thread/Turn/Item、tool lifecycle 和 patch。
- Pier 只接收 candidate patch；临时 replay task 不包含 DeepSWE reference solution，必须返回 `reward.json`、`ctrf.json` 和 `test-stdout.txt`。
- `DSW-00` 已完成：Release 20 共 61 项 source/schema/verifier/image 检查通过。
- `DSW-01` 已执行 Agnes 主测与 gpt-5.5 对照。真实 trajectory 已定位并修复 cwd 传播、模型可见 cwd、skill root 隔离、空 tool placeholder、Bash 重定向误判、伪 final、失败 item 未终态、SSE 总 timeout、错误链丢失、workspace 依赖污染和大 patch `ENOBUFS`。
- gpt-5.5 对照固化 6 文件、189 增/29 删、1,235,341 字节 patch；原 trial 因宿主 `node_modules` 污染不计分，但 patch/evidence 保留用于诊断。
- adapter v2 Agnes run `20260715T212218Z-happy-dom-abort-pending-body-reads` 记录 3,691 条事件，活动 SSE 约 78 分钟且未再被 600 秒总时限截断；最终 5,400,000ms 预算耗尽、empty patch，归 `budget`。
- 本机 Pier `0.3.0` 已可用；无 Docker、Podman、nerdctl 或 Colima，adapter 将其写成独立 verifier blocker，不生成伪造分数。
- 已删除 9 个过时 bring-up run（约 155 MB）和两条保留诊断 run 中的仓库内 clone；只保留 JSON/patch evidence 与固定 source cache。

## 10. 2026-07-16 current 主链缺陷记录

- 扩展 Rust related 不是为了扩大 case 数量，而是验证 DeepSWE 修复是否破坏反向依赖；它直接发现并关闭 3 个 App Server session/projection blocker。
- `Bash` 退役迁移残留已从 App Server 正向 fixture 清除，current 测试只消费 `exec_command` / canonical `Command`。
- Gate B queue/restore 已在相同 external controlled fixture 下通过；先前失败 evidence 不再代表 current 状态。
- AGT-03 cold-restart Gate B 首次 fresh run 暴露真实 Lime 缺陷：Result mailbox 只写 `message.delta(status=completed)`，多个结果在同一 turn 触发 canonical Item identity conflict，且 partial delta 会被错误 ack。现已在 `app-server` owner 修复为 `message.delta(status=in_progress) -> message.completed(terminal)`，canonical ack 只接受 terminal Item；9 条 owner 回归、1152 条 related Rust、真实 Electron cold-restart Gate B 全部通过。
- 同一修复暴露旧 Gate B runner 的截断断言：`wait_agent` 返回多个 terminal activity 后，500 字符 preview 中找不到 `timed_out`。runner 现用完整 current read-model tool output 做场景断言，evidence 仍保留短 preview；该改动属于测试方案修正，不是生产 mock 或放宽门禁。
- startup orphan failure 与 live 模型无关；它来自 durable agent graph 和缺失 session history 的恢复边界，已在 App Server owner 层补回归。

## 11. 2026-07-16 Agnes DSW-02 记录

- 固定 provider `custom-637ea2d5-e430-43de-86de-39c5f1735438`、model `agnes-2.0-flash`；Agnes provider 只有该文本模型，两个 `agnes-image-*` 不进入 coding eval。
- Go task 在系统临时 workspace 和 SQLite vacuum snapshot 中执行；模型先误搜 TypeScript，随后正确读取 `types.go`、`models.go`、`live.go`，说明工具/cwd/stream current 链有效。
- 20 分钟内没有 `Write`、patch 或 git diff；失败归 `budget`，不归 `tool-runtime`、`transport` 或 `app-server`。
- adapter timeout 原先会丢失 partial `currentChain`；现已在 Error 上携带 provider/model/session/turn/timestamp/evidenceCapture，并由 CLI catch 持久化，当前 adapter 18/18 回归通过。
- 已删除本地旧 BrowserGym、Tau-Bench、Terminal-Bench、WebArena source cache 及旧 fixture/release evidence，约 373 MB；DeepSWE source、Pier 和 v2 diagnostic runs 保留为 current。

## 12. 2026-07-16 adapter v3 与 Agnes usage 记录

- `agent-runtime` 新增每步 `ProviderStep`，`lime-agent` 累加所有 sampling step usage，App Server 投影 current `provider.step` 并把累计 usage 带到 `turn.completed`。
- DeepSWE adapter v3 新增 `provider-steps.json`、provider step budget、token budget 和 current `agentSession/turn/cancel`；默认 32 steps / 500,000 tokens，token 公式为 `max(0, input_tokens - cached_input_tokens) + output_tokens`。
- Agnes v3 true run 以 16 steps / 500,000 tokens 诊断预算运行，16/16 usage 完整，最终由 step budget 取消且无 candidate。该结果已经能区分模型行为与 Lime 基础设施，不再继续无差别刷 Go/Rust 题。
- 两条全套负载 flaky 已关闭：terminal activity 测试改为 `timeout_ms=0` 的状态驱动恢复；confirmation 测试移除进程全局环境修改并在双 worker runtime 中完成初始化。related 反向依赖全套通过且未复现。
- 聚合 Agent Runtime fixture 发现 renderer smoke build 回流为 `LIME_VITE_EMPTY_OUT_DIR=1`：build lock 只串行构建动作，不能保护并行 Gate B fixture 对共享 `dist/index.html` 的消费，导致 approval reload 命中 `ERR_FILE_NOT_FOUND`。已恢复 `LIME_VITE_EMPTY_OUT_DIR=0` 并反转 current entrypoint guard；旧实现上的回归断言先失败，修复后并发 build + approval Gate B 与完整聚合 smoke 均通过。

## 13. 2026-07-16 AGT-03 current 缺陷闭环

- 失败证据：`.lime/qc/phase2-agt03-agent-control-cold-restart-20260716.json`。原始报错为 `AgentMessage event message.delta targets Item ... while ... is active`；这不是 Agnes/provider 行为，而是 Lime canonical lifecycle 与 mailbox Result 终态不一致。
- 根因：旧 `mailbox_message_runtime_event` 对 `AgentMailboxMessageKind::Result` 只生成 delta，并把 presentation status 写成 `completed`；旧 `canonical_mailbox_item_exists` 只按 Item ID 判断存在，未检查 `ItemStatus::is_terminal()`。因此两个不同 Result 在一个 turn 中违反 Codex 的 start/complete 顺序，崩溃重放也可能提前 ack。
- current 修复：Result 生成 `message.delta(in_progress)` 和同 itemId 的 `message.completed`；`canonical_mailbox_item_is_terminal` 只允许 terminal Item ack；重放时可由 mailbox messageId 去重 delta 并补齐缺失 completion；Failed Result 投影为 `ItemStatus::Failed`。canonical lifecycle 的 fail-closed identity 规则保持不变。
- 测试方案修正：Gate B runner 保留短 preview 作为 evidence 展示，但场景断言消费完整 read-model tool output，避免多 mailbox Result 让旧截断字符串断言误报。
- fresh 证据：`.lime/qc/phase2-agt03-agent-control-cold-restart-20260716-fixed-v2.json`，真实 Electron/preload/IPC/App Server/runtime/read model/GUI 冷重启链通过，6/6 AgentControl tool completed，visible DOM 和截图通过；`liveProviderUsed=false`。

## 14. 2026-07-16 AGT-04 并发 child 缺陷闭环

- 失败证据来自双 child owner 回归：session/thread、agent path 和 mailbox item identity 均正确，但 child canonical `UserMessage.content` 为 `""`，只有 identity metadata 的 `last_task_message` 保留原文。旧测试只断言 item 存在，没有验证模型实际收到的 canonical task 内容。
- 根因：canonical lifecycle 为 `message.created` 合成 `item.started -> item.completed`；terminal snapshot 没有重复内容，而 `thread_item_projection::merge_payload` 缺少 `UserMessage` 合并规则，导致最后一个空 terminal snapshot 覆盖先前完整 payload。
- current 修复：UserMessage snapshot 只在新 content 非空时覆盖，并保留已有 `client_id`；不新增兼容 payload、不放宽 canonical lifecycle 校验。
- AGT-04 现验证两个 child 同时处于 running、session/thread/mailbox 路由不串、两个 terminal Result 一次聚合且二次 wait 不重复、并发 QueueOnly message 各入目标 mailbox、failed child 与 completed sibling 状态独立。
- 定向验证：AgentControl 26/26、canonical message lifecycle 10/10；`smoke:agent-runtime-current-fixture` 在重新构建 renderer/Electron/App Server 产物后通过，`liveProviderUsed=false`。后续 current owner 关闭 import 性能退化，App Server related 全量更新为 1157/1157。

## 15. 2026-07-16 Codex import 性能缺陷闭环

- 失败证据：1200-command import 在全量/独立运行分别耗时 174.4s/106.7s，超过固定 30s owner budget；fidelity 内容正确，因此属于 event processing 复杂度退化，不是 parser、模型或数据源失败。
- 根因：旧 `append_runtime_events_to_stored_session` 为每个候选事件重新扫描并 clone 全部 validation context；canonical notification 同样为每个事件重建累计 history 并全量 materialize。长历史因此形成重复 O(n²) 工作。
- current 修复：sequence verifier 和 tool lifecycle validator 改为一次初始化、逐事件 validate-and-observe；canonical notification 使用与 Codex change accumulator 同语义的 `IncrementalMaterializer`，每个事件只返回本次改变的 Turn/Item snapshot。fail-closed 合同和最终 read model 保持不变。
- fresh evidence：独立 1200-command 门禁 3.51s；`npm run test:rust:related -- <event-store/materializer/performance owner paths>` 为 1157/1157；此前完整 `smoke:agent-runtime-current-fixture` 在上述增量 notification 改动落盘后通过，`liveProviderUsed=false`。

## 16. 2026-07-16 DeepSWE tool catalog 与 runtime step cap 闭环

- 旧证据缺口：冷启动 `agentSession/toolInventory/read` 返回 `agentInitialized=false` 和 0 个工具，不能证明模型请求实际拿到什么。current `provider.request.started` 现从 sampling 冻结的 `RuntimeToolStepSnapshot` 记录稳定、去重的 `tool_names`；adapter 汇总每步和全 run tool catalog。
- Agnes run `20260716T081020Z-go-genai-streamed-function-args` 证明三次 request 都有相同 27 个工具，`Read`、`Grep`、`exec_command`、`apply_patch` 每次存在；无 patch 因而不是 Lime 隐藏写工具。该 run 同时暴露 2-step 预算仍启动 attempt 3，因为 adapter 只能在 evidence 轮询后取消。
- current 修复：DeepSWE 把 `runtimeRequest.metadata.harness.provider_budget.max_provider_steps` 投影到 `AgentSessionConfig.max_turns`，由 reply loop 在捕获工具 snapshot 和启动 provider stream 前检查。adapter v4 外部轮询只取消 token budget，避免 step budget 双 owner 竞态。
- fresh evidence：`20260716T083349Z-go-genai-streamed-function-args` 只有两个 request、两个 completed step，`budgetCancellation=null`，runtime max-turn 文案进入 canonical Thread/Turn/Item；累计 budget tokens 19,905，两个 request 均有完整 27 工具和 `apply_patch`。Agnes 仍无 patch，failure owner 为 `model`，属于模型在 2-step 诊断预算内只读探索。

## 17. 2026-07-16 MCP-02/MCP-03 current 缺陷闭环

- MCP-03 首次真实运行在健康 stdio server 旁启动一个必然失败的 server。App Server 已生成正确 JSON-RPC error，但 `ElectronAppServerHost.handleJsonLines` 把 `AppServerRequestError` 继续抛到 IPC/DevBridge，renderer 原 request 无法观察业务 error line。
- current 修复保留高阶 `request()` 的异常合同；只有 JSONL 转发边界把 `AppServerRequestError.messages/response` 恢复为 JSON-RPC response，并还原 renderer 原 request id。transport timeout、stale restart 和 sidecar lifecycle 错误仍按原语义抛出。
- MCP-03 fresh evidence：`.lime/qc/gui-evidence/mcp-current/phase2-mcp03-failure-isolation-20260716-fixed-summary.json`。`appServerHandleJsonLinesSeen=true`，失败 start 可观察且 server 为 stopped；健康 server 仍 running，tool 仍可 list/call，resource 仍可 read，legacy MCP command 为 0。
- MCP-02 fresh Gate B：`.lime/qc/gui-evidence/mcp-elicitation-gate-b/mcp-elicitation-gate-b-summary.json`，`checkedAt=2026-07-16T08:56:37.214Z`。真实 Electron/preload/`app_server_handle_json_lines`、runtime elicitation capability、Renderer form、MCP accept ledger、provider 第二次请求及 final text 全部通过，console error 和 missing method 均为 0。
- 回归与合同：Electron Host + MCP guard 34/34；`npm run test:contracts` 通过。contract guard 同步改为守住 current 增量 `EventValidationContext -> AgentEventSequenceValidator/ToolLifecycleValidator -> validate_and_observe` owner，不再要求已退役的逐事件全历史校验调用字符串。

## 18. 2026-07-16 GUI-01/02 与 ELN-01/03 缺陷闭环

- GUI-01/ELN-01 首次 fresh complete Gate B 业务 turn 已完成，但 identity collector 把后续 `event-read-probe` 的 `agentSession/turn/start` response 当成产品 turn，误报 `turnConsistent=false`。根因是 `findByTurnId` 精确匹配失败后无条件退回最后一个 entry。
- current 修复：已知 primary turnId 时，App Server/backend evidence 只接受精确匹配；不存在精确 request-log response 时保持 null，由 Electron trace、runtime ledger 与 read model 提供独立同 turn 证据。回归先在旧逻辑下稳定失败，修复后 Gate B contract + smoke guards 66/66。
- GUI-01/ELN-01 fresh evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/phase2-gui01-eln01-20260716-fixed-summary.json`。Renderer/trace/runtime/read model session/turn/item identity 一致，Electron/preload/IPC/current JSON-RPC、terminal DOM 与 screenshot 通过，legacy/mock/page error 为 0。
- GUI-02 fresh evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/phase2-gui02-20260716-summary.json`。GUI stop 命中 current cancel，read model 为 canceled、输入框恢复；同 session 发送“继续输出”后第二 turn 完成，legacy/mock/page error 为 0。
- ELN-03 fresh Electron evidence：`.lime/qc/gui-evidence/claw-chat-current-fixture/phase2-eln03-backend-failure-20260716-summary.json`。backend 在 partial answer 后失败，GUI 保留正文且不泄露底层 failure text，read model 为 failed，输入框恢复，identity 与 current bridge 全绿。
- packaged unavailable 首次运行报真实用户 data root 下固定 session 的 `SequenceRegression`，证明旧 App Server smoke 未隔离持久化状态。隔离后继续暴露 stdio 把先到的 notification 误当 response，以及 packaged failure 漏复制 runtime dylib；现分别按 request id 等待 response、复用 Electron runtime library copy owner。stdio、external、packaged lifecycle、packaged backend failure 四条 smoke 全部注入本轮临时 `dataDir`，fresh success/failure/unavailable 均通过；contract guard 扩为 291 项并逐入口防回流。未删除或修改真实用户目录数据。

## 19. 2026-07-16 multimodal 与 runtime token budget 闭环

- 多模态旧缺口是 inline base64 进入 canonical persistence，历史恢复无法在 provider 边界安全重放。current App Server 现先写 sidecar，EventLog/read model 只保存 reference；provider 执行前校验 sha256/大小并瞬时 hydrate。Chat/Responses/Anthropic lowering、历史图片恢复和 provider capture 均通过。
- Codex 语义已固化：当前回合新图片遇到 text-only 模型在网络前拒绝；历史图片降为明确占位文本，不阻塞后续文本回合。2026-07-16 的 Agnes registry/cache 曾把 `agnes-2.0-flash` 错标为 text-only；该事实已由 2026-07-17 LIV-03 修复和 live evidence 取代。
- `governance:legacy-report` 首轮发现 `input_media.rs` 重复写死 `sidecarRef`；实现改为复用 `output_refs::SIDECAR_REF_FIELD`，未扩大白名单。复跑为零引用候选 0、分类漂移 0、边界违规 0。
- DeepSWE Rust 旧 run 在 token 超限后仍启动下一 sampling。current `agent-runtime` 现在拥有 provider step/token budget；带工具调用的 step 达标后，工具零执行、下一 request 零启动。fresh Agnes run 的 adapter `requestedAt=null`，证明终止来自 runtime 而非轮询抢先 cancel。
- 验证：受影响 Rust related 13 个 crate 全部退出 0；adapter 20/20；App Server/agent-runtime 定向回归全绿；multimodal provider capture、contracts、scripts/legacy governance、完整 Agent Runtime Electron fixture 与 `verify:gui-smoke` 通过。
- 架构图文字已同步到 `internal/aiprompts/architecture.md` 6.2/6.3；进入 release evidence 前仍需责任开发者在 PR 描述确认该架构变更。

## 20. 2026-07-16 PRV-05 provider failure 语义闭环

- 旧测试全部绿色，但固化了错误重试集合：请求层自动重试 408/409/425/429，只列举 500/502/503/504，既会把 rate limit 放大成五次请求，也不符合 Codex 的全部 5xx 规则。
- Codex current `ModelProviderInfo -> ApiRetryConfig` 默认 `request_max_retries=4`、`retry_429=false`、`retry_5xx=true`、`retry_transport=true`。Lime 保持相同的初始请求加 4 次上限，并把自动重试决策与错误 `retryable` 分类拆开。
- current `model-provider` 现在只为全部 5xx 和 transport 执行请求层重试；401/403/429 直接返回 terminal。429 仍分类为 `RateLimit` 且 `retryable=true`，表示失败性质，不再被误用为本请求继续发送的许可。
- 测试改从公开 `CurrentProvider.stream(CurrentProviderRequest)` 进入 localhost capture：401 和 429 均只收到 1 个 HTTP request；501/505 后第 3 次成功；最终 503 保留 `ProviderInternal + retryable`。agent-runtime trace 的 auth/rate_limit/server 分类回归通过。
- related 验证覆盖 agent-runtime、App Server、agent、CLI、MCP、media-runtime、processor、scheduler、server、services、skills、model-provider、tool-runtime 共 13 个 crate，全部 0 failed；其中 agent-runtime 120/120、App Server 1166/1166、model-provider 128/128。

## 21. 2026-07-16 CTX-01 provider history 闭环与 PRV-06 审计

- CTX-01 旧实现只从 `message.delta/message.delta_batch/message.batch` 的标量 `text/delta/content` 读取正文，batch array 会静默丢失；`message.completed` 即使携带 full-text snapshot 也完全忽略。GUI/read model 的 full-text 去重测试因此不能证明下一轮 provider 实际收到完整历史。
- current `provider_history` 现在递归解析 `deltas/messages/items/parts/content`，并记录每个 assistant item 的累计正文。completed snapshot 先与整个 assistant turn 比较，再回退同 item 前缀，只补缺失后缀；覆盖单 item `delta(prefix) -> completed(full)` 以及 commentary/final 多 item的 turn-wide snapshot。
- owner 回归 11/11、App Server related 1169/1169。完整 `smoke:agent-runtime-current-fixture` 重新构建 App Server sidecar 后通过，覆盖真实 Electron Gate B 的 cancel/continue、pending steer queue、Plan/history hydrate、Skills、MCP、media、approval 和 Coding Workbench，`liveProviderUsed=false`。
- PRV-06 审计确认 Lime current provider 没有 WebSocket transport、provider capability 字段或 session-scoped fallback state。Codex 的实现会 capability-gate Responses WebSocket，在重试耗尽后把当前 session sticky 切到 HTTPS；这属于未实现产品能力，不新增 benchmark-only transport，也不把 HTTP SSE 单路径测试冒充 fallback 证据。

## 22. 2026-07-16 CTX-02 compaction/truncation 闭环

- 旧绿测只断言 `context.compaction.completed` 早于 `turn.started`，以及下一轮 runtime metadata 存在 summary context；测试 backend 没有覆盖 `start_turn_with_provider_history`，因此实际发送完整旧历史也会通过。
- 新回归从公开 `RuntimeCore::start_turn` 连续执行 6 个 turn，并在第 7 个 turn 捕获 `ExecutionBackend::start_turn_with_provider_history`。旧实现首先失败于摘要不含 `fact-from-turn-1`：`build_summary` 只复制最近 4 个 tail turn；继续检查可见 provider history 时，旧前缀仍完整存在。
- 对照 Codex `ContextManager::replace_history` / `replace_compacted_history` 后，Lime current owner 保持 durable EventLog、Thread/Turn/Item read model 全量，只重写 model-visible transcript。`session_context_compaction.v2` summary 只接续 `tailStartTurnId` 之前的 turn；provider history 从最新有效 tail event 重建，本轮 input 仍独立提交；无效 boundary fail open，不静默丢历史。
- 同一场景发现历史 `ToolOutput.outputRef` 会优先读取完整 sidecar，绕过 append 边界的 preview。current provider history 现只消费 canonical preview；异常未 offload 的 inline output 再按 10,000-byte provider 上限截断，full sidecar 只供显式 artifact/evidence/read owner。
- 失败证据：修复前 `auto_compaction_replaces_provider_prefix_with_summary_and_bounded_tail` 在 `summary.contains("fact-from-turn-1")` 处稳定失败。修复后 provider history 不含 turn 1/2，保留 turn 3-6，summary 含 turn 1/2 且不重复 turn 3，durable events 仍可读 turn 1。
- 验证：provider history 12/12、auto compaction 4/4、session compact 2/2；App Server unit/related 1171/1171；`npm run test:contracts` 的 App Server contract 291 项及命令/modality/scripts/docs 守卫全绿；完整 `npm run smoke:agent-runtime-current-fixture` 通过真实 Electron/preload/IPC/App Server/runtime/read model 的 cancel/continue、queue、approval、Plan/history、Skills、MCP、media 与 Coding Workbench，`liveProviderUsed=false`。
- 分类：App Server compaction/provider history 为 `current / closed`；旧“summary metadata 存在即算压缩成功”和“provider history 自动 rehydrate full output sidecar”语义为 `dead / deleted / forbidden-to-restore`。架构文字已同步；进入 release evidence 前仍需责任开发者在 PR 描述确认本次 provider-history rewrite 边界。

## 23. 2026-07-16 PRV-06 Responses WebSocket 与 session fallback

- 首次失败 capture 从公开 `CurrentProviderClient::stream` 进入 localhost fixture：`supports_websockets=true` 时旧实现实际仍是 `POST /v1/responses`，失败信息为 `capability=true must use a WebSocket upgrade, actual=POST /v1/responses HTTP/1.1`。这证明缺口属于 production transport，不是 benchmark case 数量不足。
- current capability owner 是 `ProviderRuntimeSpec.supports_websockets`；OpenAI/OpenAI Responses/Codex 显式声明支持，Gateway/NewApi/其他 provider 默认 false。direct runtime request 可以显式提交 `supportsWebsockets`，未声明即 HTTP；`model-provider` 不按名称猜测。
- `AgentRuntimeState` 从全局单 provider 改为 session map。同一 session 且 route/config 相同复用同一个 client，不同 session 隔离；route 变化替换当前 session client，`ExecutionBackend::close_session` 清理 transport state。
- `model-provider` 现在向 `ws(s)://.../v1/responses` 发真实 Upgrade，携带 `OpenAI-Beta: responses_websockets=2026-02-06`，发送去掉 HTTP-only `stream/background` 的 `response.create`。SSE 与 WebSocket 共享一个 Responses reducer；同一连接严格串行承载多个 sampling request，不 multiplex。
- 426 或 Upgrade 重试耗尽会立即/最终 replay HTTP，并把 session sticky 切到 HTTP。Upgrade 成功后若在首个 canonical event 前断线或命中 connection-limit error，也只 replay 一次完整 HTTP request；已经发出 text/tool event 后禁止 replay。取消或未完整消费的流会淘汰连接，避免下一 Turn 读取旧 frame。
- 证据：capability=false 为 `POST`；capability=true 成功链为单次 `GET` 加两个串行 `response.create`；426 跨两次 client request 为 `GET -> POST -> POST`；重试耗尽为 5 次 `GET` 后 1 次 `POST`；Upgrade 后首事件前 close 为 `GET -> POST`。RuntimeBackend 连续两个真实 turn 同样得到 `GET 426 -> POST -> POST`，证明 provider configuration 确实复用 session client。
- 已通过：`model-provider` 135/135、`lime-agent` 270/270、core provider spec 定向、App Server direct capability 与两 Turn fallback 定向、App Server 1175/1175、App Server client contract 291 项及完整 Electron current fixture。短问候 Gate B 的 `firstTextDeltaToFirstTextPaintMs=25`，预算未放宽。
- 文件退出条件：`current_client.rs` 在本轮前已因大型 inline tests 超过 1,400 行，本轮虽把 transport stream 放入 `current_client/websocket.rs`，主文件仍超过 1,000 行。进入 PRV-06 release evidence 前必须把 inline tests 按 lowering/stream/transport/websocket 拆到子模块；在此之前不得继续向主文件堆业务逻辑。
- 分类：Responses WebSocket transport、provider capability 和 session client cache 为 `current / closed`；旧“Responses 协议天然等于只走 HTTP SSE”和“全局 provider 足以表达 session fallback”的语义为 `dead / deleted / forbidden-to-restore`。架构文字已同步；进入 release evidence 前仍需责任开发者在 PR 描述确认 provider client lifetime 与 replay 边界。

## 24. 2026-07-17 PRV-06 扩大门禁与 App Server transport 闭环

- TS boundary 首次失败证明 `supportsWebsockets=true` 在 `runtimeRequest.providerConfig` normalization 中被丢弃。current `app-server-client` 现同时接受 camelCase/snake_case 布尔值并拒绝非法字符串，generated schema 与 Rust protocol 同步；client 66/66、normalization 2/2、protocol 49 + schema fixture 通过。
- MCP public JSON-RPC 精确回归在默认 2 MiB 栈稳定 stack overflow，`RUST_MIN_STACK=8MiB` 才通过，且第一条 `initialize` 已复现，排除 MCP server 本身。根因是 725 行 async dispatcher 把 290 个 handler future 内联进同一 future；current dispatcher 先将分支装箱，再统一 await，默认栈回归与 App Server 全量通过。
- 真实 Electron Gate B 首次 ledger 为空并在 30 秒超时。根因是 stdio loop 只 task 化 turn/media，任一非 turn 长请求会阻塞所有后续 Desktop Host IPC。current transport 保持 `initialize` 内联，初始化后 task 化全部 request，notification/response 保持内联，serialization scope 继续负责资源顺序；长 external turn 期间并发 `agentSession/list` 回归通过。
- App Server 全量扩大首次留下两个环境污染项。PTY 测试继承真实用户 zsh rc，只收到命令回显；旧 marker 断言还会把输入回显误当执行结果。current fixture 现注入确定性 shell，并要求 marker 同时出现在回显与命令输出，2/2 精确回归通过。plain directory status 则被无 deadline `git rev-parse` 卡死；对齐 Codex 后先做 `.git` ancestor preflight，仓库内 Git 改为 async process + `kill_on_drop` + 5 秒 timeout，合成 timeout 回归 50ms 通过。
- fresh 证据：App Server `1175 passed / 0 failed`；完整 `npm run smoke:agent-runtime-current-fixture` 通过 history、terminal、首页热路径、Coding Workbench、图片、cancel/continue、approval、queue、Plan、Skills、MCP、media、Expert 与 Content Factory，`liveProviderUsed=false`。短问候 provider wait 90ms、renderer apply 1ms、first text delta 到 paint 25ms；此前高负载下的 379ms 未复现，预算保持不变。
- contract guard 不再把旧 `.await` 源码形状当协议事实；method→handler 比较语义化忽略 `.await`、`.boxed()` 和同步 `ready(...)` 包装，MCP guard 同步。完整 `npm run test:contracts` 已通过，包含 App Server client contract 291 项及命令、modality、scripts、release、cleanup 与 docs 边界。
- 分类：dispatcher、stdio transport、Project Shell/Git process owner 与 PRV-06 均为 `current / closed`；旧单体 future、初始化后串行 stdio request、真实用户 rc 测试依赖和无界 blocking Git 为 `dead / deleted / forbidden-to-restore`。DeepSWE/Agnes 状态未变化：没有 non-empty candidate 且本机无容器 verifier，不生成分数。

## 25. 2026-07-17 LIV-03 Agnes 多模态与 DeepSWE timeout 收口

- LIV-03 首次失败不是单一模型能力问题：`agnes-2.0-flash` 被 registry 标为 text-only，自定义 Provider UUID 绕过能力推断，旧 model cache 又持久化 `vision=false`。current model list 现稳定返回 `vision=true`、`inputModalities=["text","image"]`，旧错误 cache 不再污染路由。
- 普通 ReAct harness 曾向图片理解回合暴露完整 coding tool catalog，Agnes 因而幻觉调用不存在图片路径。current harness metadata 现在投影 `tool_surface=direct_answer` 与 `max_provider_steps=1`；确定性 provider capture 证明 request `tools=0`。
- Agnes 官方请求需要 `max_tokens` 与 `chat_template_kwargs.enable_thinking`。Lime 原先虽有 canonical generation/provider options，current client 和 provider lowering 会丢弃。current owner 现贯通 `CurrentProviderRequest -> CanonicalRequest -> Chat/Responses/Anthropic lowering`；capture 精确得到 `max_tokens=128`、`enable_thinking=false`。
- deterministic capture 同时证明图片只在 provider wire 瞬时 hydrate，Thread/Turn/Item read model 与 evidence 只保留 sidecar reference、没有 inline base64，turn 为 completed。随后 Agnes live 在 25.5 秒内识别 probe 中的 apple/red 并以真实 completed terminal 收敛，LIV-03 关闭。
- DeepSWE adapter 的 wall timeout 原先直接抛错并留下 running turn。adapter v4 现在先调用 public `agentSession/turn/cancel`，最多等待 10 秒读取真实 terminal，再写 terminal/partial evidence；timeout 仍归 failure，不会把 canceled 冒充成功。adapter 回归 21/21。
- 分类：generation lowering、Agnes capability/cache、direct-answer tool surface、multimodal provider capture 和 timeout cancel/wait 都是 `current / closed`；旧 text-only Agnes cache、图片理解 ReAct 工具面、generation options 丢弃和 timeout 后遗留 running turn 为 `dead / deleted / forbidden-to-restore`。DeepSWE scoring 仍 blocked：Agnes coding 无 non-empty candidate，本机无容器 verifier。

## 26. 2026-07-17 approval compact timeline Gate B oracle 收口

- generation/direct-answer 改动后的完整 `smoke:agent-runtime-current-fixture` 首次在 approval resume 场景超时；backend `action/respond`、assistant final、completed terminal 和输入框恢复都已成立，但 `approvalRecordShape.recordCount=0`。
- 根因不是 production 审批记录丢失。当前工作树的新产品合同会把刚完成的长过程也折叠为 compact timeline，截图明确显示 `2 项 / 查看待处理项`；旧 Gate B 仍等待 `timeline-approval-record` 自动可见，因此把可展开的 current 记录误报成缺失。
- current Gate B oracle 现在先确认 terminal 文案、输入恢复和零 stop button；若要求审批记录且同 turn 存在 compact timeline，则点击 `message-list-historical-timeline-preview:leading`，展开后再断言唯一只读记录。completed/canceled 两条等待链共用同一判断，不新增 scenario 特判。
- fresh approval resume Gate B 得到唯一 `权限记录·本会话允许`，无原 prompt、请求/范围/来源详情泄漏；第二 turn 命中 session cache 且不重复弹审批。Electron/preload/IPC/App Server identity 一致，legacy/mock/page error 为零。
- 验证：completion wait + fixture guard `66/66`；定向 approval resume Gate B 通过；完整 `npm run smoke:agent-runtime-current-fixture` 重新通过首页、Workbench、图片、cancel/continue、四类 approval、queue/restore、Plan、Skills、MCP、media、Expert 和 Content Factory，`liveProviderUsed=false`。
- 分类：compact terminal timeline 与可展开审批审计记录为 `current / closed`；“terminal approval record 必须默认展开才算存在”的旧 oracle 为 `dead / deleted / forbidden-to-restore`。本轮没有为测试回退 production UI。
