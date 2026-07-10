# 版本级 Benchmark 测试计划

> 更新时间：2026-07-10
> 范围：每个 Lime 大版本、release candidate、Agent Runtime 大改、Provider / model routing 大改、coding / browser / tool runtime 大改。

## 1. 目标

每个大版本都要回答四个问题：

1. **Lime 自己还能稳定工作吗？**
   App Server、Electron GUI、AgentRuntime、tool、browser、workspace、evidence、release startup 是否仍可用。

2. **Agent 能力有没有退化？**
   coding、terminal、browser、tool-use、general assistant、multi-turn policy 是否比上一稳定版本退步。

3. **失败是否可审计？**
   每个失败是否有 trajectory、tool timeline、命令日志、GUI trace、Evidence Pack、verifier verdict。

4. **版本是否可以放行？**
   阻断项、waiver、已知缺口和下一版修复项是否落到 repo 内 artifact。

## 2. 版本测试 Lane

| Lane | 名称                              | 必跑时机                                                | 当前入口 / 计划入口                                                                                                                                                                                                                                                                                                                 | 发布阻断   |
| ---- | --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| L0   | Static / Unit / Type              | 每次 RC                                                 | `npm run verify:local`                                                                                                                                                                                                                                                                                                              | 是         |
| L1   | Contract / Bridge                 | Agent / command / bridge 改动；大版本默认跑             | `npm run test:contracts`                                                                                                                                                                                                                                                                                                            | 是         |
| L2   | Agent Runtime Current Fixture     | AgentRuntime / tool / streaming 改动；大版本默认跑      | `npm run smoke:agent-runtime-current-fixture`                                                                                                                                                                                                                                                                                       | 是         |
| L2C  | Coding Workflow P0                | 每次大版本；coding / tool / App Server runtime 改动必跑 | `npm run smoke:agent-runtime-tool-execution -- --batch coding-current-tools` + `npm run smoke:agent-runtime-current-fixture` + `npm run test:rust:related -- lime-rs/crates/app-server/src/runtime_backend/coding_events.rs lime-rs/crates/app-server/src/runtime/event_store.rs lime-rs/crates/tool-runtime/src/native_overlay.rs` | 是         |
| L3   | GUI Product Smoke                 | 每次大版本                                              | `npm run verify:gui-smoke`                                                                                                                                                                                                                                                                                                          | 是         |
| L4   | Harness Replay / Trend            | 每次大版本、nightly                                     | `npm run harness:eval` + `npm run harness:eval:trend`                                                                                                                                                                                                                                                                               | 是         |
| L5   | Agent QC P0                       | 每次大版本                                              | `npm run agent-qc:check` + `npm run agent-qc:benchmark-release:run` + qcloop / Evidence Pack；正式 release 放行前跑 `benchmark-release:run -- --include-p0 --baseline-version <baseline> --strict-gate`，`npm run agent-qc:benchmark-release:gate` 仅作 adapter readiness 单独复核                                                  | 是         |
| L6   | External Coding                   | 每次大版本                                              | 当前：`npm run agent-qc:benchmark:dry-run -- --suite deepswe-fixed-ten --all-tasks ...` + `npm run agent-qc:benchmark:deepswe-run -- --task ytt-jsonpath-query-api ...`；true-run 当前 fail-closed，计划接 DeepSWE / SWE-bench current adapter                                                                                      | P1 阻断    |
| L7   | External Terminal                 | 每次大版本                                              | 当前：`npm run agent-qc:benchmark:dry-run -- --suite terminal-bench-release-slice --all-tasks ...` + `npm run agent-qc:benchmark:terminal-run -- --task hello-world ...`；true-run 当前 fail-closed，计划接 Terminal-Bench / Harbor current adapter                                                                                 | P1 阻断    |
| L8   | Browser / Desktop / General Radar | 大版本 RC、weekly、专项                                 | WebArena / OSWorld / GAIA / tau3-bench adapter                                                                                                                                                                                                                                                                                      | 默认不阻断 |
| L9   | Release Ops                       | 每次正式发布                                            | `npm run verify:app-version` + startup / package smoke                                                                                                                                                                                                                                                                              | 是         |

## 3. 每个大版本的执行顺序

### Step 0：冻结候选

记录：

- git ref / tag / release candidate id
- model provider / model id / reasoning effort / temperature / tool profile
- App Server / Electron / package version
- benchmark manifest version
- 环境：OS、Node、Rust、Docker / VM、网络策略

输出：

```text
.lime/benchmark/releases/<version>/run-context.json
```

命令：

```bash
npm run agent-qc:benchmark-release:context -- \
  --version "<version>" \
  --output ".lime/benchmark/releases/<version>/run-context.json" \
  --format json \
  --check
```

`run-context.json` 必须记录 package version、git ref、worktree dirty 摘要、OS / Node / Rust / Docker / uv 可用性、benchmark manifest hash 和下载源 commit 对齐状态。Docker / runner 缺失是环境事实，不由 context 直接判 release 失败；source commit 不匹配必须失败，避免跑错测试集。

### Step 1：生成版本 Benchmark Evidence

推荐入口：

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

该 runner 会先检查 output root 所在卷的可用空间，默认最低 512MiB；空间不足时输出结构化 skipped report 并 fail closed，不执行后续 P0 / P1 命令，避免半截 evidence 被误读。随后按 manifest 依次生成：

- `run-context.json`
- `benchmark-release-checklist.json`
- P0 npm 门禁 step result，包括 `verify:local`、contracts、Agent Runtime fixture、GUI smoke、harness replay / trend 和 Agent QC manifest check
- Coding Workflow P0 step result，包括 Codex-first coding provider request、真实 Read / `apply_patch` / Glob / Grep / Bash 执行、coding lifecycle projection、workspace diff / file checkpoint diff、Evidence Pack 和 replay/regression 晋升要求
- Coding Workflow P0 runtime artifact：runner 会把 `coding-current-tools` smoke 输出固定到 `<output-root>/p0/coding-workflow-p0/coding-current-tools/agent-runtime-tool-execution-coding-current-tools.json`，summary 必须校验 `scenarioId=coding-current-tools`、`status=pass`、目标工具均出现在 provider request、runtime 全部 completed、Evidence Pack 已导出且 coding assertions 全 true
- P1 fixed slice dry-run evidence
- P1 full fixed slice true-run preflight evidence；默认非 strict runner 只跑每个 external suite 首题，`--strict-gate` 或 `--full-external-suites` 会展开 manifest `taskSet` 全量
- P1 full fixed slice fail-closed true-run evidence；当前 adapter 未 ready 时仍写 blocked evidence，不计 release-ready
- `benchmark-release-summary.json`
- `benchmark-release-compare.json`，当传入 `--baseline-version` 或 `--baseline-summary` 时
- `benchmark-release-check.json`
- `benchmark-baseline.json`，当传入 `--promote-baseline` 且前置 gate 全部通过时
- `benchmark-release-run.json`
- `benchmark-release-report.md` 或 `benchmark-release-report.json`，作为人工审计摘要

如 CI / release runner 的 evidence 目录较大，可显式调高门槛：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --include-p0 \
  --min-free-mb 2048 \
  --baseline-version "<baseline>" \
  --format json \
  --stdout summary \
  --strict-gate \
  --promote-baseline \
  --check
```

默认不带 `--include-p0` 时，runner 的目标是“收集 P1 evidence 并生成 summary”，不是“宣布 release ready”。默认 P1 preflight / true-run 只覆盖每个 external suite 的首题；需要在非 strict 环境预演 full fixed slice 时，显式加 `--full-external-suites`。正式 RC / release 必须带 `--include-p0`，否则不能宣称 L0-L5 多方面门禁已跑完。P1 true-run 因 Docker、runner 或 current adapter 缺失而 blocked 时，runner 仍继续执行后续 summary；blocked 状态必须进入 `benchmark-release-summary.json`，不能被解释为 pass。`--strict-gate` 已被收紧为正式放行路径：缺少 `--include-p0` 或缺少 `--baseline-version` / `--baseline-summary` 时，runner 会直接拒绝生成计划；strict gate 会自动启用 external suite 全量 `taskSet`，不能只凭首题放行。

runner 始终写出 `<output-root>/benchmark-release-run.json`，并在 run JSON 写入后自动生成 `<output-root>/benchmark-release-report.md`。正式 RC / release 推荐带 `--stdout summary`，让控制台只显示版本、run report 路径、audit report 路径、step 计数、storage、full/P0/strict 状态和失败摘要；完整结构化证据以 JSON 文件为准。需要旧行为时使用默认 `--stdout full`，CI 只消费文件时可用 `--stdout none`。

如果本次 run 已有由 App Server current 主链生成的 per-task current-chain evidence，可给 runner 传 `--current-chain-evidence-root "<root>"`。runner 会把每题路径解析为 `<root>/<suite-slug>/<task-id>/current-chain-evidence.json` 并透传给 true-run step；缺文件、坏 JSON 或合同无效必须产出 blocked evidence，不能跳过 task 或变成 release-ready。

summary 生成后，runner 的自动审计报告会给人工评审快速查看 artifact 是否齐全、decision 是否 blocked、blocker 来自 P0 还是 P1、compare / baseline 是否存在。需要复跑、改输出路径或生成 JSON 格式时，可单独执行：

```bash
npm run agent-qc:benchmark-release:report -- \
  --release-root ".lime/benchmark/releases/<version>" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-report.md" \
  --check
```

该报告消费 `benchmark-release-run.json`、`benchmark-release-summary.json`、可选 `benchmark-release-compare.json` 和可选 `benchmark-baseline.json`。Markdown 是人工审计默认格式；CI 或后续汇总可用 `--format json --output ".lime/benchmark/releases/<version>/benchmark-release-report.json"`。只传 `--release-root` 时，版本必须从 runner report 的 `plan.version` 或 summary 的 `version` 推导，不能回落为当天日期。该 report 不替代 summary / compare / strict gate；`--release-gate` 只用于让审计报告本身 fail closed。

候选版本 summary 生成后，必须与上一稳定版本 summary 做回归预算对比。正式 RC 推荐把 baseline 直接交给 runner：

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

如果只需要复跑 compare 或审计已有 summary，可单独执行：

```bash
npm run agent-qc:benchmark-release:compare -- \
  --baseline-summary ".lime/benchmark/releases/<baseline>/benchmark-release-summary.json" \
  --candidate-summary ".lime/benchmark/releases/<version>/benchmark-release-summary.json" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-compare.json" \
  --format json \
  --check
```

`benchmark-release:compare` 的职责是版本间判退化，不替代单次运行 summary / gate。它读取 manifest 的 `p1RegressionBudget.maxAdditionalFailedTasks`，阻断 P0 step 从 pass 退化、P1 true-run 新增 failed / blocked 超预算、以及 baseline 已 `releaseReady=true` 而 candidate 变为 false 的情况。正式 release summary、strict gate 和 compare 三者都必须通过，才允许声明本次大版本 benchmark 放行。`--strict-gate` 使用 baseline 时还会校验上一稳定版本的 `benchmark-baseline.json`；缺失、`baselineReady=false`、`releaseReady=false`、`baselineKind=bootstrap` 或 `allowNotReady=true` 时，runner 会在执行 P0 / P1 前 fail closed。

`benchmark-release-summary.json` 的 `releaseReady=true` 只在所有 blocker 归零时成立：`issueCount=0`、`releaseBlockerCount=0`、`p0GateBlockerCount=0`、`preflightBlockerCount=0`、`trueRunBlockerCount=0`、`trueRunEvidenceBlockerCount=0`。P0 npm step 退出码通过后，summary 仍会读取 coding P0 artifact；缺失、坏 JSON、目标工具不完整、runtime 未 completed、Evidence Pack 未导出或关键 coding assertions 失败，都会进入 `p0GateBlockers`。P1 adapter 未来升级到 `ready` 后，blocked true-run / preflight evidence 仍必须阻断 release-ready，不能只凭 manifest 状态放行。P1 true-run task 即使输出 `verdict=ready`，也必须证明 `execution.currentChainInvoked=true`、`execution.trueRunInvoked=true`、`execution.verifierInvoked=true`，且 current chain contract 指向 `agentSession/turn/start` 与 `evidence/export` 并标记 `evidenceExportInvoked=true`，同时在 task 输出目录写出有效 `evidence-pack/manifest.json`；否则 summary 作为 fake-ready evidence 处理。required P1 suite 在 `adapterStatus=ready` 后，还必须覆盖 manifest `taskSet` 全量任务；缺任一任务的 ready true-run evidence 时，summary 会产生 `task_set_true_run_missing` 或 `task_set_true_run_not_ready` blocker。

strict gate 通过后，`--promote-baseline` 会自动登记当前版本作为下一版 baseline。需要单独复跑时使用：

```bash
npm run agent-qc:benchmark-release:baseline -- \
  --version "<version>" \
  --require-compare \
  --format json \
  --check
```

`benchmark-release:baseline` 会生成 `.lime/benchmark/releases/<version>/benchmark-baseline.json`，并确认 summary release-ready、所有 blocker 计数为 0、compare decision 为 `pass`。这里的 blocker 包括 `releaseBlockerCount`、`p0GateBlockerCount`、`preflightBlockerCount`、`trueRunBlockerCount` 和 `trueRunEvidenceBlockerCount`；`--allow-not-ready` 只允许产出 bootstrap / 调试 descriptor，不能放宽这些计数，也不能作为稳定 baseline。只有 baseline descriptor `baselineReady=true`、`baselineKind=stable` 的版本，才允许在下一版 runner 中作为 `--baseline-version "<version>"`。

正式 release 放行前必须跑严格 gate：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --include-p0 \
  --baseline-version "<baseline>" \
  --format json \
  --stdout summary \
  --strict-gate \
  --check
```

在 P1 external adapter 尚未 `ready` 前，严格 gate 应该失败。只有通过 Lime App Server current 主链执行 Agent turn、生成 Evidence Pack、再调用外部 verifier 的 true-run，才允许计入 release-ready。

current adapter 的第一份输入合同是 `benchmark-current-chain-evidence-v1`：同一 suite / task 必须记录 `appServer.method="agentSession/turn/start"` 且 `invoked=true`、`evidenceExport.method="evidence/export"` 且 `invoked=true`、App Server Evidence Pack 至少包含 `session_id / thread_id / pack_relative_root / exported_at / observability_summary.source="app-server-current"`，并且 `externalVerifier.invoked=true`、`externalVerifier.verdict=pass|passed|ready`。`benchmark:true-run --current-chain-evidence <path>` 只有在 preflight ready 且该合同有效时才会产出 `verdict=ready`；runner 默认不传该参数，所以本地 blocked evidence 不会自动升级。

该合同由 `agent-qc:benchmark:current-chain-evidence` 生成，输入固定为三份真实证据：App Server `agentSession/turn/start` 记录、App Server `evidence/export` 返回的 Evidence Pack、external verifier 结果。也可以用 `--json-rpc-trace` 替代独立 turn-start 文件，让 builder 从 Electron / App Server JSON-RPC trace 中抽取 `agentSession/turn/start` 并确认 `evidence/export` 出现；Evidence Pack 正文仍由 `--evidence-pack` 输入。该 builder 只归一化证据，不执行 Agent turn；后续真实 adapter 要负责产生这些输入，再把输出交给 `benchmark:true-run --current-chain-evidence`。

`benchmark:true-run` 对缺失或无效 current-chain evidence 必须 fail closed 成结构化 blocked evidence，而不是进程崩溃或跳过 task：preflight ready 时记录 `lime_current_chain_evidence` blocker；preflight blocked 时不追加 current-chain blocker，避免把尚未到达的阶段误判为真实执行失败。

### Step 2：跑 Lime P0 基础门禁

先生成本次版本的 benchmark 执行清单：

```bash
npm run agent-qc:benchmark-release:checklist -- \
  --version "<version>" \
  --output-root ".lime/benchmark/releases/<version>" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-checklist.json" \
  --format json \
  --check
```

该清单只回答“本次大版本应该跑哪些命令、证据应落在哪里、哪些 true-run 仍是 planned”，不替代后续 dry-run、preflight、true-run、summary 或 release gate。默认清单只展开每个 P1 external suite 的首题；需要审计 full fixed slice 时加 `--full-external-suites`，正式 strict gate 清单加 `--strict-gate`，它会自动展开 manifest `taskSet` 全量并把 summary 子门禁切到 `--release-gate`。`--output-root` 要和实际 runner evidence 根目录保持一致。

命令：

```bash
npm run verify:local
npm run test:contracts
npm run smoke:agent-runtime-tool-execution -- --batch coding-current-tools
npm run smoke:agent-runtime-current-fixture
npm run test:rust:related -- lime-rs/crates/app-server/src/runtime_backend/coding_events.rs lime-rs/crates/app-server/src/runtime/event_store.rs lime-rs/crates/tool-runtime/src/native_overlay.rs
npm run verify:gui-smoke
npm run harness:eval
npm run harness:eval:trend
npm run agent-qc:check
npm run agent-qc:benchmark-release:context -- --version "<version>" --output ".lime/benchmark/releases/<version>/run-context.json" --format json --check
npm run agent-qc:benchmark-release:checklist -- --version "<version>" --output-root ".lime/benchmark/releases/<version>" --output ".lime/benchmark/releases/<version>/benchmark-release-checklist.json" --format json --check
npm run agent-qc:benchmark-release:check
```

如改动涉及版本 / packaging：

```bash
npm run verify:app-version
```

阻断条件：

- 任一命令失败且无法证明是环境阻断。
- GUI smoke 没有真实 current 主路径证据。
- Coding P0 没有固定 release artifact，或 artifact 没有证明 provider tool request、真实工具结果、patch/file artifact、command output、workspace diff / file checkpoint diff 或 Evidence Pack。
- Coding P0 发现 runtime/tool/App Server bug 后只记录不修复，或修复后没有沉淀 replay / regression / Rust 或 TS 定向测试。
- harness fixture invalid。
- Agent QC P0 manifest / GUI flow manifest 缺场景或引用不存在命令。
- Benchmark release manifest 无法校验本地测试集 source、固定 slice 或 evidence 要求。

### Step 3：跑 Lime P0 Agent QC Evidence

如果是正式大版本，必须导出 release evidence：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --output "./.lime/qc/qcloop-p0-job.json" \
  --check
```

qcloop 完成后：

```bash
npm run agent-qc:export-evidence -- \
  --job-id "<qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "<release-ref>" \
  --diff-base "<baseline-ref>" \
  --check
```

生成发布摘要：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "internal/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --harness-summary "./.lime/harness/reports/harness-eval-summary.json" \
  --harness-trend "./.lime/harness/reports/harness-eval-trend.json" \
  --tag "<release-tag>" \
  --output "./.lime/qc/release-agent-qc.md" \
  --check
```

外部 P1 adapter 标为 `ready` 后，正式放行还必须跑严格 gate：

```bash
npm run agent-qc:benchmark-release:gate
```

`agent-qc:benchmark-release:check` 只证明 manifest、下载源、固定 slice 和 evidence 要求结构有效；`agent-qc:benchmark-release:gate` 会把 release blocker 作为失败条件，防止外部 adapter 未接入时误放行。

阻断条件：

- Evidence Pack 不存在或 schema invalid。
- 未覆盖全部 P0 scenario id。
- P0 scenario verdict 非 `pass`，且没有 owner / reason / expiry 的 waiver。

### Step 4：跑外部 P1 Benchmark Slice

P1 外部集分三层运行：

1. `dry-run`：只证明 fixed slice 能加载、必需文件完整、Lime 证据形状可产出。
2. `true-run preflight`：检查本机是否具备真实运行条件，例如 source commit、Docker、runner CLI、任务结构。
3. `true-run`：通过 Lime current 主链执行 Agent turn，并调用外部 verifier；只有这一层可计入 Agent 能力分数和 release-ready。当前入口已存在，但在 current adapter 真正接入前会 fail-closed 输出 blocked evidence。

当前阶段先跑 dry-run：

```bash
npm run agent-qc:benchmark:dry-run -- \
  --suite "terminal-bench-release-slice" \
  --all-tasks \
  --output ".lime/benchmark/releases/<version>/terminal-bench" \
  --check

npm run agent-qc:benchmark:dry-run -- \
  --suite "deepswe-fixed-ten" \
  --all-tasks \
  --output ".lime/benchmark/releases/<version>/deepswe" \
  --check
```

dry-run 只允许证明 task loading、固定 slice 完整和 evidence shape，不允许作为 Agent 能力分数或 release-ready 证据。正式 P1 gate 仍必须升级到 true-run adapter。

当前可用 preflight 入口：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite "terminal-bench-release-slice" \
  --task "hello-world" \
  --output ".lime/benchmark/releases/<version>/terminal-bench/hello-world-preflight" \
  --check
```

preflight 只允许输出 `ready` 或 `blocked` 的运行条件判断。它不调用 live Provider、不执行 Agent turn、不启动 Docker 任务、不调用 verifier；`verifier-result.json` 必须是 `not_run` 或 `blocked`，不能伪造 pass。

#### Terminal-Bench / Harbor

当前 true-run preflight 入口：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite "terminal-bench-release-slice" \
  --task "hello-world" \
  --output ".lime/benchmark/releases/<version>/terminal-bench/hello-world-preflight" \
  --check
```

当前 true-run 入口：

```bash
npm run agent-qc:benchmark:terminal-run -- \
  --suite "terminal-bench-release-slice" \
  --output ".lime/benchmark/releases/<version>/terminal-bench" \
  --check
```

Adapter 必须输出：

- `trajectory.json`
- `tool-timeline.json`
- `stdout.log` / `stderr.log`
- `verifier-result.json`
- `evidence-pack/`
- `summary.json`

当前阻断：`hello-world` preflight 已确认 source checkout 和任务文件完整、`uv` 可用；但 `docker` CLI 不在 PATH，全局 `tb` CLI 不可用，`uv run --project ... --no-sync tb --help` 也无法调起 runner。因此 Terminal-Bench 仍保持 `adapterStatus=dry_run_ready`，不能升级为 `ready`。

当前 true-run 入口会先写出 blocked evidence，并在 `--check` 下非 0 退出；不会调用 provider、Docker 任务或外部 verifier。

#### DeepSWE

当前 true-run preflight 入口：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite "deepswe-fixed-ten" \
  --task "ytt-jsonpath-query-api" \
  --output ".lime/benchmark/releases/<version>/deepswe/ytt-jsonpath-query-api-preflight" \
  --check
```

当前 true-run 入口：

```bash
npm run agent-qc:benchmark:deepswe-run -- \
  --suite "deepswe-fixed-ten" \
  --output ".lime/benchmark/releases/<version>/deepswe" \
  --check
```

Adapter 必须输出：

- task repo checkout ref
- agent trajectory
- patch diff
- test log
- verifier verdict
- cost / duration / token summary
- evidence pack / replay case

当前阻断：`ytt-jsonpath-query-api` preflight 已确认 source checkout、任务文件、DeepSWE `schema_version=1.1`、separate verifier metadata、`pre_artifacts.sh`、`tests/Dockerfile`、`tests/test.patch`、`tests/test.sh`、`tests/grader.py`、`tests/config.json` 和 `environment/Dockerfile` 完整，`uv` 可用；但 `docker` CLI 不在 PATH，全局 `pier` CLI 不可用，`uv tool list` 未发现 `datacurve-pier >= 0.3.0`。因此 DeepSWE 仍保持 `adapterStatus=dry_run_ready`，不能升级为 `ready`。

当前 true-run 入口会生成 blocked `patch.diff`、`reward.json`、`ctrf.json` 和 `replay-case/replay.json` 占位证据，但这些只证明未运行原因，不代表 Agent patch 或 verifier 分数。

阻断条件：

- Adapter 无法产出 trajectory 或 Evidence Pack。
- release slice 相对上一稳定版本出现明显回退，且不能归因为上游环境或模型策略变化。
- 失败集中指向 Lime runtime/tool bug，而不是模型能力限制。

### Step 5：跑 P2 能力雷达

默认只做抽样，不阻断发布，除非本版本主目标正好是对应能力。

候选：

- WebArena fixed slice
- BrowserGym / WorkArena smoke
- OSWorld small slice
- GAIA Level 1 dev slice
- tau3-bench small slice

输出同样进入：

```text
.lime/benchmark/releases/<version>/radar/
```

如果 P2 发现真实产品阻断，例如 browser runtime 崩溃、GUI automation 无法操作、tool policy 绕过，必须升级为 P0/P1 阻断。

### Step 6：生成版本 Benchmark 总结

当前入口：

```bash
npm run agent-qc:benchmark-release:summary -- \
  --evidence-root ".lime/benchmark/releases/<version>" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-summary.json" \
  --format json \
  --check
```

总结必须包含：

- 各 lane 状态：pass / fail / blocked / needs-human-review / waived / skipped
- P0 npm gate step 计数、失败 / skipped / missing 命令和对应 stdout / stderr tail
- 内部 P0 场景覆盖率
- 外部 P1 benchmark pass rate、成本、用时、回退
- P2 radar 发现
- top failure modes
- waiver 清单和过期时间
- 必须沉淀的 replay / regression
- 最终 release verdict

## 4. 通过门槛

### 必须满足

1. L0-L5 全部通过，或只有有证据的 waived。
2. P0 Agent QC 覆盖全部 P0 scenario。
3. Harness eval summary 无 invalid current case。
4. GUI smoke 证明 current 主路径可用。
5. Release summary 存在且进入 repo 或 release artifact。
6. 所有阻断失败都有关联 owner、复现路径、修复计划或 waiver expiry。

### P1 Benchmark 回退门槛

初始阶段先用保守规则：

- Terminal-Bench release slice：不得比上一稳定版本多失败超过 1 个任务，除非有明确环境归因。
- DeepSWE release slice：不得出现大幅回退；若样本少于 20 题，按 task-level 回退逐个审查，不用百分比掩盖。
- SWE-bench slice：只作参考，不直接阻断。

成熟后再引入：

- pass@1
- pass^k
- cost-normalized score
- p50 / p95 duration
- tool error rate
- retry / human intervention rate
- evidence completeness score

## 5. 失败处理

失败分五类：

| 类型                        | 处理                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Product regression          | 必须修复；补 replay / test / GUI flow。                                                                    |
| Runtime / tool bug          | 必须修复；补 tool timeline 回归和 Rust / TS 定向测试。                                                     |
| Coding workflow bug         | 必须修复；补 coding lifecycle、workspace diff / file checkpoint、Evidence Pack 或 replay/regression 回归。 |
| Model limitation            | 可记录为能力缺口；不阻断，除非上一版本已通过。                                                             |
| Harness / environment issue | 标记 blocked；修 harness 或重跑，不能算 pass。                                                             |
| Grader issue                | 修 verifier 或暂时 waiver；记录上游 issue / 本地 patch。                                                   |

每个 P0/P1 失败修复后必须至少沉淀一项：

- harness replay case
- Agent QC scenario
- Playwright / GUI flow
- Rust / TS 定向测试
- benchmark adapter regression
- failure taxonomy entry

## 6. 运行频率

| 频率                   | 内容                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| 每次 PR / 本地交付     | 按 diff 风险跑 `verify:local`、contracts、GUI smoke 或定向 smoke。                  |
| 每日 nightly           | `harness:eval:history:record`、P0 replay trend、低成本 Agent QC smoke。             |
| 每周                   | Terminal-Bench / DeepSWE expanded slice，WebArena / GAIA / tau3-bench small slice。 |
| 每个 release candidate | L0-L9 全部大版本计划。                                                              |
| 每个正式大版本         | RC 全套 + release summary + waiver audit + 失败沉淀检查。                           |

## 7. Manifest 形状草案

当前版本化入口：

```text
internal/test/benchmark-release.manifest.json
npm run agent-qc:benchmark-release:context
npm run agent-qc:benchmark-release:checklist
npm run agent-qc:benchmark-release:run
npm run agent-qc:benchmark-release:summary
npm run agent-qc:benchmark-release:check
npm run agent-qc:benchmark-release:gate
```

核心字段：

```json
{
  "schemaVersion": "benchmark-release-v1",
  "releasePolicy": {
    "p0Required": true,
    "p1RegressionBudget": {
      "maxAdditionalFailedTasks": 1
    }
  },
  "suites": [
    {
      "id": "lime-agent-qc-p0",
      "priority": "P0",
      "runner": "agent-qc",
      "source": "internal/test/agent-qc-scenarios.manifest.json",
      "requiredForRelease": true
    },
    {
      "id": "terminal-bench-release-slice",
      "priority": "P1",
      "runner": "harbor-adapter",
      "taskSet": "external/terminal-bench/release-slice.json",
      "requiredForRelease": true
    },
    {
      "id": "deepswe-release-slice",
      "priority": "P1",
      "runner": "deepswe-adapter",
      "taskSet": "external/deepswe/release-slice.json",
      "requiredForRelease": true
    }
  ]
}
```

## 8. 实施阶段

### P0：文档和门禁口径

- 固定本目录方案。
- 固定 release benchmark manifest 草案。
- 明确大版本必须跑的 lane 和 evidence。

退出条件：不用问人也能知道大版本该跑什么、怎么判定、失败如何沉淀。

### P1：Lime 私有集收口

- 将 `agent-qc`、`harness`、GUI smoke、release summary 接到同一 release benchmark summary。
- 补齐 P0 scenario evidence completeness 检查。

退出条件：没有外部 benchmark 时，也能完成一次版本级 Agent release gate。

### P2：Terminal-Bench / Harbor adapter

- 引入 Harbor task runner adapter。
- Lime Agent 执行任务后写 `trajectory.json` 和 Evidence Pack。
- summary 能比较 baseline / candidate。

退出条件：固定 release slice 可在本地或 CI-like 环境稳定运行。

### P3：DeepSWE adapter

- 引入 DeepSWE task adapter。
- 记录 patch、test log、verifier verdict 和成本。
- 将失败沉淀到 Lime replay / coding regression。

退出条件：DeepSWE fixed slice 成为每个大版本的 P1 gate。

### P4：P2 能力雷达

- 接 WebArena / BrowserGym smoke。
- 接 GAIA public dev slice。
- 接 tau3-bench small slice。
- OSWorld 只做专项或手动触发。

退出条件：版本 summary 能显示 Lime 多方面 Agent 能力趋势，而不是只有 coding 分数。
