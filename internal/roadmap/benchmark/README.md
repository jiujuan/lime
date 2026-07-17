# Refactor v2 测试与 Benchmark 第二期

> status: active / LIV-03 Agnes multimodal closed; T9 scoring and Windows/L8 blocked
> owner: quality-workflow + runtime domain owners
> last_verified: 2026-07-17
> refactor_source: `internal/research/refactor/v2/**`
> codex_commit: `5c19155cbd93bfa099016e7487259f61669823ff`

## 1. 结论

重构前的 Benchmark 体系已经退役。旧体系把 release checklist、外部数据集下载、脚本 dry-run 和一次性报告拼成版本门禁，但它没有以 Refactor v2 的唯一产品链为测试对象，不能证明 current runtime 正确：

```text
Electron Desktop Host
  -> App Server JSON-RPC
  -> RuntimeCore
  -> Thread / Turn / Item projection
  -> GUI
```

第二期从零建立测试基线，不继承旧 runner 的通过状态。旧 `benchmark-release-v1`、旧 DeepSWE/Terminal-Bench true-run、Managed Objective differential 和历史 progress 只存在于 Git history。DeepSWE 本身继续使用，但改为 [v2 Coding 切片](./deepswe-coding-slice.md) 和新的 App Server current adapter。

## 2. 第二期目标

1. 用确定性集成测试守住 Agent loop、公共 JSON-RPC、状态机、持久化和恢复。
2. 用 current fixture 守住 provider/tool/runtime 的真实事件链，不靠生产 mock fallback。
3. 用 Gate A 验证 Renderer projection，用 Gate B 验证真实 Electron 产品链。
4. 把 live provider、随机性评估、外部 benchmark 与确定性 release gate 分开。
5. 每个测试都有明确 owner、风险、证据等级和失败归属；不再用“跑了很多脚本”代替覆盖证明。

## 3. 文档索引

| 文档                                                                                                             | 作用                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [phase-2-test-plan.md](./phase-2-test-plan.md)                                                                   | 第二期实施切片、顺序、owner、退出条件和退役账本         |
| [scenario-matrix.md](./scenario-matrix.md)                                                                       | v2/Codex 对齐的稳定场景 ID、证据等级与优先级            |
| [deepswe-coding-slice.md](./deepswe-coding-slice.md)                                                             | DeepSWE Smoke 10 / Release 20 选题、adapter、指标与门禁 |
| [../../aiprompts/quality-workflow.md](../../aiprompts/quality-workflow.md)                                       | 仓库级最低门禁与交付规则                                |
| [../../test/testing-strategy-2026.md](../../test/testing-strategy-2026.md)                                       | 测试分层、作者合同、CI lane 与 evidence 规则            |
| [../../research/refactor/v2/13-evidence/verification.md](../../research/refactor/v2/13-evidence/verification.md) | v2 历史切片的验证合同和不可变 evidence                  |
| [../../exec-plans/refactor-v2-test-phase-2-plan.md](../../exec-plans/refactor-v2-test-phase-2-plan.md)           | 本轮重建执行记录                                        |

## 4. 测试层级

| 层级               | 主要对象                                                  | 证据                                    | 是否阻断发布            |
| ------------------ | --------------------------------------------------------- | --------------------------------------- | ----------------------- |
| L0 静态与治理      | schema、generated client、依赖、旧路回流                  | lint/typecheck/contracts/governance     | 是                      |
| L1 纯单元          | parser、selector、projection、lowering、状态转换          | 整对象断言、表驱动 case                 | 是，按受影响范围        |
| L2 领域集成        | agent-runtime、tool-runtime、model-provider、thread-store | 真实 domain owner + 可控依赖            | 是                      |
| L3 App Server 集成 | public JSON-RPC、notification、read model、恢复           | client round trip + 结构化事件          | 是                      |
| L4 current fixture | RuntimeCore、provider fixture、工具、MCP、multi-agent     | current event stream + terminal state   | 是，Agent 主路径        |
| L5 Gate A          | Renderer projection、DOM、交互、五语言                    | browser fixture + 可见状态              | GUI 变更时是            |
| L6 Gate B          | Electron/preload/IPC/App Server/runtime/read model/GUI    | 真实 Electron + 同一 identity 链        | 主路径/桌面边界变更时是 |
| L7 live/eval       | live provider、非确定性任务、外部 benchmark               | transcript、grader、pass@k/pass^k、成本 | 显式 release lane 才是  |
| L8 platform/soak   | macOS/Windows、packaged app、并发、长稳                   | 平台矩阵、资源与恢复报告                | release candidate 是    |

L0-L6 主要验证确定性正确性；L7 验证模型能力和稳定性；L8 验证交付环境。三者不能互相替代。

## 5. Codex 对齐规则

- Agent 逻辑变更优先写集成测试，而不是只补内部函数单测。
- App Server 测试必须经过公共 JSON-RPC API；不直接调用 handler 私有实现伪造成功。
- Provider 使用可控 response server/fixture，保存并断言结构化 request、tool output 和 terminal event。
- 等待业务事件，不用固定 sleep 或 grace timer 合成完成态。
- 优先比较完整对象和完整投影；字段逐个断言只用于解释关键差异。
- 不测试静态常量，不为已经删除的实现继续写正向或行为测试。
- GUI 可见变化必须有稳定 DOM/快照证据；Lime 的最终产品证据仍是 Electron Gate B，而不是 Codex TUI snapshot。
- 测试资源和首方 binary 必须通过仓库统一 helper 定位，不能依赖当前工作目录偶然成立。

## 6. Release Lane

| Lane              | 触发                            | 必须包含                                                                 |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------ |
| PR related        | 每次改动                        | L0 + 受影响 L1/L2；命令边界加 contracts                                  |
| Runtime current   | Agent/runtime 改动              | L2 + L3 + `smoke:agent-runtime-current-fixture`                          |
| GUI current       | GUI/Workspace 改动              | related tests + Gate A + `verify:gui-smoke`                              |
| Desktop current   | Electron/bridge/read model 改动 | contracts + 对应 Gate B fixture                                          |
| Nightly           | 每夜或定期                      | 扩展 L2-L6、恢复/故障注入、flaky/retry 统计                              |
| Release candidate | 版本候选                        | L0-L6 全部 required 场景 + L8 平台矩阵                                   |
| Live quality      | 显式授权                        | L7 provider/eval 与 DeepSWE coding slice；记录模型、配置、成本与样本版本 |

外部公开 benchmark 只进入 `Live quality` 或研究 lane。没有 current adapter、固定环境和可复核 grader 前，不得进入 release required。

## 7. 当前状态

- `current`：仓库现有 related tests、Rust layer runner、App Server contracts、current runtime fixture、Gate A/B smoke。
- `current`：DeepSWE adapter v4 使用仓库外系统临时 workspace，经 App Server current chain 投影逐步 provider usage 与每次真实 sampling 的 tool catalog；`agent-runtime` 在工具执行和下一次 sampling 前执行 step/token budget，adapter token polling 只作 timeout race fallback；wall timeout 会先取消并等待真实 terminal。gpt-5.5 只在区分 Lime 与模型问题时作固定对照。
- `deprecated`：现有 Agent QC/Harness manifest 只作为第二期场景迁移输入，未逐项映射到 [scenario-matrix.md](./scenario-matrix.md) 前不算新门禁。
- `dead`：旧 Benchmark runner、旧 release manifest、旧外部数据集 wrapper 和旧 progress 文档，已删除；DeepSWE 数据集不属于 dead。
- `current / closed`：原 3 条 session/projection Rust blocker 和 Gate B queue/restore identity 已有定向回归与真实 Electron 通过证据；App Server orphan child restart 也已补 fail-closed cleanup。
- `current / closed`：provider 每步 usage 丢失、multi-step usage 只保留最后一步和 timeout/cancel usage 丢失已在 current owner 修复；adapter v3 的 Agnes Go run 已验证 16/16 step usage、累计 272,324 budget tokens 和 current cancel 终态。
- `current / closed`：DeepSWE 真实 request tool catalog 与 runtime step cap 已闭环。adapter v4 Agnes run `20260716T083349Z-go-genai-streamed-function-args` 严格产生 2 request / 2 completed step、`budgetCancellation=null`，两次均有完整 27 工具和 `apply_patch`；0-byte patch 正确归 `model`。
- `current / closed`：DeepSWE runtime token budget 已闭环。旧 Rust run `20260716T113222Z-fd-deterministic-multi-key-sorting` 在累计 158,754 tokens 后仍启动 attempt 8；fresh run `20260716T120650Z-fd-deterministic-multi-key-sorting` 在 attempt 2 累计 15,065/12,000 tokens 后由 runtime 终止，attempt 2 返回的 4 个工具调用均未执行，也没有 attempt 3，`budgetCancellation.requestedAt=null`。
- `current / closed`：PRV-04/ITM-05 deterministic 链已证明 inline 图片先落 sidecar、provider wire 才瞬时 hydrate、read model/evidence 零 base64；当前回合 text-only fail-before-network、历史图片降为占位文本。LIV-03 进一步关闭 Agnes capability/custom-provider/cache、direct-answer 工具面和 generation lowering 缺陷：capture 为 `tools=0`、`max_tokens=128`、`enable_thinking=false`，Agnes live 在 25.5 秒内识别 apple/red 并以 completed terminal 收敛。
- `current / closed`：Agent Runtime 聚合 Gate B 发现并关闭 renderer smoke build 清空共享 `dist` 的并发回归；approval 场景在 renderer 并发构建期间和完整聚合 current fixture 中均已通过。
- `current / closed`：新 compact terminal timeline 让 approval 只读记录默认位于“查看待处理项”之下，旧 Gate B 因等待记录自动可见而误报超时。current oracle 现先确认 terminal/input 恢复，再展开同 turn timeline 验证唯一脱敏记录；resume/decline/cancel/full-access 与完整 Agent Runtime Electron fixture fresh 通过，production UI 未回退。
- `current / closed`：AGT-03 multi-agent cold-restart 首次 fresh Gate B 暴露 mailbox Result lifecycle/terminal-ack 缺陷；current App Server owner 已补 `delta(in_progress) -> message.completed`、terminal-only ack、partial replay 补 completion 和 Failed Result 状态回归。9 条 mailbox、15 条 terminal activity、24 条 agent-control、1152 条 app-server related Rust 及真实 Electron cold-restart Gate B 全绿。
- `current / closed`：AGT-03 Gate B runner 已从 500 字符 tool preview 断言改为完整 current read-model tool output；preview 只用于 evidence 展示，避免多 Result terminal activity 造成测试误报。
- `current / closed`：AGT-04 双 child 并发回归发现 canonical UserMessage 在 synthesized `item.completed` 后被空 payload 覆盖。current projection owner 已补 UserMessage snapshot merge，两个 child 可同时运行、按 session/thread/mailbox 隔离、一次聚合 Result，且 failed sibling 不污染 completed sibling；AgentControl 26/26、canonical lifecycle 10/10、完整 Agent Runtime current fixture 通过。
- `current / closed`：1200-command Codex import 性能门禁曾在全量/独立运行耗时 174.4s/106.7s。根因是逐事件重复复制 validation context 和 canonical notification 全历史 materialize；current owner 改为增量 sequence/tool lifecycle validator 与 incremental notification materializer 后独立耗时 3.51s，App Server related 1157/1157。
- `current / closed`：MCP-02 fresh Gate B 已证明 server-originated elicitation 经真实 Electron/preload、`app_server_handle_json_lines`、App Server reverse JSON-RPC 到 Renderer form，再回到 MCP accept ledger 并让 provider 完成第二次请求；runtime stdio connection 精确广告 `elicitation` capability，management connection 保持 absent。
- `current / closed`：MCP-03 首次真实运行暴露 Desktop Host 把 App Server JSON-RPC 业务错误抛成 IPC error。`handleJsonLines` 现只在 JSONL 转发边界恢复 `AppServerRequestError` response 与 renderer 原 request id，高阶 `request()` 和 transport timeout/stale restart 语义不变。fresh evidence 证明失败 server 为 stopped，健康 server 的 status、tool list/call 与 resource read 连续可用，legacy MCP 命中为零。
- `current / closed`：GUI-01/ELN-01 fresh complete Gate B 首次误报 identity，因为 collector 在找不到产品 turn response 时回退到后续 `event-read-probe`。current evidence matcher 现对已知 turnId 只接受精确匹配；fresh evidence 中 Renderer/trace/runtime/read model identity 一致，Electron/preload/IPC/current JSON-RPC 全绿，legacy/mock/page error 为零。
- `current / closed`：GUI-02 fresh `cancel-then-continue` Gate B 证明 stop 命中 `agentSession/turn/cancel`，read model 进入 canceled、输入框恢复，同 session 后续 turn 完成；ELN-03 backend-failure Gate B 证明 partial answer 保留、失败详情只进 read model、GUI 输入恢复，零 legacy/mock/error。
- `current / closed`：ELN-03 packaged unavailable fail-closed 首次被真实用户 data root 的旧固定 session 污染并报 `SequenceRegression`。四条 current App Server stdio/external/packaged smoke 现全部注入临时 `dataDir`，success/failure/unavailable fresh 运行全绿；contract guard 防止恢复默认用户目录。
- `current / closed`：PRV-05 对照 Codex 后发现旧绿测固化了错误 retry 集合：Lime 请求层重试 429/408/409/425 且漏掉部分 5xx。current owner 已收敛为初始请求加 4 次有界重试、全部 5xx 与 transport 可重试、429 不在请求层自动重试；401、429 和最终 5xx 分别保留 auth/rate_limit/server terminal 分类。公开 `CurrentProvider.stream` localhost capture、agent-runtime trace 和 13 个 related crate 全绿。
- `current / closed`：CTX-01 发现 provider history 只读取标量 `message.delta`，`message.delta_batch` 数组静默丢失，`message.completed` full-text 也完全忽略。current owner 现解析 batch parts，并先按整个 assistant turn、再按 item 前缀补 completed snapshot 后缀；同 item 和 commentary/final turn-wide snapshot 都不重复。owner 11/11、App Server 1169/1169 和完整 Agent Runtime Electron fixture 通过。
- `current / closed`：CTX-02 的旧测试只断言 compaction event 和 summary metadata 存在，未观察 backend 实际收到的 provider history。新 public `RuntimeCore::start_turn -> ExecutionBackend::start_turn_with_provider_history` capture 首先证明旧摘要只复制最近 tail、且下一轮仍发送全部旧 turn。current owner 现让 `session_context_compaction.v2` 摘要只接续 tail 之前的前缀，durable EventLog/read model 保持全量，provider history 从最新 `tailStartTurnId` 重建；带 `outputRef` 的历史工具结果只使用 canonical preview，异常超长 inline output 继续按 10,000-byte 上限截断，不再读取 full sidecar。owner 定向、App Server 1171/1171、contracts 291 项和完整 Agent Runtime Electron fixture 均通过，`liveProviderUsed=false`。
- `current / closed`：PRV-06 已进入正式 owner。`ProviderRuntimeSpec`/direct request 显式投影 capability，`AgentRuntimeState` 按 session 复用并清理 provider client，`model-provider` 发送真实 Upgrade 与 `response.create`、串行复用连接，并让 SSE/WS 共用 reducer；426、重试耗尽和首个可见 event 前断线会安全 replay HTTP，fallback 跨 Turn sticky。首次 capture 稳定证明旧实现即使 capability=true 仍只发 `POST /v1/responses`。model-provider 135/135、agent 270/270、App Server 1175/1175、contracts 291 项和完整 Electron current fixture 已通过；短问候 `firstTextDeltaToFirstTextPaintMs=25`，预算未放宽。
- `current / closed`：扩大门禁直接发现并关闭三项 Lime App Server 缺陷：TS client 丢失 `supportsWebsockets` capability；大型 async dispatcher 在默认 2 MiB 栈溢出；stdio 把非 turn request 串行化而被长 turn head-of-line 阻塞。dispatcher 现装箱 handler future，初始化后 request task 化，contract guard 按 method→handler 语义归一化。
- `current / closed`：全量门禁中的宿主环境噪声被下沉为确定性 owner 修复。PTY 测试不再继承用户 zsh rc；plain directory Git status 零子进程返回，仓库内 Git 使用异步 5 秒 deadline/kill-on-drop。App Server 全量因此无需过滤达到 1175/1175。
- `blocked`：Agnes 在 TS/Go/Rust coding 诊断中继续只读探索且无 patch；本机 Pier `0.3.0` 可用但无容器运行时。DeepSWE trial 只作缺陷诊断，尚不能生成有效分数。
- `next`：Windows/L8 RC。DeepSWE 只在 Agnes 能产生 candidate 且 verifier runtime 可用后恢复 scoring，不再用重复只读 trial 冒充进展。

## 8. 完成口径

第二期只有在以下条件全部满足后才能标记完成：

1. P0 场景全部有稳定自动化 owner，且失败可定位到单一边界。
2. Agent runtime 关键逻辑均有 L2/L3 集成证据。
3. GUI 主路径均有 Gate A；关键桌面链均有 Gate B。
4. restart、resume、cancel、queue、stale/out-of-order、tool approval、MCP、multi-agent 和 multimodal 至少各有一条失败恢复场景。
5. macOS 与 Windows 的 release candidate 证据齐全。
6. current 导航中不存在旧 Benchmark 命令、manifest 或伪代码测试指南。

当前测试体系基线完成度为 `100%`；按 T0-T11 交付合同计算，第二期测试实现整体完成度为 `80%`。剩余主要是 DeepSWE Smoke/Release 有效评分、EVAL-01、Windows RC 与长稳/L8，而不是继续增加同义单测。
