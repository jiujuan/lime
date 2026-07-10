# Benchmark 落地进度

> 更新时间：2026-07-10
> 目标：记录测试集下载、首批测试运行和下一步 adapter / release gate 落地状态，避免只依赖聊天记录。

## 2026-07-09 首批落地

### 已下载到本地缓存

真实下载物统一放在 `.lime/benchmark/sources/`，该目录被 `.gitignore` 忽略；版本化 manifest 只记录来源、commit、slice 和证据要求。

| 数据集 / runner         | 优先级      | 本地路径                                 | Commit                                     | 当前状态                                                                                                                                                                              |
| ----------------------- | ----------- | ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal-Bench / Harbor | P1          | `.lime/benchmark/sources/terminal-bench` | `1a6ffa9674b571da0ed040c470cb40c4d85f9b9b` | 已下载任务源码和 registry；fixed 10 题 dry-run 全部能加载并产出 Lime 证据形状；`hello-world` true-run preflight 已产出 blocked 证据；未安装依赖、未拉 Docker、未执行外部 verifier。   |
| DeepSWE                 | P1          | `.lime/benchmark/sources/deep-swe`       | `3cda4081fed96103a6395de39c85e9b20275e307` | 已下载 113 题任务集；fixed 10 题 dry-run 全部能加载并产出 Lime 证据形状；`ytt-jsonpath-query-api` true-run preflight 已产出 blocked 证据；未安装 Pier、未拉 Docker、未执行 verifier。 |
| WebArena                | P2          | `.lime/benchmark/sources/webarena`       | `dce04686a56253aefba7b18a4fa0937cf1dc987b` | 已下载源码；未部署 self-hosted websites。                                                                                                                                             |
| BrowserGym              | P2          | `.lime/benchmark/sources/browsergym`     | `9e779f087de9a65668b6974d11f9ce9816026e96` | 已下载源码；作为 WebArena / WorkArena adapter 参考。                                                                                                                                  |
| tau-bench               | P2 历史参考 | `.lime/benchmark/sources/tau-bench`      | `59a200c6d575d595120f1cb70fea53cef0632f6b` | 已下载源码；2026-07-10 WebSearch 复核后仅作为 tau 系列历史参考缓存，新的 P2 radar small slice 优先评估 tau3-bench。                                                                   |

暂缓下载：

- GAIA：优先等确定 public dev slice 和 Hugging Face 下载方式后再拉，避免把私有 / 大体量数据误写入本地缓存。
- OSWorld：环境和 VM 成本较高，不作为首批默认下载；后续按专项能力评估单独接入。

### 已版本化的入口

- `internal/roadmap/benchmark/README.md`
- `internal/roadmap/benchmark/dataset-selection.md`
- `internal/roadmap/benchmark/version-test-plan.md`
- `internal/test/benchmark-release.manifest.json`
- `npm run agent-qc:benchmark-release:context`
- `npm run agent-qc:benchmark-release:checklist`
- `npm run agent-qc:benchmark-release:run`
- `npm run agent-qc:benchmark-release:summary`
- `npm run agent-qc:benchmark-release:compare`
- `npm run agent-qc:benchmark-release:baseline`
- `npm run agent-qc:benchmark-release:check`
- `npm run agent-qc:benchmark-release:gate`

`.gitignore` 已增加 `internal/roadmap/benchmark/*.md` 反忽略规则，保证 benchmark 路线图进入 repo 事实源。

### 首批已执行测试

运行目录：`.lime/benchmark/runs/2026-07-09-initial/`

| 测试                                                          | 结果                                   | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `benchmark-release.manifest.json` 路径自检                    | 通过                                   | `suiteCount=5`、`downloadedSources=5`、`radarBacklog=4`；P1 fixed slice 的任务目录均存在，P2 WebArena / BrowserGym 源缓存存在；tau-bench 源缓存只作为历史参考，P2 radar 已改为 tau3-bench not downloaded。                                                                                                                                                                                                                                                                                              |
| `npm run agent-qc:benchmark-release:context`                  | 通过结构检查；生成 release run context | 输出 `.lime/benchmark/runs/2026-07-09-release-summary/run-context.json`；`downloadedSourceCount=5`、`sourceMismatchCount=0`、`issueCount=0`，5 个下载源 HEAD 均匹配 manifest commit；当前环境记录 `docker_cli` / `docker_daemon` 不可用，作为 warning 而不是 context 结构失败；当前工作树为 dirty，记录 `statusEntryCount=751` 和状态摘要 hash。                                                                                                                                                        |
| `npm run agent-qc:benchmark-release:check`                    | 通过结构检查；release gate 未 ready    | 新增机械校验入口已确认 `valid=true`、`downloadedSources=5`、`suiteCount=5`、`radarBacklog=4`、`issueCount=0`；同时明确 `releaseReady=false`，阻断项是 `terminal-bench-release-slice` 和 `deepswe-fixed-ten` 的 adapter 仍为 `dry_run_ready`，尚未达到真实 `ready`。                                                                                                                                                                                                                                     |
| `npm run agent-qc:benchmark-release:checklist`                | 通过结构检查；生成大版本执行清单       | 输出 `.lime/benchmark/runs/2026-07-09-release-summary/benchmark-release-checklist.json`；清单展开 P0 npm gate、release context、P1 dry-run、P1 true-run preflight、planned true-run、release summary、manifest check 和严格 release gate；`stepCount=20`、`readyStepCount=18`、`plannedStepCount=2`。`planned` true-run 不算通过，也不让 `--check` 失败。                                                                                                                                               |
| `npm run agent-qc:benchmark-release:summary`                  | 通过结构检查；release summary 未 ready | 输出 `.lime/benchmark/runs/2026-07-09-release-runner-include-p0-support/benchmark-release-summary.json`，识别 `p0GateStepCount=0`、`p0GateBlockerCount=10`、`dryRunSuiteCount=2`、`preflightCount=2`、`trueRunTaskCount=2`、`releaseBlockerCount=2`、`preflightBlockerCount=6`、`trueRunBlockerCount=6`、`issueCount=0`；默认 runner 未带 `--include-p0` 时，summary 会明确列出 `verify:local`、contracts、Agent Runtime fixture、GUI smoke、harness 和 Agent QC P0 命令缺失，不能被 P1 evidence 掩盖。 |
| `npm run agent-qc:benchmark-release:run`                      | 通过默认编排；release summary 未 ready | 输出 `.lime/benchmark/runs/2026-07-09-release-runner/benchmark-release-run.json`；一键执行 context、checklist、Terminal-Bench / DeepSWE fixed slice dry-run、默认首题 preflight、默认首题 fail-closed true-run、summary 和 manifest check。默认不跑 strict gate，因此 P1 blocked evidence 会被收集并继续汇总，不会被误记为 pass。                                                                                                                                                                       |
| `npm run agent-qc:benchmark-release:run -- --include-p0`      | 已支持；本轮未跑完整 P0                | runner 已能把 manifest 中 `runner=npm` 的 P0 suites 插入到 checklist 和 P1 外部集之间，并给每个 P0 step 写入 JSON result。当前未运行完整 `--include-p0`，因为 `verify:local` 已知被既有 i18n unused key 阻断，`verify:gui-smoke` 尚未作为完整 release evidence 执行；不能用默认 P1 evidence runner 替代 P0 多方面门禁。                                                                                                                                                                                 |
| `npm run agent-qc:benchmark-release:run -- --min-free-mb <N>` | 已支持 storage preflight               | runner 会在任何 context / checklist / dry-run / P0 step 前检查 output root 所在卷可用空间；默认最低 512MiB。空间不足时不执行任何步骤，输出 `storage_preflight: available_below_minimum` 的结构化 skipped report，避免生成半截 release evidence。                                                                                                                                                                                                                                                        |
| `npm run agent-qc:benchmark-release:gate`                     | 按预期失败                             | 严格 release gate 会把 `releaseReady=false` 作为非 0 退出；当前失败原因是 P1 adapter 只有 `dry_run_ready`，证明 dry-run 不会误放行大版本。                                                                                                                                                                                                                                                                                                                                                              |
| `npm run agent-qc:benchmark:check`                            | 通过                                   | Agent QC differential benchmark manifest `valid=true`，无 issues。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run harness:eval`                                        | 通过                                   | 2 个 repo fixture 全部 ready，0 invalid；summary 已写入 `.lime/benchmark/runs/2026-07-09-initial/harness-eval-summary.json`。                                                                                                                                                                                                                                                                                                                                                                           |
| `npm run harness:eval:trend`                                  | 通过                                   | trend seed 已写入 `.lime/benchmark/runs/2026-07-09-initial/harness-eval-trend.json`；样本数为 1，只能作为初始 baseline，不能判断长期退化。                                                                                                                                                                                                                                                                                                                                                              |
| `npm run agent-qc:check`                                      | 通过                                   | Agent QC scenario manifest `valid=true`，13 个 scenario / 8 个 P0；GUI flow manifest `valid=true`，5 个 flow / 4 个 P0。                                                                                                                                                                                                                                                                                                                                                                                |
| `npm run test:contracts`                                      | 通过                                   | App Server client contract、command contracts、Harness contracts、modality contracts、scripts governance、Electron release workflow、harness cleanup contract 和 docs boundary 均通过。                                                                                                                                                                                                                                                                                                                 |
| `npm run smoke:agent-runtime-current-fixture`                 | 通过                                   | 先遇到 stale `.lime/electron-fixture-build.lock`，脚本自动清理后重建 renderer / Electron host / app-server sidecar；随后通过 history/cache hydration、stream completion、Electron fixture guard、Claw 热路径、Coding Workbench、approval、Inputbar queue / restore、Plan hydrate、Skills Runtime、Multi-Agent、MCP structuredContent、media reference、Expert Skills、Content Factory 等 current fixture；`liveProviderUsed=false`。                                                                    |
| `npm run verify:local`                                        | 失败                                   | 阻断点是当前工作树既有 `i18n:unused --check` 大量未引用 key 候选；不是 benchmark 文档、manifest 或新增 release check 直接引入的问题，但仍会阻止完整 L0 门禁通过。                                                                                                                                                                                                                                                                                                                                       |
| `npm run governance:scripts`                                  | 通过                                   | 新增脚本放在既有 `scripts/agent-qc/` 领域，未新增 `scripts/` 根脚本或一级目录。                                                                                                                                                                                                                                                                                                                                                                                                                         |

### P1 fixed slice dry-run

运行目录：`.lime/benchmark/runs/2026-07-09-p1-dry-run/`

| Suite                            | 命令                                                                                                                                                                  | 结果 | 证据                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terminal-Bench / Harbor fixed 10 | `npm run agent-qc:benchmark:dry-run -- --suite terminal-bench-release-slice --all-tasks --output ".lime/benchmark/runs/2026-07-09-p1-dry-run/terminal-bench" --check` | 通过 | `suite-summary.json` 显示 `readyCount=10`、`blockedCount=0`；每题写出 `summary.json`、`trajectory.json`、`tool-timeline.json`、`verifier-result.json`、`stdout.log`、`stderr.log`、`evidence-pack/manifest.json`。`simple-web-scraper` 是多服务 compose 任务，adapter 已支持 `client/Dockerfile` / `server/Dockerfile`。 |
| DeepSWE fixed 10                 | `npm run agent-qc:benchmark:dry-run -- --suite deepswe-fixed-ten --all-tasks --output ".lime/benchmark/runs/2026-07-09-p1-dry-run/deepswe" --check`                   | 通过 | `suite-summary.json` 显示 `readyCount=10`、`blockedCount=0`；每题写出 `summary.json`、`trajectory.json`、`tool-timeline.json`、`verifier-result.json`、`patch.diff`、`test-stdout.txt`、`reward.json`、`ctrf.json`、`replay-case/replay.json`、`evidence-pack/manifest.json`。                                           |

dry-run 边界：

- 未调用 live Provider。
- 未执行 Docker / external verifier。
- `verifier-result.json` / `reward.json` 明确为 `not_run`，不伪造 pass。
- 该结果只能证明任务加载、固定 slice 完整和 Lime 证据形状可产出，不能当作 Agent 能力分数或 release-ready 证据。

### Terminal-Bench true-run preflight

运行目录：`.lime/benchmark/runs/2026-07-09-true-run-preflight/terminal-bench/hello-world/`

命令：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite terminal-bench-release-slice \
  --task hello-world \
  --output ".lime/benchmark/runs/2026-07-09-true-run-preflight/terminal-bench/hello-world" \
  --format json \
  --check
```

结果：按预期失败，`verdict=blocked`。

已确认：

- source checkout 存在，HEAD 匹配 manifest commit `1a6ffa9674b571da0ed040c470cb40c4d85f9b9b`。
- `hello-world` 必需文件完整，`missingFiles=[]`。
- `uv` 可用，版本为 `0.9.8`。
- 未调用 live Provider、未执行 Agent turn、未执行 Docker verifier；`verifier-result.json` 为 `blocked`，不是伪 pass。

阻断项：

- `docker` CLI 不在当前 PATH，`docker_daemon` 因此未检查。
- 全局 `tb` CLI 不可用。
- `uv run --project ... --no-sync tb --help` 也无法调起 `tb`，说明 Terminal-Bench runner 入口尚未安装 / 暴露。

### Terminal-Bench fail-closed true-run

运行目录：`.lime/benchmark/runs/2026-07-09-true-run/terminal-bench/hello-world/`

命令：

```bash
npm run agent-qc:benchmark:terminal-run -- \
  --task hello-world \
  --output ".lime/benchmark/runs/2026-07-09-true-run/terminal-bench/hello-world" \
  --format json
```

结果：生成 `benchmark-true-run-v1` blocked evidence；未调用 provider、未执行 Lime current 主链、未执行 Docker 任务、未调用 verifier。

同时验证：

```bash
npm run agent-qc:benchmark:terminal-run -- \
  --task hello-world \
  --output ".lime/benchmark/runs/2026-07-09-true-run-check/terminal-bench/hello-world" \
  --format json \
  --check
```

该命令按预期非 0 退出，证明 true-run blocked 不会在 release 脚本中误当通过。

新增入口：

- `npm run agent-qc:benchmark:true-run-preflight`
- `npm run agent-qc:benchmark:true-run`
- `npm run agent-qc:benchmark:terminal-run`
- `npm run agent-qc:benchmark:deepswe-run`
- `npm run agent-qc:benchmark-release:context`
- `npm run agent-qc:benchmark-release:checklist`
- `npm run agent-qc:benchmark-release:run`
- `npm run agent-qc:benchmark-release:summary`
- `npm run agent-qc:benchmark-release:check`
- `npm run agent-qc:benchmark-release:gate`
- `scripts/agent-qc/benchmark-true-run-preflight.mjs`
- `scripts/agent-qc/benchmark-true-run-preflight.test.mjs`
- `scripts/agent-qc/benchmark-true-run.mjs`
- `scripts/agent-qc/benchmark-true-run.test.mjs`
- `scripts/agent-qc/benchmark-release-context.mjs`
- `scripts/agent-qc/benchmark-release-context.test.mjs`
- `scripts/agent-qc/benchmark-release-checklist.mjs`
- `scripts/agent-qc/benchmark-release-checklist.test.mjs`
- `scripts/agent-qc/benchmark-release-run.mjs`
- `scripts/agent-qc/benchmark-release-run.test.mjs`
- `scripts/agent-qc/benchmark-release-summary.mjs`
- `scripts/agent-qc/benchmark-release-summary.test.mjs`
- `scripts/agent-qc/benchmark-release-check.mjs`

### DeepSWE true-run preflight

运行目录：`.lime/benchmark/runs/2026-07-09-true-run-preflight/deepswe/ytt-jsonpath-query-api/`

命令：

```bash
npm run agent-qc:benchmark:true-run-preflight -- \
  --suite deepswe-fixed-ten \
  --task ytt-jsonpath-query-api \
  --output ".lime/benchmark/runs/2026-07-09-true-run-preflight/deepswe/ytt-jsonpath-query-api" \
  --format json \
  --check
```

结果：按预期失败，`verdict=blocked`。

已确认：

- source checkout 存在，HEAD 匹配 manifest commit `3cda4081fed96103a6395de39c85e9b20275e307`。
- `ytt-jsonpath-query-api` 必需文件完整，`missingFiles=[]`。
- DeepSWE task metadata 为 `schema_version=1.1`，`verifier.environment_mode=separate`，并配置 `/logs/artifacts/model.patch`。
- verifier 关键文件完整：`pre_artifacts.sh`、`tests/Dockerfile`、`tests/test.patch`、`tests/test.sh`、`tests/grader.py`、`tests/config.json`、`environment/Dockerfile`。
- `uv` 可用，版本为 `0.9.8`。
- 未调用 live Provider、未执行 Agent turn、未执行 Docker verifier；`verifier-result.json` 为 `blocked`，不是伪 pass。

阻断项：

- `docker` CLI 不在当前 PATH，`docker_daemon` 因此未检查。
- 全局 `pier` CLI 不可用。
- `uv tool list` 未发现 `datacurve-pier >= 0.3.0`，当前只列出 `harbor v0.7.0`、`kimi-cli v0.54`、`specify-cli v0.0.19`。

### DeepSWE fail-closed true-run

运行目录：`.lime/benchmark/runs/2026-07-09-true-run/deepswe/ytt-jsonpath-query-api/`

命令：

```bash
npm run agent-qc:benchmark:deepswe-run -- \
  --task ytt-jsonpath-query-api \
  --output ".lime/benchmark/runs/2026-07-09-true-run/deepswe/ytt-jsonpath-query-api" \
  --format json
```

结果：生成 `benchmark-true-run-v1` blocked evidence；未调用 provider、未执行 Lime current 主链、未执行 Docker 任务、未调用 verifier。该入口额外写出 blocked `patch.diff`、`reward.json`、`ctrf.json` 和 `replay-case/replay.json` 占位证据，明确这些不是 Agent patch 或 verifier pass。

## 2026-07-10 Runner 硬化

### Storage preflight

运行目录：`.lime/benchmark/runs/2026-07-10-storage-preflight/`

命令：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version 2026-07-10-storage-preflight \
  --output-root ".lime/benchmark/runs/2026-07-10-storage-preflight" \
  --format json \
  --check
```

结果：通过默认编排，`benchmark-release-run.json` 显示 `storage.status=ready`，10 个默认步骤全部执行并通过结构检查；summary 仍保持 `releaseReady=false`，因为 P0 未带 `--include-p0` 且 P1 true-run adapter 尚未 ready。

高阈值阻断验证：

```bash
npm run agent-qc:benchmark-release:run -- \
  --version 2026-07-10-storage-blocked \
  --output-root ".lime/benchmark/runs/2026-07-10-storage-blocked" \
  --min-free-mb 999999999 \
  --format json \
  --check
```

结果：按预期非 0 退出，`benchmark-release-run.json` 输出 `storage.status=blocked`、`reason=available_below_minimum`，所有计划步骤为 `skipped`，`issues=["storage_preflight: available_below_minimum"]`。该结果证明 evidence 目录空间不足时不会继续执行 P0 / P1 命令，也不会留下看似可放行的半截报告。

### Strict gate 参数硬化

`benchmark-release:run -- --strict-gate` 已收紧为正式放行路径：生成计划前必须同时提供 `--include-p0` 和 `--baseline-version` / `--baseline-summary`。这样正式 RC 不能只靠 P1 dry-run / preflight evidence 或缺失 baseline compare 的结果进入 strict gate。

仍保留独立入口：

```bash
npm run agent-qc:benchmark-release:gate
```

该入口只用于复核 manifest 中 release-required external adapter 是否已 `ready`。当前它仍应失败，因为 Terminal-Bench / Harbor 与 DeepSWE 的 `adapterStatus` 仍为 `dry_run_ready`。

### Baseline descriptor 硬化

正式 `benchmark-release:run -- --strict-gate` 使用 baseline 时，现在会先校验上一稳定版本目录里的 `benchmark-baseline.json`。该 descriptor 必须满足：

- `schemaVersion=benchmark-release-baseline-v1`
- `baselineReady=true`
- `releaseReady=true`
- `baselineKind=stable`
- `allowNotReady` 不是 `true`
- descriptor 中的 `summaryPath` 与本次 runner 解析出的 baseline summary 路径一致

缺失或不满足这些条件时，runner 会在执行 P0 / P1 前输出 `baseline_descriptor_blocked`，所有步骤保持 `skipped`。`benchmark-release:baseline -- --allow-not-ready` 现在只会生成 `baselineKind=bootstrap` 的调试 descriptor，`baselineReady=false`，不能被 strict gate 当作上一稳定版。

### Release summary blocker 硬化

`benchmark-release-summary.json` 的 `releaseReady` 已收紧为所有 blocker 归零才为 true：`issueCount=0`、`releaseBlockerCount=0`、`p0GateBlockerCount=0`、`preflightBlockerCount=0`、`trueRunBlockerCount=0`、`trueRunEvidenceBlockerCount=0`。新增回归覆盖：P0 npm gate 全部通过且 P1 adapter 已标 `ready` 时，只要 true-run suite 仍为 `blocked`、task-level current-chain evidence 缺失、Evidence Pack 无效，或 manifest `taskSet` 未被全量 ready true-run 覆盖，summary 仍必须 `releaseReady=false`。这防止未来 P1 adapter 状态先改成 ready 后，blocked verifier / Docker / current adapter evidence 或首题 smoke 被误放行。

新增 `benchmark-release-summary -- --release-gate` 作为正式 runner 的 summary 子门禁：普通 summary 仍可生成 blocked evidence 并返回 0，strict runner 会额外要求 `releaseReady=true`。真实 CLI 已用 `.lime/benchmark/fixtures/strict-summary-gate.manifest.json` 和 `.lime/benchmark/releases/2026-07-10-stable-fixture/benchmark-baseline.json` 验证：baseline descriptor 为 `ready` 后，runner 执行到 `benchmark-release:summary --release-gate`；候选 summary 因 `releaseReady=false` 非 0，后续 `benchmark-release:check`、compare、gate 和 baseline promotion 全部 `skipped`。本地证据位于 `.lime/benchmark/runs/2026-07-10-summary-release-gate-cli/`，`benchmark-release-run.json` 显示 `passedStepCount=6`、`failedStepCount=1`、`skippedStepCount=4`，失败步骤为 `benchmark-release:summary`；候选 `benchmark-release-summary.json` 同时记录 `p0GatePassedCount=1`、`releaseBlockerCount=1`、`preflightBlockerCount=3`、`trueRunBlockerCount=3`、`issueCount=0`。

新增 `trueRunEvidenceBlockers`，避免未来外部 adapter 只把 task 标成 `verdict=ready` 就被 release summary 放行。required P1 suite 在 `adapterStatus=ready` 后，summary 会要求存在 task-level ready true-run evidence，并逐项检查 `execution.currentChainInvoked=true`、`execution.trueRunInvoked=true`、`execution.verifierInvoked=true`、`execution.currentChain.appServerMethod="agentSession/turn/start"`、`execution.currentChain.evidenceExportMethod="evidence/export"`、`execution.currentChain.evidenceExportInvoked=true`，以及同目录 `evidence-pack/manifest.json` 有效且匹配 suite / task / verdict；同时按 manifest `taskSet` 逐题检查，缺任务会报 `task_set_true_run_missing`，任务非 ready 会报 `task_set_true_run_not_ready`。缺任一项时 `trueRunEvidenceBlockerCount>0`，`releaseReady=false`；这把“Lime App Server current 主链 + Evidence Pack + external verifier + full fixed slice”从文档约束提升为机械门禁。

`benchmark:true-run` 新增 `--current-chain-evidence <path>` 导入合同：只有 preflight ready，且 `benchmark-current-chain-evidence-v1` 同时证明同一 suite / task 已经走 `agentSession/turn/start`、经 `evidence/export` 导出 App Server Evidence Pack、external verifier 已执行且通过时，才会生成 `verdict=ready`。缺该文件、文件不匹配、Evidence Pack 缺 `session_id / thread_id / pack_relative_root / exported_at`、`observability_summary.source` 不是 `app-server-current`，或 verifier 未 pass，都会保持 blocked。runner 默认不传该参数，因此本地 dry-run / blocked evidence 不会自动升级。

新增 `agent-qc:benchmark:current-chain-evidence` builder，用三份真实输入生成该合同：App Server `agentSession/turn/start` 记录、App Server `evidence/export` 返回的 Evidence Pack、external verifier 结果。builder 也支持 `--json-rpc-trace`，可直接从 Electron / App Server JSON-RPC trace 中抽取 `agentSession/turn/start` 并确认 `evidence/export` 出现；Evidence Pack 正文仍通过 `--evidence-pack` 输入。该 builder 只归一化和校验证据，不执行 Agent turn、不调用 Docker、不调用模型；后续真实 adapter 要先产生这些输入，再把 builder 输出交给 `benchmark:true-run --current-chain-evidence`。

`benchmark:true-run --current-chain-evidence` 指向缺失、坏 JSON 或无效合同文件时，现在不会让 CLI 直接崩溃；preflight ready 时会写出 `lime_current_chain_evidence` blocker，preflight blocked 时只保留 preflight blocker，避免把未到达的 current-chain 阶段误记成额外失败。这使 release runner 未来可以安全传入约定 evidence 路径，缺文件仍是可审计 blocked evidence。

### Full external suite 调度

`benchmark-release:run` 已支持 `--full-external-suites`。默认 runner 仍只对每个 P1 external suite 的首题跑 preflight / fail-closed true-run，便于在 Docker / runner 未 ready 时快速收集 blocked evidence；显式 `--full-external-suites` 或正式 `--strict-gate` 会对 manifest `taskSet` 全量展开 preflight / true-run step。runner report 的 `plan.fullExternalSuites` 会记录实际是否进入 full fixed slice 模式，避免默认首题 evidence 被误读为完整 release gate。

`benchmark-release:run` 也已支持 `--current-chain-evidence-root <root>`。runner 会对每个 true-run task 透传 `<root>/<suite-slug>/<task-id>/current-chain-evidence.json` 给 `benchmark:true-run --current-chain-evidence`；缺文件或无效 evidence 会由 true-run 写成 blocked evidence，不会让 runner 跳过 task，也不会把 dry-run / preflight 当作 release-ready。

新增 runner 级 current-chain root 回归：构造一个 full fixed slice 的 Terminal-Bench fixture，`hello-world` 有有效 `current-chain-evidence.json`，`fix-git` 缺失 evidence。受控 preflight ready 时，runner 会让 `hello-world` 生成 `verdict=ready`、`execution.currentChainInvoked=true`、`trueRunInvoked=true`、`verifierInvoked=true` 和有效 true-run Evidence Pack；`fix-git` 则生成 `lime_current_chain_evidence` blocker，summary 仍 `releaseReady=false`，并额外产生 `task_set_true_run_not_ready`。这证明 root 参数不会把首题 ready 或部分 fixture 误放行为整套 fixed slice release-ready。

`benchmark-release:checklist` 已同步同一口径：默认只展开每个 external suite 首题，`--full-external-suites` 展开 manifest `taskSet` 全量，`--strict-gate` 自动 full fixed slice 并给 summary 命令追加 `--release-gate`。runner 调用 checklist 时也会透传 `--output-root`、`--full-external-suites` 和 `--strict-gate`，确保 `benchmark-release-checklist.json` 的 step 数、evidence 路径和实际执行计划一致，不再把自定义 run 目录误写成默认 `.lime/benchmark/releases/<version>`。

### Runner stdout 摘要

`benchmark-release:run` 已支持 `--stdout full|summary|none`。默认 `full` 保持兼容，仍把完整 JSON report 输出到 stdout；正式 RC / release 推荐 `--stdout summary`，控制台只显示版本、run report 路径、audit report 路径、step 计数、storage、full/P0/strict 状态和非 passed 摘要；完整结构化 report 始终写入 `<output-root>/benchmark-release-run.json`，人读审计报告自动写入 `<output-root>/benchmark-release-report.md`。如果 CI 只消费文件产物，可用 `--stdout none`。

为降低 runner / summary 文件体量，Markdown 和 console summary 渲染已拆到 `scripts/agent-qc/benchmark-release-run-render.mjs`，审计 report 写入已拆到 `scripts/agent-qc/benchmark-release-run-audit-report.mjs`，P0 suite step 构建已拆到 `scripts/agent-qc/benchmark-release-run-suite-helpers.mjs`，strict baseline descriptor 校验已拆到 `scripts/agent-qc/benchmark-release-run-baseline-descriptor.mjs`；release summary 的 P0 gate 聚合拆到 `scripts/agent-qc/benchmark-release-summary-p0.mjs`，Markdown 渲染拆到 `scripts/agent-qc/benchmark-release-summary-render.mjs`。`scripts/agent-qc/benchmark-release-run.mjs` 当前约 919 行，`benchmark-release-summary.mjs` 当前约 934 行，均已降回 1000 行硬边界以下；`benchmark-release-run.test.mjs` 已超过 800 行。后续再扩 runner / summary 时，继续优先拆 helper 和小测试文件，避免回到巨型文件。

### Release report 审计层

新增 `benchmark-release:report`，用于把 `benchmark-release-run.json`、`benchmark-release-summary.json`、可选 `benchmark-release-compare.json` 和可选 `benchmark-baseline.json` 汇总成一页 Markdown 或 JSON 人工审计报告。report 会输出 artifact 状态、release decision、blocker 摘要、compare decision 和 baseline readiness；缺 run / summary 或 JSON 结构错误时 `--check` fail closed。`benchmark-release:run` 现在会在收尾阶段自动写出 `<output-root>/benchmark-release-report.md`，单独 report 命令只用于复跑、自定义输出路径或 JSON 格式。

只传 `--release-root` 不传 `--version` 时，report 现在会优先从 runner report 的 `plan.version` 或 summary 的 `version` 推导版本，避免审计报告显示为当天日期。本地用 `.lime/benchmark/runs/2026-07-10-checklist-run-sync` 验证，生成的 `benchmark-release-report.md` 显示 `version: 2026-07-10-checklist-run-sync`、`decision: blocked`、`releaseReady: no`、`run steps: 46 passed / 0 failed / 0 skipped`；blocked 原因仍是 P0 未跑、P1 adapter 为 `dry_run_ready`、Docker / runner preflight blocker 仍存在。这是预期的审计结论，不能作为 release-ready。另用 `.lime/benchmark/runs/2026-07-10-auto-report` 验证 runner 自动写 report，`--stdout summary` 输出 `auditReport=.lime/benchmark/runs/2026-07-10-auto-report/benchmark-release-report.md`，报告头部显示 `decision: blocked`。

### Coding Workflow P0 门禁

新增 `coding-workflow-p0` release suite，并把它加入 `releasePolicy.releaseVerdictRequires`。对应 Agent QC 场景为 `coding-workflow-current-chain`，风险等级 `P0`，覆盖 `L1-contract-bridge`、`L2-agent-runtime`、`L3-product-surface` 和 `L4-behavior-eval`。release P0 当前使用 Codex-first `coding-current-tools` batch，而不是旧 `safe-core-tools` 的 Aster `Edit` / `Write` 工具面。

这条 P0 的事实源不是 DeepSWE / SWE-bench，而是 Lime 自己的 Codex-first 主链：

- `agentSession/turn/start`
- Read / `apply_patch` / Glob / Grep / Bash provider request 和真实工具结果
- `apply_patch` / command / file_changed / test output coding lifecycle
- workspace diff 或 `agentSession/fileCheckpoint/diff`
- `evidence/export` Evidence Pack
- Thread / Turn / Item read model projection
- GUI Coding Workbench fixture
- 失败修复后的 replay / regression 晋升记录

本轮按用户要求先跑了一次可执行 smoke，而不是只补 manifest。第一次使用旧 `safe-core-tools` batch，目的是暴露现有 tool runtime 实际缺口：

```bash
npm run smoke:agent-runtime-tool-execution -- \
  --batch safe-core-tools \
  --no-write \
  --timeout-ms 30000
```

结果：DevBridge、workspace、tool inventory、fixture provider、session、turn 和 Evidence Pack 阶段均被触达，但最终失败于 `fixtureProviderUsed`，说明当前 provider request 没有按预期命中 localhost fixture。

随后复跑带 evidence 输出的同一 batch：

```bash
npm run smoke:agent-runtime-tool-execution -- \
  --batch safe-core-tools \
  --output ".lime/benchmark/runs/2026-07-10-coding-p0-smoke/agent-runtime-tool-execution-safe-core-tools.json" \
  --timeout-ms 60000
```

结果：更早暴露 current native gateway 注册问题，错误为 `Native tool tool_search is not allowed by tool-runtime current registration policy`。根因是 App Server 会按 current gateway 注册 `tool_search`，但 `tool-runtime` registration allowlist 漏掉了这个 Codex-current native tool。

修复：`lime-rs/crates/tool-runtime/src/native_overlay.rs` 已把 `tool_search` 纳入 current registration allowlist，并补 `runtime_native_tool_registration_policy_matches_allowlist` 断言。该修复属于 `current` owner，不在 `agent-compat` 增加业务逻辑，也不恢复 Aster 工具面。

修复后再次复跑旧 `safe-core-tools`，命令写出 `.lime/benchmark/runs/2026-07-10-coding-p0-rerun/agent-runtime-tool-execution-safe-core-tools.json`。结果已经通过 `tool-inventory` 并命中 localhost fixture provider，证明 `tool_search` 注册策略问题进入运行时；新的失败集中在 `Edit` / `Write` 不在 current provider request 和 runtime surface 中。按 Aster 迁移规则，这不是要恢复 Aster `Edit` / `Write`，而是将 release coding P0 切到 `coding-current-tools`，验证 `Read`、`apply_patch`、`Glob`、`Grep`、`Bash` 和 App Server coding lifecycle。

验证状态：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime runtime_native_tool_registration_policy_matches_allowlist --lib`：通过，确认 `tool_search` 已进入 current registration allowlist。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend_registers_current_gateway_tools_in_agent_registry --lib`：通过，确认 App Server current native gateway 能注册 `tool_search` 到 agent registry。
- `npm run agent-qc:benchmark-release:checklist -- --version "2026-07-10-coding-p0-gate" ... --check`：通过，生成 checklist 中 `coding-workflow-p0` 展开 3 个 ready step。后续已把第一步从旧 `safe-core-tools` 切换为 Codex-first `coding-current-tools`。
- `npm run test:rust:related -- lime-rs/crates/tool-runtime/src/native_overlay.rs`：已触发 `tool-runtime`、`lime-agent`、`app-server` 等反向依赖测试；`app-server` 单测输出中 coding lifecycle、Evidence Pack、tool lifecycle 相关用例已通过，但最终被当前脏树中的 `aster-core` / `agent-compat` 既有失败阻断，失败集中在旧 Aster prompt / registry / provider / recipe / bash 测试，不是本轮 `tool_search` current owner 修改引入。

随后新增并执行 `coding-current-tools` batch，目标工具改为 Codex-first `Read`、`apply_patch`、`Glob`、`Grep`、`Bash`。第一次运行写出 `.lime/benchmark/runs/2026-07-10-coding-current-tools/agent-runtime-tool-execution-coding-current-tools.json`：provider request 已包含全部 target tools，`apply_patch` 实际修改并新增了 fixture 文件，说明 coding P0 已触达真实工具链；但 run 失败在 App Server current tool lifecycle，`agentSession/read` 报 `tool_args_without_start`，导致 `Read` 后续工具结果没有完成投影。

该失败根因是 provider/runtime streaming 首个 `tool_input_delta` 到达时，Event Store 只对 `llm_protocol` 的 `tool.args.delta` 合成 `tool.started`，没有覆盖 current `RuntimeAgentEvent::ToolInputDelta -> tool.input.delta` 形状。修复落在 `lime-rs/crates/app-server/src/runtime/event_store.rs`：仅对 `backend=runtime` 且 `runtimeEvent.type=tool_input_delta` 的首包合成 `tool.started`，并且只把由 synthetic start 激活后的同 id runtime `tool_start` 当幂等事件跳过；普通重复 `tool.started` 仍 fail closed。新增回归覆盖 runtime 首包合成、synthetic start 后 runtime start 幂等跳过、以及无 synthetic start 的重复 runtime start 继续拒绝。该修复服务 refactor v1 的 Turn / Item 边界：Turn execution lifecycle 必须先有合法 tool start，Item/read model 和 Evidence 才能消费后续 args/result。

修复后又暴露 Evidence Pack 可审计性缺口：工具链已完成，但 coding summary 只汇总 output/diff/checkpoint，无法稳定证明 `apply_patch` / `Bash` 等工具真实执行。修复落在 `lime-rs/crates/app-server/src/runtime/evidence_provider/coding.rs`，给 coding evidence summary 增加非敏感 tool execution index：`toolCallCount`、`completedToolCallCount`、`failedToolCallCount`、`toolNames`、`toolCallIds`、`completedToolCallIds`、`failedToolCallIds`；`export_evidence_pack_includes_coding_snapshot_artifacts` 已覆盖 `Bash` 与 `apply_patch`。

最终复跑：

```bash
npm run smoke:agent-runtime-tool-execution -- \
  --batch coding-current-tools \
  --output ".lime/benchmark/runs/2026-07-10-coding-current-tools-rerun/agent-runtime-tool-execution-coding-current-tools.json" \
  --timeout-ms 180000
```

结果：通过，`status=pass`，session 为 `sess_2d5feeda30b748aab72e153fcc3ac852`，turn 为 `tool-execution-1783645238774-42833`。provider request 和 runtime inventory 均包含 `Read`、`apply_patch`、`Glob`、`Grep`、`Bash`；5 个 target tools 全部 `completed`；`apply_patch` 修改并新增 fixture 文件，`Glob` / `Grep` / `Bash` 均有输出；Evidence Pack 成功导出，`evidencePackMentionsCodingExecution=true`。

同时把 `smoke:agent-runtime-tool-execution` 的裸命令默认 batch 从旧 `safe-core-tools` 切到 `coding-current-tools`。旧 `safe-core-tools` 仍可显式调用用于历史排障，但不再作为默认 current 工具烟测，避免 Aster `Edit` / `Write` dead 工具面继续误导 release evidence。

2026-07-10 继续收口 release artifact 契约：`benchmark-release:run -- --include-p0` 现在会对 `coding-workflow-p0` 的 `smoke:agent-runtime-tool-execution -- --batch coding-current-tools` 自动注入稳定输出路径：

```text
<output-root>/p0/coding-workflow-p0/coding-current-tools/agent-runtime-tool-execution-coding-current-tools.json
```

P0 step result 仍写在 `<output-root>/p0/coding-workflow-p0/01-smoke-agent-runtime-tool-execution.json`，但 summary 不再只看 step 退出码；它会读取上面的 runtime artifact 并校验 `scenarioId=coding-current-tools`、`status=pass`、`Read` / `apply_patch` / `Glob` / `Grep` / `Bash` 全部进入 provider request、runtime `completedTools` 全 true、Evidence Pack 已导出、`applyPatchMutatedFile` / `applyPatchCreatedFile` / `bashToolReturnedOutput` / `evidencePackMentionsCodingExecution` 等关键 assertions 全 true。缺 artifact、坏 JSON、目标工具不完整、runtime 未完成或 Evidence Pack 缺失都会进入 `p0GateBlockers`，因此正式 release summary 不能再用“npm step 通过但内部证据缺失”的假阳性放行。

### P2 radar WebSearch 复核

2026-07-10 WebSearch 复核后，P2 tau 系列策略调整为：

- 已下载的 `.lime/benchmark/sources/tau-bench` 只作为历史参考缓存保留，不再升级为新的 radar fixed slice。
- `internal/test/benchmark-release.manifest.json` 的 radar backlog 从 `tau-bench-small-slice` 改为 `tau3-bench-small-slice`，状态为 `not_downloaded`。
- 后续接入 tau 系列时，优先评估 tau3-bench 的 small slice；上游版本变化必须重新建立 baseline，不能和旧 tau-bench 缓存混比。

### 收口验证

本轮定向验证：

- `npx vitest run $(rg --files "scripts/agent-qc" | rg 'benchmark-.*\.test\.mjs$')`：通过，16 个测试文件 / 87 个用例全部通过，覆盖 manifest plan、dry-run、preflight、fail-closed true-run、current-chain evidence builder / JSON-RPC trace 抽取 / 导入、current-chain evidence 缺失 fail-closed、runner current-chain evidence root 透传、valid current-chain task ready 与缺失 task fail-closed、release context / checklist / summary / runner / run renderer / release report / runner 自动 audit report / compare / baseline、current App Server true-run contract、full external suite 调度、checklist full/root 同步和 fixed slice 全量 evidence blocker。
- `node --check scripts/agent-qc/benchmark-release-run-current-chain.test.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-run-current-chain.test.mjs`：通过，2 个用例覆盖 current-chain evidence root 的 per-task 路径透传，以及 full fixed slice 中 valid task ready、缺失 task fail-closed 且 summary 不 release-ready。
- `node --check scripts/agent-qc/benchmark-release-baseline.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-baseline.test.mjs`：通过，6 个用例覆盖 releaseReady summary + pass compare 登记、releaseReady=false 阻断、compare 缺失 / 非 pass 阻断、bootstrap descriptor 不能作为 stable baseline，以及 `allow-not-ready` 不放宽 P0 / preflight / true-run / true-run evidence blocker 计数。
- `node --check scripts/agent-qc/benchmark-release-run.mjs`：通过。
- `node --check scripts/agent-qc/benchmark-release-run-suite-helpers.mjs`、`node --check scripts/agent-qc/benchmark-release-run-baseline-descriptor.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-run.test.mjs`：通过，22 个用例覆盖 runner 默认步骤、默认首题 P1 evidence 收集、`--full-external-suites` 展开 external suite 全量 `taskSet`、strict gate 自动 full fixed slice、P0 include、storage preflight、`--baseline-version` 解析、`--baseline-summary` compare 插入、strict gate 必须携带 P0 + baseline、strict gate 必须使用 ready/stable baseline descriptor、summary release gate / compare / strict gate 失败时 baseline promotion fail-closed，以及 promote baseline 全通过路径。
- `node --check scripts/agent-qc/benchmark-release-run-render.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-run-render.test.mjs`：通过，2 个用例覆盖 console summary 不输出 stdout/stderr tail，以及 Markdown 仍保留完整 step 表格。
- `node --check scripts/agent-qc/benchmark-release-report.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-report.test.mjs`：通过，5 个用例覆盖 blocked / needs_compare / pass / missing artifact，以及只传 `--release-root` 时从 runner report 推导版本。
- `npx vitest run scripts/agent-qc/benchmark-release-run-audit-report.test.mjs`：通过，1 个用例覆盖 runner evidence root 自动写出 `benchmark-release-report.md`。
- `npm run agent-qc:benchmark-release:report -- --release-root ".lime/benchmark/runs/2026-07-10-checklist-run-sync" --output ".lime/benchmark/runs/2026-07-10-checklist-run-sync/benchmark-release-report.md" --check`：通过，报告头部显示 `version: 2026-07-10-checklist-run-sync`、`decision: blocked`、`releaseReady: no`，证明 report 用真实 runner version 而不是当天日期。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-auto-report" --output-root ".lime/benchmark/runs/2026-07-10-auto-report" --dry-run-only --stdout summary --format json --check`：通过，控制台输出 `auditReport=.lime/benchmark/runs/2026-07-10-auto-report/benchmark-release-report.md`，自动生成的审计报告显示 `decision: blocked`，证明 dry-run-only 不会被误读为 release-ready。
- `node --check scripts/agent-qc/benchmark-release-checklist.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-checklist.test.mjs`：通过，4 个用例覆盖默认首题 checklist、`--full-external-suites` 全量 taskSet、`--strict-gate` 自动 full fixed slice + summary release gate、以及模块导入不依赖 `process.argv[1]`。
- `node --check scripts/agent-qc/benchmark-release-summary.mjs`：通过。
- `node --check scripts/agent-qc/benchmark-release-summary-p0.mjs`、`node --check scripts/agent-qc/benchmark-release-summary-render.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-summary.test.mjs`：通过，11 个用例覆盖 P0 blocker、外部 dry-run/preflight 聚合、true-run blocked 聚合、P0 全过 + P1 adapter ready 但 true-run blocked 时仍 `releaseReady=false`，adapter ready 但缺 current-chain ready true-run task / Evidence Pack / current App Server contract 时仍 fail closed，以及 required external suite 未覆盖 manifest `taskSet` 全量 true-run 时仍 fail closed。
- `node --check scripts/agent-qc/benchmark-release-coding-p0-artifact.mjs`、`node --check scripts/agent-qc/benchmark-release-run-coding-p0.test.mjs`、`node --check scripts/agent-qc/benchmark-release-summary-coding-p0.test.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-run-coding-p0.test.mjs scripts/agent-qc/benchmark-release-summary-coding-p0.test.mjs`：通过，4 个用例覆盖 runner 自动注入 coding P0 稳定 artifact 输出路径、step result 保留 manifest command、summary 在 artifact 缺失时 fail closed、artifact 内部 Evidence Pack / assertion 缺失时 fail closed，以及完整 coding artifact 通过后 P0 releaseReady。
- `npm run agent-qc:benchmark-release:run -- --manifest ".lime/benchmark/fixtures/strict-summary-gate.manifest.json" --version "2026-07-10-summary-release-gate-cli" --output-root ".lime/benchmark/runs/2026-07-10-summary-release-gate-cli" --include-p0 --baseline-version "2026-07-10-stable-fixture" --strict-gate --promote-baseline --format json --check`：按预期非 0，`baselineDescriptor.status=ready`，P0 / dry-run / preflight / fail-closed true-run evidence 收集步骤先通过，`benchmark-release:summary --release-gate` 因 `releaseReady=false` 失败，后续 manifest check、compare、strict gate、baseline promotion 全部跳过，证明 strict runner 不会把 blocked summary 继续送入对比或稳定 baseline 登记。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-summary-blocker-hardening" --output-root ".lime/benchmark/runs/2026-07-10-summary-blocker-hardening" --format json --check`：通过默认编排，10 个步骤全部执行并通过结构检查；该运行仍不是 release-ready，因为 P0 未带 `--include-p0`，且 P1 preflight / true-run blocker 被 summary 计入 release-ready 阻断条件。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-full-external-suite-run" --output-root ".lime/benchmark/runs/2026-07-10-full-external-suite-run" --full-external-suites --format json --check`：通过 full external suite 编排，`plan.fullExternalSuites=true`、`stepCount=46`、`preflightCount=20`、`trueRunTaskCount=20`；summary 仍 `releaseReady=false`，因为 P0 未带 `--include-p0`，Terminal-Bench / DeepSWE adapter 仍为 `dry_run_ready`，且 Docker / runner blocker 进入 `preflightBlockerCount=60`、`trueRunBlockerCount=60`。该运行证明 full fixed slice 会被完整调度，但不能被解释为 Agent 能力分数。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-checklist-run-sync" --output-root ".lime/benchmark/runs/2026-07-10-checklist-run-sync" --full-external-suites --format json --check`：通过，`summary.stepCount=46`、`passedStepCount=46`、`plan.fullExternalSuites=true`。runner 的 `benchmark-release:checklist` 子步骤已带 `--output-root .lime/benchmark/runs/2026-07-10-checklist-run-sync` 和 `--full-external-suites`；生成的 `benchmark-release-checklist.json` 显示 `releaseRoot=.lime/benchmark/runs/2026-07-10-checklist-run-sync`、`fullExternalSuites=true`、`stepCount=56`、`plannedStepCount=20`，证明 checklist 清单路径和 full fixed slice 口径与实际 runner plan 对齐。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-stdout-summary" --output-root ".lime/benchmark/runs/2026-07-10-stdout-summary" --dry-run-only --stdout summary --format json --check`：通过，控制台只输出短摘要；`benchmark-release-run.json` 仍写入 output root。该运行用于验证正式 runbook 推荐的 `--stdout summary` 不影响 evidence 文件生成。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-baseline-descriptor-missing" --output-root ".lime/benchmark/runs/2026-07-10-baseline-descriptor-missing" --include-p0 --baseline-version "missing-baseline" --strict-gate --format json --check`：按预期非 0，输出 `baselineDescriptor.status=blocked`、`baseline descriptor 不存在`，22 个计划步骤全部 `skipped`，证明缺稳定 baseline descriptor 时不会执行 P0 / P1。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-strict-gate-hardening" --output-root ".lime/benchmark/runs/2026-07-10-strict-gate-hardening" --format json --check`：通过默认编排，10 个步骤全部执行并通过结构检查；该运行仍不是 release-ready，因为未带 `--include-p0`、未提供 baseline，且 P1 true-run 仍是 fail-closed blocked evidence。
- `npm run agent-qc:benchmark-release:run -- --version "2026-07-10-strict-gate-misuse" --strict-gate --check`：按预期非 0，错误为 `--strict-gate 必须和 --include-p0 一起使用`，证明正式 runner 不允许缺 P0 的 strict gate。
- runner 子步骤已同步传递 `--manifest` 到 context、checklist、dry-run、preflight、true-run、summary、manifest check、compare 和 strict gate，避免自定义 release manifest 跑到中途回落默认清单。
- `node --check scripts/agent-qc/benchmark-release-compare.mjs`：通过。
- `npx vitest run scripts/agent-qc/benchmark-release-compare.test.mjs`：通过，6 个用例覆盖 P0 step 退化、P1 true-run task 新增 blocked、manifest 回归预算和 `needs-release-gate` 状态。
- `npm run agent-qc:benchmark-release:check`：通过，`valid=true`、`downloadedSourceCount=5`、`suiteCount=5`、`radarBacklogCount=4`、`issueCount=0`；`releaseReady=false`，阻断项仍是 Terminal-Bench / Harbor 与 DeepSWE 的 adapterStatus 只有 `dry_run_ready`。
- `npm run governance:scripts`：通过，新增 benchmark 脚本仍位于既有 `scripts/agent-qc/` 领域，没有新增 `scripts/` 根脚本或一级目录。
- `git diff --check -- ".gitignore" "package.json" "internal/roadmap/benchmark" "internal/test/benchmark-release.manifest.json" "scripts/agent-qc"`：通过，无 whitespace error。
- `npm run agent-qc:benchmark-release:gate`：按预期失败，`valid=true` 但 `releaseReady=false`，release blocker 为 `terminal-bench-release-slice: adapterStatus=dry_run_ready` 与 `deepswe-fixed-ten: adapterStatus=dry_run_ready`。该失败证明外部 adapter 未接 current true-run 前不会误放行。

### Agent Runtime current fixture 修复闭环

本轮按大版本 L2 / L2C 口径复跑 `npm run smoke:agent-runtime-current-fixture`，先暴露并修复一个 current 主链问题：MCP tool result 的 `structuredContent` 已由 App Server / fixture backend 产出，但前端 Agent protocol parser 在 `tool.result` 规范化时只保留 `output` / `metadata` / `images`，没有把 `structuredContent` / `structured_content` 传入 `AgentToolExecutionResult`，导致 GUI 工具过程只显示协议包络摘要，无法显示真实结构化答案。

修复范围：

- `src/lib/api/agentProtocolParserUtils.ts`：`normalizeToolExecutionResult()` 保留 nested `result.structuredContent` / `result.structured_content` 和顶层 `event.structuredContent` / `event.structured_content`，同时输出 camelCase 与 snake_case，保持 App Server current evidence、Agent Chat GUI 和 read model 投影一致。
- `src/lib/api/agentProtocol.structuredContent.test.ts`：新增 parser 回归，覆盖 `tool.result` 同时带协议包络 `output` 与真实 `structuredContent` 时，前端 `tool_end.result` 不丢结构化内容。

验证：

- `npx vitest run "src/lib/api/agentProtocol.structuredContent.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts"`：通过，5 files / 58 tests。
- `npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --prefix claw-chat-current-fixture-mcp-structured-content-after-parser-fix --timeout-ms 240000`：通过，summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-mcp-structured-content-after-parser-fix-summary.json`，关键断言包括 `guiMcpStructuredContentVisible=true`、`guiMcpStructuredContentEnvelopeHidden=true`、`readModelMcpStructuredContentCompleted=true`。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache hydration、turn completed 工具收尾、failed read model、Claw 终态 UI、Electron fixture guard、首页热路径、真实 GUI coding 输入到 Coding Workbench、图片命令、自然语言画图、停止后继续、approval 三类决策、full-access no prompt、Inputbar draft / pending steer queue、Plan revisioned history hydrate、Skills Runtime 三入口、Multi-Agent Team Evidence Pack、MCP structuredContent、media contentParts、Expert Skills Runtime、Expert Plaza / ExpertInfoPanel skills 闭环、Content Factory Article Editor；`liveProviderUsed=false`。

分类：

- `current`：MCP structuredContent 从 App Server current event -> Agent protocol parser -> Agent Stream timeline / read model -> `InlineToolProcessStep` / Agent Chat GUI 的真实展示链已恢复；同轮聚合也证明 Coding Workbench P0 GUI fixture 仍通过。
- `compat / deprecated`：未新增 `agent-compat` owner；外部 DeepSWE / Terminal-Bench true-run adapter 仍停留在 `dry_run_ready` / blocked evidence，不能作为 release-ready。
- `dead`：本轮没有新增 Aster-only 能力删除；仅在用户确认后删除本地生成缓存 `.lime/cargo-target` 以恢复 fixture 运行空间，该目录不是版本化源码事实源。

新增版本对比入口：

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

该 runner 会把 `--baseline-version "<baseline>"` 解析为 `.lime/benchmark/releases/<baseline>/benchmark-release-summary.json`，并在 `benchmark-release-summary.json` 和 `benchmark-release-check.json` 生成后自动执行 compare；若 compare `--check` 失败，后续 strict gate 会被跳过。单独复跑 compare 或使用自定义 baseline summary 路径时使用：

```bash
npm run agent-qc:benchmark-release:compare -- \
  --baseline-summary ".lime/benchmark/releases/<baseline>/benchmark-release-summary.json" \
  --candidate-summary ".lime/benchmark/releases/<version>/benchmark-release-summary.json" \
  --output ".lime/benchmark/releases/<version>/benchmark-release-compare.json" \
  --format json \
  --check
```

该入口读取 manifest 的 `p1RegressionBudget.maxAdditionalFailedTasks`，对比上一稳定版本和候选版本的 `benchmark-release-summary.json`：P0 step 从 pass 退化、P1 true-run 新增 failed / blocked 超预算、baseline 已 release-ready 但 candidate 不 ready，都会让 `--check` 非 0。当前还没有真实上一稳定版本 release summary，因此本轮完成脚本、runner 接入、单测和文档接入；正式 RC 需要提供 baseline summary 后再产出真实 compare evidence。

新增 baseline 登记入口：

```bash
npm run agent-qc:benchmark-release:baseline -- \
  --version "<version>" \
  --require-compare \
  --format json \
  --check
```

该入口会读取 `.lime/benchmark/releases/<version>/benchmark-release-summary.json` 和 `benchmark-release-compare.json`，写出 `benchmark-baseline.json`，并要求 `summary.releaseReady=true`、所有 blocker 计数为 0、compare decision 为 `pass`。当前 P1 adapter 未 ready 前，该入口应失败，不能把 dry-run / blocked evidence、fake-ready true-run evidence 或未覆盖 fixed slice 全量 taskSet 的结果登记成稳定 baseline。

### 当前不能宣称完成的部分

- Terminal-Bench 已有 `hello-world` true-run preflight，但当前被 Docker / `tb` runner 环境阻断；DeepSWE 已有 `ytt-jsonpath-query-api` true-run preflight，但当前被 Docker / Pier runner 环境阻断。两者尚未真正通过 Lime App Server / RuntimeCore 执行 Agent turn，也未调用外部 verifier；不能把 dry-run 或 preflight 当作 Agent 能力分数。
- `npm run verify:local` 已运行但被既有 i18n unused key 阻断，不能宣称完整 L0 release gate 通过。
- `npm run verify:gui-smoke` 尚未在本轮作为完整 release gate 运行。
- `npm run agent-qc:benchmark-release:run -- --include-p0` 已有 runner 支持，且 coding P0 artifact 已接入 summary 校验，但本轮仍未执行完整 release P0；正式 RC / release 必须启用，默认 runner 只能作为 P1 evidence 收集闭环。
- `npm run agent-qc:benchmark-release:compare` 和 `npm run agent-qc:benchmark-release:baseline` 已有脚本和单测，但还缺上一稳定版本真实 `benchmark-release-summary.json` 与本版 release-ready summary；正式 RC 需要把 compare / baseline descriptor 写入 release evidence。
- Storage preflight 只证明 evidence 目录具备最低写入条件；它不是 Agent 能力分数，也不能替代 P0 / P1 true-run。
- P1 外部 benchmark 已开始 dry-run 证据生成，但未开始真实 Agent execution；P2 仍只完成下载与 manifest 登记。
- `.lime/benchmark/runs/2026-07-09-initial/` 是本地证据缓存，不进入 Git；正式 release 需要导出 release summary 或把摘要复制到版本化 artifact。

## 下一刀

1. 补齐 Terminal-Bench true-run 环境：安装 / 暴露 Harbor 或 `tb` runner，确保 Docker CLI 和 daemon 可用；随后把 `hello-world` 从 preflight 升级为真实执行，通过 Lime current 主链生成 trajectory，再调用外部 verifier。
2. 补齐 DeepSWE true-run 环境：安装 / 暴露 `datacurve-pier >= 0.3.0`，确保 Docker CLI 和 daemon 可用；随后把 `ytt-jsonpath-query-api` 从 preflight 升级为真实执行，生成 patch / test log / reward / replay-case；未接 live Provider 前只能使用明确标记的 fixture backend，不伪造 pass。
3. 处理或隔离 `verify:local` 的既有 i18n unused key 阻断，让 L0 release gate 恢复可用。
4. 扩大运行门禁：`npm run verify:gui-smoke`，并把 GUI smoke evidence 写入 `.lime/benchmark/runs/<run-id>/`。
5. 复跑一次带 `--include-p0` 的非 strict release runner，确认 coding P0 artifact 在真实 run 目录中被 summary 识别；若仍被 `verify:local` / GUI smoke 阻断，记录 blocker 而不是跳过。
