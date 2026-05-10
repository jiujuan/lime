# Lime Agent QC 当前 P0 阻断记录

> 本文件记录 Lime 作为样本产品执行 Agent QC P0 时发现的真实阻断。它不是发布放行说明；只要本文件中的 P0 blocker 未清空，`.lime/qc/agent-qc-evidence.json` 就不应被视为绿色发布证据。

## 1. 当前结论

截至 2026-05-11 01:13，本地已经具备 Agent QC 标准、manifest、Evidence Pack schema、qcloop exporter、release summary gate、completion audit、qcloop status sidecar 和 GUI smoke 能力。隔离 qcloop 已经证明部分 P0 smoke 能在 worker 内跑通；最新显式 Sensenova provider 的 `verify:gui-smoke -- --reuse-running` 已通过，并覆盖 Claw streaming / interrupt / resume，但官方 Evidence Pack 仍为失败，完整 `verify:local` 与 stale qcloop P0 owner 仍未闭环：

```text
.lime/qc/agent-qc-evidence.json status=fail scenarios=8/8
```

这说明当前不是“缺测试”，而是测试系统已经把阻断分成三类：产品深证据 blocker、qcloop worker / provider 卡住、以及 verifier 正确拒绝“只有命令通过、缺少 transcript / trace / console-network 证据”的浅层输出。不能通过修改门禁、降低证据要求或用 isolated partial evidence 把它伪装成通过。

## 2. 证据来源

| 证据 | 状态 | 说明 |
| --- | --- | --- |
| qcloop P0 v3 `1778390726823769000` | `completed` / `fail` | 覆盖 8/8 P0，2 pass / 6 fail |
| qcloop rerun v4 `1778392677659787000` | `completed` / `fail` | 重跑 6 个失败 P0，最终 0 pass / 6 exhausted；失败集中在旧 verifier 输出读取和 qcloop worker localhost / DevBridge 权限 |
| qcloop rerun v5 `1778398587521627000` | `completed` / sidecar `fail` | 使用带 worker preflight 和 stdout verifier 的新 payload；最终结果为 1 `failed`、5 `exhausted`、0 `success`；其中 GUI / Skill / Browser 类场景已明确输出 `QCLOOP_WORKER_RESULT=BLOCKED` |
| `.lime/qc/agent-qc-evidence.json` | `fail` | 官方默认 Evidence Pack，覆盖 8/8，但不能发布 |
| `.lime/qc/agent-qc-evidence.p0-v3.json` | `fail` | v3 sidecar，覆盖 8/8 |
| `.lime/qc/agent-qc-evidence.p0-rerun-v4-running.json` | `fail` / `blocked` | v4 sidecar，当前 6 个重跑场景未完成或失败 |
| `.lime/qc/agent-qc-evidence.p0-rerun-v4-completed.json` | `fail` | 2026-05-10 15:35 从 completed v4 job 导出的 sidecar，6/6 exhausted；不是官方发布证据 |
| `.lime/qc/agent-qc-evidence.p0-rerun-v5-current.json` | `fail` | v5 sidecar；`tool-approval-sandbox-boundary` qcloop item 已 failed，同时 GUI / Skill / Browser 类场景因 `QCLOOP_WORKER_RESULT=BLOCKED` 保持 blocked 语义；不是官方发布证据 |
| `.lime/qc/qcloop-executor-env-20260510.json` | env finding | qcloop serve PID `80248` 仅设置了 `QCLOOP_CODEX_BIN`，未设置 `QCLOOP_CODEX_SANDBOX=off` / bypass / approval policy；解释了 worker localhost 被 Codex 默认沙箱阻断的高概率原因 |
| `.lime/qc/qcloop-devbridge-health-after-v5.json` | env finding | v5 completed 后宿主 shell 直连 `http://127.0.0.1:3030/health` 也失败，`lsof` 未发现 3030 listener；这是宿主 DevBridge 恢复前的历史阻断证据 |
| `.lime/qc/qcloop-devbridge-health-restored.json` | env finding | 2026-05-10 16:59 后 headless Tauri 启动成功，宿主 `npm run bridge:health` 与 `agent-qc:qcloop-preflight -- --require-devbridge` 均为 pass；官方 evidence 未变 |
| qcloop worker preflight `1778403715309891000` | `completed` / `blocked` sidecar | 宿主 DevBridge 已恢复后创建 1 个只读 preflight item；worker cwd/tmp 通过，但 DevBridge health 仍 `fetch failed`，输出 `QCLOOP_WORKER_RESULT=BLOCKED`；`.lime/qc/qcloop-status.worker-devbridge-preflight.json` 归类为 `blocked` |
| isolated qcloop worker preflight `1778404260108641000` | `completed` / sidecar `complete` | 使用隔离 qcloop server `127.0.0.1:18080`、独立 DB `.lime/qc/qcloop-isolated-worker-preflight.db`、`QCLOOP_CODEX_SANDBOX=off` 后，worker preflight 通过；证明 qcloop worker 权限问题可通过正确启动环境解除 |
| isolated `workspace-ready-session-restore` `1778404364137496000` | `completed` / sidecar `complete` | `smoke:workspace-ready` 与 `verify:gui-smoke -- --reuse-running` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack |
| isolated `browser-runtime-site-adapter` `1778404601640847000` | `completed` / sidecar `complete` | `smoke:browser-runtime` 与 `smoke:site-adapters` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack |
| isolated `skill-forge-register-bind-enable` `1778404743505029000` | `completed` / sidecar `complete` | `test:contracts` 与 `smoke:agent-service-skill-entry` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack |
| isolated `release-package-startup-smoke` v1 `1778404882904047000` | `failed` / sidecar `blocked` | 执行时宿主 `127.0.0.1:3030` 已再次断开，preflight 停在 `devbridge-health BLOCKED`，未运行版本和 GUI smoke；保留为历史环境阻断证据 |
| isolated `release-package-startup-smoke` v2 `1778405385701480000` | `completed` / sidecar `complete` | 宿主 DevBridge 恢复后，隔离 qcloop worker preflight、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 均通过；artifact scope 明确为 `source-tree-startup-smoke`，不是 installer 验证，也不覆盖官方 Evidence Pack |
| isolated P0 full v1 `1778405842243079000` | `running` / sidecar `stale` | 已有 4/8 success：`command-bridge-contract`、`claw-chat-ready-streaming`、`tool-approval-sandbox-boundary`、`skill-forge-register-bind-enable`；`browser-runtime-site-adapter` 仍 running 且当前 attempt 无 stdout/stderr，SQLite lease 被心跳延长到 `2026-05-10T19:00:05+08:00`；后续 3 个场景 pending；只读观察，不中断 |
| isolated no-MCP P0 full v1 `1778410893606889000` | `failed` / sidecar `blocked` | 为排查内层 `codex exec` 用户级 MCP 启动导致长期无输出的问题，启动了独立端口 `127.0.0.1:18081`；该批次因 `QCLOOP_CODEX_BIN` 指向坏 Homebrew symlink 立即失败，现按 worker CLI 环境阻断归类，不作为产品失败 |
| isolated no-MCP P0 full v2 `1778410956075020000` | `running` / sidecar `stale` | 使用独立端口 `127.0.0.1:18082`、正确 Codex bin、`QCLOOP_CODEX_EXTRA_ARGS='--ephemeral -c mcp_servers={}'`；实测仍可能启动用户级 MCP 子进程；`command-bridge-contract` 已在 repair attempt 后 success；当前 `claw-chat-ready-streaming` running 且 9 分钟无 stdout/stderr，被 sidecar 标记 stale；后续 6 个 P0 pending；只读观察，不覆盖官方 evidence |
| isolated MCP-disabled P0 full v1 `1778412160003934000` | `running` / sidecar `running` | 使用独立端口 `127.0.0.1:18083`、正确 Codex bin，并把 `mcp_servers.context7.command` / `mcp_servers.playwright.command` 覆盖为空；初始 `ps` 未观察到用户级 MCP 子进程；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence |
| isolated fast P0 full v1 `1778412499745993000` | `running` / sidecar `running` | 使用独立端口 `127.0.0.1:18084`、正确 Codex bin、MCP command 覆盖为空，并额外加 `--ignore-rules` 避免项目规则 / skill / MCP 依赖放大；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence |
| isolated fast-mini readonly P0 full v1 `1778412738097137000` | `running` / sidecar `running` | 使用独立端口 `127.0.0.1:18085`、`gpt-5.4-mini`、low reasoning、MCP command 覆盖为空、`--ignore-rules`、`max_qc_rounds=1` 和只读 worker prompt；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence |
| direct host `browser-runtime-site-adapter` check | command `pass` with cleanup warning | `agent-qc:qcloop-preflight -- --require-devbridge`、`smoke:browser-runtime`、`smoke:site-adapters` 在宿主 shell 直接通过；`smoke:browser-runtime` 输出了非阻断 cleanup warning：`close_cdp_session` 未找到刚创建的 session；这证明当前 full P0 卡点更像 qcloop worker / provider 无输出，而不是宿主 DevBridge 或产品命令不可用 |
| direct host `harness-replay-regression` check | command `pass` with trend seed caveat | `npm run harness:eval` 与 `npm run harness:eval:trend` 在宿主 shell 直接通过；current observability gap 为 0，degraded gap 为 1，trend 样本数为 1，只能作为 seed，不能判断长期退化 |
| direct host `workspace-ready-session-restore` / `release-package-startup-smoke` check | command `pass` | `smoke:workspace-ready`、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 在宿主 shell 直接通过；验证了 workspace ready、版本一致性、DevBridge health、GUI smoke、browser runtime、site adapters、service skill entry、runtime tool surface、knowledge GUI、design canvas |
| direct host `tool-approval-sandbox-boundary` live runtime check | command `pass` | `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json` verdict=`pass`；denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:*`，并证明 `approvalPolicy=on-request`、`sandboxPolicy=workspace-write` 已随 turn 提交；仍是 sidecar，不覆盖官方 Evidence Pack |
| `npm run agent-qc:qcloop-status -- --job-id 1778398587521627000` | `completed` / sidecar monitoring | 最终只读检查显示 v5 已 completed / fail，`tool-approval-sandbox-boundary` failed，其他 5 个重跑项 exhausted；用于排障，不覆盖官方 evidence |
| `.lime/qc/gui-evidence/product-backend-ux-e2e-2026-05-10.json` | `pass` + deep flow finding `fail` | 基础 GUI surface 通过，但 Claw streaming deep flow 标记为 product blocker |

### 2.1 最新只读刷新（2026-05-10 19:58）

| 批次 | 当前状态 | 关键含义 |
| --- | --- | --- |
| isolated full P0 v1 `1778405842243079000` | `running` / `stale`，4 success、1 running、3 pending | `browser-runtime-site-adapter` 已无 stdout/stderr 约 8002 秒；只读观察，不 kill、不覆盖官方 evidence |
| no-MCP P0 v2 `1778410956075020000` | `running`，2 success、1 failed、1 running、4 pending | `tool-approval-sandbox-boundary` 已 failed；`skill-forge-register-bind-enable` running；`mcp_servers={}` 仍不足以完全证明内层 MCP 降噪 |
| MCP-disabled P0 v1 `1778412160003934000` | `running` / `stale`，1 failed、1 running、6 pending | `command-bridge-contract` 因旧 no-change verifier 失败；`claw-chat-ready-streaming` stale 约 674 秒；后续 payload 已修正，但当前批次只读观察 |
| fast P0 v1 `1778412499745993000` | `running`，1 success、1 running、6 pending | `--ignore-rules` 后 command bridge 已通过，`claw-chat-ready-streaming` 仍在跑 |
| fast-mini readonly P0 v1 `1778412738097137000` | `failed`，8 exhausted | sidecar evidence 为 `fail=6 / blocked=2`。verifier 正确拒绝缺少 deep evidence 的浅层输出；同时发现 `workspace-ready-session-restore` 的 `verify:gui-smoke` 失败在 `smoke:design-canvas` 保存成功状态断言，`release-package-startup-smoke` 因 GUI smoke 未自然收口被判 blocked |

这次刷新说明：当前最有价值的下一刀不是“再开一个全量 P0 批次”，而是把浅层 smoke 与深层 live transcript 拆清楚，让 qcloop worker 输出可被 verifier 审计的结构化证据；仍在 running 的批次继续只读观察。

由于当前仍有多个 GUI / DevBridge 相关 qcloop 批次 running 或 stale，后续不能再并发启动新的 full P0 GUI 批次。新的 manifest 已把 `GUI session owner / isolation statement` 加入 GUI P0 evidence，并把 `parallel GUI smoke interference` 加入 failure mode；这用于区分真实产品回归和多个 worker 抢同一个 Lime GUI 会话造成的测试失真。

机器前置检查：

```bash
npm run agent-qc:gui-owner-check -- --check
```

当前该命令应阻断新 GUI P0，因为仍有 active GUI owner sidecar。

`workspace-ready-session-restore` 的细化证据已导出到 `.lime/qc/design-canvas-failure-fastmini-workspace-extract.json`。关键日志为：

```text
[smoke:design-canvas] stage=project-roundtrip-save-open
[smoke:design-canvas] 工程目录保存结果 等待失败，缺少文本 "已保存图层设计工程"
页面已在 CANVAS:DESIGN 专属 GUI SMOKE / AI 图层化设计画布，但未出现保存成功状态
DevBridge status=ok，smoke:workspace-ready PASS
```

这说明当前不是 workspace 初始化失败，也不是 Bridge 不可用，而是 GUI ready / 设计画布导出状态没有形成可观察的保存完成证据。

### 2.2 最新只读复核（2026-05-10 20:40）

按用户要求，本轮没有 push、没有 commit，也没有 kill / pause / interrupt 任何 qcloop 或 Codex worker。只读刷新后，当前需要以 `1778405842243079000` 为唯一 active GUI owner 处理；其他历史批次只作为 sidecar 排障事实，不再触发新的 full GUI P0 抢占。

| 检查 | 当前值 | 结论 |
| --- | --- | --- |
| qcloop job | `1778405842243079000` / `running` | full P0 v1 未终态 |
| qcloop verdict | `stale` | 仍不能导出官方 pass evidence |
| qcloop counts | 4 success / 1 running / 3 pending / 1 stale | P0 覆盖未完成 |
| active scenario | `browser-runtime-site-adapter` | 卡在 GUI / browser runtime 类 P0 |
| worker output | stdout/stderr `0 / 0` | 尚未开始可审查的业务命令输出 |
| worker duration | 约 `10508s` | 已远超 stale 阈值 |
| observed process | PID `69738`，内层 `codex exec` | stale owner 不是旧 sidecar 噪声 |
| GUI owner gate | `ownerCount=1`、`staleOwnerCount=1`、`verdict=blocked` | 不允许启动新的 full GUI P0 |

当前唯一可安全推进的是继续维护标准、sidecar 和 runbook。必须等待 PID `69738` 自然释放，或由 owner 明确确认处置后，才能按 `docs/tests/lime-agent-qc-stale-owner-intervention.md` 执行 post-stale runbook。确认前不得直接处理进程或修改 qcloop DB。

### 2.3 只读复核续刷（2026-05-10 20:44）

再次只读刷新后，状态未释放：`1778405842243079000` 仍为 `running` / `stale`，`browser-runtime-site-adapter` 的 `staleSeconds=10772`，stdout/stderr 仍为 `0 / 0`；`agent-qc:gui-owner-check` 仍为 `blocked`，`ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=10772`。`ps` 仍可见 PID `69738` 处于内层 `codex exec`。本轮未执行任何中断动作。

### 2.4 DB / lease 级取证（2026-05-10 20:48）

新增 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1.md`。只读 SQLite 与进程树显示：

| 取证点 | 当前值 | 含义 |
| --- | --- | --- |
| `batch_jobs.status` | `running` | qcloop 仍认为该批次未终态 |
| active item | `1778405842246191000` / `browser-runtime-site-adapter` | 卡住的是 browser runtime P0 |
| item lease | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T21:02:05+08:00` | lease 仍被心跳延长 |
| attempt | `running`，started `2026-05-10T17:45:05+08:00` | active attempt 未结束 |
| attempt output | stdout/stderr `0 / 0` | 不是产品命令失败，而是没有可审查业务输出 |
| process | PID `69738`，PPID `1`，PGID `69307` | worker 已成为 orphan，但仍在 qcloop process group |
| child processes | Playwright MCP / Context7 MCP npm exec | 与 `worker user-config MCP startup no-output hang` failure mode 匹配 |

这把 blocker 从“sidecar 显示 stale”升级为“DB lease、attempt、process tree 三侧一致证明 stale”。确认前仍不得处理进程或改 DB。

### 2.5 qcloop runtime binary provenance（2026-05-10 20:52）

新增 sidecar：`.lime/qc/qcloop-runtime-binary-provenance-18080.md`。只读 `lsof` 与 checksum 显示：

| 二进制 | 路径 | 大小 | SHA-256 | 结论 |
| --- | --- | --- | --- | --- |
| 当前 18080 qcloop serve | `/Users/coso/Documents/dev/ai/limecloud/qcloop/qcloop` | `13321106` | `177bf7fa...35dc5fe1` | 当前正在运行 |
| timeout-fixed sidecar | `.lime/qc/bin/qcloop-timeout-fixed` | `13426082` | `2895e33d...3d4314c7` | 已构建但未运行 |

这证明 qcloop executor timeout / process-group cleanup 补丁还没有影响当前 PID `69307` 的 qcloop serve，也不会自动回收 stale PID `69738`。后续只有在 owner 释放或确认处理当前 stale owner 后，才能用 fixed binary 新启隔离 server 重跑 P0。

### 2.6 lease 过期窗口后复核（2026-05-10 21:02）

新增 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1-after-expiry.md`。等待超过先前记录的 `lock_expires_at=2026-05-10T21:02:05+08:00` 后，只读复核显示：

| 取证点 | 当前值 | 含义 |
| --- | --- | --- |
| qcloop verdict | `stale` | job 仍未终态 |
| counts | 4 success / 1 running / 3 pending / 1 stale | P0 仍未覆盖完成 |
| active item | `browser-runtime-site-adapter` | 仍是同一 GUI / browser P0 阻塞 |
| current lock | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T21:17:05+08:00` | lease 在过期窗口后继续被延长 |
| active attempt | `running`，stdout/stderr `0 / 0` | 仍无可审查业务输出 |
| process | PID `69738`，PPID `1`，PGID `69307` | worker 仍存活 |

这确认 stale worker 没有在 lease 过期窗口自然释放；qcloop 仍在维持该 owner。未获 owner 明确确认前，仍只能继续只读观察。

### 2.7 GUI owner 机器决策输出（2026-05-10 21:08）

`agent-qc:gui-owner-check -- --format json` 现在会在 stale owner 场景输出 `ownerIntervention`，当前 `.lime/qc/gui-owner-current.json` 显示：

```text
ownerIntervention.status=requires_owner_confirmation
requiredConfirmationText=确认处理 stale GUI owner 1778405842243079000，可以终止 PID <pid> 并记录 sidecar。
```

该输出已纳入 `agent-qc:audit` 的 `stale-owner-intervention-protocol` 检查项。注意：`<pid>` 仍必须由最新 `ps` / DB 取证填入；当前确认前不得把该字段视为授权。

### 2.8 stale owner watch history（2026-05-10 21:10）

新增 sidecar：`.lime/qc/stale-owner-watch-history.jsonl`。该文件按 JSONL 记录只读观察序列，当前包含 3 条：

1. `20:44:52`：qcloop status / GUI owner 仍 blocked，PID `69738` 存活。
2. `20:48:00`：DB active attempt running、stdout/stderr `0 / 0`，lease 到 `21:02:05`。
3. `21:02:46`：超过上一 lease 窗口后，lease 延长到 `21:17:05`，PID `69738` 仍存活。
4. `21:18:00`：超过第二个 lease 窗口后，lease 再次延长到 `21:32:05`，PID `69738` 仍存活，stdout/stderr 仍为 `0 / 0`。

后续 Agent 可追加该 JSONL 作为观察历史，但仍不得据此自动处理进程；处理动作仍需要 owner 明确确认。

2026-05-10 21:21 后续观察已改为脚本化追加：`agent-qc:gui-owner-check -- --watch-history-output ./.lime/qc/stale-owner-watch-history.jsonl` 已写入第 5 条记录，后续无需手工拼 JSONL。

2026-05-10 21:32 续刷：超过第三个 lease 窗口后，qcloop 仍为 `stale`，`browser-runtime-site-adapter staleSeconds=13657`，stdout/stderr 仍为 `0 / 0`；SQLite 显示 `lock_expires_at=2026-05-10T21:47:05+08:00`，PID `69738` 仍存活。该观察通过 `--watch-history-output` 追加，当前 watch history entries=6。

### 2.9 只读续刷（2026-05-11 01:02）

按用户要求，本轮仍未 push、未 commit、未 tag、未 release，也没有 kill / pause / interrupt / restart 任何 qcloop、Codex worker、Tauri、Cargo 或 GUI smoke 进程。只读刷新后的当前状态：

| 检查 | 当前值 | 结论 |
| --- | --- | --- |
| qcloop job | `1778405842243079000` / `running` | full P0 v1 仍未终态 |
| qcloop verdict | `stale` | 仍不能导出官方 pass evidence |
| qcloop counts | 4 success / 1 running / 3 pending / 1 stale | P0 覆盖仍未完成 |
| active scenario | `browser-runtime-site-adapter` | 仍卡在 GUI / browser runtime 类 P0 |
| stale age | 约 `26202s` | 已远超 stale 阈值 |
| GUI owner gate | `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=26202` | 不允许启动新的 full GUI P0 |
| DB lease | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:17:06+08:00` | lease 仍被续约 |
| active attempt | `dc625f8e-b3b9-46b7-9758-4b0273438d50` / `running` | stdout/stderr 仍为空 |

新增 / 刷新 sidecar：

- `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json`
- `.lime/qc/gui-owner-current.json`
- `.lime/qc/stale-owner-watch-history.jsonl`
- `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json`
- `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.md`

这些证据只支持 owner 决策，不构成处理授权。确认前仍不得处理 PID `69738`、修改 qcloop DB、启动新的 full GUI P0，或覆盖官方 `.lime/qc/agent-qc-evidence.json`。

### 2.10 `verify:local` 与 Claw streaming 复核（2026-05-11 01:02）

最新完整 `npm run verify:local` 仍为失败，且已把 `.lime/qc/verify-local-current.json` 刷新到最新失败口径：

```text
status=fail
failedStage=verify:gui-smoke / smoke:claw-chat-ready-streaming
evidence=.lime/qc/verify-local-sensenova-2026-05-11-0023.log
```

该失败发生在完整本地门禁中的 Claw streaming deep flow：前置 GUI smoke 已通过 `smoke:agent-service-skill-entry` 与 runtime tool surface，随后 `smoke:claw-chat-ready-streaming` 在“等待 GUI 出现恢复结果”处超时。之后脚本已加固并直跑复测：

| 证据 | 状态 | 含义 |
| --- | --- | --- |
| `.lime/qc/gui-evidence/claw-chat-ready-streaming-post-refresh-fallback-2026-05-11/claw-chat-ready-streaming-post-refresh-fallback-summary.json` | `pass` | runtime 已持久化 `复原完成` 时，刷新 / 会话恢复 fallback 可以让 GUI 重新呈现恢复结果 |
| `.lime/qc/gui-evidence/claw-chat-ready-streaming-sensenova-session-restore-2026-05-11/claw-chat-ready-streaming-sensenova-session-restore-summary.json` | `fail` | 复测期间 DevBridge 中途不可达，恢复 turn 未进入 completed；这是环境 / runtime 稳定性证据，不能替代完整门禁 |
| `.lime/qc/claw-chat-ready-streaming-current.json` | `mixed` | 汇总当前 Claw deep flow 的 pass / fail 侧证据 |

因此当前判断不变：Claw deep flow 已从“没有足够证据”推进为“有可复核的 pass/fail 证据和更精确的失败分类”，但 `local-verify-gate` 仍不能关闭。关闭条件仍是重新跑完整 `npm run verify:local` 并得到 `status=pass`。

### 2.11 GUI smoke pass 与 raw process owner 复核（2026-05-11 01:13）

观察到外部启动的 GUI smoke 自然结束并通过，本轮只读取日志和证据，没有中断或重启该进程：

```text
command=LIME_AGENT_QC_PROVIDER=custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed LIME_AGENT_QC_MODEL=sensenova-6.7-flash-lite npm run verify:gui-smoke -- --reuse-running --timeout-ms 240000
status=pass
evidence=.lime/qc/verify-gui-smoke-reuse-sensenova-session-restore-2026-05-11-0108.log
```

已刷新：

- `.lime/qc/verify-gui-smoke-current.json`
- `.lime/qc/verify-gui-smoke-2026-05-11-0112-sensenova-pass.md`
- `.lime/qc/claw-chat-ready-streaming-current.json`

本次 GUI smoke 通过了 DevBridge health、workspace-ready、browser-runtime、site-adapters、agent-service-skill-entry、runtime tool surface、runtime tool surface page、Claw streaming/interrupt/resume、knowledge-gui、i18n patch metrics report 和 design-canvas。Claw summary 中 `recoveryVisibleSource=live-stream`、`interruptedTurnStatus=aborted`、`followTurnStatus=completed`，且 runtime 关键命令未走 mock fallback。

但 `.lime/qc/gui-process-owner-current.json` 仍显示 raw process owner 为 `busy`：存在长时间 `smoke:design-canvas` 进程、stale qcloop Codex worker，以及多个 Cargo / Rust 编译进程。因此仍不应在当前窗口启动新的完整 `verify:local` 或新的 full GUI P0 qcloop 批次；`local-verify-gate` 只能在这些 owner 自然释放后用完整 `npm run verify:local` 关闭。

### 2.12 只读续刷与 owner 取证脚本化（2026-05-11 01:32）

按“Lime 不要推送、还有其他进程在跑”的约束，本轮仍未执行 commit / push / tag / release，也没有 kill / pause / interrupt / restart qcloop、Codex worker、Tauri、Cargo 或 GUI smoke 进程。只读刷新后的当前状态：

| 检查 | 当前值 | 结论 |
| --- | --- | --- |
| qcloop job | `1778405842243079000` / `running` | full P0 v1 仍未终态 |
| qcloop verdict | `stale` | 仍不能导出官方 pass evidence |
| qcloop counts | 4 success / 1 running / 3 pending / 1 stale | P0 覆盖仍未完成 |
| active scenario | `browser-runtime-site-adapter` | 仍卡在 browser runtime / site adapter 类 P0 |
| stale age | 约 `28020s` | 已远超 stale 阈值 |
| GUI owner gate | `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds≈27026` | 不允许启动新的 full GUI P0 |
| raw process owner | `busy`，`activeGuiSmoke=2`、`cargoOrRust=4`、`qcloopRelated=7` | 不允许启动完整 `verify:local` |
| DB lease | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:47:06+08:00` | lease 仍被续约 |
| active attempt | `dc625f8e-b3b9-46b7-9758-4b0273438d50` / `running` | stdout/stderr 仍为空 |

新增 / 刷新 sidecar：

- `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json`
- `.lime/qc/gui-owner-current.json`
- `.lime/qc/stale-owner-watch-history.jsonl`
- `.lime/qc/gui-process-owner-current.json`
- `.lime/qc/gui-process-owner-current.md`
- `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json`
- `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.md`

新增 `npm run agent-qc:process-owner-check` 与 `npm run agent-qc:qcloop-db-lease`，把 raw process owner 和 SQLite lease 只读取证脚本化，避免后续依赖临时 `ps` / `sqlite3` 片段。这些脚本只用于判断是否应该等待，不授权处理任何进程或修改 qcloop DB。

## 3. P0 blocker 列表

| Scenario | 当前状态 | 直接证据 | 下一步 |
| --- | --- | --- | --- |
| `claw-chat-ready-streaming` | product blocker；isolated full sidecar pass with shallow GUI scope | `docs/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/11-claw-streaming-summary.json` 标记 stop / interrupt 后长 turn 仍 completed；default worker preflight job `1778403715309891000` 仍证明内层 Codex 无法访问 DevBridge；isolated full v1 已通过 `verify:gui-smoke -- --reuse-running`，但 stdout 明确 scope 不含 live long-turn interrupt transcript | 保留 deep flow blocker；后续必须修 stop / interrupt 后端语义，并把 live long-turn transcript 纳入 qcloop / Playwright MCP 深证据 |
| `tool-approval-sandbox-boundary` | default qcloop failed；direct-host live runtime sidecar pass | v5 attempt 1 和 repair attempt 2 的确定性 smoke 不足以通过 verifier；本轮 direct-host `smoke:agent-runtime-approval-sandbox` 已补真实 live runtime transcript：denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:*`，并证明 approval / sandbox policy 进入 turn config；证据在 `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json` | 该场景从“缺 live transcript”降级为“待 full P0 qcloop 同批次采信”；不要覆盖官方 `.lime/qc/agent-qc-evidence.json`，也不要在 stale GUI owner 未释放前重启 full GUI P0 |
| `skill-forge-register-bind-enable` | default qcloop blocked；isolated sidecar pass | v5 多轮 worker 均停在 DevBridge preflight blocked；隔离 qcloop job `1778404743505029000` 已证明 contracts + service skill entry smoke 可通过 | 等宿主 DevBridge 稳定后，把该证据纳入新的全量 P0 qcloop 批次；仍不能单独覆盖官方 evidence |
| `browser-runtime-site-adapter` | default qcloop blocked；isolated single sidecar pass；isolated full P0 stale | v5 多轮 worker 均停在 DevBridge preflight blocked；隔离 qcloop job `1778404601640847000` 已证明 browser runtime + site adapter smoke 可通过；full P0 v1 当前卡在内层 `codex exec` 无 stdout/stderr；宿主直接运行 preflight + browser runtime + site adapters 通过，但 browser cleanup 有非阻断 warning | 等当前 full P0 worker 自然结束；后续重跑时把 browser runtime 与 site adapter 拆成更窄 item，并把 cleanup warning 纳入 evidence |
| `qcloop-batch-verifier-repair` | worker / verifier 协议仍在收敛 | 已发现 qcloop generic repair prompt 会要求 worker “修复目标工作区”，这不适合发布证据批次；已把 worker prompt 改为只读，并生成 `.lime/qc/qcloop-readonly-p0-v1-payload.json` / `.lime/qc/qcloop-fastmini-readonly-p0-v2-payload.json`（`max_qc_rounds=1`）待用； no-MCP P0 v2 的 `command-bridge-contract` attempt 1 真实执行通过，verifier 正确拒绝了“只给命令通过与日志路径、未逐项解释 evidence / failure mode”的输出；repair attempt 已补足并通过 | worker prompt 已强化为必须逐项列出 `evidence_required` 和 `failure_modes`；`command-bridge-contract` verifier 已允许 no-change surface evidence 使用 checked surface counts + contract pass，并已生成待用 payload `.lime/qc/qcloop-isolated-nomcp-p0-v3-after-evidence-prompt-payload.json`；继续观察后续 P0 是否复现同类证据不足 |
| `workspace-ready-session-restore` | default qcloop blocked；isolated sidecar pass；fast-mini full P0 failed | v5 多轮 worker 未提供 workspace-ready / GUI smoke / DevBridge 可审查证据；隔离 qcloop job `1778404364137496000` 曾证明 workspace-ready + GUI smoke 可通过；但 fast-mini readonly P0 v1 中 `smoke:workspace-ready` 通过、`verify:gui-smoke` 失败在 `smoke:design-canvas` 的保存成功状态断言，命中 `ui ready false positive` 风险 | 不把旧 isolated pass 当成当前 release 证据；后续需要定位 design canvas 保存状态断言或产品状态回写，再用 qcloop deep evidence 重跑 |
| `release-package-startup-smoke` | default qcloop blocked；isolated source-tree sidecar pass；direct host pass | v5 多轮 worker 未提供版本、GUI smoke、首屏 ready、Bridge health、waiver 证据；隔离 v2 `1778405385701480000` 已证明 source-tree startup smoke；宿主直接运行 `verify:app-version` + GUI smoke 通过 | 进入 full P0 verifier 后才能覆盖官方 evidence；发布前仍不能把 source-tree smoke 伪装成 installer artifact |
| `harness-replay-regression` | isolated full P0 pending；direct host pass | full P0 v1 尚未调度该 item；宿主直接运行 `harness:eval` + `harness:eval:trend` 通过，但 trend 只有 1 个样本，仍不是 qcloop verifier pass | 等当前 full P0 worker 自然结束后，让该 item 进入 qcloop verifier；长期趋势需要继续积累 nightly 样本 |

## 4. 已经修正的标准问题

- `release-package-startup-smoke` 不再要求场景本身预先提供 `release evidence pack`。
- release Evidence Pack 的覆盖和 pass 状态由 `agent-qc:release-summary -- --require-scenario-manifest docs/test/agent-qc-scenarios.manifest.json --require-risk P0 --check` 单独强制。
- `agent-qc:audit` 已能区分官方 `.lime/qc/agent-qc-evidence.json` 与 sidecar evidence，避免 partial 或 fail sidecar 被误读为完成。
- `agent-qc:export-evidence` / `agent-qc:qcloop-status` 已能识别 worker stdout 中的 `QCLOOP_WORKER_RESULT=BLOCKED`，把 qcloop `exhausted` 但实为环境权限阻断的 item 归类为 Evidence Pack `blocked`。
- 已提交 qcloop rerun v5 `1778398587521627000`，payload 来自 `.lime/qc/qcloop-p0-rerun-v5-verifier-evidence-ready-payload.json`，覆盖当前 6 个未通过 / 未完成 P0，并确认 worker prompt 含 preflight、verifier prompt 含 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}`。
- 已用 `npm run tauri:dev:headless` 恢复宿主 DevBridge，并把恢复证据写入 `.lime/qc/qcloop-devbridge-health-restored.json`。
- 已提交只读 qcloop worker preflight job `1778403715309891000`。该 job 证明问题已经从“宿主 DevBridge 未启动”收敛为“qcloop 内层 worker loopback / sandbox 权限阻断”，不是产品 P0 已恢复。
- 已启动隔离 qcloop server `127.0.0.1:18080` 使用独立 DB 和显式 Codex sandbox 配置，证明 worker 权限可恢复，并产生 4 个 P0 sidecar pass：`workspace-ready-session-restore`、`browser-runtime-site-adapter`、`skill-forge-register-bind-enable`、`release-package-startup-smoke`。
- `release-package-startup-smoke` v2 sidecar 只证明 source-tree startup smoke，不证明 installer artifact；当前仍不能写官方 Evidence Pack，因为还没有同一批次覆盖 8/8 P0 的真实 pass。
- 已启动 isolated P0 full v1 `1778405842243079000`。该批次目前 4/8 success，但 `browser-runtime-site-adapter` item 长时间 running 且无 stdout/stderr，`.lime/qc/qcloop-status.isolated-p0-full-v1-stale-check.json` 已标记 `stale`；只读 `ps` 显示内层 `codex exec` 仍在跑、尚未出现 npm 子命令输出，后续 3 个 P0 pending；按 qcloop 运维规则只读观察，不 kill、不 pause、不覆盖官方 evidence。
- 已把这次真实卡点回写到机器标准：`docs/test/agent-qc-scenarios.manifest.json` 的 `qcloop-batch-verifier-repair` 增加 `stale item sidecar`、worker stdout/stderr 长度摘要，以及 `running no-output stale` / `worker lease heartbeat without stdout` 失败模式；`browser-runtime-site-adapter` 增加 cleanup warning 证据与失败模式。
- 已强化 `agent-qc:qcloop-status` stale evidence：`scripts/lib/agent-qc-qcloop-status-core.mjs` 现在输出 item 级 `staleSeconds` 和 worker `durationSeconds`；当前 sidecar 显示 `browser-runtime-site-adapter staleSeconds=5108 stdoutLength=0 stderrLength=0`。
- 已把 qcloop worker 执行器环境失败纳入 blocked 语义：`QCLOOP_CODEX_BIN 不可用`、`QCLOOP_CODEX_EXTRA_ARGS` 解析失败、内层认证 / sandbox 配置错误不再被误判为产品 fail；blocker 摘要不会泄露原始 stderr 路径或凭证内容。
- 已记录 no-MCP worker 策略：隔离 qcloop server 已验证 `mcp_servers={}` 不足以覆盖嵌套 MCP 配置；当前改用 `mcp_servers.<name>.command=""` 覆盖已知 MCP command，初始 `ps` 未观察到用户级 MCP 子进程。
- 已强化 qcloop worker prompt：最终 stdout 必须逐项列出 `evidence_required` 是否满足，并说明每个 `failure_modes` 如何被覆盖、排除或命中；不能只写“命令通过”或只给日志路径。
- 已给 P0 manifest 增加 `evidenceLayers`，并把 qcloop item 导出为 `evidence_layers`，要求 worker 明确本次只覆盖 `deterministic-smoke`，还是已经覆盖 `gui-trace`、`runtime-transcript` 或 `release-artifact`；这防止 smoke PASS 被误读成 deep evidence PASS。
- `agent-qc:check` 已机械强制 P0 场景必须声明合法 `evidenceLayers`，未知层级会被 `scripts/lib/agent-qc-report-core.mjs` 阻断。
- 已新增 `agent-qc:gui-owner-check`，用于在启动新 GUI P0 前只读扫描 active GUI qcloop sidecar 并阻断并发 GUI smoke 干扰。
- 已生成待用 payload `.lime/qc/qcloop-p0-evidence-layers-v1-payload.json`，`max_qc_rounds=1` 且 8 个 P0 item 均带 `evidence_layers`；GUI P0 均要求 `GUI session owner / isolation statement`，`workspace-ready-session-restore` / `release-package-startup-smoke` 已纳入 design canvas 工程 roundtrip 和 GUI smoke 自然收口证据；仅供当前 running/stale 批次自然结束后使用，不自动提交。

## 5. 完成定义

本 blocker 文档只能在以下事实同时成立后关闭：

1. qcloop P0 批次覆盖全部 8 个 P0 scenario id。
2. `.lime/qc/agent-qc-evidence.json` 的 `verdict.status` 为 `pass`。
3. `npm run agent-qc:release-summary -- --evidence ./.lime/qc/agent-qc-evidence.json --require-scenario-manifest docs/test/agent-qc-scenarios.manifest.json --require-risk P0 --check` 通过。
4. `npm run agent-qc:audit -- --format json` 返回 `complete`。

在此之前，Lime Agent QC 整体目标不得标记完成。

### 5.1 手动 Playwright Agent UI / Skills 非抢占续测（2026-05-10 20:54）

新增证据目录：`.lime/qc/gui-evidence/agent-ui-manual-e2e-2026-05-10/`。

| 检查 | 当前值 | 结论 |
| --- | --- | --- |
| qcloop owner gate | `blocked`，active owner 仍为 `1778405842243079000` | 未启动新的 full GUI P0 |
| Playwright manual flow | 首页 / 新建任务 / Skills / Skill 补参 / Skill 搜索 / 能力草案 / 已注册能力 / 添加资料 / 高级设置 | 手动 UI 流程可交互 |
| screenshots | `01-home.png` 到 `10-advanced-settings-open.png` | 已留图证据 |
| console | `Errors: 0, Warnings: 0` | 无新增控制台错误 |
| network | `194` 个非静态请求，全部 HTTP `200` | 无非静态网络失败 |
| `Agent 1000` 标签 | 未观察到 | 本轮截图未复现该冗余标签 |
| 新问题 | Skill 补参卡暴露 `auto_analysis/context/preference` 等内部线索；Skills 搜索空态与本地命中并存；高级设置有 `Plan` 等混合英文 / 内部词 | 不阻断官方 qcloop，但应作为 Agent UI 产品化 polish / 信息泄露后续项 |

该续测只能证明当前桌面 WebView 的 Agent UI 表层可交互，不能替代官方 Evidence Pack。关闭条件仍保持：新的同批次 8/8 P0 structured qcloop Evidence Pack pass、release summary pass、completion audit complete。

### 5.2 已解决：Skill 补参卡内部参考信息外露（2026-05-10 21:10）

| 项 | 结果 |
| --- | --- |
| 原问题 | Skill 补参卡向普通用户暴露 `auto_analysis/context/preference`、`fp:*`、`-32603`、`Pexels API Key` 与 task JSON |
| 修复 | `curatedTaskReferenceSelection` 在参考对象事实源归一化阶段脱敏标题、摘要和 tag |
| 回归 | `CuratedTaskLauncherDialog.test.tsx` + `curatedTaskReferenceSelection.test.ts` 覆盖 UI 文本和 prompt block |
| Playwright evidence | `.lime/qc/gui-evidence/skill-preflight-reference-sanitized-2026-05-10/summary.json`，verdict=`pass` |
| 剩余 | 这不改变官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass |

该项从 Agent UI 产品化 blocker 降级为已修复回归项。后续如果要继续治理参考对象列表，还应单独处理“任务 ID”类历史成果摘要是否默认展示给普通用户的问题。

### 5.3 已解决：Skills 搜索本地命中时的全局无结果误导（2026-05-10 21:17）

| 项 | 结果 |
| --- | --- |
| 原问题 | 搜索 `cover` 时右侧本地 Skills 有 `cover_generate` 等命中，但主区域仍显示“当前搜索下暂无结果模板 / Skill 分组” |
| 修复 | `SkillsWorkspacePage` 在右侧有匹配结果时改用“右侧已有可继续的 Skill / 分类暂无匹配但已找到可用 Skill” |
| 回归 | `SkillsWorkspacePage.test.tsx` 覆盖仅命中本地 Skill 的搜索 |
| Playwright evidence | `.lime/qc/gui-evidence/skills-search-local-hit-2026-05-10/summary.json`，verdict=`pass` |
| 剩余 | 不影响官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass |

该项从产品 UI/UX blocker 降级为已修复回归项。

### 5.4 已解决：高级设置 `Plan` 英文 / 内部词暴露（2026-05-10 21:28）

| 项 | 结果 |
| --- | --- |
| 原问题 | Agent UI 输入区展开高级设置后显示 `Plan`，普通用户难以理解其含义 |
| 修复 | `InputbarExecutionStrategySelect` 统一改为 `计划执行`，`aria-label` / `title` 改为 `开启计划执行` / `关闭计划执行` |
| 覆盖面 | 首页空态输入区与工作区输入区共用同一个执行策略开关 |
| 回归 | `Inputbar/index.test.tsx`、`EmptyStateComposerPanel.test.tsx`、`EmptyState.test.tsx` 覆盖用户可见中文标签和旧 `Plan` 文案不再出现 |
| Playwright evidence | `.lime/qc/gui-evidence/advanced-settings-plan-label-cn-2026-05-10/summary.json`，verdict=`pass` |
| 剩余 | 不改变官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass |

该项从产品 UI/UX polish 降级为已修复回归项。

### 5.5 已复核：Design Canvas 工程保存状态当前可观察（2026-05-10 21:35）

| 项 | 结果 |
| --- | --- |
| 原风险 | fast-mini readonly P0 sidecar 在 `smoke:design-canvas` 的 `project-roundtrip-save-open` 阶段等待 `已保存图层设计工程` 超时 |
| 复测 | 宿主直接执行 `npm run smoke:design-canvas -- --timeout-ms 180000` 通过 |
| 覆盖 | DevBridge ready、设计画布打开、图层交互、工程目录保存 / 打开、平面图拆层、质量导出 manifest |
| Evidence | `.lime/qc/gui-evidence/design-canvas-project-roundtrip-current-2026-05-10/summary.json`，verdict=`pass` |
| 结论 | 当前 host 产品链路可用，旧 fast-mini sidecar 失败更像 qcloop worker / 并发 / 证据层问题；仍不能替代官方 full P0 qcloop pass |
| 剩余 | 整体 blocker 仍是 `real-qcloop-evidence` 未 pass，且 active GUI owner 仍 stale |

该项从“需定位的产品 UI/UX 风险”降级为当前已复核通过的 sidecar 风险；后续应在单一 GUI owner 下纳入新的 full P0 qcloop 证据，而不是单独宣称发布通过。

### 5.6 已复核：Harness Replay / Eval 后端回归当前可运行（2026-05-10 21:39）

| 项 | 结果 |
| --- | --- |
| 原风险 | full P0 中 `harness-replay-regression` 仍 pending，无法被 stale qcloop owner 调度验证 |
| 复测 | 宿主直接执行 `npm run harness:eval:json` 与 `npm run harness:eval:trend:json`，均 exit `0` |
| 当前 eval | `suiteCount=3`、`caseCount=2`、`readyCount=2`、`invalidCount=0`、`needsHumanReviewCount=0`、`currentObservabilityGapCaseCount=0` |
| Trend 限制 | `sampleCount=1`，只能作为 trend seed，不能判断长期退化 |
| 历史基线 | 未发现既有 `.lime/harness/history` / `reports` 样本；已把本轮结果记录为第一条真实 baseline，并生成 summary / trend / cleanup / dashboard 报告 |
| Evidence | `.lime/qc/backend-evidence/harness-replay-regression-current-2026-05-10/summary.json`，verdict=`pass_with_trend_seed_limit` |
| 剩余 | 仍需 full P0 qcloop verifier 同批次采信；当前 active GUI owner stale，不能直接启动新的 full GUI P0 |

该项从“pending 未调度”降级为 direct host backend sidecar pass；由于 trend 样本不足和 qcloop 未采信，仍不能关闭 `real-qcloop-evidence` blocker。

### 5.7 已复核：Approval / Sandbox live runtime transcript 当前可运行（2026-05-10 22:15）

| 项 | 结果 |
| --- | --- |
| 原风险 | `tool-approval-sandbox-boundary` 只有 deterministic smoke 或 qcloop worker 自报 PASS，缺少真实 runtime permission request / decision transcript |
| 初始失败 | live runtime 请求没有带 provider/model preference，导致 submit turn 没有形成权限确认 transcript；UI 侧留有 `agent-runtime-create-session-fail-2026-05-10.png` |
| 修复 | `scripts/agent-runtime-approval-sandbox-smoke.mjs` 自动解析本地 enabled provider/model，并支持显式 `--provider-preference` / `--model-preference` |
| 复测 | `node --check scripts/agent-runtime-approval-sandbox-smoke.mjs`、`npx vitest run scripts/lib/agent-runtime-approval-sandbox-smoke-core.test.ts`、`npm run smoke:agent-runtime-approval-sandbox -- --timeout-ms 120000 --output .lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/runtime-approval-sandbox-smoke.fixed.json`、`npm run smoke:agent-runtime-tool-surface`、`npm run agent-qc:check` 均通过 |
| Live assertions | `devBridgeHealthy`、`permissionRequestCreatedBeforeModel`、`deniedDecisionClearsPendingRequest`、`resolvedDecisionClearsPendingRequest`、`approvalPolicySubmitted`、`sandboxPolicySubmitted` 均为 `true` |
| Evidence | `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json`，verdict=`pass` |
| 剩余 | 仍需 full P0 qcloop verifier 在同批次采信；当前 active GUI owner `1778405842243079000` 仍 stale，不能新开 full GUI P0 |

该项从“缺 live runtime transcript”降级为 direct-host backend sidecar pass；它不改变官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，也不关闭 `real-qcloop-evidence` 和 `local-verify-gate` 两个 completion audit 缺口。

### 5.8 当前门禁刷新（2026-05-10 22:20）

| 门禁 | 当前值 | 结论 |
| --- | --- | --- |
| completion audit | `16/18`，`status=incomplete` | 缺 `real-qcloop-evidence` 与 `local-verify-gate` |
| GUI owner | `blocked`，owner `1778405842243079000` | `browser-runtime-site-adapter` stale 约 `16482s`，3 个 GUI P0 仍未终态 |
| qcloop status | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale |
| local verify | `verify:local` 当前 fail in `typecheck` | `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx(129,51)` 的 `number` / `Timeout` 类型不匹配；本轮为避免 settings-v2 高冲突未修改 |

因此当前允许继续补 sidecar / 文档 / 低冲突后端证据；不允许启动新的 full GUI P0、处理中断 PID `69738`、改 qcloop DB，或把任何 sidecar pass 写成 release pass。

### 5.9 当前门禁刷新（2026-05-10 22:45）

| 门禁 | 当前值 | 结论 |
| --- | --- | --- |
| completion audit | `16/18`，`status=incomplete` | 缺 `real-qcloop-evidence` 与 `local-verify-gate` |
| GUI owner | `blocked`，owner `1778405842243079000` | `browser-runtime-site-adapter` stale 约 `17692s`，3 个 GUI P0 仍未终态 |
| qcloop status | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale |
| DB lease | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T22:56:05+08:00` | stale worker 仍在续约，不能新开 full GUI P0 |
| local verify | `verify:local` fail in `npm test / vitest-smart batch 39/54` | `src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts:98` 期望缺少 `turnId`，但实现返回 `turnId`；该文件属于当前活动工作树修改，本轮未改 |

当前仍只允许只读刷新、sidecar 记录和 docs/tests runbook 同步；不允许启动新的 full GUI P0、处理中断 PID `69738`、修改 qcloop DB、覆盖官方 Evidence Pack、或执行 git commit / push / tag / release。

### 5.10 当前门禁刷新（2026-05-10 23:40）

| 门禁 | 当前值 | 结论 |
| --- | --- | --- |
| completion audit | `16/18`，`status=incomplete` | 当前 audit 仍读取旧 `verify-local-current.json`，缺 `real-qcloop-evidence` 与 `local-verify-gate` |
| GUI owner | `blocked`，owner `1778405842243079000` | `browser-runtime-site-adapter` stale 约 `20265s`，仍不能新开 full GUI P0 |
| qcloop status | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale |
| local verify | 新一轮 `verify:local` 仍在运行 | 已过前端 / contracts / Rust 主库 / GUI smoke 前半段，当前卡在 `smoke:agent-service-skill-entry` 的 Rust 定向测试编译；未判 pass/fail |
| running evidence | `.lime/qc/verify-local-2026-05-10-2340-running.md` | 只读记录当前进程与日志，不覆盖最终 gate |

当前仍只允许只读刷新、sidecar 记录和必要文档同步；不允许启动新的 full GUI P0、处理中断 PID `69738`、修改 qcloop DB、覆盖官方 Evidence Pack、或执行 git commit / push / tag / release。

### 5.11 当前门禁刷新（2026-05-10 23:50）

| 门禁 | 当前值 | 结论 |
| --- | --- | --- |
| local verify | 仍在运行 | 第一条 Skill Forge Rust 定向测试已通过，第二条 `registered_skill_becomes_ready_for_manual_enable_binding_candidate` 正等待 Cargo artifact lock |
| lock context | 并发 Cargo 工作仍活跃 | 观察到 workspace locked test / cargo check / GUI smoke cargo run 等进程；本轮不终止任何进程 |
| evidence | `.lime/qc/verify-local-2026-05-10-2350-cargo-lock.md` | 只读记录，不覆盖最终 `verify-local-current.json` |

该状态不能关闭 `local-verify-gate`，但也不再等同于 22:39 的 Vitest 失败；最终口径以当前 wrapper 自然结束后写出的 `.lime/qc/verify-local-current.json` 为准。

### 5.12 当前门禁刷新（2026-05-10 23:56）

| 门禁 | 当前值 | 结论 |
| --- | --- | --- |
| completion audit | `16/18`，`status=incomplete` | 缺 `real-qcloop-evidence` 与 `local-verify-gate` |
| local verify | exit `124` | 失败在 `verify:gui-smoke / smoke:agent-service-skill-entry`，第二条 Skill Forge Rust 定向测试等待 lock 后编译但超过 `1830000ms` 超时 |
| 已通过局部 | app-version / lint / typecheck / frontend tests / contracts / Rust 主库 / workspace-ready / browser-runtime / site-adapters / Skill Forge frontend / 第一条 Rust 定向测试 | 说明 22:39 的 Vitest 失败已不是当前 active run 的失败点 |
| qcloop status | `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale |
| GUI owner | `blocked` | stale owner `1778405842243079000`，约 `20878s` |
| evidence | `.lime/qc/verify-local-2026-05-10-2355-gui-smoke-timeout.md`、`.lime/qc/completion-audit-2026-05-10-2356.json` | 当前仍不可发布 |

`local-verify-gate` 仍不能关闭；下一刀应在不抢 qcloop GUI owner 的前提下，等并发 Cargo 工作结束后重跑 `npm run smoke:agent-service-skill-entry` 或 `npm run verify:gui-smoke -- --reuse-running`，而不是启动新的 full P0。

### 2026-05-11 00:20 追加阻断：Claw streaming 首增量 / 停止按钮证据未闭环

最新宿主 `verify:gui-smoke -- --reuse-running` 已进入更深层的 Claw streaming 验证。前置 GUI smoke 阶段通过，且 `smoke:claw-chat-ready-streaming` 已自动解析 `deepseek / deepseek-v4-flash`，但长 turn 提交后未能在 smoke 窗口内同时观察到首个流式文本和可见“停止”按钮。

证据：

- `.lime/qc/verify-gui-smoke-current.json`
- `.lime/qc/verify-gui-smoke-reuse-2026-05-11-0006.log`
- `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json`
- `.lime/qc/smoke-claw-chat-ready-streaming-deepseek-chat-2026-05-11-0008.log`
- `.lime/qc/gui-evidence/claw-chat-ready-streaming-deepseek-chat-2026-05-11/claw-chat-ready-streaming-deepseek-chat-summary.json`

分类：

| 项 | 当前结论 |
| --- | --- |
| provider/model 解析 | 已解除；默认 smoke 自动选中 `deepseek / deepseek-v4-flash` |
| first streamed delta | 未闭环；默认 run 等待首个流式文本与停止按钮超时 |
| evidence completeness | 已补脚本；失败路径后续会写 console/network/runtime/session/thread 证据 |
| release gate | 仍阻断；不能把 GUI 主路径标记为可交付 |

本轮只修复 smoke 脚本的证据采集和空快照健壮性，没有重跑完整 GUI smoke；原因是仍有其他 Lime / Cargo / qcloop 进程在运行，且用户明确要求不要推送、不要干预其他进程。关闭条件是：在无并发 GUI owner 阻断的环境下，重跑 `npm run verify:gui-smoke -- --reuse-running` 或等价 qcloop P0 item，取得 `claw-chat-ready-streaming` 的 pass summary，并包含 runtime transcript、interrupt scope、恢复 turn、console/network 摘要。

### 2026-05-11 00:25 更新：Claw streaming 在显式 Sensenova provider 下通过

00:20 记录的默认 deepseek 首增量失败之后，另一个已经运行中的 `verify:gui-smoke` 使用显式 `custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed / sensenova-6.7-flash-lite` 自然完成并通过。本轮只是观察和记录，没有启动、停止或重启该流程。

证据：

- `.lime/qc/verify-gui-smoke-current.json`
- `.lime/qc/verify-gui-smoke-2026-05-11-0025-sensenova-pass.md`
- `.lime/qc/verify-gui-smoke-reuse-sensenova-2026-05-11-0020.log`
- `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json`

当前分类调整：

| 项 | 当前结论 |
| --- | --- |
| Claw streaming smoke | 在显式 Sensenova provider 下已通过，包含流式、停止、中断、恢复和 runtime transcript 证据 |
| 默认 provider path | 仍有 default deepseek run 的失败历史，后续需要决定发布门禁默认 provider 是否也必须通过 |
| `local-verify-gate` | 仍未关闭；完整 `npm run verify:local` sidecar 仍为 fail |
| qcloop official P0 Evidence Pack | 仍未关闭；官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，且 stale qcloop GUI owner 未释放 |

因此，本条从“当前 GUI smoke blocker”降级为“provider 口径 / full local verify 未闭环”缺口；它不能替代完整 `verify:local` 和真实 8/8 P0 qcloop Evidence Pack。
