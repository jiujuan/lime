# Lime Agent QC 证据输出契约

> 本文定义 Lime 样本产品在 qcloop 中运行 Agent QC 场景时，worker 必须输出的结构化证据格式。它补齐的是“命令跑过但 verifier 无法审查”的缺口：P0 发布门禁只接受可机器复核的 evidence，不接受散文式自评。

## 1. 为什么需要契约

最近的 P0 qcloop 批次暴露了三类典型问题：

- worker 运行了正确命令，但只输出“通过”摘要，verifier 看不到 `evidenceRequired` 的逐项证据。
- worker stdout 为空或只有日志路径，qcloop verifier 只能给出“输出格式错误”或“证据不足”。
- deterministic smoke 通过后，被误读为已经覆盖 `gui-trace`、`runtime-transcript` 或 `release-artifact`。

因此，qcloop worker 的最终 stdout 必须同时满足两层要求：

1. 人能快速读懂 PASS / FAIL / BLOCKED 与关键缺口。
2. 机器能稳定解析证据层、命令结果、artifact 路径、失败模式和发布 scope。

## 2. 必须输出的 marker

每个 Agent QC worker 最终 stdout 必须包含两行 marker：

```text
QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED
QCLOOP_EVIDENCE_SUMMARY_JSON=<json>
```

约束：

- `QCLOOP_WORKER_RESULT=PASS` 只表示 worker 认为场景满足要求；仍需 verifier 独立审查。
- `QCLOOP_WORKER_RESULT=BLOCKED` 用于 cwd、tmp、DevBridge、CLI 认证、sandbox、loopback 权限等环境阻断。
- `QCLOOP_EVIDENCE_SUMMARY_JSON=<json>` 必须是单行 JSON object；不要 Markdown、不要代码块、不要前后缀说明。
- `agent-qc:export-evidence` 会解析该 marker；qcloop item 即使是 `success`，只要缺少该 JSON 或 JSON 无法解析，导出的 Evidence Pack 也必须转为 `fail`。
- `agent-qc:release-summary --check` 会拒绝只有 `qcloop:*` 引用、缺少非 qcloop artifact / GUI owner / release scope evidenceRef 的 pass 场景。
- JSON 中不得包含 token、API key、用户私密数据或未经脱敏的完整请求 / 响应正文。

## 3. Evidence Summary JSON

最小结构：

```json
{
  "scenario_id": "workspace-ready-session-restore",
  "result": "pass",
  "commands": [
    {
      "command": "npm run verify:gui-smoke -- --reuse-running",
      "exit_code": 0,
      "duration_seconds": 142,
      "stdout_artifact": ".lime/qc/gui-smoke.stdout.txt",
      "stderr_artifact": ".lime/qc/gui-smoke.stderr.txt"
    }
  ],
  "evidence_layers_covered": ["deterministic-smoke", "gui-trace"],
  "evidence_required": [
    {
      "name": "DevBridge health",
      "status": "pass",
      "evidence": "GET http://127.0.0.1:3030/health returned ok",
      "artifact_path": ".lime/qc/devbridge-health.json"
    }
  ],
  "failure_modes": [
    {
      "name": "parallel GUI smoke interference",
      "status": "excluded",
      "evidence": "agent-qc:gui-owner-check ownerCount=0 before the run"
    }
  ],
  "artifacts": [
    {
      "path": ".lime/qc/gui-trace/workspace-ready.trace.zip",
      "kind": "gui-trace",
      "redacted": true
    }
  ],
  "blockers": [],
  "gui_session_owner": "single-owner:job-1778412738097137000:item-workspace-ready-session-restore",
  "release_scope": "source-tree-startup-smoke"
}
```

字段口径：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `scenario_id` | 是 | 必须等于 manifest 中的 scenario id。 |
| `result` | 是 | `pass` / `fail` / `blocked`。 |
| `commands[]` | 是 | 记录实际执行命令、退出码、耗时和可审查日志路径。 |
| `evidence_layers_covered[]` | 是 | 只能声明本次真实覆盖的层：`deterministic-smoke`、`gui-trace`、`runtime-transcript`、`release-artifact`。 |
| `evidence_required[]` | 是 | 对 manifest 的 `evidenceRequired` 逐项给出 `pass` / `fail` / `blocked` / `missing`。 |
| `failure_modes[]` | 是 | 对 manifest 的 `failureModes` 逐项给出 `covered` / `excluded` / `hit` / `unknown`。 |
| `artifacts[]` | 是 | 记录截图、trace、transcript、release summary、console/network 摘要等证据路径。 |
| `blockers[]` | 是 | 环境阻断或产品阻断；无阻断时为空数组。 |
| `gui_session_owner` | GUI 场景必填 | 证明当前 GUI / DevBridge 会话没有被其他 qcloop worker 抢占。 |
| `release_scope` | Release 场景必填 | 明确是 `source-tree-startup-smoke`、`installer-artifact-smoke` 还是其他 scope。 |

## 4. Verifier 判定规则

qcloop verifier 必须只输出单个 JSON object：

```json
{"pass": false, "feedback": "missing runtime transcript", "missingEvidence": ["runtime transcript"], "nextAction": "rerun with transcript artifact"}
```

判定规则：

- stdout 缺少 `QCLOOP_EVIDENCE_SUMMARY_JSON`：`pass=false`。
- `QCLOOP_WORKER_RESULT=PASS` 但 evidence JSON 有 `missing` / `unknown` / `blocked`：`pass=false`。
- 命令退出码为 `0` 但 `evidenceRequired` 没逐项满足：`pass=false`。
- 只覆盖 `deterministic-smoke`，却声明满足 `gui-trace` 或 `runtime-transcript`：`pass=false`。
- `failure_modes` 没逐项说明覆盖、排除或命中：`pass=false`。
- GUI 场景缺少 `GUI session owner / isolation statement`：`pass=false` 或 `blocked`，优先排查并发干扰。
- Release 场景没有明确 `release_scope`：`pass=false`，不能把 source-tree smoke 伪装成 installer artifact 验证。

## 5. 与现有入口的关系

当前机器标准已经接入：

```bash
npm run agent-qc:check
npm run agent-qc:qcloop-job -- --risk P0 --max-qc-rounds 1 --check
npm run agent-qc:gui-owner-check -- --check
```

执行顺序：

1. `agent-qc:check` 校验 manifest、P0 evidence layers、qcloop prompt 和 npm script 入口。
2. `agent-qc:gui-owner-check -- --check` 确认没有 active GUI qcloop owner 后，才能启动新的 GUI P0 批次。
3. `agent-qc:qcloop-job` 生成的 payload 会把 `evidence_layers` 带入 item，并把结构化证据输出契约追加到 worker prompt。
4. qcloop worker 执行场景命令并输出 marker。
5. qcloop verifier 审查 marker、JSON、`evidenceRequired`、`failureModes`、`issue_ledger` 和退出码。
6. 只有 8/8 P0 item 全部 qcloop `success`，且每个 item 都包含可解析的 `QCLOOP_EVIDENCE_SUMMARY_JSON` 后，才能导出官方 `.lime/qc/agent-qc-evidence.json` 并进入 release summary gate。

## 6. 失败沉淀

真实失败不能只记录“本轮未过”，必须回写到长期资产：

| 失败 | 回写资产 |
| --- | --- |
| 缺 `QCLOOP_EVIDENCE_SUMMARY_JSON` | 更新 worker prompt / payload generator / manifest 校验。 |
| verifier 输出 Markdown 导致解析失败 | 收紧 verifier prompt，只允许单个 JSON object。 |
| GUI owner 并发 | 保留 `agent-qc:gui-owner-check` sidecar，重跑前必须 ownerCount=0。 |
| smoke 通过但缺 transcript | 新增 runtime transcript artifact 或 harness replay。 |
| cleanup warning 被 exit=0 隐藏 | 在 evidence JSON 中单独记录 warning classified。 |
| release scope 不清晰 | 明确 source-tree / installer artifact / CI artifact scope。 |

关闭标准不变：P0 qcloop 8/8 success、8/8 structured evidence summary 可解析，官方 Evidence Pack `pass`，`agent-qc:release-summary --check` 通过，`agent-qc:audit` 为 `complete`。
