# Refactor v2 测试体系第二期执行计划

> status: completed / phase-2 roadmap implementation continues; DeepSWE scoring blocked
> owner: quality-workflow
> created: 2026-07-15
> last_updated: 2026-07-16
> source: `internal/research/refactor/v2/**`
> architecture_impact: none; 本计划只重建测试与证据体系，不改变产品 owner 或依赖方向

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

| 阶段                | 状态      | 退出条件                                                                                                                 |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| R0 旧基线退役       | completed | 旧 Benchmark runner、manifest、npm 入口和重复文档退出 current 导航                                                       |
| R1 策略重写         | completed | 质量规则、测试分层、测试作者规则和证据等级对齐 v2/Codex                                                                  |
| R2 第二期路线图     | completed | 场景矩阵、实施切片、owner、门禁、退出条件和删除账本完整                                                                  |
| R3 引用收口         | completed | current 文档无悬空链接，历史 evidence 不再被导航为 current                                                               |
| R4 验证             | completed | JSON、文档守卫、脚本治理、合同与定向测试通过；跨写集阻塞已精确记录                                                       |
| R5 DeepSWE 缺陷发现 | completed | Agnes 主测与 gpt-5.5 对照在仓库外隔离 workspace 完成 terminal；确定性 Lime 缺陷已回归；Pier evidence 齐全或 blocker 明确 |

## 5. 删除裁决

- `dead`：重构前 `benchmark-release-v1`、旧 Terminal-Bench/DeepSWE true-run、旧 Managed Objective differential manifest 及配套 runner/test。
- `dead`：旧 dataset selection、版本测试计划和按日期追加的 progress 日志。
- `deprecated -> rewrite`：旧测试总览、单元/集成/E2E/Agent evaluation 指南。
- `current`：Rust related tests、App Server public JSON-RPC integration、current runtime fixture、Gate A、真实 Electron Gate B、live provider 显式 lane。
- `current / adapter v3`：DeepSWE v2 Smoke 10 / Release 20、仓库外 task workspace、current-chain adapter、逐步 provider usage、step/token/wall time 预算、partial patch 和分层 failure evidence；诊断 true run 已完成，Pier verifier 阻塞。

## 6. 完成定义

1. 新测试策略以 current 产品链为唯一事实源。
2. Agent runtime 逻辑变更默认要求公共边界集成测试，不以组件 mock 或脚本拼装替代。
3. 场景覆盖正常、失败、取消、排队、恢复、分页、过期事件、工具审批和跨进程可见状态。
4. 所有门禁写明能证明和不能证明的内容。
5. 旧 Benchmark 命令、manifest 和 current 导航引用归零。
6. 本轮只完成测试体系基线重建；第二期测试实现按路线图切片继续推进，不伪报覆盖完成。

## 7. 验证记录

### 7.1 已通过

| 命令/检查                                                                                               | 结果                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:contracts`                                                                                | 通过                                                                                                                                               |
| `npm run governance:scripts`                                                                            | 通过                                                                                                                                               |
| `npm run docs:boundary`                                                                                 | 通过                                                                                                                                               |
| `npm run governance:legacy-report`                                                                      | 通过；零引用候选 0、分类漂移 0、边界违规 0                                                                                                         |
| `npx vitest run scripts/harness/deepswe-coding-slice.test.mjs`                                          | 3/3 通过；source、Smoke 10、Release 20 合同有效                                                                                                    |
| `npx vitest run scripts/harness/deepswe-adapter.test.mjs scripts/harness/deepswe-coding-slice.test.mjs` | 21/21 通过；精确 base、仓库外 workspace、宿主依赖/未来 refs 隔离、provider step/token budget、累计 usage、failure owner 与 verifier blocker 有回归 |
| `cargo test -p agent-runtime provider_turn`                                                             | 12/12 通过；cwd 注入及 commentary/final phase 通过                                                                                                 |
| `cargo test -p model-provider current_client`                                                           | 29/29 通过；空 tool placeholder、SSE idle timeout 和 error chain 通过                                                                              |
| App Server coding projection 定向测试                                                                   | 4/4 通过；commentary/final、取消和失败 item terminal 通过                                                                                          |
| App Server current tool inventory / confirmation 定向测试                                               | 3/3 通过；删除 `Bash` 正向 fixture 残留，改为 `exec_command` + `cmd`，并验证 approval resume 后投影为 canonical `Command` item                     |
| App Server session/projection blocker 定向测试                                                          | 4/4 通过；WebSearch canonical item 合同、failed-delete 原子性、empty-prefix crash-tail 修复和 orphan child restart cleanup 已闭环                  |
| Gate B `inputbar-pending-steer-rich-restore`                                                            | 通过；真实 Electron/IPC/App Server/read model/GUI identity 一致，rich text/image/path/skill 恢复断言全通过，console/page error 为 0                |
| `npm run harness:deepswe:preflight`                                                                     | 通过；Release 20 共 61 项 source/schema/verifier/image 检查通过                                                                                    |
| `npx vitest run scripts/harness/deepswe-adapter.test.mjs`                                               | 18/18 通过；超时和 turn-start failure 保留 partial current-chain/provider/model/timestamp evidence，provider budget 可触发 current cancel          |
| `npm run test:rust:related -- <DeepSWE owner paths>`                                                    | 通过；agent-runtime 117/117、app-server 1149/1149、lime-agent 265/265、scheduler 24/24、server 111/111                                             |
| `node --test scripts/electron/current-docs-guard.test.mjs`                                              | 12/12 通过                                                                                                                                         |
| Electron current rules guard                                                                            | 10/10 通过                                                                                                                                         |
| `npm run test:bridge`                                                                                   | 37/37 通过                                                                                                                                         |
| `npm run test:resume` 的批次 36-109                                                                     | 全部通过；未重复运行已完成批次                                                                                                                     |
| `git diff --check`                                                                                      | 通过                                                                                                                                               |
| 旧 Benchmark 入口扫描                                                                                   | 仅命中本计划的删除账本和 DeepSWE 迁移说明，无 current 命令/manifest/runner 命中                                                                    |

`npm run verify:local` 已通过版本一致性、i18n、lint 和 typecheck；前端 smart suite 首轮受并行工作区失败中断，随后从批次 36 续跑到 109 并全部通过。

### 7.2 当前阻塞

- 原 3 条 App Server session/projection 失败已关闭：`WebSearch` 旧断言改为 canonical `web_search` item；failed-delete 测试在 durable pending-spawn 依赖恢复后验证内存原子性；empty-prefix crash tail 在无 terminal 有效前缀时只截断安全尾部，不放宽 projection watermark fail-closed。
- Gate B `inputbar-pending-steer-rich-restore` 已独立通过，先前 `identityConsistent=false` 未复现。该旧 evidence 不能继续作为 current blocker。
- live provider preflight 发现真实用户数据中存在 open child + identity + pending mailbox、但 session event/projection history 缺失的 orphan。此前 App Server 启动会以 `SessionNotFound` 退出；current recovery 现删除 unusable child 的 mailbox、identity、session data 和 graph edge，定向回归通过。
- Agnes DSW-02 run `20260716T020910Z-go-genai-streamed-function-args` 在 1,200,000ms 内产生 1,763 个 event、15 个 coding tool item、0 tool failure，但没有任何文件写入，最终为 `budget` + empty patch。它证明 current cwd、command/Read、provider stream 和隔离 workspace 可用，同时再次暴露 Agnes 长 reasoning/只读探索吞吐不足。
- provider usage evidence 缺陷已关闭：current runtime 现在每个 sampling step 投影 `provider.step`，multi-step usage 在 lime-agent 累计，并由 App Server 写入 trajectory/turn terminal；timeout/cancel 不再丢失已消耗 usage。
- adapter v3 Agnes run `20260716T033001Z-go-genai-streamed-function-args` 在 16-provider-step 预算内产生 2,350 个 App Server event、33 个 trajectory item 和 16 个 tool call；16/16 step usage 完整，累计 input 268,495、output 3,829、budget 272,324 tokens。第 16 步经 current cancel 进入 `canceled`，failure owner 为 `budget`，patch 为 0 bytes。
- 该 run 唯一工具失败来自 Agnes 在命令正文中少写临时 cwd 片段；工具实际 `cwd` 正确，随后 15 次工具调用成功。这进一步把无 patch 归到 Agnes coding 吞吐，而不是 Lime cwd、sandbox、transport 或 App Server。
- Pier `0.3.0` 仍缺少 Docker/Podman/nerdctl/Colima；没有 non-empty candidate 时也没有可交给 verifier 的 patch。当前仍无有效 DeepSWE 分数。

## 8. 完成度与下一刀

- 本轮“测试体系基线重建”完成度：`100%`。R0-R4 均已完成，旧基线已退出，v2/Codex 场景矩阵和 DeepSWE Coding 切片已落库。
- “第二期测试实现”尚未完成：确定性 T0-T8/T11 仍按切片推进，T9 已进入真实缺陷发现，不得把 true run 数量误报为覆盖完成。
- DeepSWE 当前状态：`diagnostic_true_runs_blocked`。adapter v3 缺陷发现闭环已完成；已有 Agnes TS/Go 主测和 gpt-5.5 对照 trajectory，逐步 usage 与预算证据完整。Agnes 在两个不同语言任务中均能稳定消费 current coding tools，但在固定预算内无 patch，本机无容器 verifier，尚无有效 Lime App Server DeepSWE 分数。
- current App Server blocker 和 queue/restore Gate B 已关闭；第二期仍未达到完成口径，因为 DSW-02 未产生 non-empty candidate，DSW-03 Smoke 10 calibration 尚未开始，Windows/L8 也未验证。
- 下一刀：恢复能在固定 step/token 预算内产生 non-empty candidate 的 Agnes coding 路由，并提供 Docker/Podman/nerdctl/Colima 之一；这两个条件满足后再继续 Go/Rust 批次和 Pier verifier，禁止用延长 wall timeout 或增加无效 trial 冒充进展。

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
