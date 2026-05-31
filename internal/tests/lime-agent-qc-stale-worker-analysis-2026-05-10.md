# Lime Agent QC stale worker 根因分析（2026-05-10）

> 本文件把 `1778405842243079000` 的 stale qcloop worker 取证集中成一个可复用分析样本。它不是 release waiver，也不是处理授权；它用于指导后续 Agent 判断何时可以重跑 P0、何时必须等待 owner 决策。

## 1. 结论

当前 Lime Agent QC 整体目标未完成的直接原因不是测试标准缺失，而是官方 P0 Evidence Pack 没有真实 8/8 pass。当前阻断项是 isolated full P0 job `1778405842243079000` 中的 `browser-runtime-site-adapter`：worker 长时间 running，但没有 stdout/stderr。

截至本轮只读取证，三侧证据一致：

| 证据侧 | 事实 | 结论 |
| --- | --- | --- |
| qcloop status sidecar | `4 success / 1 running / 3 pending / 1 stale` | P0 批次未完成 |
| SQLite DB | active item / attempt 仍为 `running`，stdout/stderr `0 / 0` | stale 不是旧 sidecar 噪声 |
| process tree | PID `69738` 仍存活，PPID `1`，带 MCP child processes | worker 已孤儿化且未进入产品命令输出 |
| binary provenance | 当前 qcloop serve 不是 `.lime/qc/bin/qcloop-timeout-fixed` | 已准备的 timeout fix 未作用于当前进程 |

因此不能覆盖 `.lime/qc/agent-qc-evidence.json`，不能启动新的 full GUI P0，也不能把 isolated partial pass 当作 release pass。

## 2. 关键证据

### 2.1 qcloop job 状态

```text
job_id=1778405842243079000
job_status=running
verdict=stale
counts=8 total / 4 success / 1 running / 3 pending / 1 stale
stale_scenario=browser-runtime-site-adapter
worker_stdout_len=0
worker_stderr_len=0
```

权威 sidecar：

- `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json`
- `.lime/qc/gui-owner-current.json`

### 2.2 DB / lease 取证

```text
item_id=1778405842246191000
scenario_id=browser-runtime-site-adapter
item_status=running
lock_owner=qcloop-worker-1
lock_expires_at=2026-05-10T21:02:05+08:00
attempt_id=dc625f8e-b3b9-46b7-9758-4b0273438d50
attempt_status=running
attempt_started_at=2026-05-10T17:45:05+08:00
attempt_stdout_len=0
attempt_stderr_len=0
```

权威 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1.md`。

2026-05-10 21:02 复核补充：等待超过上述 `lock_expires_at` 后，qcloop 并未自然释放该 item；只读 SQLite 显示 `lock_expires_at` 已延长到 `2026-05-10T21:17:05+08:00`，active attempt 仍为 `running` 且 stdout/stderr `0 / 0`。权威 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1-after-expiry.md`。

### 2.3 进程树取证

```text
qcloop_serve_pid=69307
qcloop_serve_pgid=69307
codex_worker_pid=69738
codex_worker_ppid=1
codex_worker_pgid=69307
child_processes=Playwright MCP / Context7 MCP npm exec
```

这说明 worker 并非已经退出；它仍然存在，但没有开始输出 `npm run agent-qc:qcloop-preflight`、`smoke:browser-runtime` 或 `smoke:site-adapters` 的业务日志。

### 2.4 qcloop binary provenance

```text
active_binary=/Users/coso/Documents/dev/ai/limecloud/qcloop/qcloop
active_sha256=177bf7fa79212d065c5cb6cc5cdbb153d3079cec3252a157993f70ab35dc5fe1
fixed_binary=.lime/qc/bin/qcloop-timeout-fixed
fixed_sha256=2895e33d068a7109607d3e45b6e3bebe1807b6f71d387a3b62eb669a3d4314c7
```

权威 sidecar：`.lime/qc/qcloop-runtime-binary-provenance-18080.md`。

这说明当前 qcloop serve 未使用 timeout / process-group cleanup fix。即使 fix 已在 qcloop repo 通过测试，它也不会影响当前 running job。

## 3. 失败分类

当前阻断应归类为：

```text
failure_mode=worker user-config MCP startup no-output hang
scope=qcloop infrastructure / executor lifecycle
product_verdict=unproven
release_verdict=blocked
```

不要把它误判为：

- `browser-runtime-site-adapter` 产品功能已经失败。
- `browser-runtime-site-adapter` 产品功能已经通过。
- qcloop full P0 已经完成。
- 可用单场景 isolated pass 覆盖官方 Evidence Pack。

当前正确口径是：产品命令在宿主 shell 里曾直接通过，但 qcloop worker 内的同批次 P0 证据未形成；release gate 必须继续阻断。

## 4. 禁止动作

未获 owner 明确确认前禁止：

- kill / pause / interrupt PID `69738` 或 qcloop serve PID `69307`。
- 修改 `.lime/qc/qcloop-isolated-worker-preflight.db`。
- 启动新的 full GUI P0。
- 覆盖 `.lime/qc/agent-qc-evidence.json`。
- 用 isolated sidecar pass 发布 release note。
- git commit / push / tag / release。

## 5. 允许动作

当前仍允许：

- 只读刷新 qcloop status sidecar。
- 只读刷新 GUI owner report。
- 只读查询 SQLite DB。
- 只读查询进程树和 binary provenance。
- 更新 `.lime/qc/*` sidecar 和 `internal/tests` 分析文档。
- 准备但不提交新的 P0 structured evidence payload。

## 6. Owner 清空后的恢复路径

当 stale worker 自然退出，或 owner 明确确认处理后，按以下顺序恢复：

1. 重新运行 `npm run agent-qc:gui-owner-check -- --check`，确认 active GUI owner 为 0。
2. 使用 `.lime/qc/bin/qcloop-timeout-fixed` 或等价重建后的 qcloop binary，启动隔离 qcloop server 与独立 DB。
3. 生成或复核 `.lime/qc/qcloop-p0-structured-evidence-v1-payload.json`：8 个 P0、`max_qc_rounds=1`、`max_executor_retries=0`。
4. 提交 P0 structured evidence job。
5. 等待 8/8 qcloop `success`。
6. 只在该 job 真实 pass 后导出 `.lime/qc/agent-qc-evidence.json`。
7. 运行 release summary gate 与 completion audit。

完成条件仍是：`agent-qc:audit` 返回 `complete`，且 release summary 以官方 Evidence Pack 通过。
