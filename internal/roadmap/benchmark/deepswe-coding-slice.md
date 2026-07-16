# DeepSWE Coding 测试切片 v2

> status: adapter v3 usage evidence complete / Agnes provider-step budget + verifier blocked
> owner: evaluation + agent-runtime
> source_commit: `3cda4081fed96103a6395de39c85e9b20275e307`
> source_schema: `1.1`
> source_tasks: 113
> manifest: `internal/test/deepswe-coding-slice-v2.json`

## 1. 定位

DeepSWE 用于评估 Lime 的长程 coding 能力，不验证协议和 GUI 的确定性正确性。它属于 L7 coding eval：

- 不能替代 `test:contracts`、Rust/App Server integration、current runtime fixture 或 Gate A/B。
- 必须通过 Lime App Server JSON-RPC current 链运行，不能用 Codex CLI、mini-swe-agent 或旧 Agent runtime 结果冒充 Lime 分数。
- verifier 在独立环境中运行；reference solution 和 verifier tests 对 Agent 不可见。

本阶段的首要产出不是 pass@k，而是从真实 coding trajectory 中定位 Lime owner 缺陷。每个失败先区分 `Lime product`、`adapter`、`model`、`task environment` 和 `verifier`；只有 App Server current chain、任务隔离和 separate verifier 都有效时，结果才进入能力分数。

## 2. 为什么重新选题

旧 `deepswe-fixed-ten` 只有 dry-run runner，没有真实 Lime Agent execution，且固定十题未写清语言分布、能力维度和回归阈值。v2 切片重新固定 source commit，并按 Lime/Codex coding 风险选题：

- 流式协议与增量输出；
- 取消、超时、资源回收；
- 持久化、缓存、回放与损坏恢复；
- 并发、依赖图、multi-agent/tool routing；
- parser、typed API、错误合同；
- 确定性排序、冲突处理和结构化重写；
- TypeScript、Go、Python、Rust、JavaScript 五种语言。

## 3. 两级切片

### Smoke 10

| Task                                       | Lang   | 重点                                         |
| ------------------------------------------ | ------ | -------------------------------------------- |
| `happy-dom-abort-pending-body-reads`       | TS     | bugfix、取消、资源回收                       |
| `ofetch-per-origin-circuit-breaker`        | TS     | 网络状态机、并发、重试                       |
| `go-genai-streamed-function-args`          | Go     | provider stream、function args、SDK contract |
| `ytt-jsonpath-query-api`                   | Go     | parser、公共 API、结构化错误                 |
| `httpx-multipart-response-parsing`         | Python | sync/async stream parser、畸形输入           |
| `ipython-session-bundle-replay`            | Python | replay、持久化、redaction                    |
| `boa-hierarchical-evaluation-cancellation` | Rust   | 层级取消、runtime                            |
| `fd-deterministic-multi-key-sorting`       | Rust   | CLI、文件系统、确定性                        |
| `csstree-shorthand-expansion-compression`  | JS     | 双向转换、复杂语法                           |
| `yjs-map-conflict-detection`               | JS     | 冲突处理、分布式状态                         |

用途：adapter bring-up、模型/runtime 候选快速比较、版本 RC 的 coding smoke。默认每题 1 trial；正式模型 bake-off 每题 3 trials。

### Release 20

在 Smoke 10 基础上增加：

| Task                                         | Lang   | 重点                                |
| -------------------------------------------- | ------ | ----------------------------------- |
| `superjson-error-stack-serialization`        | TS     | 序列化、错误、redaction             |
| `awilix-async-container-initialization`      | TS     | async lifecycle、依赖图、失败恢复   |
| `claude-code-by-agents-recursive-delegation` | TS     | multi-agent、递归委派、tool routing |
| `vitest-duration-sharding`                   | TS     | test infra、sharding、determinism   |
| `prometheus-typed-label-sorting`             | Go     | bugfix、typed sorting               |
| `pebble-durability-wait-apis`                | Go     | 持久化、并发、wait API              |
| `python-statemachine-state-data-scoping`     | Python | 状态机、history、scope              |
| `bandit-incremental-cache-control`           | Python | cache、CLI、损坏恢复                |
| `gql-incremental-graphql-delivery`           | Python | 增量协议、streaming                 |
| `oxvg-structural-selector-preservation`      | Rust   | 精确结构重写、回归修复              |

用途：大版本 RC、默认 coding 模型或 tool policy 变更、RuntimeCore/coding tools 重大变更。

## 4. Lime Adapter 合同

新 adapter 必须：

1. 在任务声明的 base commit 启动 workspace；clone 必须位于 Lime 仓库外的系统临时目录，且 Node 等工具不得向上解析到 Lime 的依赖。
2. 启动 Lime App Server/RuntimeCore current owner，并通过 public JSON-RPC 创建 thread/turn。
3. 把 DeepSWE instruction 作为用户输入；不得注入 task-specific 解法或 reference patch。
4. 只开放 Lime current coding tools、审批和 sandbox policy；记录最终有效 tool catalog。
5. 等待真实 terminal event，不靠固定 sleep 合成完成。
6. 每个 sampling step 投影 `provider.step`，导出逐步与累计 usage，并以 provider step、token 和 wall time 三类预算约束运行。
7. 导出 Thread/Turn/Item、tool lifecycle、trajectory、`provider-steps.json`、patch 和运行上下文。
8. 由 DeepSWE/Pier separate verifier 应用 patch 并生成 `reward.json`、`ctrf.json` 和 stdout。
9. 将失败归类为 `agent-runtime`、`model`、`tool-runtime`、`app-server`、`transport`、`harness`、`environment`、`verifier` 或 `budget`。
10. terminal 或失败后先固化 partial/candidate patch，再清理临时 clone；run evidence 留在 `.lime/benchmark/v2/runs`。

生产 GUI 不是 DeepSWE runner 的必经入口，但 adapter 必须使用与 GUI 相同的 App Server/runtime 公共链，不能建立 benchmark-only runtime。

当前 adapter 已落在：

- `scripts/harness/deepswe-adapter.mjs`：CLI、live gate、单题执行和 verifier-only 恢复；
- `scripts/harness/deepswe-adapter-core.mjs`：source/task preflight、仓库外隔离 workspace、App Server current chain、证据、patch 与 Pier 交接；
- `scripts/harness/deepswe-adapter.test.mjs`：current method、隔离 git、reference solution 隔离、verifier 证据和旧 runner 不回流守卫。

正式入口：

```bash
npm run harness:deepswe:preflight
npm run harness:deepswe:run -- --task happy-dom-abort-pending-body-reads --allow-live-provider
npm run harness:deepswe:run -- --verifier-only --run-dir <existing-run-dir>
```

adapter 不把 reference solution 复制到 Agent workspace。Lime current chain 结束后只把 `patch.diff` 放入临时 Pier replay task，由 Pier 在 separate verifier environment 应用并判分。Verifier preflight 在 candidate patch 固化后执行，这样缺少容器运行时时仍保留 Lime 缺陷证据；但该 trial 不得产生或冒充 DeepSWE 分数。`--verifier-only` 会保留既有 product failure，并单独记录 verifier blocker。

adapter v3 默认最多运行 32 个 provider step、消耗 500,000 budget tokens，并每 30 秒捕获一次 current evidence。budget token 计算为 `max(0, input_tokens - cached_input_tokens) + output_tokens`。诊断时可以显式收紧 step 上限，但必须把实际预算写入 run context；wall time 只作为最后的环境保护，不能再作为唯一模型预算。

## 5. 指标

必报：

- pass@1；bake-off 时增加 pass@3 与 pass^3；
- 每题 wall time、model latency、token/费用；
- provider step 数、每步 usage、累计 usage 和预算终止原因；
- tool calls、tool failures、approval/sandbox failures；
- patch size、changed files、test result；
- no-op、build failure、timeout、verifier failure；
- 按语言和 focus 聚合的通过率。

只比较相同 source commit、task slice、模型、provider、tool policy、预算和 adapter version 的运行。任一维度变化必须重建 baseline。

## 6. 门禁阶段

### Calibration

adapter 首次完成后运行 Smoke 10 三个独立批次。此阶段只做信息性报告，不设置分数阈值；环境或 verifier failure 必须为零。

### Candidate Gate

有稳定 baseline 后：

- Smoke 10：pass@1 相对稳定基线最多下降 1 题；同一任务连续两次从 pass 变 fail 时阻断。
- Release 20：总体 pass@1 回退不超过 10 个百分点；任一语言不得从非零直接降为零。
- 环境、adapter、App Server 或 verifier failure 不计 agent 失败，但任何非零基础设施失败都使本次结果无效，不能用剩余题目计算 release verdict。

阈值可在三轮 calibration 后收紧，不能为了让候选通过而临时放宽。

## 7. 版本与合规

- 本地 source cache 不进入 Git；版本化 manifest 只记录 source commit、任务 ID 和策略。
- 当前 DeepSWE clone 未在仓库根提供可直接确认的统一 license 文件；完成 source 与各 task repository license/usage 审查前，仅允许私有评估，不分发任务内容或镜像。
- 不保存 API key、Authorization、真实用户数据或 reference solution 到 evidence。
- 公开 benchmark prompt 不进入 Lime system prompt、skill 或 task-specific routing，防止过拟合和数据泄漏。

## 8. 缺陷发现闭环

每个诊断 trial 按以下顺序处理：

1. 先验证 workspace、cwd、skill root、provider/model 和 tool catalog 是否真实隔离。
2. 读取 trajectory 和 Thread/Turn/Item，判断模型实际做了什么，不用 terminal 文案替代行为证据。
3. Lime 边界缺陷在对应 owner 修复，并补最小回归；模型任务失误只记录，不通过改 prompt 或放宽 sandbox 掩盖。
4. 用同一任务和 Agnes 重跑；需要区分模型与 Lime 时才使用固定 gpt-5.5 对照。
5. candidate patch 必须进入 Pier separate verifier；Docker/Pier 不可用时只允许写 blocker，不能手工判 pass。
6. 只有能稳定复现的 Lime 根因才下沉到 L2-L6 门禁，DeepSWE task 本身不复制成大量仓库测试用例。

## 9. 2026-07-15 诊断事实

- Agnes run `20260715T180858Z-happy-dom-abort-pending-body-reads` 暴露 cwd 未传工具、模型不可见 cwd、workspace skill 混入、Bash `2>/dev/null` 误判、空 tool placeholder、伪 `final_answer`、失败 item 未终态和 provider stream 错误信息过粗；该 trial 的 workspace 位于 Lime 仓库内，因此不计能力分数。
- gpt-5.5 对照 `20260715T184451Z-happy-dom-abort-pending-body-reads` 生成 6 文件、189 增/29 删、1,235,341 字节 candidate patch，同时暴露 Node 向上解析 Lime `node_modules` 和 patch capture `ENOBUFS`；该 trial 同样不计能力分数。
- 两个模型都在活动 SSE 约 600 秒后出现 `error decoding response body`。根因是 Lime reqwest client 对整个 response 设置 600 秒总 timeout；Codex 使用逐事件 idle timeout。Lime 已移除总 timeout，改为 5 分钟逐 chunk idle timeout，并保留 error source chain。
- 仓库外 Agnes run `20260715T204006Z-happy-dom-abort-pending-body-reads` 进一步证明全量 clone 会暴露未来 `origin/master`；模型切换分支后生成 1,219,383 字节伪 patch。adapter v2 现只 shallow-fetch 精确 base commit、移除 remote/ref，并拒绝 base 后的非候选 committer。
- adapter v2 Agnes run `20260715T212218Z-happy-dom-abort-pending-body-reads` 使用精确 base、无 remote、仓库外 workspace，记录 3,691 条 App Server 事件。单次活动 SSE 越过旧 600 秒总时限并持续约 78 分钟，证明 idle-timeout 修复有效；Agnes 在 5,400,000ms 总预算内始终没有写文件，trial 以 `budget` + empty patch 结束。
- 同一题的 gpt-5.5 对照能够形成 6 文件 candidate，因而 Agnes 结果不再指向 Lime coding tools/cwd/sandbox。Go/Rust 诊断题暂停，直到 Agnes 路由能在固定预算内产生 terminal candidate；否则继续跑题只是在重复模型吞吐失败。
- Pier `0.3.0` 可用，但当前机器无 Docker/其他容器运行时；`reward.json`、`ctrf.json`、`test-stdout.txt` 尚未产生，Verifier 明确为 blocked。
- DSW-02 Agnes run `20260716T020910Z-go-genai-streamed-function-args` 固定 `agnes-2.0-flash`，20 分钟内产生 1,763 个 event、15 个 coding tool item、0 tool failure；cwd、command、Read 和 provider stream 均有效，但工作树始终为空，最终归 `budget`。这把同一只读探索模式从 TS 题扩展复现到 Go 题。
- 本次 timeout 暴露 adapter evidence 丢失：partial trajectory 已存在，但 CLI result 的 `currentChain` 为 null。adapter 现把 provider/model/session/turn/timestamps/evidenceCapture 附到 failure 并持久化，回归 16/16 通过。
- adapter v3 run `20260716T033001Z-go-genai-streamed-function-args` 首次用结构化 provider budget 重跑 Agnes：16/16 个 step 均有 usage，累计 input 268,495、output 3,829、budget 272,324 tokens，共 16 个 tool call、2,350 个 App Server event 和 33 个 trajectory item。第 16 步触发 current `agentSession/turn/cancel`，turn 终态为 `canceled`，failure owner 为 `budget`，patch 仍为 0 bytes。
- 该 v3 run 的 16 个工具中 15 个成功；唯一失败是 Agnes 在命令正文中把正确临时 cwd 少写一段后显式 `cd`，随后通过 current cwd 恢复，不是 Lime 丢失 cwd。逐步 usage、工具终态和取消链完整，因而本轮无 patch 应归 Agnes coding 吞吐，而不是 `tool-runtime`、`transport` 或 `app-server`。

## 10. 实施顺序

1. `DSW-00`：已完成；source commit、20 个 task path、task schema 和 verifier metadata 共 61 项检查通过。
2. `DSW-01`：adapter v3、仓库外隔离、current cancel、partial evidence 和逐步 usage 已完成；等待 Agnes 产生非空 candidate 且 Pier verifier 可运行后关闭评分链。
3. `DSW-02`：TS/Go 两题已证明 Agnes 能稳定使用 current coding tools但会在固定预算内只读探索、无 patch；provider step/token/usage 已完成并经 v3 Agnes true run 验证。暂停继续刷 Go/Rust 题，直到 Agnes 路由能产生 non-empty candidate；随后再执行 `fd-deterministic-multi-key-sorting` 和 Pier。
4. `DSW-03`：完成 Smoke 10 三轮 calibration 并冻结 baseline。
5. `DSW-04`：运行 Release 20，建立语言/focus 分层结果。
6. `DSW-05`：把真实失败中可确定复现的 runtime/tool 缺陷回写为 L2-L6 内部回归场景。
