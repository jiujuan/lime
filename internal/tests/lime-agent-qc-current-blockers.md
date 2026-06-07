# Lime Agent QC 当前 P0 阻断记录

> 本文件记录 Lime 作为样本产品执行 Agent QC P0 时发现的真实阻断。它不是发布放行说明；只要本文件中的 P0 blocker 未清空，`.lime/qc/agent-qc-evidence.json` 就不应被视为绿色发布证据。

## 1. 当前结论

截至 2026-05-11 05:02，本地已经具备 Agent QC 标准、manifest、Evidence Pack schema、qcloop exporter、release summary gate、completion audit、qcloop status sidecar、payload coverage gate 和 GUI smoke 能力。隔离 qcloop 已经证明部分 P0 smoke 能在 worker 内跑通；最新完整 `verify:local` 已通过，隔离 P0 full v3 已把 `command-bridge-contract`、`claw-chat-ready-streaming`、`tool-approval-sandbox-boundary`、`harness-replay-regression` 推进到 qcloop pass，后续单项 qcloop 又把 `skill-forge-register-bind-enable` 推进到 runtime-transcript pass；但官方 Evidence Pack 仍为失败，且 PID `59011` 的 raw `smoke:design-canvas` stale owner 仍未释放。2026-05-11 05:02 的最新门禁刷新见 [5.38](#538-completion-audit-纳入-payload-coverage2026-05-11-0502)：

```text
.lime/qc/agent-qc-evidence.json status=fail scenarios=8/8
```

这说明当前不是“缺测试”，而是测试系统已经把阻断分成三类：产品深证据 blocker、qcloop worker / provider 卡住、以及 verifier 正确拒绝“只有命令通过、缺少 transcript / trace / console-network 证据”的浅层输出。不能通过修改门禁、降低证据要求或用 isolated partial evidence 把它伪装成通过。

## 2. 证据来源

| 证据                                                                                  | 状态                                  | 说明                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| qcloop P0 v3 `1778390726823769000`                                                    | `completed` / `fail`                  | 覆盖 8/8 P0，2 pass / 6 fail                                                                                                                                                                                                                                                                                                                                                                    |
| qcloop rerun v4 `1778392677659787000`                                                 | `completed` / `fail`                  | 重跑 6 个失败 P0，最终 0 pass / 6 exhausted；失败集中在旧 verifier 输出读取和 qcloop worker localhost / DevBridge 权限                                                                                                                                                                                                                                                                          |
| qcloop rerun v5 `1778398587521627000`                                                 | `completed` / sidecar `fail`          | 使用带 worker preflight 和 stdout verifier 的新 payload；最终结果为 1 `failed`、5 `exhausted`、0 `success`；其中 GUI / Skill / Browser 类场景已明确输出 `QCLOOP_WORKER_RESULT=BLOCKED`                                                                                                                                                                                                          |
| `.lime/qc/agent-qc-evidence.json`                                                     | `fail`                                | 官方默认 Evidence Pack，覆盖 8/8，但不能发布                                                                                                                                                                                                                                                                                                                                                    |
| `.lime/qc/agent-qc-evidence.p0-v3.json`                                               | `fail`                                | v3 sidecar，覆盖 8/8                                                                                                                                                                                                                                                                                                                                                                            |
| `.lime/qc/agent-qc-evidence.p0-rerun-v4-running.json`                                 | `fail` / `blocked`                    | v4 sidecar，当前 6 个重跑场景未完成或失败                                                                                                                                                                                                                                                                                                                                                       |
| `.lime/qc/agent-qc-evidence.p0-rerun-v4-completed.json`                               | `fail`                                | 2026-05-10 15:35 从 completed v4 job 导出的 sidecar，6/6 exhausted；不是官方发布证据                                                                                                                                                                                                                                                                                                            |
| `.lime/qc/agent-qc-evidence.p0-rerun-v5-current.json`                                 | `fail`                                | v5 sidecar；`tool-approval-sandbox-boundary` qcloop item 已 failed，同时 GUI / Skill / Browser 类场景因 `QCLOOP_WORKER_RESULT=BLOCKED` 保持 blocked 语义；不是官方发布证据                                                                                                                                                                                                                      |
| `.lime/qc/qcloop-executor-env-20260510.json`                                          | env finding                           | qcloop serve PID `80248` 仅设置了 `QCLOOP_CODEX_BIN`，未设置 `QCLOOP_CODEX_SANDBOX=off` / bypass / approval policy；解释了 worker localhost 被 Codex 默认沙箱阻断的高概率原因                                                                                                                                                                                                                   |
| `.lime/qc/qcloop-devbridge-health-after-v5.json`                                      | env finding                           | v5 completed 后宿主 shell 直连 `http://127.0.0.1:3030/health` 也失败，`lsof` 未发现 3030 listener；这是宿主 DevBridge 恢复前的历史阻断证据                                                                                                                                                                                                                                                      |
| `.lime/qc/qcloop-devbridge-health-restored.json`                                      | env finding                           | 2026-05-10 16:59 后 headless Tauri 启动成功，宿主 `npm run bridge:health` 与 `agent-qc:qcloop-preflight -- --require-devbridge` 均为 pass；官方 evidence 未变                                                                                                                                                                                                                                   |
| qcloop worker preflight `1778403715309891000`                                         | `completed` / `blocked` sidecar       | 宿主 DevBridge 已恢复后创建 1 个只读 preflight item；worker cwd/tmp 通过，但 DevBridge health 仍 `fetch failed`，输出 `QCLOOP_WORKER_RESULT=BLOCKED`；`.lime/qc/qcloop-status.worker-devbridge-preflight.json` 归类为 `blocked`                                                                                                                                                                 |
| isolated qcloop worker preflight `1778404260108641000`                                | `completed` / sidecar `complete`      | 使用隔离 qcloop server `127.0.0.1:18080`、独立 DB `.lime/qc/qcloop-isolated-worker-preflight.db`、`QCLOOP_CODEX_SANDBOX=off` 后，worker preflight 通过；证明 qcloop worker 权限问题可通过正确启动环境解除                                                                                                                                                                                       |
| isolated `workspace-ready-session-restore` `1778404364137496000`                      | `completed` / sidecar `complete`      | `smoke:workspace-ready` 与 `verify:gui-smoke -- --reuse-running` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack                                                                                                                                                                                                                                                                               |
| isolated `browser-runtime-site-adapter` `1778404601640847000`                         | `completed` / sidecar `complete`      | `smoke:browser-runtime` 与 `smoke:site-adapters` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack                                                                                                                                                                                                                                                                                               |
| isolated `skill-forge-register-bind-enable` `1778404743505029000`                     | `completed` / sidecar `complete`      | `test:contracts` 与 `smoke:agent-service-skill-entry` 均通过；只作为 sidecar，不覆盖官方 Evidence Pack                                                                                                                                                                                                                                                                                          |
| isolated `release-package-startup-smoke` v1 `1778404882904047000`                     | `failed` / sidecar `blocked`          | 执行时宿主 `127.0.0.1:3030` 已再次断开，preflight 停在 `devbridge-health BLOCKED`，未运行版本和 GUI smoke；保留为历史环境阻断证据                                                                                                                                                                                                                                                               |
| isolated `release-package-startup-smoke` v2 `1778405385701480000`                     | `completed` / sidecar `complete`      | 宿主 DevBridge 恢复后，隔离 qcloop worker preflight、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 均通过；artifact scope 明确为 `source-tree-startup-smoke`，不是 installer 验证，也不覆盖官方 Evidence Pack                                                                                                                                                                     |
| isolated P0 full v1 `1778405842243079000`                                             | `running` / sidecar `stale`           | 已有 4/8 success：`command-bridge-contract`、`claw-chat-ready-streaming`、`tool-approval-sandbox-boundary`、`skill-forge-register-bind-enable`；`browser-runtime-site-adapter` 仍 running 且当前 attempt 无 stdout/stderr，SQLite lease 被心跳延长到 `2026-05-10T19:00:05+08:00`；后续 3 个场景 pending；只读观察，不中断                                                                       |
| isolated no-MCP P0 full v1 `1778410893606889000`                                      | `failed` / sidecar `blocked`          | 为排查内层 `codex exec` 用户级 MCP 启动导致长期无输出的问题，启动了独立端口 `127.0.0.1:18081`；该批次因 `QCLOOP_CODEX_BIN` 指向坏 Homebrew symlink 立即失败，现按 worker CLI 环境阻断归类，不作为产品失败                                                                                                                                                                                       |
| isolated no-MCP P0 full v2 `1778410956075020000`                                      | `running` / sidecar `stale`           | 使用独立端口 `127.0.0.1:18082`、正确 Codex bin、`QCLOOP_CODEX_EXTRA_ARGS='--ephemeral -c mcp_servers={}'`；实测仍可能启动用户级 MCP 子进程；`command-bridge-contract` 已在 repair attempt 后 success；当前 `claw-chat-ready-streaming` running 且 9 分钟无 stdout/stderr，被 sidecar 标记 stale；后续 6 个 P0 pending；只读观察，不覆盖官方 evidence                                            |
| isolated MCP-disabled P0 full v1 `1778412160003934000`                                | `running` / sidecar `running`         | 使用独立端口 `127.0.0.1:18083`、正确 Codex bin，并把 `mcp_servers.context7.command` / `mcp_servers.playwright.command` 覆盖为空；初始 `ps` 未观察到用户级 MCP 子进程；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence |
| isolated fast P0 full v1 `1778412499745993000`                                        | `running` / sidecar `running`         | 使用独立端口 `127.0.0.1:18084`、正确 Codex bin、MCP command 覆盖为空，并额外加 `--ignore-rules` 避免项目规则 / skill / MCP 依赖放大；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence                                  |
| isolated fast-mini readonly P0 full v1 `1778412738097137000`                          | `running` / sidecar `running`         | 使用独立端口 `127.0.0.1:18085`、`gpt-5.4-mini`、low reasoning、MCP command 覆盖为空、`--ignore-rules`、`max_qc_rounds=1` 和只读 worker prompt；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending；只读观察，不覆盖官方 evidence                        |
| direct host `browser-runtime-site-adapter` check                                      | command `pass` with cleanup warning   | `agent-qc:qcloop-preflight -- --require-devbridge`、`smoke:browser-runtime`、`smoke:site-adapters` 在宿主 shell 直接通过；`smoke:browser-runtime` 输出了非阻断 cleanup warning：`close_cdp_session` 未找到刚创建的 session；这证明当前 full P0 卡点更像 qcloop worker / provider 无输出，而不是宿主 DevBridge 或产品命令不可用                                                                  |
| direct host `harness-replay-regression` check                                         | command `pass` with trend seed caveat | `npm run harness:eval` 与 `npm run harness:eval:trend` 在宿主 shell 直接通过；current observability gap 为 0，degraded gap 为 1，trend 样本数为 1，只能作为 seed，不能判断长期退化                                                                                                                                                                                                              |
| direct host `workspace-ready-session-restore` / `release-package-startup-smoke` check | command `pass`                        | `smoke:workspace-ready`、`verify:app-version`、`verify:gui-smoke -- --reuse-running` 在宿主 shell 直接通过；验证了 workspace ready、版本一致性、DevBridge health、GUI smoke、browser runtime、site adapters、service skill entry、runtime tool surface、knowledge GUI、design canvas                                                                                                            |
| direct host `tool-approval-sandbox-boundary` live runtime check                       | command `pass`                        | `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json` verdict=`pass`；denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:*`，并证明 `approvalPolicy=on-request`、`sandboxPolicy=workspace-write` 已随 turn 提交；仍是 sidecar，不覆盖官方 Evidence Pack                                                                                            |
| `npm run agent-qc:qcloop-status -- --job-id 1778398587521627000`                      | `completed` / sidecar monitoring      | 最终只读检查显示 v5 已 completed / fail，`tool-approval-sandbox-boundary` failed，其他 5 个重跑项 exhausted；用于排障，不覆盖官方 evidence                                                                                                                                                                                                                                                      |
| `.lime/qc/gui-evidence/product-backend-ux-e2e-2026-05-10.json`                        | `pass` + deep flow finding `fail`     | 基础 GUI surface 通过，但 Claw streaming deep flow 标记为 product blocker                                                                                                                                                                                                                                                                                                                       |

### 2.1 最新只读刷新（2026-05-10 19:58）

| 批次                                           | 当前状态                                             | 关键含义                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| isolated full P0 v1 `1778405842243079000`      | `running` / `stale`，4 success、1 running、3 pending | `browser-runtime-site-adapter` 已无 stdout/stderr 约 8002 秒；只读观察，不 kill、不覆盖官方 evidence                                                                                                                                                                          |
| no-MCP P0 v2 `1778410956075020000`             | `running`，2 success、1 failed、1 running、4 pending | `tool-approval-sandbox-boundary` 已 failed；`skill-forge-register-bind-enable` running；`mcp_servers={}` 仍不足以完全证明内层 MCP 降噪                                                                                                                                        |
| MCP-disabled P0 v1 `1778412160003934000`       | `running` / `stale`，1 failed、1 running、6 pending  | `command-bridge-contract` 因旧 no-change verifier 失败；`claw-chat-ready-streaming` stale 约 674 秒；后续 payload 已修正，但当前批次只读观察                                                                                                                                  |
| fast P0 v1 `1778412499745993000`               | `running`，1 success、1 running、6 pending           | `--ignore-rules` 后 command bridge 已通过，`claw-chat-ready-streaming` 仍在跑                                                                                                                                                                                                 |
| fast-mini readonly P0 v1 `1778412738097137000` | `failed`，8 exhausted                                | sidecar evidence 为 `fail=6 / blocked=2`。verifier 正确拒绝缺少 deep evidence 的浅层输出；同时发现 `workspace-ready-session-restore` 的 `verify:gui-smoke` 失败在 `smoke:design-canvas` 保存成功状态断言，`release-package-startup-smoke` 因 GUI smoke 未自然收口被判 blocked |

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

| 检查             | 当前值                                                 | 结论                             |
| ---------------- | ------------------------------------------------------ | -------------------------------- |
| qcloop job       | `1778405842243079000` / `running`                      | full P0 v1 未终态                |
| qcloop verdict   | `stale`                                                | 仍不能导出官方 pass evidence     |
| qcloop counts    | 4 success / 1 running / 3 pending / 1 stale            | P0 覆盖未完成                    |
| active scenario  | `browser-runtime-site-adapter`                         | 卡在 GUI / browser runtime 类 P0 |
| worker output    | stdout/stderr `0 / 0`                                  | 尚未开始可审查的业务命令输出     |
| worker duration  | 约 `10508s`                                            | 已远超 stale 阈值                |
| observed process | PID `69738`，内层 `codex exec`                         | stale owner 不是旧 sidecar 噪声  |
| GUI owner gate   | `ownerCount=1`、`staleOwnerCount=1`、`verdict=blocked` | 不允许启动新的 full GUI P0       |

当前唯一可安全推进的是继续维护标准、sidecar 和 runbook。必须等待 PID `69738` 自然释放，或由 owner 明确确认处置后，才能按 `internal/tests/lime-agent-qc-stale-owner-intervention.md` 执行 post-stale runbook。确认前不得直接处理进程或修改 qcloop DB。

### 2.3 只读复核续刷（2026-05-10 20:44）

再次只读刷新后，状态未释放：`1778405842243079000` 仍为 `running` / `stale`，`browser-runtime-site-adapter` 的 `staleSeconds=10772`，stdout/stderr 仍为 `0 / 0`；`agent-qc:gui-owner-check` 仍为 `blocked`，`ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=10772`。`ps` 仍可见 PID `69738` 处于内层 `codex exec`。本轮未执行任何中断动作。

### 2.4 DB / lease 级取证（2026-05-10 20:48）

新增 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1.md`。只读 SQLite 与进程树显示：

| 取证点              | 当前值                                                                    | 含义                                                                 |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `batch_jobs.status` | `running`                                                                 | qcloop 仍认为该批次未终态                                            |
| active item         | `1778405842246191000` / `browser-runtime-site-adapter`                    | 卡住的是 browser runtime P0                                          |
| item lease          | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T21:02:05+08:00` | lease 仍被心跳延长                                                   |
| attempt             | `running`，started `2026-05-10T17:45:05+08:00`                            | active attempt 未结束                                                |
| attempt output      | stdout/stderr `0 / 0`                                                     | 不是产品命令失败，而是没有可审查业务输出                             |
| process             | PID `69738`，PPID `1`，PGID `69307`                                       | worker 已成为 orphan，但仍在 qcloop process group                    |
| child processes     | Playwright MCP / Context7 MCP npm exec                                    | 与 `worker user-config MCP startup no-output hang` failure mode 匹配 |

这把 blocker 从“sidecar 显示 stale”升级为“DB lease、attempt、process tree 三侧一致证明 stale”。确认前仍不得处理进程或改 DB。

### 2.5 qcloop runtime binary provenance（2026-05-10 20:52）

新增 sidecar：`.lime/qc/qcloop-runtime-binary-provenance-18080.md`。只读 `lsof` 与 checksum 显示：

| 二进制                  | 路径                                                   | 大小       | SHA-256               | 结论           |
| ----------------------- | ------------------------------------------------------ | ---------- | --------------------- | -------------- |
| 当前 18080 qcloop serve | `/Users/coso/Documents/dev/ai/limecloud/qcloop/qcloop` | `13321106` | `177bf7fa...35dc5fe1` | 当前正在运行   |
| timeout-fixed sidecar   | `.lime/qc/bin/qcloop-timeout-fixed`                    | `13426082` | `2895e33d...3d4314c7` | 已构建但未运行 |

这证明 qcloop executor timeout / process-group cleanup 补丁还没有影响当前 PID `69307` 的 qcloop serve，也不会自动回收 stale PID `69738`。后续只有在 owner 释放或确认处理当前 stale owner 后，才能用 fixed binary 新启隔离 server 重跑 P0。

### 2.6 lease 过期窗口后复核（2026-05-10 21:02）

新增 sidecar：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1-after-expiry.md`。等待超过先前记录的 `lock_expires_at=2026-05-10T21:02:05+08:00` 后，只读复核显示：

| 取证点         | 当前值                                                                    | 含义                           |
| -------------- | ------------------------------------------------------------------------- | ------------------------------ |
| qcloop verdict | `stale`                                                                   | job 仍未终态                   |
| counts         | 4 success / 1 running / 3 pending / 1 stale                               | P0 仍未覆盖完成                |
| active item    | `browser-runtime-site-adapter`                                            | 仍是同一 GUI / browser P0 阻塞 |
| current lock   | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T21:17:05+08:00` | lease 在过期窗口后继续被延长   |
| active attempt | `running`，stdout/stderr `0 / 0`                                          | 仍无可审查业务输出             |
| process        | PID `69738`，PPID `1`，PGID `69307`                                       | worker 仍存活                  |

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

| 检查            | 当前值                                                                    | 结论                               |
| --------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| qcloop job      | `1778405842243079000` / `running`                                         | full P0 v1 仍未终态                |
| qcloop verdict  | `stale`                                                                   | 仍不能导出官方 pass evidence       |
| qcloop counts   | 4 success / 1 running / 3 pending / 1 stale                               | P0 覆盖仍未完成                    |
| active scenario | `browser-runtime-site-adapter`                                            | 仍卡在 GUI / browser runtime 类 P0 |
| stale age       | 约 `26202s`                                                               | 已远超 stale 阈值                  |
| GUI owner gate  | `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=26202`           | 不允许启动新的 full GUI P0         |
| DB lease        | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:17:06+08:00` | lease 仍被续约                     |
| active attempt  | `dc625f8e-b3b9-46b7-9758-4b0273438d50` / `running`                        | stdout/stderr 仍为空               |

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

| 证据                                                                                                                                                    | 状态    | 含义                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `.lime/qc/gui-evidence/claw-chat-ready-streaming-post-refresh-fallback-2026-05-11/claw-chat-ready-streaming-post-refresh-fallback-summary.json`         | `pass`  | runtime 已持久化 `复原完成` 时，刷新 / 会话恢复 fallback 可以让 GUI 重新呈现恢复结果                       |
| `.lime/qc/gui-evidence/claw-chat-ready-streaming-sensenova-session-restore-2026-05-11/claw-chat-ready-streaming-sensenova-session-restore-summary.json` | `fail`  | 复测期间 DevBridge 中途不可达，恢复 turn 未进入 completed；这是环境 / runtime 稳定性证据，不能替代完整门禁 |
| `.lime/qc/claw-chat-ready-streaming-current.json`                                                                                                       | `mixed` | 汇总当前 Claw deep flow 的 pass / fail 侧证据                                                              |

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

| 检查              | 当前值                                                                    | 结论                                        |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| qcloop job        | `1778405842243079000` / `running`                                         | full P0 v1 仍未终态                         |
| qcloop verdict    | `stale`                                                                   | 仍不能导出官方 pass evidence                |
| qcloop counts     | 4 success / 1 running / 3 pending / 1 stale                               | P0 覆盖仍未完成                             |
| active scenario   | `browser-runtime-site-adapter`                                            | 仍卡在 browser runtime / site adapter 类 P0 |
| stale age         | 约 `28020s`                                                               | 已远超 stale 阈值                           |
| GUI owner gate    | `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds≈27026`           | 不允许启动新的 full GUI P0                  |
| raw process owner | `busy`，`activeGuiSmoke=3`、`cargoOrRust=4`、`qcloopRelated=7`            | 不允许启动完整 `verify:local`               |
| DB lease          | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:47:06+08:00` | lease 仍被续约                              |
| active attempt    | `dc625f8e-b3b9-46b7-9758-4b0273438d50` / `running`                        | stdout/stderr 仍为空                        |

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

| Scenario                           | 当前状态                                                                     | 直接证据                                                                                                                                                                                                                                                                                                                                                                                                                                             | 下一步                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claw-chat-ready-streaming`        | product blocker；isolated full sidecar pass with shallow GUI scope           | `internal/exec-plans/evidence/product-backend-ux-e2e-2026-05-10/11-claw-streaming-summary.json` 标记 stop / interrupt 后长 turn 仍 completed；default worker preflight job `1778403715309891000` 仍证明内层 Codex 无法访问 DevBridge；isolated full v1 已通过 `verify:gui-smoke -- --reuse-running`，但 stdout 明确 scope 不含 live long-turn interrupt transcript                                                                                   | 保留 deep flow blocker；后续必须修 stop / interrupt 后端语义，并把 live long-turn transcript 纳入 qcloop / Playwright MCP 深证据                                                                                                                                                                                                  |
| `tool-approval-sandbox-boundary`   | default qcloop failed；direct-host live runtime sidecar pass                 | v5 attempt 1 和 repair attempt 2 的确定性 smoke 不足以通过 verifier；本轮 direct-host `smoke:agent-runtime-approval-sandbox` 已补真实 live runtime transcript：denied / resolved 两条 flow 均生成 `runtime_permission_confirmation:*`，并证明 approval / sandbox policy 进入 turn config；证据在 `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json`                                                                   | 该场景从“缺 live transcript”降级为“待 full P0 qcloop 同批次采信”；不要覆盖官方 `.lime/qc/agent-qc-evidence.json`，也不要在 stale GUI owner 未释放前重启 full GUI P0                                                                                                                                                               |
| `skill-forge-register-bind-enable` | default qcloop blocked；isolated sidecar pass                                | v5 多轮 worker 均停在 DevBridge preflight blocked；隔离 qcloop job `1778404743505029000` 已证明 contracts + service skill entry smoke 可通过                                                                                                                                                                                                                                                                                                         | 等宿主 DevBridge 稳定后，把该证据纳入新的全量 P0 qcloop 批次；仍不能单独覆盖官方 evidence                                                                                                                                                                                                                                         |
| `browser-runtime-site-adapter`     | default qcloop blocked；isolated single sidecar pass；isolated full P0 stale | v5 多轮 worker 均停在 DevBridge preflight blocked；隔离 qcloop job `1778404601640847000` 已证明 browser runtime + site adapter smoke 可通过；full P0 v1 当前卡在内层 `codex exec` 无 stdout/stderr；宿主直接运行 preflight + browser runtime + site adapters 通过，但 browser cleanup 有非阻断 warning                                                                                                                                               | 等当前 full P0 worker 自然结束；后续重跑时把 browser runtime 与 site adapter 拆成更窄 item，并把 cleanup warning 纳入 evidence                                                                                                                                                                                                    |
| `qcloop-batch-verifier-repair`     | worker / verifier 协议仍在收敛                                               | 已发现 qcloop generic repair prompt 会要求 worker “修复目标工作区”，这不适合发布证据批次；已把 worker prompt 改为只读，并生成 `.lime/qc/qcloop-readonly-p0-v1-payload.json` / `.lime/qc/qcloop-fastmini-readonly-p0-v2-payload.json`（`max_qc_rounds=1`）待用； no-MCP P0 v2 的 `command-bridge-contract` attempt 1 真实执行通过，verifier 正确拒绝了“只给命令通过与日志路径、未逐项解释 evidence / failure mode”的输出；repair attempt 已补足并通过 | worker prompt 已强化为必须逐项列出 `evidence_required` 和 `failure_modes`；`command-bridge-contract` verifier 已允许 no-change surface evidence 使用 checked surface counts + contract pass，并已生成待用 payload `.lime/qc/qcloop-isolated-nomcp-p0-v3-after-evidence-prompt-payload.json`；继续观察后续 P0 是否复现同类证据不足 |
| `workspace-ready-session-restore`  | default qcloop blocked；isolated sidecar pass；fast-mini full P0 failed      | v5 多轮 worker 未提供 workspace-ready / GUI smoke / DevBridge 可审查证据；隔离 qcloop job `1778404364137496000` 曾证明 workspace-ready + GUI smoke 可通过；但 fast-mini readonly P0 v1 中 `smoke:workspace-ready` 通过、`verify:gui-smoke` 失败在 `smoke:design-canvas` 的保存成功状态断言，命中 `ui ready false positive` 风险                                                                                                                      | 不把旧 isolated pass 当成当前 release 证据；后续需要定位 design canvas 保存状态断言或产品状态回写，再用 qcloop deep evidence 重跑                                                                                                                                                                                                 |
| `release-package-startup-smoke`    | default qcloop blocked；isolated source-tree sidecar pass；direct host pass  | v5 多轮 worker 未提供版本、GUI smoke、首屏 ready、Bridge health、waiver 证据；隔离 v2 `1778405385701480000` 已证明 source-tree startup smoke；宿主直接运行 `verify:app-version` + GUI smoke 通过                                                                                                                                                                                                                                                     | 进入 full P0 verifier 后才能覆盖官方 evidence；发布前仍不能把 source-tree smoke 伪装成 installer artifact                                                                                                                                                                                                                         |
| `harness-replay-regression`        | isolated full P0 pending；direct host pass                                   | full P0 v1 尚未调度该 item；宿主直接运行 `harness:eval` + `harness:eval:trend` 通过，但 trend 只有 1 个样本，仍不是 qcloop verifier pass                                                                                                                                                                                                                                                                                                             | 等当前 full P0 worker 自然结束后，让该 item 进入 qcloop verifier；长期趋势需要继续积累 nightly 样本                                                                                                                                                                                                                               |

## 4. 已经修正的标准问题

- `release-package-startup-smoke` 不再要求场景本身预先提供 `release evidence pack`。
- release Evidence Pack 的覆盖和 pass 状态由 `agent-qc:release-summary -- --require-scenario-manifest internal/test/agent-qc-scenarios.manifest.json --require-risk P0 --check` 单独强制。
- `agent-qc:audit` 已能区分官方 `.lime/qc/agent-qc-evidence.json` 与 sidecar evidence，避免 partial 或 fail sidecar 被误读为完成。
- `agent-qc:export-evidence` / `agent-qc:qcloop-status` 已能识别 worker stdout 中的 `QCLOOP_WORKER_RESULT=BLOCKED`，把 qcloop `exhausted` 但实为环境权限阻断的 item 归类为 Evidence Pack `blocked`。
- 已提交 qcloop rerun v5 `1778398587521627000`，payload 来自 `.lime/qc/qcloop-p0-rerun-v5-verifier-evidence-ready-payload.json`，覆盖当前 6 个未通过 / 未完成 P0，并确认 worker prompt 含 preflight、verifier prompt 含 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}`。
- 已用 `npm run tauri:dev:headless` 恢复宿主 DevBridge，并把恢复证据写入 `.lime/qc/qcloop-devbridge-health-restored.json`。
- 已提交只读 qcloop worker preflight job `1778403715309891000`。该 job 证明问题已经从“宿主 DevBridge 未启动”收敛为“qcloop 内层 worker loopback / sandbox 权限阻断”，不是产品 P0 已恢复。
- 已启动隔离 qcloop server `127.0.0.1:18080` 使用独立 DB 和显式 Codex sandbox 配置，证明 worker 权限可恢复，并产生 4 个 P0 sidecar pass：`workspace-ready-session-restore`、`browser-runtime-site-adapter`、`skill-forge-register-bind-enable`、`release-package-startup-smoke`。
- `release-package-startup-smoke` v2 sidecar 只证明 source-tree startup smoke，不证明 installer artifact；当前仍不能写官方 Evidence Pack，因为还没有同一批次覆盖 8/8 P0 的真实 pass。
- 已启动 isolated P0 full v1 `1778405842243079000`。该批次目前 4/8 success，但 `browser-runtime-site-adapter` item 长时间 running 且无 stdout/stderr，`.lime/qc/qcloop-status.isolated-p0-full-v1-stale-check.json` 已标记 `stale`；只读 `ps` 显示内层 `codex exec` 仍在跑、尚未出现 npm 子命令输出，后续 3 个 P0 pending；按 qcloop 运维规则只读观察，不 kill、不 pause、不覆盖官方 evidence。
- 已把这次真实卡点回写到机器标准：`internal/test/agent-qc-scenarios.manifest.json` 的 `qcloop-batch-verifier-repair` 增加 `stale item sidecar`、worker stdout/stderr 长度摘要，以及 `running no-output stale` / `worker lease heartbeat without stdout` 失败模式；`browser-runtime-site-adapter` 增加 cleanup warning 证据与失败模式。
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
3. `npm run agent-qc:release-summary -- --evidence ./.lime/qc/agent-qc-evidence.json --require-scenario-manifest internal/test/agent-qc-scenarios.manifest.json --require-risk P0 --check` 通过。
4. `npm run agent-qc:audit -- --format json` 返回 `complete`。

在此之前，Lime Agent QC 整体目标不得标记完成。

### 5.1 手动 Playwright Agent UI / Skills 非抢占续测（2026-05-10 20:54）

新增证据目录：`.lime/qc/gui-evidence/agent-ui-manual-e2e-2026-05-10/`。

| 检查                   | 当前值                                                                                                                               | 结论                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| qcloop owner gate      | `blocked`，active owner 仍为 `1778405842243079000`                                                                                   | 未启动新的 full GUI P0                                              |
| Playwright manual flow | 首页 / 新建任务 / Skills / Skill 补参 / Skill 搜索 / 能力草案 / 已注册能力 / 添加资料 / 高级设置                                     | 手动 UI 流程可交互                                                  |
| screenshots            | `01-home.png` 到 `10-advanced-settings-open.png`                                                                                     | 已留图证据                                                          |
| console                | `Errors: 0, Warnings: 0`                                                                                                             | 无新增控制台错误                                                    |
| network                | `194` 个非静态请求，全部 HTTP `200`                                                                                                  | 无非静态网络失败                                                    |
| `Agent 1000` 标签      | 未观察到                                                                                                                             | 本轮截图未复现该冗余标签                                            |
| 新问题                 | Skill 补参卡暴露 `auto_analysis/context/preference` 等内部线索；Skills 搜索空态与本地命中并存；高级设置有 `Plan` 等混合英文 / 内部词 | 不阻断官方 qcloop，但应作为 Agent UI 产品化 polish / 信息泄露后续项 |

该续测只能证明当前桌面 WebView 的 Agent UI 表层可交互，不能替代官方 Evidence Pack。关闭条件仍保持：新的同批次 8/8 P0 structured qcloop Evidence Pack pass、release summary pass、completion audit complete。

### 5.2 已解决：Skill 补参卡内部参考信息外露（2026-05-10 21:10）

| 项                  | 结果                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 原问题              | Skill 补参卡向普通用户暴露 `auto_analysis/context/preference`、`fp:*`、`-32603`、`Pexels API Key` 与 task JSON |
| 修复                | `curatedTaskReferenceSelection` 在参考对象事实源归一化阶段脱敏标题、摘要和 tag                                 |
| 回归                | `CuratedTaskLauncherDialog.test.tsx` + `curatedTaskReferenceSelection.test.ts` 覆盖 UI 文本和 prompt block     |
| Playwright evidence | `.lime/qc/gui-evidence/skill-preflight-reference-sanitized-2026-05-10/summary.json`，verdict=`pass`            |
| 剩余                | 这不改变官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass                            |

该项从 Agent UI 产品化 blocker 降级为已修复回归项。后续如果要继续治理参考对象列表，还应单独处理“任务 ID”类历史成果摘要是否默认展示给普通用户的问题。

### 5.3 已解决：Skills 搜索本地命中时的全局无结果误导（2026-05-10 21:17）

| 项                  | 结果                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 原问题              | 搜索 `cover` 时右侧本地 Skills 有 `cover_generate` 等命中，但主区域仍显示“当前搜索下暂无结果模板 / Skill 分组” |
| 修复                | `SkillsWorkspacePage` 在右侧有匹配结果时改用“右侧已有可继续的 Skill / 分类暂无匹配但已找到可用 Skill”          |
| 回归                | `SkillsWorkspacePage.test.tsx` 覆盖仅命中本地 Skill 的搜索                                                     |
| Playwright evidence | `.lime/qc/gui-evidence/skills-search-local-hit-2026-05-10/summary.json`，verdict=`pass`                        |
| 剩余                | 不影响官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass                              |

该项从产品 UI/UX blocker 降级为已修复回归项。

### 5.4 已解决：高级设置 `Plan` 英文 / 内部词暴露（2026-05-10 21:28）

| 项                  | 结果                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 原问题              | Agent UI 输入区展开高级设置后显示 `Plan`，普通用户难以理解其含义                                                                  |
| 修复                | `InputbarExecutionStrategySelect` 统一改为 `计划执行`，`aria-label` / `title` 改为 `开启计划执行` / `关闭计划执行`                |
| 覆盖面              | 首页空态输入区与工作区输入区共用同一个执行策略开关                                                                                |
| 回归                | `Inputbar/index.test.tsx`、`EmptyStateComposerPanel.test.tsx`、`EmptyState.test.tsx` 覆盖用户可见中文标签和旧 `Plan` 文案不再出现 |
| Playwright evidence | `.lime/qc/gui-evidence/advanced-settings-plan-label-cn-2026-05-10/summary.json`，verdict=`pass`                                   |
| 剩余                | 不改变官方 qcloop Evidence Pack；整体 blocker 仍是 `real-qcloop-evidence` 未 pass                                                 |

该项从产品 UI/UX polish 降级为已修复回归项。

### 5.5 已复核：Design Canvas 工程保存状态当前可观察（2026-05-10 21:35）

| 项       | 结果                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 原风险   | fast-mini readonly P0 sidecar 在 `smoke:design-canvas` 的 `project-roundtrip-save-open` 阶段等待 `已保存图层设计工程` 超时  |
| 复测     | 宿主直接执行 `npm run smoke:design-canvas -- --timeout-ms 180000` 通过                                                      |
| 覆盖     | DevBridge ready、设计画布打开、图层交互、工程目录保存 / 打开、平面图拆层、质量导出 manifest                                 |
| Evidence | `.lime/qc/gui-evidence/design-canvas-project-roundtrip-current-2026-05-10/summary.json`，verdict=`pass`                     |
| 结论     | 当前 host 产品链路可用，旧 fast-mini sidecar 失败更像 qcloop worker / 并发 / 证据层问题；仍不能替代官方 full P0 qcloop pass |
| 剩余     | 整体 blocker 仍是 `real-qcloop-evidence` 未 pass，且 active GUI owner 仍 stale                                              |

该项从“需定位的产品 UI/UX 风险”降级为当前已复核通过的 sidecar 风险；后续应在单一 GUI owner 下纳入新的 full P0 qcloop 证据，而不是单独宣称发布通过。

### 5.6 已复核：Harness Replay / Eval 后端回归当前可运行（2026-05-10 21:39）

| 项         | 结果                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 原风险     | full P0 中 `harness-replay-regression` 仍 pending，无法被 stale qcloop owner 调度验证                                                         |
| 复测       | 宿主直接执行 `npm run harness:eval:json` 与 `npm run harness:eval:trend:json`，均 exit `0`                                                    |
| 当前 eval  | `suiteCount=3`、`caseCount=2`、`readyCount=2`、`invalidCount=0`、`needsHumanReviewCount=0`、`currentObservabilityGapCaseCount=0`              |
| Trend 限制 | `sampleCount=1`，只能作为 trend seed，不能判断长期退化                                                                                        |
| 历史基线   | 未发现既有 `.lime/harness/history` / `reports` 样本；已把本轮结果记录为第一条真实 baseline，并生成 summary / trend / cleanup / dashboard 报告 |
| Evidence   | `.lime/qc/backend-evidence/harness-replay-regression-current-2026-05-10/summary.json`，verdict=`pass_with_trend_seed_limit`                   |
| 剩余       | 仍需 full P0 qcloop verifier 同批次采信；当前 active GUI owner stale，不能直接启动新的 full GUI P0                                            |

该项从“pending 未调度”降级为 direct host backend sidecar pass；由于 trend 样本不足和 qcloop 未采信，仍不能关闭 `real-qcloop-evidence` blocker。

### 5.7 已复核：Approval / Sandbox live runtime transcript 当前可运行（2026-05-10 22:15）

| 项              | 结果                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原风险          | `tool-approval-sandbox-boundary` 只有 deterministic smoke 或 qcloop worker 自报 PASS，缺少真实 runtime permission request / decision transcript                                                                                                                                                                                                                                                                           |
| 初始失败        | live runtime 请求没有带 provider/model preference，导致 submit turn 没有形成权限确认 transcript；UI 侧留有 `agent-runtime-create-session-fail-2026-05-10.png`                                                                                                                                                                                                                                                             |
| 修复            | `scripts/agent-runtime/approval-sandbox-smoke.mjs` 自动解析本地 enabled provider/model，并支持显式 `--provider-preference` / `--model-preference`                                                                                                                                                                                                                                                                         |
| 复测            | `node --check scripts/agent-runtime/approval-sandbox-smoke.mjs`、`npx vitest run scripts/lib/agent-runtime-approval-sandbox-smoke-core.test.ts`、`npm run smoke:agent-runtime-approval-sandbox -- --timeout-ms 120000 --output .lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/runtime-approval-sandbox-smoke.fixed.json`、`npm run smoke:agent-runtime-tool-surface`、`npm run agent-qc:check` 均通过 |
| Live assertions | `devBridgeHealthy`、`permissionRequestCreatedBeforeModel`、`deniedDecisionClearsPendingRequest`、`resolvedDecisionClearsPendingRequest`、`approvalPolicySubmitted`、`sandboxPolicySubmitted` 均为 `true`                                                                                                                                                                                                                  |
| Evidence        | `.lime/qc/backend-evidence/approval-sandbox-live-current-2026-05-10/summary.json`，verdict=`pass`                                                                                                                                                                                                                                                                                                                         |
| 剩余            | 仍需 full P0 qcloop verifier 在同批次采信；当前 active GUI owner `1778405842243079000` 仍 stale，不能新开 full GUI P0                                                                                                                                                                                                                                                                                                     |

该项从“缺 live runtime transcript”降级为 direct-host backend sidecar pass；它不改变官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，也不关闭 `real-qcloop-evidence` 和 `local-verify-gate` 两个 completion audit 缺口。

### 5.8 当前门禁刷新（2026-05-10 22:20）

| 门禁             | 当前值                                                                       | 结论                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| completion audit | `16/18`，`status=incomplete`                                                 | 缺 `real-qcloop-evidence` 与 `local-verify-gate`                                                                                                          |
| GUI owner        | `blocked`，owner `1778405842243079000`                                       | `browser-runtime-site-adapter` stale 约 `16482s`，3 个 GUI P0 仍未终态                                                                                    |
| qcloop status    | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale                                                                                                               |
| local verify     | `verify:local` 当前 fail in `typecheck`                                      | `src/components/settings-v2/system/channels/ChannelLogTailPanel.test.tsx(129,51)` 的 `number` / `Timeout` 类型不匹配；本轮为避免 settings-v2 高冲突未修改 |

因此当前允许继续补 sidecar / 文档 / 低冲突后端证据；不允许启动新的 full GUI P0、处理中断 PID `69738`、改 qcloop DB，或把任何 sidecar pass 写成 release pass。

### 5.9 当前门禁刷新（2026-05-10 22:45）

| 门禁             | 当前值                                                                       | 结论                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| completion audit | `16/18`，`status=incomplete`                                                 | 缺 `real-qcloop-evidence` 与 `local-verify-gate`                                                                                                           |
| GUI owner        | `blocked`，owner `1778405842243079000`                                       | `browser-runtime-site-adapter` stale 约 `17692s`，3 个 GUI P0 仍未终态                                                                                     |
| qcloop status    | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale                                                                                                                |
| DB lease         | `lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-10T22:56:05+08:00`    | stale worker 仍在续约，不能新开 full GUI P0                                                                                                                |
| local verify     | `verify:local` fail in `npm test / vitest-smart batch 39/54`                 | `src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts:98` 期望缺少 `turnId`，但实现返回 `turnId`；该文件属于当前活动工作树修改，本轮未改 |

当前仍只允许只读刷新、sidecar 记录和 internal/tests runbook 同步；不允许启动新的 full GUI P0、处理中断 PID `69738`、修改 qcloop DB、覆盖官方 Evidence Pack、或执行 git commit / push / tag / release。

### 5.10 当前门禁刷新（2026-05-10 23:40）

| 门禁             | 当前值                                                                       | 结论                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| completion audit | `16/18`，`status=incomplete`                                                 | 当前 audit 仍读取旧 `verify-local-current.json`，缺 `real-qcloop-evidence` 与 `local-verify-gate`                                    |
| GUI owner        | `blocked`，owner `1778405842243079000`                                       | `browser-runtime-site-adapter` stale 约 `20265s`，仍不能新开 full GUI P0                                                             |
| qcloop status    | `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 为 `verdict=stale` | 4 success / 1 running / 3 pending / 1 stale                                                                                          |
| local verify     | 新一轮 `verify:local` 仍在运行                                               | 已过前端 / contracts / Rust 主库 / GUI smoke 前半段，当前卡在 `smoke:agent-service-skill-entry` 的 Rust 定向测试编译；未判 pass/fail |
| running evidence | `.lime/qc/verify-local-2026-05-10-2340-running.md`                           | 只读记录当前进程与日志，不覆盖最终 gate                                                                                              |

当前仍只允许只读刷新、sidecar 记录和必要文档同步；不允许启动新的 full GUI P0、处理中断 PID `69738`、修改 qcloop DB、覆盖官方 Evidence Pack、或执行 git commit / push / tag / release。

### 5.11 当前门禁刷新（2026-05-10 23:50）

| 门禁         | 当前值                                                | 结论                                                                                                                                           |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| local verify | 仍在运行                                              | 第一条 Skill Forge Rust 定向测试已通过，第二条 `registered_skill_becomes_ready_for_manual_enable_binding_candidate` 正等待 Cargo artifact lock |
| lock context | 并发 Cargo 工作仍活跃                                 | 观察到 workspace locked test / cargo check / GUI smoke cargo run 等进程；本轮不终止任何进程                                                    |
| evidence     | `.lime/qc/verify-local-2026-05-10-2350-cargo-lock.md` | 只读记录，不覆盖最终 `verify-local-current.json`                                                                                               |

该状态不能关闭 `local-verify-gate`，但也不再等同于 22:39 的 Vitest 失败；最终口径以当前 wrapper 自然结束后写出的 `.lime/qc/verify-local-current.json` 为准。

### 5.12 当前门禁刷新（2026-05-10 23:56）

| 门禁             | 当前值                                                                                                                                                                    | 结论                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| completion audit | `16/18`，`status=incomplete`                                                                                                                                              | 缺 `real-qcloop-evidence` 与 `local-verify-gate`                                                                                     |
| local verify     | exit `124`                                                                                                                                                                | 失败在 `verify:gui-smoke / smoke:agent-service-skill-entry`，第二条 Skill Forge Rust 定向测试等待 lock 后编译但超过 `1830000ms` 超时 |
| 已通过局部       | app-version / lint / typecheck / frontend tests / contracts / Rust 主库 / workspace-ready / browser-runtime / site-adapters / Skill Forge frontend / 第一条 Rust 定向测试 | 说明 22:39 的 Vitest 失败已不是当前 active run 的失败点                                                                              |
| qcloop status    | `verdict=stale`                                                                                                                                                           | 4 success / 1 running / 3 pending / 1 stale                                                                                          |
| GUI owner        | `blocked`                                                                                                                                                                 | stale owner `1778405842243079000`，约 `20878s`                                                                                       |
| evidence         | `.lime/qc/verify-local-2026-05-10-2355-gui-smoke-timeout.md`、`.lime/qc/completion-audit-2026-05-10-2356.json`                                                            | 当前仍不可发布                                                                                                                       |

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

| 项                    | 当前结论                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| provider/model 解析   | 已解除；默认 smoke 自动选中 `deepseek / deepseek-v4-flash`             |
| first streamed delta  | 未闭环；默认 run 等待首个流式文本与停止按钮超时                        |
| evidence completeness | 已补脚本；失败路径后续会写 console/network/runtime/session/thread 证据 |
| release gate          | 仍阻断；不能把 GUI 主路径标记为可交付                                  |

本轮只修复 smoke 脚本的证据采集和空快照健壮性，没有重跑完整 GUI smoke；原因是仍有其他 Lime / Cargo / qcloop 进程在运行，且用户明确要求不要推送、不要干预其他进程。关闭条件是：在无并发 GUI owner 阻断的环境下，重跑 `npm run verify:gui-smoke -- --reuse-running` 或等价 qcloop P0 item，取得 `claw-chat-ready-streaming` 的 pass summary，并包含 runtime transcript、interrupt scope、恢复 turn、console/network 摘要。

### 2026-05-11 00:25 更新：Claw streaming 在显式 Sensenova provider 下通过

00:20 记录的默认 deepseek 首增量失败之后，另一个已经运行中的 `verify:gui-smoke` 使用显式 `custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed / sensenova-6.7-flash-lite` 自然完成并通过。本轮只是观察和记录，没有启动、停止或重启该流程。

证据：

- `.lime/qc/verify-gui-smoke-current.json`
- `.lime/qc/verify-gui-smoke-2026-05-11-0025-sensenova-pass.md`
- `.lime/qc/verify-gui-smoke-reuse-sensenova-2026-05-11-0020.log`
- `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json`

当前分类调整：

| 项                               | 当前结论                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Claw streaming smoke             | 在显式 Sensenova provider 下已通过，包含流式、停止、中断、恢复和 runtime transcript 证据     |
| 默认 provider path               | 仍有 default deepseek run 的失败历史，后续需要决定发布门禁默认 provider 是否也必须通过       |
| `local-verify-gate`              | 仍未关闭；完整 `npm run verify:local` sidecar 仍为 fail                                      |
| qcloop official P0 Evidence Pack | 仍未关闭；官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，且 stale qcloop GUI owner 未释放 |

因此，本条从“当前 GUI smoke blocker”降级为“provider 口径 / full local verify 未闭环”缺口；它不能替代完整 `verify:local` 和真实 8/8 P0 qcloop Evidence Pack。

### 5.13 当前门禁刷新（2026-05-11 01:57）

| 门禁                                      | 当前值                                                                                | 结论                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| completion audit                          | `16/18`，`status=incomplete`                                                          | `release-hard-gate` 已恢复 PASS；缺口只剩 `real-qcloop-evidence` 与 `local-verify-gate`              |
| release workflow                          | 缺 Evidence Pack 时 `exit 1`，存在 evidence 时强制 `agent-qc-release-summary --check` | 已去除 release workflow 的 `--allow-missing-evidence` 发布预览分支                                   |
| release summary against official evidence | exit `1`                                                                              | 当前官方 `.lime/qc/agent-qc-evidence.json` 仍为 fail，发布被正确阻断                                 |
| qcloop status                             | `verdict=stale`                                                                       | job `1778405842243079000` 为 `4 success / 1 running / 3 pending / 1 stale`                           |
| GUI owner                                 | `blocked`                                                                             | stale owner 最长约 `29474s`；仍需 owner 明确确认或自然释放                                           |
| DB lease                                  | `status=running`                                                                      | active item `browser-runtime-site-adapter`，PID `69738`，`lock_expires_at=2026-05-11T02:11:06+08:00` |
| raw process owner                         | `busy`                                                                                | activeGuiSmoke=`2`、cargoOrRust=`4`、qcloopRelated=`7`；本轮不跑完整 `verify:local`                  |
| `.lime/qc` secret scan                    | `pass`                                                                                | `fileCount=315`、`findingCount=0`                                                                    |

当前允许继续：只读刷新 qcloop / GUI owner / DB lease / process owner sidecar，维护 internal/tests 和 Agent QC 脚本的小范围逻辑，运行轻量 `agent-qc:*` 与定向 Vitest。当前不允许：处理中断 PID `69738`、修改 qcloop DB、启动新的 full GUI P0、覆盖官方 Evidence Pack、执行 git commit / push / tag / release，或在 raw process owner 仍 busy 时运行完整 `npm run verify:local`。

### 5.14 目标级审计刷新（2026-05-11 02:02）

| 门禁                       | 当前值           | 结论                                                                                                             |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| objective completion audit | `achieved=false` | `.lime/qc/objective-completion-audit-current.json` 明确失败项为 `real-p0-qcloop-evidence` 与 `local-verify-gate` |
| qcloop status              | `verdict=stale`  | job `1778405842243079000` 仍 `4 success / 1 running / 3 pending / 1 stale`                                       |
| GUI owner                  | `blocked`        | stale owner 最长约 `29693s`                                                                                      |
| DB lease                   | `status=running` | `browser-runtime-site-adapter` active attempt 仍无 stdout/stderr，`lock_expires_at=2026-05-11T02:14:06+08:00`    |
| raw process owner          | `busy`           | activeGuiSmoke=`2`、cargoOrRust=`4`、qcloopRelated=`7`                                                           |
| 通用标准口径               | 已补强           | `agent-ops-qc.md` 与 `ai-agent-testing-guide.md` 不再以 Lime 作为标准标题；Lime 样本仍在 `lime-*` 文档中         |

当前整体仍不可标记 complete；下一步仍是等待 owner / process 自然释放，或获得明确 owner 确认后处理 stale worker，然后再跑完整 `verify:local` 与单 owner full P0 qcloop。

### 5.15 GitHub Actions 解耦口径（2026-05-11 02:05）

| 门禁                       | 当前值                                     | 结论                                                                                                                       |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| completion audit           | `15/17`，`status=incomplete`               | 新口径移除 release/nightly hard gate 项，新增 `github-actions-detached` 且已 PASS                                          |
| GitHub release workflow    | 不再执行 Agent QC                          | `.github/workflows/release.yml` 只创建 / 刷新 GitHub Release                                                               |
| harness nightly            | 不再上传 `artifacts/agent-qc/*`            | `.github/workflows/harness-nightly.yml` 只保留 harness eval artifacts                                                      |
| `test:contracts`           | 不再串 `agent-qc:check`                    | Agent QC 校验改为显式本地入口                                                                                              |
| release summary 本地 gate  | exit `1` against current official evidence | 当前 fail Evidence Pack 仍被 `agent-qc:release-summary --check` 阻断                                                       |
| objective completion audit | `achieved=false`                           | `.lime/qc/objective-completion-audit-current.json` schema `v3` 失败项仍为 `real-p0-qcloop-evidence` 与 `local-verify-gate` |

该口径不改变核心发布事实：没有真实 8/8 P0 qcloop pass 和完整 `verify:local` pass 时，仍不能把当前状态标记为整体完成，也不能覆盖官方 `.lime/qc/agent-qc-evidence.json`。

### 5.16 当前门禁刷新与 stale owner 收口（2026-05-11 02:42）

本轮只执行只读 / sidecar 取证与低冲突脚本修正；未执行 git commit / push / tag / release，未修改 qcloop SQLite DB，未覆盖官方 `.lime/qc/agent-qc-evidence.json`，也未启动新的 full GUI P0 或完整 `verify:local`。

| 门禁                                      | 当前值                                                                                 | 结论                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| isolated full P0 v1 `1778405842243079000` | `failed`，5 success / 3 exhausted                                                      | 旧 stale owner 已自然进入终态；该批次不能作为发布 pass                 |
| GUI owner gate                            | `pass`，ownerCount=`0`                                                                 | qcloop GUI owner 已释放，可以作为后续新批次的必要条件之一              |
| raw process owner                         | `busy`，activeGuiSmoke=`3`、cargoOrRust=`5`、qcloopRelated=`6`                         | 仍不应启动完整 `verify:local` 或新的 full GUI P0                       |
| sidecar Evidence Pack                     | `.lime/qc/agent-qc-evidence.isolated-p0-full-v1-after-intervention.json` status=`fail` | 只作为失败证据；不覆盖官方 Evidence Pack                               |
| sidecar release summary                   | `exit 1` / status=`fail`                                                               | `agent-qc:release-summary --check` 正确拒绝该 sidecar 作为绿色发布证据 |
| completion audit                          | `15/17`，`status=incomplete`                                                           | 当前只剩 `real-qcloop-evidence` 与 `local-verify-gate` 两个目标级缺口  |

本轮还修正了 completion audit 的 sidecar 归并口径：同一个 qcloop job 存在更新的终态 status sidecar 时，旧的 `pre-intervention` / stale snapshot 不再被误判为“仍有未终态 owner”。该修正只消除历史 sidecar 噪声，不会放宽真正的发布门禁；官方 Evidence Pack 仍必须是真实 `8/8` P0 pass，完整 `verify:local` 仍必须 pass。

本轮验证：

```bash
node --check scripts/agent-qc/completion-audit.mjs
npx vitest run scripts/lib/agent-qc-completion-audit-core.test.ts
npm run agent-qc:audit -- --format json --output ./.lime/qc/objective-completion-audit-current.json
npm run agent-qc:release-summary -- --evidence ./.lime/qc/agent-qc-evidence.isolated-p0-full-v1-after-intervention.json --require-scenario-manifest internal/test/agent-qc-scenarios.manifest.json --require-risk P0 --tag sidecar-isolated-p0-full-v1-after-intervention --check
```

下一刀仍不应直接重跑重型门禁；应先等 raw process owner 释放，再按顺序执行 `agent-qc:process-owner-check -- --check`、`agent-qc:gui-owner-check -- --check`、完整 `npm run verify:local`，最后再启动单 owner full P0 qcloop 并导出真实官方 Evidence Pack。

### 5.17 raw process owner 精确化（2026-05-11 02:47）

`agent-qc:process-owner-check` 已从粗粒度进程计数改为区分 active owner、passive runtime 和 observer：

| 分类                      | 当前值 | 含义                                                                     |
| ------------------------- | ------ | ------------------------------------------------------------------------ |
| active GUI smoke          | `1`    | 只有 PID `59011` 的 `npm run smoke:design-canvas ...` 仍是重型 GUI owner |
| stale active GUI smoke    | `1`    | PID `59011` 已运行约 `7h`，超过默认 `30min` stale 阈值                   |
| active qcloop worker      | `0`    | 旧 qcloop serve 进程被归为 passive server，不再误判为 active worker      |
| active Cargo / Rust build | `0`    | desktop runtime 被归为 passive runtime，不再误判为 Cargo build owner     |
| passive qcloop server     | `6`    | 仅说明历史隔离 server 仍在，不代表 active P0 worker                      |
| passive desktop runtime   | `4`    | 仅说明 Electron dev host / legacy Tauri runtime 仍在，不代表正在编译     |
| observer process          | `2`    | 只读 `ps` / `rg` watcher，不再计入阻断 owner                             |

最新 sidecar：`.lime/qc/gui-process-owner-current.json` / `.md`。当前 `ownerIntervention.status=requires_owner_confirmation`，确认文本为：

```text
确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。
```

确认前仍不执行 kill / pause / interrupt，也不启动完整 `verify:local` 或新的 full GUI P0。该修正只消除 idle qcloop serve、passive desktop runtime 和观察脚本的误报；真实阻断仍是 stale `smoke:design-canvas` owner。

### 5.18 stale raw GUI owner 处置请求（2026-05-11 02:51）

再次只读刷新确认 PID `59011` 仍存活，`etime=07:04:53`，仍是唯一 active raw GUI smoke owner。已生成处置请求 sidecar：

- `.lime/qc/stale-raw-gui-owner-intervention-request.json`
- `.lime/qc/stale-raw-gui-owner-intervention-request.md`

该请求只用于 owner 决策，不代表授权。确认文本仍为：

```text
确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。
```

确认前继续保持：不 kill / pause / interrupt PID `59011`，不启动完整 `verify:local`，不启动新的 full GUI P0，不覆盖官方 Evidence Pack，不执行 git commit / push / tag / release。

### 5.19 process owner 分类核心回归（2026-05-11 02:55）

为避免 raw process owner gate 后续再次把 passive runtime / observer 误判成 active blocker，本轮把分类逻辑抽到 `scripts/lib/agent-qc-process-owner-core.mjs`，并新增 `scripts/lib/agent-qc-process-owner-core.test.ts`。当前验证：

```bash
node --check scripts/lib/agent-qc-process-owner-core.mjs
node --check scripts/agent-qc/process-owner-check.mjs
npx vitest run scripts/lib/agent-qc-process-owner-core.test.ts scripts/lib/agent-qc-completion-audit-core.test.ts
```

结果：`21 tests` 全部通过。最新 `agent-qc:process-owner-check --check` 仍按预期失败：`activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`staleActiveGuiSmoke=1`、`passiveQcloopServer=6`、`passiveDesktopRuntime=4`、`observer=2`。因此门禁没有被放宽，仍卡在 PID `59011` 的 stale `smoke:design-canvas`。

### 5.20 objective checklist sidecar（2026-05-11 02:59）

新增目标级 checklist sidecar：

- `.lime/qc/objective-completion-checklist-current.json`
- `.lime/qc/objective-completion-checklist-current.md`

该 checklist 把显式目标映射到文档、manifest、schema、qcloop 工具、owner gate、官方 Evidence Pack、`verify:local` 和 git guardrail。当前状态仍为 `incomplete`，`4/7` pass；阻断项为 raw process owner busy、官方 Evidence Pack 非 pass、`verify:local` 非 pass。短暂观察到的外部 `verify:gui-smoke` transient owner 已自然结束，最新 raw process owner 又收敛为唯一 active blocker：PID `59011` 的 stale `smoke:design-canvas`。

### 5.21 raw process owner watch history（2026-05-11 03:01）

`agent-qc:process-owner-check` 新增 `--watch-history-output`，已追加 `.lime/qc/raw-process-owner-watch-history.jsonl`。最新记录：`status=busy`，`activeGuiSmoke=1`，`staleActiveGuiSmoke=1`，`ownerIntervention=requires_owner_confirmation`，PID `59011` 运行约 `7h16m`。该 JSONL 只记录观察，不授权处理进程。

### 5.22 objective checklist 脚本化（2026-05-11 03:04）

新增 `scripts/agent-qc/objective-checklist.mjs` 与 npm 入口 `agent-qc:objective-checklist`，把目标级 checklist 从一次性 sidecar 生成逻辑固化为可重复门禁。当前命令：

```bash
npm run agent-qc:objective-checklist -- --format json --output ./.lime/qc/objective-completion-checklist-current.json
npm run agent-qc:objective-checklist -- --format markdown --output ./.lime/qc/objective-completion-checklist-current.md
npm run agent-qc:objective-checklist -- --check
```

前两条已生成当前 sidecar；`--check` 按预期 exit `1`，因为 checklist 仍为 `incomplete`（`4/7`）。这不会放宽门禁，只把“目标是否完成”的判断变成可重复脚本。

### 5.23 objective checklist core 回归（2026-05-11 03:07）

`agent-qc:objective-checklist` 已抽出 `scripts/lib/agent-qc-objective-checklist-core.mjs`，并新增 `scripts/lib/agent-qc-objective-checklist-core.test.ts`。回归覆盖：owner clear 时 checklist 可 complete、raw process owner busy 时保持 `pass_with_blocking_owner`、官方 Evidence Pack / `verify:local` fail 时列为 blocker、Markdown 渲染。该轮同时修正了 owner gate 已 pass 时 checklist 可能误判的边界。最新定向测试：

```bash
npx vitest run scripts/lib/agent-qc-objective-checklist-core.test.ts scripts/lib/agent-qc-process-owner-core.test.ts scripts/lib/agent-qc-completion-audit-core.test.ts
```

结果：`25 tests` 全部通过。当前实际 checklist 仍为 `incomplete`，`4/7`。

### 5.24 raw GUI owner post-confirmation runbook（2026-05-11 03:09）

`internal/tests/lime-agent-qc-stale-owner-intervention.md` 新增第 8 节，专门覆盖 `gui-owner-check` 已通过但 `process-owner-check` 仍因 raw GUI smoke stale 的场景。该 runbook 明确：确认前不处理进程；确认后只处理 owner 明确确认的 PID / PGID；不得顺手清理 passive qcloop serve、passive desktop runtime 或 observer shell；处理后必须先通过 `agent-qc:process-owner-check -- --check` 与 `agent-qc:gui-owner-check -- --check`，再跑完整 `verify:local`。

### 5.25 local verify gate 已关闭（2026-05-11 03:11）

外部完整门禁已把 `.lime/qc/verify-local-current.json` 与 `.lime/qc/verify-gui-smoke-current.json` 刷新为 `status=pass`。重新运行 `agent-qc:audit` 后，completion audit 从 `15/17` 提升为 `16/17`，剩余目标级缺口只剩 `real-qcloop-evidence`。Objective checklist 从 `4/7` 提升为 `5/7`，其中 `verify:local` 已 PASS。

当前仍不能启动新的 full P0 qcloop，因为 raw process owner 仍为 `busy`：PID `59011` 的 stale `smoke:design-canvas` 仍存活，`ownerIntervention=requires_owner_confirmation`。因此下一刀不是重跑 `verify:local`，而是等待或获得明确确认后处理 PID `59011`，再启动 single-owner full P0 qcloop 并导出真实 8/8 P0 official Evidence Pack。

### 5.26 隔离 P0 full v2 终态失败（2026-05-11 03:50）

观察到本地已有隔离 P0 full v2 批次 `1778440541478632000`（`lime-agent-qc-isolated-p0-full-v2-2026-05-11-0315`）运行在 `127.0.0.1:18086`。本轮只做只读监控、sidecar 导出和 release gate 校验；未覆盖官方 `.lime/qc/agent-qc-evidence.json`，未执行 git commit / push / tag / release。

| 门禁                    | 当前值                                                                                         | 结论                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| qcloop status           | `failed`，3 success / 5 exhausted                                                              | 批次无 stale，但仍不能发布                                                                        |
| sidecar Evidence Pack   | `.lime/qc/agent-qc-evidence.isolated-p0-full-v2-2026-05-11-0315.json` status=`fail`            | 2 pass / 4 fail / 2 blocked                                                                       |
| sidecar release summary | `.lime/qc/release-agent-qc.sidecar-isolated-p0-full-v2-2026-05-11-0315.md`，`--check` exit `1` | release gate 正确拒绝                                                                             |
| direct contracts sanity | `npm run test:contracts` pass                                                                  | 当前工作树的命令契约已恢复；v2 中 `command-bridge-contract` 失败是历史运行时证据，不可改写为 pass |
| raw process owner       | `busy`                                                                                         | PID `59011` 的 stale `smoke:design-canvas` 仍阻断新 full P0                                       |

v2 的主要失败分类：

| 场景                               | sidecar 状态 | 主要原因                                                                                                                                   |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `command-bridge-contract`          | `fail`       | worker 运行当时 `test:contracts` 命中 `execution_run_get_general_workbench_state` mock drift；后续 direct sanity 已通过，但不回写历史 item |
| `claw-chat-ready-streaming`        | `fail`       | 长 turn 在首个流式增量前 completed，未完整证明中断与恢复                                                                                   |
| `skill-forge-register-bind-enable` | `fail`       | `test:contracts` 在该 worker 中失败，Skill P0 不能判通过                                                                                   |
| `browser-runtime-site-adapter`     | `blocked`    | 缺 `gui-trace` 与干净 GUI session isolation                                                                                                |
| `workspace-ready-session-restore`  | `blocked`    | active GUI owner 阻断核心命令执行 / isolation statement                                                                                    |
| `release-package-startup-smoke`    | `fail`       | `verify:gui-smoke` exit `1`，release startup smoke 未闭环                                                                                  |

### 5.27 隔离 P0 full v3 终态失败但无 stale（2026-05-11 04:24）

随后观察到隔离 P0 full v3 批次 `1778442773271496000`（`lime-agent-qc-isolated-p0-full-v3-2026-05-11-0354`）运行在 `127.0.0.1:18087`。该批次修正了 worker 内 GUI session owner / isolation 口径，避免 worker 把同批次 GUI owner 误判为外部抢占；本轮仍只做只读监控和 sidecar 导出。

| 门禁                    | 当前值                                                                                         | 结论                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| qcloop status           | `failed`，4 success / 4 exhausted                                                              | 批次已终态，无 running / pending / stale；仍不能发布                        |
| sidecar Evidence Pack   | `.lime/qc/agent-qc-evidence.isolated-p0-full-v3-2026-05-11-0354.json` status=`fail`            | 4 pass / 1 fail / 3 blocked                                                 |
| sidecar release summary | `.lime/qc/release-agent-qc.sidecar-isolated-p0-full-v3-2026-05-11-0354.md`，`--check` exit `1` | release gate 正确拒绝                                                       |
| completion audit        | `16/17`，`status=incomplete`                                                                   | 只剩 `real-qcloop-evidence`                                                 |
| objective checklist     | `5/7`，`status=incomplete`                                                                     | raw process owner busy + official Evidence Pack fail                        |
| raw process owner       | `busy`，activeGuiSmoke=`1`、cargoOrRust 波动中、qcloopRelated=`0`                              | PID `59011` 仍是 stale GUI owner；同时有外部 Rust 定向测试 / rustc 编译在跑 |

v3 的通过项和剩余缺口：

| 场景                               | sidecar 状态 | 说明                                                                                                                            |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `command-bridge-contract`          | `pass`       | 当前 qcloop worker 与 verifier 均通过                                                                                           |
| `claw-chat-ready-streaming`        | `pass`       | qcloop worker / verifier 接受 GUI、DevBridge、runtime transcript 证据                                                           |
| `tool-approval-sandbox-boundary`   | `pass`       | qcloop worker / verifier 通过                                                                                                   |
| `harness-replay-regression`        | `pass`       | qcloop worker / verifier 通过                                                                                                   |
| `skill-forge-register-bind-enable` | `fail`       | verifier 认为只覆盖 deterministic smoke，未证明 runtime-transcript / readiness / metadata / explicit enable / SkillTool gate    |
| `browser-runtime-site-adapter`     | `blocked`    | deterministic smoke 有证据，但缺 `gui-trace`，并命中 parallel GUI smoke interference                                            |
| `workspace-ready-session-restore`  | `blocked`    | workspace 与 GUI smoke 命令成功，但 `GUI session owner / isolation statement` 因非本 job stale owner PID `59011` 被标为 blocked |
| `release-package-startup-smoke`    | `blocked`    | `verify:app-version` 与 `verify:gui-smoke` 成功，但缺 release-artifact 层，且 GUI isolation 被 PID `59011` 阻断                 |

当前不能把 v3 sidecar 升格为官方发布证据。关闭条件仍是：PID `59011` 自然释放，或 owner 明确确认处理 stale raw GUI owner 后，重新执行 single-owner full P0，并得到官方 `.lime/qc/agent-qc-evidence.json` 的真实 8/8 P0 pass。

### 5.28 Skill Forge P0 定向 smoke 补证（2026-05-11 04:31）

v3 中 `skill-forge-register-bind-enable` 的失败不是 GUI owner 阻断，而是 `smoke:agent-service-skill-entry` 当时的 Rust exact filter 没有实际运行关键后端测试：日志显示多个 `running 0 tests`，导致 verifier 正确拒绝把 deterministic smoke 升格为 runtime / SkillTool gate 证据。

随后观察到当前工作树中的 `scripts/agent-runtime/service-skill-entry-smoke.mjs` 已改为：

- 为 root Tauri 测试显式使用 `-p lime`
- 为 `lime-agent` SkillTool gate 测试显式使用 `-p lime-agent`
- 使用完整 Rust test path 与 `--exact`
- 捕获 stdout/stderr 并拒绝没有 `N passed` 的 Rust 定向测试，避免 `running 0 tests` 被误判为通过

定向证据：

| 证据                                                                                | 状态   | 说明                                                                     |
| ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `.lime/qc/smoke-agent-service-skill-entry-after-rust-exact-fix-2026-05-11-0430.log` | `pass` | 当前 `smoke:agent-service-skill-entry` 已通过                            |
| Rust exact tests                                                                    | `pass` | 日志中关键 root / `lime-agent` 测试均出现 `running 1 test` 与 `1 passed` |
| 服务技能入口路由回归                                                                | `pass` | 4 个 Vitest 文件、66 tests pass                                          |
| Agent A2UI 挂起主链                                                                 | `pass` | 1 个 Vitest 文件，6 tests pass / 102 skipped                             |

该补证只说明 v3 的 Skill Forge 失败已有可复核的修复方向，不能回写 v3 sidecar，也不能替代新的 full P0。后续仍必须在 raw process owner 清空后重新运行 single-owner full P0，让 `skill-forge-register-bind-enable` 在 qcloop worker / verifier 内重新通过。

### 5.29 raw process owner 回到单一 PID 阻断（2026-05-11 04:32）

最新 `agent-qc:process-owner-check` sidecar 显示外部 Rust/Cargo owner 已自然清空：`activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`staleActiveGuiSmoke=1`。唯一 active blocker 仍是 PID `59011` 的 stale `smoke:design-canvas`，`etime≈8h46m`。

该状态说明下一轮 full P0 的唯一环境前置阻断已经收敛为 raw GUI owner；确认前仍不得处理 PID `59011`，也不得启动新的 full GUI P0 或覆盖官方 Evidence Pack。

### 5.30 Skill Forge 单项 qcloop 补证终态（2026-05-11 04:39）

观察到单项 qcloop job `1778445171616868000`（`lime-agent-qc-skill-forge-rust-exact-fix-2026-05-11-0432`）运行在 `127.0.0.1:18087` 并进入终态 `failed`，`0 success / 1 exhausted / 0 stale`。该批次只覆盖 `skill-forge-register-bind-enable`，不是 full P0，也不能覆盖官方 Evidence Pack。

| 证据                                                              | 状态     | 说明                                                       |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `.lime/qc/qcloop-status.skill-forge-rust-exact-fix-current.json`  | `failed` | 单项 job 已终态，无 stale                                  |
| `.lime/qc/agent-qc-evidence.skill-forge-rust-exact-fix.json`      | `fail`   | deterministic smoke 证据充分，但 runtime-transcript 层仍缺 |
| `.lime/qc/release-agent-qc.sidecar-skill-forge-rust-exact-fix.md` | `fail`   | release summary 正确拒绝单项 sidecar 作为 full P0 发布证据 |

这次补证把 `skill-forge-register-bind-enable` 的缺口从“Rust exact tests 没实际运行”推进为更准确的 P0 缺口：

- `npm run test:contracts` 与 `npm run smoke:agent-service-skill-entry` 在 qcloop worker 内已能产出可审查 deterministic-smoke 证据
- capability draft、registration、runtime binding readiness、metadata、显式 enable、SkillTool gate 的 deterministic evidence 已被 verifier 接受
- 仍缺 live runtime transcript：未产出 submit / stream / tool-request / decision / result 级 artifact

因此下一刀不是再修 Rust exact filter，而是补 `skill-forge-register-bind-enable` 的 runtime transcript 采集路径；在该 artifact 存在前，P0 verifier 不应把 Skill Forge 场景判为 pass。

### 5.31 Skill Forge runtime transcript sidecar 已出现，但不能回写历史 job（2026-05-11 04:44）

继续只读复核后，`agent-qc:process-owner-check` 已回到单一 active blocker：

| 检查                   | 当前值 | 结论                                                      |
| ---------------------- | ------ | --------------------------------------------------------- |
| raw process owner      | `busy` | 仍不能启动完整 `verify:local` 或新的 full GUI P0          |
| active GUI smoke       | `1`    | PID `59011` 的 stale `smoke:design-canvas`，`etime≈8h58m` |
| qcloop worker          | `0`    | 单项 Skill Forge qcloop worker 已自然结束                 |
| Cargo / Rust owner     | `0`    | 外部编译 owner 已自然清空                                 |
| official Evidence Pack | `fail` | `.lime/qc/agent-qc-evidence.json` 仍不能发布              |

同时观察到 `.lime/qc/skill-forge-runtime-transcript-current.json` 已生成：

```text
schemaVersion=v1
scenarioId=skill-forge-register-bind-enable
result=pass
evidenceLayersCovered=deterministic-smoke,runtime-transcript
runtimeTranscript.events=8
```

这把 Skill Forge 的剩余缺口进一步收窄：runtime transcript sidecar 已存在，但它是在单项 qcloop job `1778445171616868000` 失败后生成的，不能回写历史 qcloop verdict，也不能覆盖官方 full P0 Evidence Pack。下一轮 owner 清空后，应先重跑 `skill-forge-register-bind-enable` 单项 qcloop，确认 worker / verifier 会采信该 artifact 或重新生成同等 artifact；然后再进入 8/8 single-owner full P0。

当前仍禁止：

- 终止 / pause / interrupt PID `59011`，除非 owner 明确确认 `确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。`
- 启动新的 full GUI P0。
- 覆盖 `.lime/qc/agent-qc-evidence.json`。
- git commit / push / tag / release。

### 5.32 Skill Forge runtime transcript 单项 qcloop 通过（2026-05-11 04:48）

继续只读观察后，发现第二个单项 qcloop job `1778445676473687000`（`lime-agent-qc-skill-forge-runtime-transcript-2026-05-11-0441`）已在 `127.0.0.1:18087` 终态 `completed`，`1 success / 0 fail / 0 stale`。本轮只导出 sidecar，并运行 release summary 检查；未覆盖官方 Evidence Pack。

| 证据                                                                  | 状态       | 说明                                               |
| --------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| `.lime/qc/qcloop-status.skill-forge-runtime-transcript-current.json`  | `complete` | `skill-forge-register-bind-enable` 单项 success    |
| `.lime/qc/agent-qc-evidence.skill-forge-runtime-transcript.json`      | `pass`     | 只覆盖 `skill-forge-register-bind-enable` 1 个场景 |
| `.lime/qc/release-agent-qc.sidecar-skill-forge-runtime-transcript.md` | `fail`     | 缺少其余 7 个 P0 场景，release gate 正确拒绝       |

这说明 `skill-forge-register-bind-enable` 的 runtime-transcript 层已能被 qcloop worker / verifier 采信；该缺口从“需要补 transcript artifact”推进为“需要在下一轮 full P0 同批次重新覆盖”。它仍不能关闭官方发布门禁，因为官方 `.lime/qc/agent-qc-evidence.json` 仍是旧的 8/8 `fail`，且当前 raw process owner 仍被 PID `59011` 阻断。

### 5.33 stale raw GUI owner 处置请求已刷新（2026-05-11 04:52）

最新只读刷新显示，`agent-qc:gui-owner-check -- --check` 仍为 pass，但 raw process owner 仍为 busy：

| 检查               | 当前值                        | 结论                                      |
| ------------------ | ----------------------------- | ----------------------------------------- |
| active GUI smoke   | `1`                           | PID `59011`                               |
| runtime            | `09:06:20` / `32780s`         | 远超 `--timeout-ms 600000` 对应的 10 分钟 |
| qcloop worker      | `0`                           | 没有新的 active qcloop worker             |
| Cargo / Rust owner | `0`                           | 没有 active 编译 owner                    |
| owner intervention | `requires_owner_confirmation` | 仍需要 owner 明确确认才能处理 PID         |

已刷新：

- `.lime/qc/gui-process-owner-current.json`
- `.lime/qc/gui-process-owner-current.md`
- `.lime/qc/raw-process-owner-watch-history.jsonl`
- `.lime/qc/stale-raw-gui-owner-intervention-request.json`
- `.lime/qc/stale-raw-gui-owner-intervention-request.md`

确认文本仍是：

```text
确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。
```

在该确认出现前，当前 Agent 只能继续只读观察或维护文档 / sidecar；不得处理进程、不得启动 full GUI P0、不得覆盖官方 Evidence Pack。

### 5.34 single-owner full P0 待执行 payload 已生成但未启动（2026-05-11 04:54）

在不启动新 qcloop job 的前提下，已生成下一轮 full P0 待执行 payload：

| 产物                                                         | 状态         | 说明                                          |
| ------------------------------------------------------------ | ------------ | --------------------------------------------- |
| `.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.json` | `valid=true` | 覆盖 8 个 P0 scenario                         |
| `.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.md`   | ready note   | 记录 scenario IDs、启动前置门禁和当前 blocker |
| qcloop job                                                   | not started  | 没有提交到 qcloop server，没有抢占 GUI        |

payload 覆盖：

```text
command-bridge-contract
claw-chat-ready-streaming
tool-approval-sandbox-boundary
skill-forge-register-bind-enable
browser-runtime-site-adapter
workspace-ready-session-restore
harness-replay-regression
release-package-startup-smoke
```

启动前置仍是：

```bash
npm run agent-qc:process-owner-check -- --check
npm run agent-qc:gui-owner-check -- --check
npm run agent-qc:qcloop-preflight -- --require-devbridge --check
```

当前 PID `59011` 未释放，所以该 payload 只能作为 ready-to-run artifact，不能启动，也不能用于覆盖官方 Evidence Pack。

### 5.35 full P0 payload coverage 已校验（2026-05-11 04:55）

已新增 coverage sidecar：

- `.lime/qc/qcloop-p0-single-owner-ready-coverage-2026-05-11-0455.json`
- `.lime/qc/qcloop-p0-single-owner-ready-coverage-2026-05-11-0455.md`

校验结果：

| 检查                   | 当前值    |
| ---------------------- | --------- |
| status                 | `blocked` |
| manifest P0 count      | `8`       |
| payload item count     | `8`       |
| missing scenarios      | `none`    |
| extra scenarios        | `none`    |
| order matches manifest | `true`    |
| payload validation     | `true`    |

这证明待执行 payload 与 `internal/test/agent-qc-scenarios.manifest.json` 的 P0 场景完全一致。`status=blocked` 只来自 owner gate：PID `59011` 仍未释放。该 coverage 不是执行证据，不改变官方 Evidence Pack 状态。

### 5.36 owner 清空后的 full P0 runbook 已准备（2026-05-11 04:57）

已新增 post-owner-clear runbook：

- `.lime/qc/post-owner-clear-full-p0-runbook-2026-05-11-0457.md`
- `.lime/qc/qcloop-p0-single-owner-ready-submit-curl-2026-05-11-0457.txt`

该 runbook 只记录 owner 清空后的执行顺序，不提交 job。核心顺序：

1. `agent-qc:process-owner-check -- --check`
2. `agent-qc:gui-owner-check -- --check`
3. `agent-qc:qcloop-preflight -- --require-devbridge --check`
4. 使用 ready payload 提交单一 qcloop server / DB / port 的 full P0 job。
5. 只在 qcloop 8/8 P0 success 后覆盖官方 `.lime/qc/agent-qc-evidence.json`。
6. 再执行 release summary、completion audit 和 objective checklist。

生成时 guardrails 仍为：未启动 job、未覆盖官方 Evidence、未改 DB、未处理 PID、未执行 git mutation。

### 5.37 full P0 payload coverage 已脚本化（2026-05-11 04:59）

为避免后续继续依赖一次性 Python 片段校验 payload 覆盖，本轮新增可重复门禁：

- `scripts/agent-qc/payload-coverage.mjs`
- `scripts/lib/agent-qc-payload-coverage-core.mjs`
- `scripts/lib/agent-qc-payload-coverage-core.test.ts`
- `package.json` script：`agent-qc:payload-coverage`

当前命令已生成最新 coverage sidecar：

```bash
npm run agent-qc:payload-coverage -- \
  --payload "./.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.json" \
  --format json \
  --output "./.lime/qc/qcloop-p0-single-owner-ready-coverage-current.json" \
  --check
```

结果：coverage `passed=true`，missing / extra 均为空，owner status 仍为 `busy`，因此 overall status 是 `blocked`。这把“payload 是否覆盖 manifest P0”的检查从手工 sidecar 提升为可重复工具，但不改变当前发布阻断：PID `59011` 仍未释放，full P0 未启动。

### 5.38 completion audit 纳入 payload coverage（2026-05-11 05:02）

`agent-qc:audit` 已新增 `qcloop-payload-coverage` 检查项，要求 ready payload coverage sidecar 显示 P0 manifest 覆盖完整。最新刷新：

| 门禁                  | 当前值                       | 说明                                                                                    |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| completion audit      | `17/18`，`status=incomplete` | 新增 payload coverage 项为 PASS                                                         |
| payload coverage item | `pass`                       | `status=blocked coverage=pass manifestP0=8 payloadItems=8 missing=0 extra=0 owner=busy` |
| objective checklist   | `5/7`，`status=incomplete`   | 仍被 raw process owner 与 official Evidence Pack 阻断                                   |

该项只证明 ready payload 覆盖正确，不代表 full P0 已执行。最终发布门禁仍只接受官方 `.lime/qc/agent-qc-evidence.json` 的真实 8/8 P0 pass。

### 5.39 执行矩阵纳入 payload coverage gate（2026-05-11 05:04）

`internal/tests/lime-agent-autonomous-test-execution-matrix.md` 的执行前 Owner Gate 已补充 `npm run agent-qc:payload-coverage`。后续 Agent 在启动 full P0 前，不仅要确认 GUI / raw process / DB lease 清空，还必须确认 ready payload 与 P0 manifest 一致。

新增通过条件：

```text
qcloop-p0-single-owner-ready-coverage-current.json:
coverage.passed=true
missing=[]
extra=[]
```

新增阻断条件：ready payload 与 manifest P0 不一致，或 payload coverage sidecar 未生成。该更新把刚新增的脚本纳入人读执行矩阵，避免后续 Agent 只看 owner clear 就直接启动过期 payload。

### 5.40 stale owner runbook 纳入精确进程树计划（2026-05-11 05:10）

`internal/tests/lime-agent-qc-stale-owner-intervention.md` 已新增 8.6，明确确认前可以做只读进程树取证，但不能发送 signal。该节把以下 sidecar 纳入标准处置链：

- `.lime/qc/stale-raw-gui-owner-process-tree-current.json`
- `.lime/qc/stale-raw-gui-owner-recursive-tree-current.json`
- `.lime/qc/stale-raw-gui-owner-intervention-plan-current.json`

当前计划显示 recommended scope 为 `process_group`，但仍只是确认后的计划。没有 owner 确认文本前，仍不得处理 PID `59011` 或其 process group。
