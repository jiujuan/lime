# Lime Agent Benchmark 路线图

> 状态：draft
> 更新时间：2026-07-10
> 目标：建立 Lime 版本级 Agent 测试体系，让每个大版本都能用同一组私有回归、外部 benchmark、GUI / terminal / coding / browser / tool-use 证据判断是否可发布。

## 1. 固定结论

1. **不能只用一个公开测试集判断 Lime Agent。**
   DeepSWE、SWE-bench、Terminal-Bench、WebArena、OSWorld、GAIA、tau3-bench 各自只覆盖 Agent 能力的一部分。Lime 是 GUI 桌面产品和 App Server Agent Runtime，不是纯 coding CLI，因此必须组合测试。

2. **Lime 私有 benchmark 是发布门禁的第一事实源。**
   外部 benchmark 用来横向对比和发现能力短板；发布是否可过，必须优先看 Lime 自己的 current 主链：App Server / RuntimeCore / Electron Desktop Host / AgentUI Projection / Evidence Pack / Replay / GUI smoke。

3. **每个大版本必须跑版本级 Benchmark Gate。**
   大版本包括 major、minor、公开 release candidate、runtime / provider / tool / GUI 主链大改。没有 Evidence Pack、trend 对比和阻断项处理记录，不允许把 Agent 主线标为发布就绪。

4. **测试集按风险分层，不按名气排序。**
   P0 是 Lime 私有 release benchmark；P1 是 Terminal-Bench / DeepSWE 这类最贴近工程能力的外部集；P2 是 WebArena / OSWorld / GAIA / tau3-bench 这类覆盖浏览器、桌面、通用工具和多轮策略的扩展集。

5. **公开 benchmark 不能成为 prompt 过拟合目标。**
   固定公开子集只做 smoke 和趋势；发布判断必须同时看私有回归集、轮换样本、失败沉淀 replay 和真实 GUI 证据。

6. **Coding 是 Lime P0 私有门禁，不是 DeepSWE 附属项。**
   DeepSWE / SWE-bench 只能证明公开 coding 任务表现；Lime 每个大版本必须先证明自己的 Codex-first coding 主链：`agentSession/turn/start`、Read / `apply_patch` / Glob / Grep / Bash、command / file_changed lifecycle、workspace diff、`evidence/export`、Thread / Turn / Item projection、GUI Coding Workbench 和失败 replay/regression 晋升。

7. **Benchmark 方案必须受 refactor v1 约束。**
   `internal/research/refactor/v1` 是 coding / tool / runtime benchmark 的架构基线：Thread 管历史与 evidence，Turn 管执行和 tool lifecycle，Item 管 message / tool / artifact 投影。任何测试集或 release gate 只能证明这条主链，不能把 Agent compat、mock fallback 或外部 benchmark dry-run 当作 current 能力。

## 2. 文档索引

| 文档 | 作用 |
| --- | --- |
| [dataset-selection.md](./dataset-selection.md) | 测试集选择原则、候选 benchmark 分层、采用 / 暂缓 / 排除理由。 |
| [version-test-plan.md](./version-test-plan.md) | 每个大版本要跑的测试 lane、命令、证据、通过门槛和失败处理。 |
| [progress.md](./progress.md) | 测试集下载、首批测试运行、adapter 缺口和下一步落地记录。 |

## 3. Benchmark 主链

后续 benchmark 能力必须收敛到这条链：

```text
Release Candidate / Model Candidate / Runtime Candidate
  -> Benchmark Manifest
  -> Lime Agent Run / External Harness Adapter
  -> RuntimeEvent / ThreadReadModel / Tool Timeline
  -> Evidence Pack / Replay Case / Trajectory
  -> Grader / Verifier
  -> Summary / Trend / Regression Decision
  -> Release Gate
```

关键要求：

1. **统一输入**：所有任务都进入同一类 manifest，记录 suite、task id、仓库 / 环境、预算、模型、工具面、grader 和证据要求。
2. **统一执行**：外部 harness 只能作为 adapter；Lime Agent 的事实源仍是 App Server current 主链。
3. **统一证据**：每次运行都产出 trajectory、tool timeline、命令日志、patch / artifact、Evidence Pack 和 verifier verdict。
4. **统一趋势**：每个版本和基线比，不只看一次 pass/fail。
5. **统一沉淀**：失败修复后必须提升为 replay、私有 benchmark case、GUI flow 或定向测试之一。

## 4. 能力覆盖矩阵

| 能力面 | P0 Lime 私有集 | P1 外部集 | P2 扩展集 | 说明 |
| --- | --- | --- | --- | --- |
| App Server / RuntimeCore | 必测 | 不覆盖 | 不覆盖 | Lime 自身主链，只能私有测试证明。 |
| Electron / GUI / Workspace | 必测 | 不覆盖 | OSWorld 抽样 | 公开 GUI benchmark 不能替代 Lime 自己的桌面主路径。 |
| Coding / Patch / Test | 必测 | DeepSWE、SWE-bench | Terminal-Bench coding tasks | 既要真实代码修改，也要证据链和 UI 投影。 |
| Terminal / Shell / Sandbox | 必测 | Terminal-Bench / Harbor | tau3-bench 候选 | Lime coding 和 tool runtime 都依赖终端能力。 |
| Browser / Web Agent | 必测 | WebArena / BrowserGym 抽样 | VisualWebArena / WorkArena | 覆盖 browser runtime、site adapter、视觉网页任务。 |
| Tool use / Policy / Multi-turn | 必测 | tau3-bench | GAIA | 覆盖 API tool、策略遵循、pass^k 一致性。 |
| Knowledge / Search / File / Multimodal | 必测 | GAIA dev 抽样 | VisualWebArena / OSWorld | 公开集只补能力视角，不能替代产品回归。 |
| Evidence / Replay / Review | 必测 | 外部 adapter 必须回写 | 外部 adapter 必须回写 | 没证据就不能进入版本 gate。 |

## 5. current / compat / deprecated / dead

### current

- `internal/test/agent-qc-scenarios.manifest.json` 作为 Lime 私有场景事实源。
- `internal/test/harness-evals.manifest.json`、`npm run harness:eval`、`npm run harness:eval:trend` 作为 replay / trend 入口。
- `npm run agent-qc:*` 作为 Agent QC、Evidence Pack、release summary 入口。
- `coding-workflow-p0` / `coding-workflow-current-chain` 作为 Lime 私有 coding 发布门禁；外部 DeepSWE 通过前也必须独立跑这条 P0。
- 外部 benchmark adapter 只输出 Lime current trajectory / evidence / replay，不拥有运行事实。
- 每个大版本生成 `.lime/benchmark/releases/<version>/` 下的 summary、trend、evidence 和 waiver。

### compat

- 公开 benchmark 的原生 runner、Docker、Harbor、BrowserGym、OSWorld VM 可作为 adapter runtime。
- SWE-bench / DeepSWE 原生 patch verifier 可作为 grader，但必须把 Lime 运行事实回写到 Evidence Pack。

退出条件：Lime adapter 能稳定消费上游任务并输出同一份 release evidence 后，不再手工拼接外部日志。

### deprecated

- 只看 leaderboard 分数决定模型或版本质量。
- 手工复制外部 runner 日志，不生成 Lime Evidence Pack。
- 把公开固定 10 题当成唯一发布门禁。
- GUI / Runtime 主链改动只跑 coding benchmark。

### dead

- 生产路径依赖 mock fallback 后仍宣称 benchmark 通过。
- 外部 CLI / harness 绕过 App Server current 主链成为 Lime Agent 事实源。
- 失败不沉淀 replay / regression，只在聊天里记录。

## 6. 完成口径

### MVP 完成

1. 固定 P0 Lime release benchmark manifest。
2. 大版本测试计划能落到本地命令和 Evidence Pack。
3. Terminal-Bench / Harbor 至少有一个 adapter spike。
4. DeepSWE 固定子集至少有一个 adapter spike。
5. release summary 能展示内部 / 外部 benchmark 趋势和阻断项。

### 完整完成

1. P0 / P1 / P2 benchmark 都能从 manifest 调度。
2. 每个外部任务都能导出 trajectory、Evidence Pack、patch / artifact、verifier verdict。
3. 版本 gate 能比较当前版本与上一个稳定版本。
4. 失败能自动生成或提升 replay / regression case。
5. GUI、terminal、coding、browser、tool-use、general assistant、release startup 都有可审计证据。

## 7. 下一刀

第一阶段已经完成：P0 release gate 已映射到现有 `agent-qc` / `harness` 命令；`coding-workflow-p0` 已作为独立 required suite 接入 release verdict；`internal/test/benchmark-release.manifest.json` 已固定 P1 fixed slice；Terminal-Bench / Harbor 和 DeepSWE fixed 10 都已能通过 `npm run agent-qc:benchmark:dry-run` 批量生成 Lime 证据形状。

本轮按 coding P0 smoke 暴露并修复了一个 current 主链问题：`smoke:agent-runtime-tool-execution -- --batch safe-core-tools` 命中了 App Server native gateway 注册 `tool_search` 时被 `tool-runtime` current registration policy 拒绝的问题。修复落在 `lime-rs/crates/tool-runtime/src/native_overlay.rs` 的 current allowlist，不在 `agent-compat` 续命；后续 release P0 改由 Codex-first `coding-current-tools` batch 验证 `Read` / `apply_patch` / `Glob` / `Grep` / `Bash`，避免把 Agent `Edit` / `Write` 旧工具面当 current。该问题证明 benchmark 不是只新增测试集，失败必须进入修复、验证和回归沉淀。

Terminal-Bench / Harbor 的 `hello-world` 已新增 true-run preflight：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite terminal-bench-release-slice \
  --task hello-world \
  --output ".lime/benchmark/runs/<run-id>/terminal-bench/hello-world" \
  --check
```

当前 preflight 已确认 source checkout、manifest commit 和任务文件完整，`uv` 可用；阻断项是 `docker` CLI / daemon 和 `tb` runner 入口尚不可用。因此 P1 仍保持 `dry_run_ready`，不能升级为 release `ready`。

DeepSWE 的 `ytt-jsonpath-query-api` 也已新增 true-run preflight：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite deepswe-fixed-ten \
  --task ytt-jsonpath-query-api \
  --output ".lime/benchmark/runs/<run-id>/deepswe/ytt-jsonpath-query-api" \
  --check
```

当前 preflight 已确认 source checkout、manifest commit、任务文件、DeepSWE v1.1 metadata 和 separate verifier 文件完整，`uv` 可用；阻断项是 `docker` CLI / daemon 和 `datacurve-pier >= 0.3.0` runner 入口尚不可用。因此 DeepSWE 仍保持 `dry_run_ready`，不能升级为 release `ready`。

版本级一键 runner 已新增，后续每次大版本优先使用它生成同一目录下的 context、checklist、P1 dry-run、preflight、fail-closed true-run、summary 和 manifest check。默认模式只对每个 P1 external suite 的首题执行 preflight / true-run，用来快速收集 blocked evidence；正式 strict gate 会自动展开 manifest `taskSet` 全量，也可用 `--full-external-suites` 提前预演 full fixed slice：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --format json \
  --stdout summary \
  --check
```

该 runner 默认不跑 P0 npm 门禁，也不跑严格 release gate，因此可以在 P1 adapter 仍是 `dry_run_ready` 时收集 blocked evidence 并生成 summary。这个默认结果不是 release-ready 证据。

runner 会在任何测试步骤前做 storage preflight，默认要求 output root 所在卷至少有 512MiB 可用空间。空间不足时会写出 `storage_preflight: available_below_minimum` 的 skipped report 并 fail closed，不继续执行 P0 / P1 命令；CI 或正式 release 可通过 `--min-free-mb <N>` 调高门槛。

正式 RC / release 还必须加 `--include-p0`，让 runner 执行 manifest 中 `runner=npm` 的 P0 多方面门禁，包括 `verify:local`、contracts、Agent Runtime fixture、GUI smoke、harness replay / trend 和 Agent QC manifest check：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --include-p0 \
  --format json \
  --stdout summary \
  --check
```

当前本地不默认启用 `--include-p0`，原因是 `verify:local` 已被既有 i18n unused key 阻断、`verify:gui-smoke` 也尚未在本轮跑完整 release evidence；这两个阻断不能被 P1 dry-run 掩盖。

正式 release 放行前必须额外执行严格 gate。`benchmark-release:run -- --strict-gate` 现在会在生成计划前强制要求同时提供 `--include-p0` 和 `--baseline-version` / `--baseline-summary`，并自动启用 P1 external suite 全量 `taskSet` preflight / true-run，防止只跑 P1 首题或缺少版本对比时误用严格 gate：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --include-p0 \
  --baseline-version "<baseline>" \
  --format json \
  --stdout summary \
  --strict-gate \
  --promote-baseline \
  --check
```

runner 始终把完整 JSON report 写到 `<output-root>/benchmark-release-run.json`，并在收尾阶段自动写出 `<output-root>/benchmark-release-report.md` 人读审计报告；`--stdout summary` 只把控制台输出收敛为版本、输出目录、run report 路径、audit report 路径、step 计数、storage、P0/full/strict 状态和失败摘要，适合正式 RC / release 日常使用。需要兼容旧的完整 stdout JSON 时可省略该参数，或显式使用 `--stdout full`；自动化只关心文件产物时可用 `--stdout none`。

当已有 current-chain evidence 文件时，runner 可以传 `--current-chain-evidence-root "<root>"`，每个 true-run task 会按 `<root>/<suite-slug>/<task-id>/current-chain-evidence.json` 传给 `benchmark:true-run --current-chain-evidence`。该参数只透传 evidence 路径，不生成 evidence；缺文件或无效 evidence 会进入结构化 blocked evidence，不会误放行。

如果只需要复核 P1 adapter readiness，可以单独执行：

```bash
npm run agent-qc:benchmark-release:gate
```

当前单独 release gate 应按预期失败，原因是 Terminal-Bench / Harbor 和 DeepSWE 尚未接入 Lime App Server current true-run adapter。这个失败是门禁设计的一部分，证明 dry-run、preflight 或 blocked true-run 不会误放行大版本。

版本级 context / checklist / summary 也可以单独运行：

```bash
npm run agent-qc:benchmark-release:context -- \
  --version "<version>" \
  --output ".lime/benchmark/releases/<version>/run-context.json" \
  --format json \
  --check
```

当前 context 会记录 package version、git ref、dirty 状态摘要、OS / Node / Rust / Docker / uv 可用性、benchmark manifest hash 和本地下载源 commit 对齐状态。`--check` 会在 manifest / source commit 不一致时失败；Docker / runner 缺失只作为环境 warning 记录，真实运行条件仍由 true-run preflight 判定。

```bash
npm run agent-qc:benchmark-release:checklist -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-checklist.json" \
  --format json \
  --check
```

当前 checklist 能从 `internal/test/benchmark-release.manifest.json` 生成大版本执行清单：P0 npm gate、P1 dry-run、P1 true-run preflight、计划中的 P1 true-run、release summary、manifest check 和严格 release gate。默认只展开每个 P1 external suite 的首题，和默认 runner 的快速 evidence 收集口径一致；传入 `--full-external-suites` 或 `--strict-gate` 时会展开 manifest `taskSet` 全量，并在 strict gate 下给 summary 命令追加 `--release-gate`。`--output-root` 必须和 runner evidence 根目录一致，避免清单路径回落到默认 release 目录。`--check` 只校验清单结构，不把 `planned` / `blocked` 误判为通过或失败；真实发布仍以 summary / gate / Evidence Pack 为准。

```bash
npm run agent-qc:benchmark-release:summary -- \
  --evidence-root ".lime/benchmark/runs" \
  --output ".lime/benchmark/runs/<run-id>/benchmark-release-summary.json" \
  --format json \
  --check
```

当前 summary 能把 manifest、P0 npm gate step results、P1 dry-run suite、true-run preflight 和 fail-closed true-run evidence 汇总成 `benchmark-release-summary-v1`；本地默认 runner 结果为 `p0GateBlockerCount=10`、`dryRunSuiteCount=2`、`preflightCount=2`、`trueRunTaskCount=2`、`releaseBlockerCount=2`、`preflightBlockerCount=6`、`trueRunBlockerCount=6`、`releaseReady=false`。`releaseReady=true` 必须同时满足 `issueCount=0`、`releaseBlockerCount=0`、`p0GateBlockerCount=0`、`preflightBlockerCount=0`、`trueRunBlockerCount=0`、`trueRunEvidenceBlockerCount=0`；即使 P1 adapter 已标成 `ready`，blocked preflight / true-run 也不能被误判为放行。即使 true-run task 自称 `verdict=ready`，summary 也会继续检查 `execution.currentChainInvoked=true`、`execution.trueRunInvoked=true`、`execution.verifierInvoked=true`、`execution.currentChain.appServerMethod="agentSession/turn/start"`、`execution.currentChain.evidenceExportMethod="evidence/export"`、`execution.currentChain.evidenceExportInvoked=true` 和同目录 `evidence-pack/manifest.json` 是否有效；缺任一项都会进入 `trueRunEvidenceBlockers`。required P1 suite 一旦 `adapterStatus=ready`，summary 还会要求 manifest `taskSet` 每个任务都有 task-level ready true-run evidence，首题 ready 不能代表 full fixed slice。默认 runner 只收集 P1 evidence 时，summary 会明确标出 P0 未跑，不能被误解为完整 release gate。

候选版本 summary 生成后，runner 会自动生成一页人读审计报告，方便 RC / release 评审时快速查看版本、artifact 完整性、decision、blocker 和 compare / baseline 状态。需要复跑、改输出路径或生成 JSON 格式时，可单独执行：

```bash
npm run agent-qc:benchmark-release:report -- \
  --release-root ".lime/benchmark/releases/<version>" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-report.md" \
  --check
```

该 report 默认读取同目录的 `benchmark-release-run.json`、`benchmark-release-summary.json`、可选 `benchmark-release-compare.json` 和可选 `benchmark-baseline.json`；也可传 `--format json` 输出结构化 `benchmark-release-report-v1`。只传 `--release-root` 时，版本会优先从 runner report 的 `plan.version` 或 summary 的 `version` 推导，避免人工审计报告回退为当天日期。`--release-gate` 会要求 report decision 为 `pass`，但它仍只是审计层，正式放行事实源仍是 summary、compare、strict gate 和 baseline descriptor。

候选版本跑完后，还要和上一稳定版本 summary 做回归预算对比。正式 RC 推荐直接在 `benchmark-release:run` 里传入 `--baseline-version "<baseline>"`，runner 会解析为 `.lime/benchmark/releases/<baseline>/benchmark-release-summary.json` 并自动生成 `benchmark-release-compare.json`。在 `--strict-gate` 下，runner 还会先校验上一稳定版本目录里的 `benchmark-baseline.json`，要求 `baselineReady=true`、`releaseReady=true`、`baselineKind=stable` 且未使用 `--allow-not-ready`。需要复跑或审计自定义路径时，也可以单独执行：

```bash
npm run agent-qc:benchmark-release:compare -- \
  --baseline-summary ".lime/benchmark/releases/<baseline>/benchmark-release-summary.json" \
  --candidate-summary ".lime/benchmark/releases/<version>/benchmark-release-summary.json" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-compare.json" \
  --format json \
  --check
```

compare 会读取 `internal/test/benchmark-release.manifest.json` 中的 `releasePolicy.p1RegressionBudget.maxAdditionalFailedTasks`，并机械判定 P0 step 是否从 pass 退化、P1 true-run task 是否新增 failed / blocked、候选版本是否从 baseline 的 `releaseReady=true` 倒退为 false。`--check` 只有在 candidate release-ready 且未超过回归预算时通过；当前 P1 adapter 仍未 ready 时，compare 至少会给出 `needs-release-gate` 或 `hold-or-revert`，不能当作放行证据。

正式版本通过 strict gate 后，runner 会在 `--promote-baseline` 下自动登记它是否可以成为下一版 baseline。也可以单独复跑 baseline 登记：

```bash
npm run agent-qc:benchmark-release:baseline -- \
  --version "<version>" \
  --require-compare \
  --format json \
  --check
```

该命令读取 `.lime/benchmark/releases/<version>/benchmark-release-summary.json` 和 `benchmark-release-compare.json`，写出 `.lime/benchmark/releases/<version>/benchmark-baseline.json`。默认要求 `summary.releaseReady=true`，且 `issueCount`、P0 / release blocker、preflight blocker、true-run blocker、true-run evidence blocker 全部为 0；`--require-compare` 还要求 compare decision 为 `pass`。`--allow-not-ready` 只能生成 `baselineKind=bootstrap` 的调试 descriptor，不能得到 `baselineReady=true`，也不能放宽任何 blocker 计数或被 strict gate 作为上一稳定版。当前 P1 adapter 未 ready 前，这个命令应失败，不能把 dry-run evidence 登记成稳定 baseline。

true-run 入口已存在但保持 fail-closed：

```bash
npm run agent-qc:benchmark:terminal-run -- \
  --task hello-world \
  --output ".lime/benchmark/runs/<run-id>/terminal-bench/hello-world" \
  --check

npm run agent-qc:benchmark:deepswe-run -- \
  --task ytt-jsonpath-query-api \
  --output ".lime/benchmark/runs/<run-id>/deepswe/ytt-jsonpath-query-api" \
  --check
```

当前 true-run 会先复用 preflight；环境或 runner 不满足时写出 `benchmark-true-run-v1` blocked evidence。即使 preflight 通过，在 Lime App Server current 主链 adapter 真正实现前，也会阻断在 `lime_current_true_run_adapter_not_implemented`，不会调用 provider、Docker verifier 或伪造 pass。release summary 已能聚合 true-run evidence，并按 task id 取最新一次运行。

当后续 App Server true-run adapter 打通后，`benchmark:true-run` 可以通过 `--current-chain-evidence <path>` 消费一份 `benchmark-current-chain-evidence-v1`。该文件必须证明同一 suite / task 已经经 `agentSession/turn/start` 发起、经 `evidence/export` 导出 App Server Evidence Pack，且 external verifier 已执行并通过；否则 true-run 仍保持 blocked。runner 默认不传该参数，因此当前 blocked / dry-run evidence 不会因为存在本地文件而误放行。

生成该文件的稳定入口是：

```bash
npm run agent-qc:benchmark:current-chain-evidence -- \
  --suite "terminal-bench-release-slice" \
  --task "hello-world" \
  --turn-start ".lime/benchmark/current-chain/turn-start.json" \
  --evidence-pack ".lime/benchmark/current-chain/evidence-pack.json" \
  --verifier ".lime/benchmark/current-chain/verifier-result.json" \
  --output ".lime/benchmark/current-chain/current-chain-evidence.json" \
  --check
```

`turn-start.json` 必须记录 App Server `agentSession/turn/start` 已调用；`evidence-pack.json` 必须是 App Server `evidence/export` 返回的 Evidence Pack；`verifier-result.json` 必须来自外部 benchmark verifier 且 verdict 为 pass / passed / ready。这个 builder 只做证据合同归一化，不调用模型、不调用 Docker，也不改变 release gate。

如果已有 Electron / App Server JSON-RPC trace，可用 `--json-rpc-trace <path>` 替代 `--turn-start`。trace 模式会从 `app_server_handle_json_lines` 请求行或 `appServerRequests` 中抽取 `agentSession/turn/start`，并要求同一 trace 出现 `evidence/export`；Evidence Pack 正文仍通过 `--evidence-pack` 输入，避免把大对象塞进 trace。

`--current-chain-evidence` 指向缺失或无效文件时，true-run 不会直接崩溃。preflight ready 时会写出 `lime_current_chain_evidence` blocker；preflight blocked 时只记录 preflight blocker。这让后续 runner 可以安全传入约定路径，缺 evidence 仍是可审计 blocked evidence。

下一刀进入真实 current-chain adapter：

1. 补齐 Terminal-Bench / Harbor true-run 环境，再将 `hello-world` 从 preflight 升级到真实执行，通过 Lime current 主链生成 `trajectory.json` / `tool-timeline.json` / Evidence Pack，并调用外部 verifier。
2. 补齐 DeepSWE true-run 环境，再将 `ytt-jsonpath-query-api` 从 preflight 升级到真实执行，生成 patch、test log、reward、CTRF 和 replay-case；未接 live Provider 前只能使用明确标记的 fixture backend，不伪造 pass。
3. 将 fail-closed true-run adapter 接到真实 Lime current 主链后，更新 release checklist / summary，使每个大版本能区分 `dry_run_ready`、`ready`、`blocked` 和 `waived`。
4. 修复或隔离当前 `verify:local` 的既有 i18n unused key 阻断，并补 `verify:gui-smoke` 证据。
