# Lime Agent QC qcloop 运维手册

> 本手册描述 Lime 作为样本产品运行 Agent QC qcloop 批次时的安全操作。目标是让测试 Agent 可以持续观察、导出证据和安排重跑，但不误杀正在运行的 worker，也不把 partial evidence 冒充成发布通过。

## 1. 操作原则

- **不抢占运行中的 worker**：qcloop item 仍为 `running` 时，不主动 kill / interrupt；只做只读状态查询、sidecar 导出和 blocker 记录。
- **不覆盖官方 Evidence Pack**：只有 P0 批次覆盖全部 P0 scenario 且 `verdict.status=pass` 时，才写入 `.lime/qc/agent-qc-evidence.json`。
- **sidecar 只用于排障**：`.lime/qc/agent-qc-evidence.*.json`、`.lime/qc/qcloop-status.*.json` 可以记录当前状态，但不能作为 release gate 证据。
- **qcloop API 固定 IPv4 loopback**：本地调用使用 `http://127.0.0.1:8080`，避免 `localhost` 代理、IPv6 或浏览器环境差异。
- **payload 必须显式 cwd**：qcloop 进程不一定从 Lime 仓库启动，生成 job 时必须传 `--cwd /Users/coso/Documents/dev/ai/aiclientproxy/lime`。

## 2. 只读状态检查

优先使用仓库脚本，而不是手写长 `curl | jq`：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<qcloop-job-id>"
```

输出 JSON sidecar：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<qcloop-job-id>" \
  --format json \
  --output "./.lime/qc/qcloop-status.<job-id>.json"
```

默认 `stale-minutes=30`。当 item 仍在 `running`，latest worker 运行超过阈值且 stdout/stderr 为空时，脚本标记为 `stale`，但不会停止进程。需要 CI 或排障脚本显式失败时，才加：

```bash
npm run agent-qc:qcloop-status -- \
  --job-id "<qcloop-job-id>" \
  --fail-on-stale
```

## 3. qcloop server 启动环境

GUI / DevBridge / browser runtime 场景要求宿主机先有健康的 `127.0.0.1:3030` DevBridge listener，然后 qcloop worker 里的 Codex 也能访问该 listener。如果宿主 shell 自己也无法访问 `http://127.0.0.1:3030/health`，先恢复 DevBridge / headless Tauri，不要误判为 qcloop sandbox。只有宿主 shell 可访问而 worker 内失败时，才优先检查 qcloop serve 进程是否显式配置 Codex sandbox；这类失败表现为 worker 内 `fetch failed` / `Operation not permitted`。出现这种状态时，不要继续提交完整 P0 GUI 批次；先用只读 worker preflight 证明权限恢复。

只读检查当前 qcloop serve 环境：

```bash
ps eww -p "<qcloop-serve-pid>" | tr ' ' '\n' | rg 'QCLOOP_CODEX|QCLOOP_EXECUTOR'
```

宿主 DevBridge health 检查：

```bash
curl --max-time 5 "http://127.0.0.1:3030/health"
lsof -nP -iTCP:3030 -sTCP:LISTEN
```

推荐的本地 Agent QC 启动方式：

```bash
QCLOOP_CODEX_BIN="/Users/coso/.nvm/versions/node/v23.4.0/bin/codex" \
QCLOOP_CODEX_SANDBOX=off \
QCLOOP_CODEX_APPROVAL_POLICY=never \
QCLOOP_CODEX_EXTRA_ARGS="--ephemeral -c 'mcp_servers.context7.command=\"\"' -c 'mcp_servers.playwright.command=\"\"'" \
./qcloop serve --addr :8080
```

`QCLOOP_CODEX_EXTRA_ARGS="--ephemeral -c 'mcp_servers.context7.command=\"\"' -c 'mcp_servers.playwright.command=\"\"'"` 是当前更可靠的内层 MCP 降噪方式：它保留用户 provider / 认证配置，同时把已知用户级 MCP server 的 command 覆盖为空。`mcp_servers={}` 不足以覆盖嵌套 `mcp_servers.*` 配置；`--ignore-user-config` 也不能作为默认方案，因为它可能跳过本机 provider / 认证配置，让 worker 变成 401 或认证阻断。

如果 `QCLOOP_CODEX_BIN` 指向坏 symlink（例如已删除的 Homebrew Cellar 路径），这不是产品失败，应归类为 qcloop worker 环境阻断。`agent-qc:export-evidence` 与 `agent-qc:qcloop-status` 会把 `QCLOOP_CODEX_BIN 不可用`、`QCLOOP_CODEX_EXTRA_ARGS 解析失败`、内层认证错误等归类为 `blocked`，避免把执行器配置错误写成 P0 产品缺陷。

如使用 `QCLOOP_CODEX_BYPASS_SANDBOX=true`，必须确认外层环境已经隔离，因为它会让 Codex 跳过 approval 和 sandbox。当前 Lime 样本只记录该方案，不在仍有 qcloop job running 时重启 qcloop。

修复后先提交一个只读 worker preflight job，目标只包含 cwd / tmp / DevBridge health，不运行产品 smoke。只有该 job 的 worker stdout 同时包含 `QCLOOP_PREFLIGHT_RESULT=PASS`、`devbridge-health PASS` 和 `QCLOOP_WORKER_RESULT=PASS`，才进入 P0 GUI / browser / release 场景重跑。

如果不能重启现有 qcloop serve，可临时启动隔离 qcloop server，必须使用独立 DB 和不同端口，避免影响正在运行的 Web 面板和默认队列：

```bash
QCLOOP_CODEX_BIN="/Users/coso/Library/PhpWebStudy/env/node/bin/codex" \
QCLOOP_CODEX_SANDBOX=off \
QCLOOP_CODEX_APPROVAL_POLICY=never \
QCLOOP_CODEX_CWD="/Users/coso/Documents/dev/ai/aiclientproxy/lime" \
./qcloop --db "/Users/coso/Documents/dev/ai/aiclientproxy/lime/.lime/qc/qcloop-isolated-worker-preflight.db" \
  serve --addr "127.0.0.1:18080" --workers 1
```

隔离 server 只用于 sidecar 诊断；除非重新跑完整 P0 并导出覆盖 8/8 P0 的官方 Evidence Pack，否则不能用 isolated partial pass 覆盖 `.lime/qc/agent-qc-evidence.json`。

## 4. Worker preflight

运行 qcloop P0 前，worker 应先证明自己在正确仓库、临时目录可写，并且在 GUI / DevBridge 场景中能访问本地 DevBridge：

```bash
npm run agent-qc:qcloop-preflight -- \
  --expected-cwd "$(pwd)" \
  --check

# 需要 DevBridge / GUI / browser runtime 的场景再加：
npm run agent-qc:qcloop-preflight -- \
  --expected-cwd "$(pwd)" \
  --require-devbridge \
  --timeout-ms 15000 \
  --check
```

如果 preflight 阻断，worker 必须在 stdout 输出 `QCLOOP_WORKER_RESULT=BLOCKED`，停止后续高成本命令，并把 cwd、health URL、失败 check、stdout/stderr 证据路径写入 stdout。这样 release gate 可以区分“产品失败”和“qcloop worker 环境没有本地 DevBridge 权限”；`agent-qc:export-evidence` 和 `agent-qc:qcloop-status` 会把这种显式 marker 归类为 Evidence Pack `blocked`，即使 qcloop item 因 verifier 多轮失败进入 `exhausted`。

## 5. Sidecar evidence 导出

qcloop 批次 running / blocked / failed 时，只导出 sidecar：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.<job-name-or-date>.json" \
  --ref "local-qcloop-<job-name-or-date>" \
  --check
```

sidecar 用于回答：

- 哪些 scenario 已经 `success`、`failed`、`exhausted`、`running`、`pending`。
- verifier 是否拿到了 worker stdout / exit code / attempt 状态。
- 当前 blocker 是产品缺陷、证据缺口、环境卡住，还是 qcloop 调度未完成。

sidecar 不用于回答“能否发布”。发布只看官方 `.lime/qc/agent-qc-evidence.json`。

## 6. Stale item 处理

当 `agent-qc:qcloop-status` 标记 `stale`：

1. 记录 job id、scenario id、worker started_at、stdout/stderr 长度和当前时间。
2. 导出 `.lime/qc/qcloop-status.<job-id>.json` 和 sidecar Evidence Pack。
3. 检查是否有已知长编译、GUI bridge 启动或外部运行时阻塞；不要立即归因于产品缺陷。
4. 不主动 kill；如果必须中止，需要由任务 owner 明确确认。
5. 当前 job 自然结束后，使用带 `{{stdout}}` / `{{attempt_status}}` / `{{exit_code}}` 的新 payload 重跑失败或卡住场景。

必要时只读查看 SQLite lease，确认是队列 / worker 调度卡住还是产品命令已经输出失败：

```bash
sqlite3 -readonly ".lime/qc/qcloop-isolated-worker-preflight.db" \
  "SELECT id, status, lock_owner, lock_expires_at FROM batch_items WHERE batch_job_id='<job-id>';"
```

只能读取，不要直接改 DB 状态；否则 qcloop 的 attempt / QC 证据链会失真。

分类口径：

| 状态 | 解释 | 下一步 |
| --- | --- | --- |
| `running` 且有 stdout/stderr | 仍可能在正常执行 | 继续观察，必要时导出 sidecar |
| `running` 且长期无输出 | 疑似 worker 卡住或外部进程阻塞 | 记录 stale，不中断；等待或请求 owner 判断 |
| `pending` | 队列尚未调度 | 不做产品结论，等待前序 item 结束 |
| `exhausted` 且 stdout 包含 `QCLOOP_WORKER_RESULT=BLOCKED` | worker 明确证明环境 / 权限前置检查阻断 | 归类为 `blocked`，修 qcloop worker 环境后重跑，不写官方 pass |
| `failed` 且 stderr 包含 `QCLOOP_CODEX_BIN 不可用` / 内层认证或 sandbox 配置错误 | qcloop worker 执行器环境阻断 | 归类为 `blocked`，修 CLI 路径 / 认证 / extra args 后新建隔离批次 |
| `failed` 且 stdout 包含 `QCLOOP_WORKER_RESULT=PASS` | worker 自评通过，但 qcloop 进程或 verifier 未通过 | 归类为 `fail`，记录 `worker_self_report_pass_not_verified`，不要把自评 PASS 当成 release 证据 |
| `exhausted` | worker 或 verifier 未满足 QC | 修产品缺陷或补 evidence，再新建重跑 job |
| `success` | 当前 item 通过 qcloop verifier | 仍需等待全部 P0 success 才能写官方 evidence |

## 7. 重跑策略

重跑只针对终态失败或明确卡住后已释放的场景，避免与仍在 running 的批次抢队列。

单场景重跑示例：

```bash
npm run agent-qc:qcloop-job -- \
  --scenario "tool-approval-sandbox-boundary" \
  --cwd "/Users/coso/Documents/dev/ai/aiclientproxy/lime" \
  --base-url "http://127.0.0.1:8080" \
  --output "./.lime/qc/qcloop-tool-approval-sandbox-rerun-payload.json" \
  --check
```

全量 P0 重跑示例：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "/Users/coso/Documents/dev/ai/aiclientproxy/lime" \
  --base-url "http://127.0.0.1:8080" \
  --output "./.lime/qc/qcloop-p0-rerun-payload.json" \
  --check
```

提交前检查 payload：

- `prompt_template` 明确要求只读执行，不修改源码、配置、文档、锁文件或 git 状态；Agent QC repair 不应该在 qcloop 内直接修代码。
- P0 release evidence 批次默认使用 `--max-qc-rounds 1`，避免 qcloop generic repair prompt 把“补证据”误变成“改源码”；需要修复产品问题时另开人工确认的开发任务。
- `prompt_template` 明确要求切到 Lime cwd 并打印 `pwd`。
- `verifier_prompt_template` 包含 `{{stdout}}` 或 `{{output}}`。
- `verifier_prompt_template` 包含 `{{attempt_status}}` 与 `{{exit_code}}`。
- items 中 `scenario_id` 覆盖目标场景，不混入低优先级 P1/P2。

## 8. 当前样本状态（2026-05-10）

当前 qcloop v5 job：`1778398587521627000`（completed / fail）。

宿主 DevBridge 已于 2026-05-10 16:59 后通过 `npm run tauri:dev:headless` 恢复，证据为 `.lime/qc/qcloop-devbridge-health-restored.json`。但随后创建的只读 qcloop worker preflight job `1778403715309891000` 仍为 `completed` / `blocked`：内层 worker cwd/tmp 通过，`devbridge-health` 对 `http://127.0.0.1:3030/health` 仍 `fetch failed`。因此当前主阻断已经收敛为 qcloop worker loopback / sandbox 权限，而不是宿主 DevBridge 未启动。

隔离 qcloop server `127.0.0.1:18080` 使用独立 DB 与显式 Codex sandbox 配置后，worker preflight job `1778404260108641000` 已 `completed` / `success`，证明 worker 权限可以恢复。随后四个 P0 sidecar 通过：

- `workspace-ready-session-restore`：job `1778404364137496000`，`smoke:workspace-ready` + `verify:gui-smoke -- --reuse-running` 通过。
- `browser-runtime-site-adapter`：job `1778404601640847000`，`smoke:browser-runtime` + `smoke:site-adapters` 通过。
- `skill-forge-register-bind-enable`：job `1778404743505029000`，`test:contracts` + `smoke:agent-service-skill-entry` 通过。
- `release-package-startup-smoke`：job `1778405385701480000`，worker preflight + `verify:app-version` + `verify:gui-smoke -- --reuse-running` 通过；scope 明确为 `source-tree-startup-smoke`。

`release-package-startup-smoke` isolated v1 job `1778404882904047000` 仍保留为历史 blocked 证据，因为执行时宿主 DevBridge 再次断开；v2 pass 仍不能单独覆盖官方 Evidence Pack。

已启动 isolated full P0 v1 job `1778405842243079000` 作为同批次 8/8 P0 尝试。当前只读 sidecar `.lime/qc/qcloop-status.isolated-p0-full-v1-current.json` 与 stale check `.lime/qc/qcloop-status.isolated-p0-full-v1-stale-check.json` 显示：

- `command-bridge-contract`：success。
- `claw-chat-ready-streaming`：success，但 stdout 明确 scope 为 GUI smoke / DevBridge / runtime surface，不包含 live long-turn interrupt transcript。
- `tool-approval-sandbox-boundary`：success，但 stdout 明确 scope 为 deterministic smoke，不包含 live runtime transcript。
- `skill-forge-register-bind-enable`：success。
- `browser-runtime-site-adapter`：running，当前 attempt 无 stdout/stderr；`--stale-minutes 1` 只读检查已标记 stale；SQLite 只读检查显示 lock owner 为 `qcloop-worker-1`，lease 已被心跳延长到 `2026-05-10T19:00:05+08:00`。
- `workspace-ready-session-restore`、`harness-replay-regression`、`release-package-startup-smoke`：pending。

该批次仍未进入终态；按本手册的 stale item 规则，只能继续只读观察，不 kill、不 pause、不覆盖官方 Evidence Pack。当前卡点更像 worker / provider 调度无输出，而不是产品 smoke 已失败：只读 `ps` 可见 `codex exec` 进程仍在执行该 item，但没有 `npm run smoke:browser-runtime` / `smoke:site-adapters` 子命令输出。必须等待当前 worker 自然结束，或由 owner 明确授权后再处理。

为验证是否是内层用户级 MCP server 启动导致 worker 长时间无业务 stdout，后续追加了 no-MCP-attempt 隔离批次：

- `1778410893606889000`：端口 `127.0.0.1:18081`，因 `QCLOOP_CODEX_BIN` 指向坏 Homebrew symlink 立即失败；该结果归类为 worker CLI 环境阻断，不是产品 P0 失败。
- `1778410956075020000`：端口 `127.0.0.1:18082`，使用正确 Codex bin 与 `QCLOOP_CODEX_EXTRA_ARGS='--ephemeral -c mcp_servers={}'`；实测仍可能存在用户级 MCP 子进程，因此该批次只证明 CLI 路径和认证已恢复，不证明 MCP 已完全关闭；`command-bridge-contract` 已在 repair attempt 后 success；当前 `claw-chat-ready-streaming` running 且 9 分钟无 stdout/stderr，被 sidecar 标记 stale；后续 6 个 P0 pending。
- `1778412160003934000`：端口 `127.0.0.1:18083`，使用正确 Codex bin 与 `mcp_servers.context7.command=""` / `mcp_servers.playwright.command=""` 覆盖；初始 `ps` 未观察到用户级 MCP 子进程，`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending。已另行生成只读待用 payload `.lime/qc/qcloop-readonly-p0-v1-payload.json` / `.lime/qc/qcloop-fastmini-readonly-p0-v2-payload.json`，`max_qc_rounds=1`，暂不抢跑。
- `1778412499745993000`：端口 `127.0.0.1:18084`，在 MCP command 覆盖基础上追加 `--ignore-rules`，避免内层 worker 读取项目规则 / skill 后进入非必要工具链；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending。已另行生成只读待用 payload `.lime/qc/qcloop-readonly-p0-v1-payload.json` / `.lime/qc/qcloop-fastmini-readonly-p0-v2-payload.json`，`max_qc_rounds=1`，暂不抢跑。
- `1778412738097137000`：端口 `127.0.0.1:18085`，使用 `gpt-5.4-mini`、low reasoning、MCP command 覆盖、`--ignore-rules`、只读 prompt 与 `max_qc_rounds=1`，目标是在 qcloop 5 分钟 executor timeout 内完成 worker；`command-bridge-contract` 已 exhausted，原因是 verifier 拒绝 no-change surface evidence；已修正 manifest 并生成 v2 payload，当前 `claw-chat-ready-streaming` running，后续 6 个 P0 pending。

这说明 qcloop worker 侧还需要同时治理四类问题：CLI 路径 / 认证环境、用户级 MCP 启动策略或隔离配置、worker stdout 可审查性，以及 no-change 场景下 verifier 不能把“没有变更面”误判为“缺少变更面证据”。四者都是测试基础设施问题；在官方 Evidence Pack 通过前，不能把 isolated partial pass 或宿主直跑命令当作 release 证据。

这类真实卡点已经回写到机器标准：

- `internal/test/agent-qc-scenarios.manifest.json` 的 `qcloop-batch-verifier-repair` 要求记录 stale sidecar、worker stdout/stderr 长度摘要、worker CLI environment sidecar 和 inner Codex MCP startup policy，并把 `running no-output stale`、`worker lease heartbeat without stdout`、`worker codex binary unavailable`、`worker auth or sandbox misconfiguration`、`worker user-config MCP startup no-output hang` 作为失败模式。
- `browser-runtime-site-adapter` 要求把 cleanup warning 单独分类，避免 `exit=0` 把清理问题完全隐藏。
- `scripts/lib/agent-qc-qcloop-status-core.mjs` 现在会输出 item 级 `staleSeconds` 和 worker `durationSeconds`；当前 full P0 stale sidecar 显示 `browser-runtime-site-adapter staleSeconds=5108 stdoutLength=0 stderrLength=0`，可以直接用于判断“长时间无输出”而不是只看布尔 stale。
- `scripts/lib/agent-qc-evidence-core.mjs` 现在会把 `QCLOOP_CODEX_BIN 不可用`、extra args 解析失败、内层认证 / sandbox 配置错误归类为 `blocked`，并在 blocker 摘要中使用脱敏的环境阻断说明。
- `internal/test/agent-qc-scenarios.manifest.json` 的 qcloop worker prompt 要求最终 stdout 逐项列出 `evidence_required` 是否满足，并说明每个 `failure_modes` 如何被覆盖、排除或命中；已生成待用 payload `.lime/qc/qcloop-isolated-nomcp-p0-v3-after-evidence-prompt-payload.json`，但在 v2 仍 running 时不自动抢跑。
- `scripts/lib/agent-qc-qcloop-job-core.mjs` 会把 manifest 的 `evidenceLayers` 写入 qcloop item 的 `evidence_layers`，worker 必须声明本次覆盖层级；只跑到 `deterministic-smoke` 时不得伪装成 `gui-trace`、`runtime-transcript` 或 `release-artifact`。

2026-05-10 19:58 只读刷新显示，当前不应继续开新 full P0 抢资源：

| 批次 | 只读状态 | 处理 |
| --- | --- | --- |
| `1778405842243079000` isolated full P0 v1 | 4 success / 1 running / 3 pending，`browser-runtime-site-adapter` stale 约 8002 秒 | 继续观察；记录 stale sidecar，不中断 |
| `1778410956075020000` no-MCP P0 v2 | 2 success / 1 failed / 1 running / 4 pending | `tool-approval-sandbox-boundary` 已 failed；该批次不能证明 `mcp_servers={}` 足以关闭嵌套 MCP |
| `1778412160003934000` MCP-disabled P0 v1 | 1 failed / 1 running / 6 pending，`claw-chat-ready-streaming` stale 约 674 秒 | 失败来自旧 no-change verifier；后续 payload 已修正，当前批次不抢占 |
| `1778412499745993000` fast P0 v1 | 1 success / 1 running / 6 pending | `--ignore-rules` 后进入 `claw-chat-ready-streaming`；继续观察 |
| `1778412738097137000` fast-mini readonly P0 v1 | failed，8 exhausted | sidecar evidence 为 6 fail / 2 blocked；verifier 正确拒绝缺 deep evidence 的浅层 smoke 摘要，并额外暴露 `workspace-ready-session-restore` 中 `smoke:design-canvas` 保存成功状态断言失败；`release-package-startup-smoke` 因 GUI smoke 未自然收口被 blocked；用于修正证据分层和产品回归，不覆盖官方 Evidence Pack |

当 qcloop worker 能快速跑完确定性 smoke 但 verifier 仍拒绝时，不要把拒绝当成坏事。它说明当前输出还缺 live transcript、trace、console/network、cleanup、approval/sandbox 或 SkillTool gate 证据；应拆分并补证据，而不是降低 P0 release gate。

GUI P0 需要单一 owner。只要 `.lime/qc/qcloop-status.*.json` 里仍有 GUI / DevBridge 场景 `running` 或 `stale`，不要再启动新的 full P0 GUI 批次；否则多个 worker 复用同一个 `127.0.0.1:1420` / `127.0.0.1:3030` 会话，可能互相导航或抢占按钮点击，导致 `verify:gui-smoke` 失败点失真。新的 payload 已要求 GUI 场景输出 `GUI session owner / isolation statement`，并把 `parallel GUI smoke interference` 作为 failure mode。

启动新的 GUI P0 前先跑：

```bash
npm run agent-qc:gui-owner-check -- --check
```

该命令只读扫描 `.lime/qc/qcloop-status.*.json`。如果发现 active GUI owner，会非 0 退出，并列出仍在 running / stale 的 qcloop job 和场景；此时只能继续观察或等待 owner 明确处理，不能再开新的 full P0 GUI 批次。

使用 `--format json` 时，报告还会在 stale owner 场景下输出 `ownerIntervention`：

```json
{
  "ownerIntervention": {
    "status": "requires_owner_confirmation",
    "requiredConfirmationText": "确认处理 stale GUI owner <job-id>，可以终止 PID <pid> 并记录 sidecar。",
    "prohibitedUntilConfirmed": [
      "kill / pause / interrupt stale worker",
      "modify qcloop SQLite DB",
      "start another full GUI P0 batch",
      "overwrite .lime/qc/agent-qc-evidence.json",
      "git commit / push / tag / release"
    ]
  }
}
```

该字段只表示“需要 owner 决策”，不是授权；真实 PID 仍必须来自最新 sidecar / DB / `ps` 取证。

`workspace-ready-session-restore` 的细化日志提取见 `.lime/qc/design-canvas-failure-fastmini-workspace-extract.json`，当前失败点是 `smoke:design-canvas` 在 `project-roundtrip-save-open` 阶段等待 `已保存图层设计工程` 文本超时。后续重跑前，应先确认设计画布导出按钮点击后是否能形成可观察的保存中 / 保存成功状态。

待 running/stale 批次自然结束后，可优先使用 `.lime/qc/qcloop-p0-evidence-layers-v1-payload.json` 作为下一轮只读 P0 payload。该 payload 只生成不提交，8 个 P0 item 均带 `evidence_layers`，`workspace-ready-session-restore` / `release-package-startup-smoke` 已显式要求 design canvas 工程 roundtrip 和 GUI smoke 自然收口，并保持 `max_qc_rounds=1`，避免 repair prompt 在发布证据批次中修改工作区。

当前 CLI gate 复核：

```bash
npm run agent-qc:qcloop-status -- \
  --base-url "http://127.0.0.1:18080" \
  --job-id "1778405842243079000" \
  --stale-minutes 1 \
  --check-terminal \
  --fail-on-stale
```

结果为 `QCLOOP_STATUS_CHECK_EXIT_STATUS=2`，摘要显示 `duration=67m stdout=0 stderr=0 stale=worker 运行 67 分钟且 stdout/stderr 为空`。这证明 stale gate 会以非 0 阻断，不能被误当作通过。

宿主 shell 直接执行同一产品命令的结果：

```bash
npm run agent-qc:qcloop-preflight -- --expected-cwd "$(pwd)" --require-devbridge --timeout-ms 30000 --check
npm run smoke:browser-runtime
npm run smoke:site-adapters
```

结果为退出码 `0`：DevBridge health pass，browser runtime smoke 创建 session 并通过，site adapter catalog/list/recommend/search 通过。`smoke:browser-runtime` 同时输出一个非阻断 cleanup warning：`close_cdp_session` 未找到刚创建的 session。该 warning 应进入后续 evidence，但当前 stale 卡点本身仍更像 qcloop worker / provider 没有开始执行命令。

另一个 pending P0 `harness-replay-regression` 的宿主直接检查也已通过：

```bash
npm run harness:eval
npm run harness:eval:trend
```

结果为退出码 `0`：`harness:eval` 显示 2/2 ready、invalid=0、current observability gap=0、degraded gap=1；`harness:eval:trend` 显示 samples=1，仅能形成 trend seed。该结果证明宿主命令可跑，但不能替代 qcloop verifier。

剩余 pending 的 workspace / release source-tree smoke 也已直接通过：

```bash
npm run smoke:workspace-ready
npm run verify:app-version
npm run verify:gui-smoke -- --reuse-running
```

结果为退出码 `0`：workspace ready、版本一致性、复用 headless Tauri 的 GUI smoke 全部通过；GUI smoke 覆盖 workspace ready、browser runtime、site adapters、service skill entry、runtime tool surface、runtime surface page、knowledge GUI、design canvas。该结果只能证明宿主 source-tree 可用，不能替代 qcloop verifier 或 installer artifact 验证。

已知状态：

- `claw-chat-ready-streaming`：qcloop item 为 `exhausted`，但 worker stdout 明确输出 `QCLOOP_WORKER_RESULT=BLOCKED`；sidecar Evidence Pack 归类为 `blocked`。同日 GUI deep flow 仍有 stop / interrupt 后长 turn completed 落盘的产品 blocker，需在 worker 环境连通后继续验证。
- `tool-approval-sandbox-boundary`：当前 `failed`；worker stdout 自报 `QCLOOP_WORKER_RESULT=PASS`，确定性 smoke 通过，但 qcloop exit `-1` / verifier 仍判缺 live runtime transcript，不能作为 P0 pass。
- `skill-forge-register-bind-enable`：当前 `exhausted`；多轮 worker 均停在 DevBridge preflight blocked，sidecar 归类为 `blocked`。
- `browser-runtime-site-adapter`：当前 `exhausted`；多轮 worker 均停在 DevBridge preflight blocked，sidecar 归类为 `blocked`。
- `workspace-ready-session-restore`：当前 `exhausted`；多轮 worker 未提供 workspace-ready / GUI smoke / DevBridge 可审查证据，sidecar 归类为 `blocked`。
- `release-package-startup-smoke`：默认 v5 当前 `exhausted`，sidecar 归类为 `blocked`；隔离 v2 已通过 source-tree startup smoke，但仍需进入同一全量 P0 批次并覆盖官方 Evidence Pack。
- v4 job `1778392677659787000` 已 `completed` / `fail`，6/6 exhausted；只保留为排障 sidecar，不再作为当前运行批次。

当前关闭条件仍是：8/8 P0 scenario 全部 qcloop `success`，官方 `.lime/qc/agent-qc-evidence.json` 为 `pass`，`agent-qc:release-summary --check` 与 `agent-qc:audit` 通过。

## 9. 2026-05-10 20:07 状态刷新

按用户要求，本轮没有 push、没有 commit、没有 kill / pause / interrupt 任何仍在运行的 qcloop 或 Codex worker。只读刷新结果如下：

| 批次 | 当前状态 | 结论 |
| --- | --- | --- |
| `1778405842243079000` isolated full P0 v1 | `stale`，4 success / 1 running / 3 pending，`browser-runtime-site-adapter` stale 约 8522 秒 | 仍是唯一 active GUI owner；继续观察，不启动新的 GUI P0。 |
| `1778410956075020000` no-MCP P0 v2 | `fail`，2 success / 6 failed | 终态失败；部分失败来自 worker / verifier 证据不足或 verifier 输出格式错误。 |
| `1778412160003934000` MCP-disabled P0 v1 | `fail`，8 failed | 终态失败；不能作为 MCP-disabled 方案有效证据。 |
| `1778412499745993000` fast P0 v1 | `fail`，1 success / 7 failed | 终态失败；`--ignore-rules` 降噪不足以形成 P0 Evidence Pack。 |
| `1778412738097137000` fast-mini readonly P0 v1 | `fail`，8 exhausted | verifier 正确拒绝浅层 smoke 摘要；同时暴露 design canvas / evidence artifact 缺口。 |

`agent-qc:gui-owner-check` 输出 `ownerCount=1`、`verdict.status=blocked`，原因是 isolated full P0 v1 仍持有 active GUI owner。因此当前不允许启动新的 full P0 GUI 批次；下一步只能继续只读观察，或在 owner 明确处理后再重跑。

本轮新增结构化证据契约，原因是多个终态失败并非单纯产品失败，而是 worker stdout 无法被 verifier 稳定审查。后续新 payload 必须让 worker 输出：

```text
QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED
QCLOOP_EVIDENCE_SUMMARY_JSON=<json>
```

其中 JSON 必须逐项覆盖 `evidenceRequired`、`failureModes`、`evidenceLayers`、命令退出码、artifact 路径、GUI owner 和 release scope。详见 `internal/tests/lime-agent-qc-evidence-contract.md`。

2026-05-10 20:18 追加 sidecar 导出复核：使用新版 `agent-qc:export-evidence` 对 `1778405842243079000` 导出 `.lime/qc/agent-qc-evidence.isolated-p0-full-v1-current.json`，结果为 `fail`。除 running / pending 外，前 4 个 qcloop `success` item 也被降级为 `fail`，原因是 stdout 缺少 `QCLOOP_EVIDENCE_SUMMARY_JSON`，不能作为 release pass。这是预期收紧：旧批次的浅层 success 只能作为排障参考，不能覆盖新的结构化证据门禁。

2026-05-10 20:20 追加 completion audit 复核：`agent-qc:audit` 已新增 `structured-evidence-contract` 检查项，要求文档、qcloop worker prompt、verifier prompt 与 exporter 同时强制 `QCLOOP_EVIDENCE_SUMMARY_JSON`。当前该项为 pass；整体 audit 变为 15/16，唯一缺口仍是官方 P0 qcloop Evidence Pack 未 pass。

2026-05-10 20:21 追加 release gate 收紧：`agent-qc:release-summary --check` 已拒绝只有 `qcloop:*` 引用、缺少非 qcloop artifact / GUI owner / release scope evidenceRef 的 pass 场景。这样即使旧 exporter 或手工 evidence 把场景写成 pass，也不能只凭 qcloop item id 进入发布。

2026-05-10 20:23 追加 completion audit gate 同步：`structured-evidence-contract` 现在同时检查 release summary gate 是否拒绝弱 evidenceRefs。当前证据为 `doc=true worker=true verifier=true strictJson=true exporter=true release=true`，整体仍是 15/16，唯一缺口仍是 `real-qcloop-evidence`。

2026-05-10 20:25 只读进程核查：`1778405842243079000` 仍有真实内层 `codex exec` 进程存在，PID `69738`，命令仍停在 `browser-runtime-site-adapter` worker prompt，qcloop sidecar 显示该 item 已运行约 9543 秒且 stdout/stderr 仍为 0。因此当前 stale owner 不是单纯旧 sidecar 噪声；仍不能启动新的 GUI P0，也不能在未获 owner 明确确认时 kill / pause / interrupt。

同轮增强 `agent-qc:gui-owner-check` 输出：报告现在包含 `staleOwnerCount` 与 `oldestStaleSeconds`，当前 `.lime/qc/gui-owner-current.json` 为 `ownerCount=1`、`staleOwnerCount=1`、`oldestStaleSeconds=9543`，nextAction 明确为继续只读观察或由 owner 确认后处理。

2026-05-10 20:26 追加 stale owner intervention artifact：新增 `internal/tests/lime-agent-qc-stale-owner-intervention.md` 与 `.lime/qc/stale-owner-intervention-request.md`。前者固化只读取证、禁止操作、owner 确认格式和确认后的最小闭环；后者记录当前 job `1778405842243079000` / PID `69738` 的干预请求，但未执行任何中断动作。`agent-qc:audit` 已新增 `stale-owner-intervention-protocol`，当前整体为 16/17，唯一缺口仍是 `real-qcloop-evidence`。

2026-05-10 20:28 追加 post-stale rerun runbook：`internal/tests/lime-agent-qc-stale-owner-intervention.md` 新增 Owner 清空后的 P0 重跑步骤，并生成 `.lime/qc/post-stale-owner-rerun-plan.md`。已只生成并校验 `.lime/qc/qcloop-p0-structured-evidence-v1-payload.json`，结果 `valid=true`、`itemCount=8`、`maxQcRounds=1`，且 worker / verifier 均包含结构化 evidence 与严格 JSON 约束；未提交 qcloop job。

2026-05-10 20:32 追加 qcloop executor timeout 核查：只读检查 `/Users/coso/Documents/dev/ai/limecloud/qcloop/internal/executor/codex.go` 显示 `NewCodexExecutor` 期望 `timeout: 5 * time.Minute`，`runCLICommand` 使用 `exec.CommandContext`。但当前 live PID `69738` 已运行约 165 分钟且 stdout/stderr 仍为 0，说明当前运行中的 qcloop serve / 子进程状态不能简单按源码 timeout 预期判断；可能是旧二进制、孤儿 `codex exec`、或 qcloop runner 未能回收子进程。该情况仍按 stale GUI owner 处理：未获 owner 明确确认前不 kill、不改 DB、不启动新 GUI P0；后续重跑前应确认 qcloop serve 使用带 executor timeout 的当前构建，并保留 `max_qc_rounds=1` 与 structured evidence gate。

2026-05-10 20:32 追加 payload retry 控制：`agent-qc:qcloop-job` 已支持 `--max-executor-retries` 并把 `max_executor_retries` 写入 qcloop payload，校验范围为 0-5。post-stale P0 release evidence payload 已重新生成并校验：`itemCount=8`、`max_qc_rounds=1`、`max_executor_retries=0`。这样发布证据批次不会自动重试内层 CLI，避免在当前 stale owner 问题未解决时重复制造孤儿 worker；如需基础设施重试，必须由 owner 在隔离环境中明确改为 1。

2026-05-10 20:34 追加 qcloop timeout issue sidecar：已生成 `.lime/qc/qcloop-executor-timeout-issue.md`，把当前 PID `69738` 长时间超过 qcloop 源码 `5 * time.Minute` Codex executor timeout 的现象、可能原因和 qcloop-side 修复建议集中记录。该文件是排障 sidecar，不代表已经修改 qcloop 或处理进程。

2026-05-10 20:35 追加 qcloop 本地修复准备：在 `/Users/coso/Documents/dev/ai/limecloud/qcloop` 中准备了 executor timeout process-group cleanup 补丁，新增 Unix/Windows helper 与 Unix regression test，`go test ./internal/executor` 通过。该补丁未提交、未推送、未影响当前运行中的 qcloop serve 或 PID `69738`；要生效仍需 owner 在处理当前 stale worker 后重建/重启 qcloop。

2026-05-10 20:36 追加 qcloop 全量 Go 测试：在 `/Users/coso/Documents/dev/ai/limecloud/qcloop` 执行 `go test ./...` 通过，覆盖 `internal/api`、`internal/core`、`internal/db` 与 `internal/executor`。这只验证本地 qcloop 源码补丁，不影响当前运行中的 qcloop serve / PID `69738`。

2026-05-10 20:37 追加 qcloop fixed binary sidecar：已从修复后的 qcloop 源码构建 `.lime/qc/bin/qcloop-timeout-fixed`，并执行 `--help` 验证可启动。该 binary 未运行、未替换当前 qcloop serve，只作为 owner 确认处理 stale 后的候选恢复工具。

2026-05-10 20:38 追加 qcloop executor race 验证：在 qcloop 仓库执行 `go test -race ./internal/executor` 通过，用于确认新的 `Start` / `Wait` / timeout goroutine 没有暴露明显竞态。

2026-05-10 20:40 追加 qcloop 全量 race 验证：在 qcloop 仓库执行 `go test -race ./...` 通过，覆盖 `internal/api`、`internal/core`、`internal/db` 与 `internal/executor`。macOS linker 输出 LC_DYSYMTAB warning，但测试退出码为 0。

## 10. 2026-05-10 20:40 安全继续策略

当前用户明确要求 Lime 不推送，且本地仍有其他进程在跑。因此本阶段的允许动作只限于只读刷新和文档 / sidecar 同步。

最新只读状态：

| 项目 | 当前值 |
| --- | --- |
| qcloop server | `127.0.0.1:18080` |
| qcloop job | `1778405842243079000` |
| job verdict | `stale` |
| counts | 8 total / 4 success / 1 running / 3 pending / 1 stale |
| stale scenario | `browser-runtime-site-adapter` |
| worker output | stdout/stderr `0 / 0` |
| worker duration | 约 `10508s` |
| observed PID | `69738` |
| GUI owner gate | `blocked`，`ownerCount=1`，`staleOwnerCount=1` |

安全动作矩阵：

| 动作 | 当前是否允许 | 说明 |
| --- | --- | --- |
| 刷新 `agent-qc:qcloop-status` sidecar | 允许 | 只读，不改变 qcloop job |
| 刷新 `agent-qc:gui-owner-check` sidecar | 允许 | 只读，用于阻止新 GUI P0 抢占 |
| 更新 `internal/tests` 运行手册 | 允许 | 记录事实和 runbook，不改变运行中 job |
| 导出 partial sidecar evidence | 允许，但不能覆盖官方 evidence | 仅用于排障 |
| 启动新的 full GUI P0 | 禁止 | 当前 GUI owner 未释放 |
| 覆盖 `.lime/qc/agent-qc-evidence.json` | 禁止 | 还没有 8/8 P0 structured evidence pass |
| kill / pause / interrupt PID `69738` | 禁止，除非 owner 明确确认 | 需要按 stale owner 处置协议执行 |
| commit / push / tag / release | 禁止 | 用户明确要求 Lime 不推送 |

下一次真正能推进 release gate 的动作只有两种：

1. stale worker 自然结束，且 `npm run agent-qc:gui-owner-check -- --check` 通过。
2. owner 明确确认处理 stale GUI owner 后，按 `internal/tests/lime-agent-qc-stale-owner-intervention.md` 记录 sidecar、清 owner、再重跑 P0 structured evidence payload。

在其中任一条件满足前，不能把当前目标标记为完成。

2026-05-10 20:44 只读续刷显示状态未释放：`1778405842243079000` 仍为 `running` / `stale`，`browser-runtime-site-adapter staleSeconds=10772`，stdout/stderr 仍为 `0 / 0`；`agent-qc:gui-owner-check` 仍为 `blocked`，`ownerCount=1`、`staleOwnerCount=1`。本轮仍只能继续观察或等待 owner 明确确认。

2026-05-10 20:48 追加 DB / lease 级取证：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1.md` 记录 SQLite 只读结果，active item `1778405842246191000` 仍为 `running`，attempt stdout/stderr 为 `0 / 0`，lease 被 `qcloop-worker-1` 延长到 `2026-05-10T21:02:05+08:00`。进程树显示 PID `69738` 已成为 PPID `1` 的 orphan，但仍在 qcloop PGID `69307` 中，并有 Playwright MCP / Context7 MCP 子进程。该证据用于支持后续 owner 决策，但不授权当前 Agent 直接处理进程。

2026-05-10 20:52 追加 runtime binary provenance：`.lime/qc/qcloop-runtime-binary-provenance-18080.md` 记录当前 18080 qcloop serve PID `69307` 仍运行 `/Users/coso/Documents/dev/ai/limecloud/qcloop/qcloop`，而不是 `.lime/qc/bin/qcloop-timeout-fixed`。两者 checksum 不同；因此 qcloop timeout / process-group cleanup 补丁不会影响当前 stale worker。owner 清空当前 GUI owner 后，下一轮隔离 P0 应使用 fixed binary 或等价重建后的 qcloop binary。

2026-05-10 21:02 追加 lease 过期窗口后复核：`.lime/qc/qcloop-db-lease-isolated-p0-full-v1-after-expiry.md` 记录等待超过先前 `lock_expires_at=2026-05-10T21:02:05+08:00` 后，active item 仍为 `running`，stdout/stderr 仍为 `0 / 0`，lease 被延长到 `2026-05-10T21:17:05+08:00`。这说明 stale owner 未自然释放，qcloop 仍在续约该 worker；当前仍不能启动新 GUI P0。

2026-05-10 21:10 追加 watch history：`.lime/qc/stale-owner-watch-history.jsonl` 以 JSONL 记录 stale owner 的只读观察时间线。后续只读刷新可以继续追加该文件；它只用于证明持续 heartbeat / no-output hang，不构成处理授权。

2026-05-10 21:18 追加第二个 lease 窗口复核：qcloop 仍为 `stale`，stdout/stderr 仍为 `0 / 0`，lease 从 `21:17:05` 再次延长到 `21:32:05`，PID `69738` 仍存活。watch history 当前为 4 条。

2026-05-10 21:27 追加脚本化 watch history：`agent-qc:gui-owner-check` 支持 `--watch-history-output <path>`，会把当前 GUI owner report 摘要追加为 JSONL。推荐只读续刷命令：

```bash
npm run agent-qc:gui-owner-check -- \
  --format json \
  --output "./.lime/qc/gui-owner-current.json" \
  --watch-history-output "./.lime/qc/stale-owner-watch-history.jsonl"
```

该参数只追加观察记录，不改变 qcloop job、DB 或进程状态。

2026-05-10 21:32 追加第三个 lease 窗口复核：qcloop 仍为 `stale`，stdout/stderr 仍为 `0 / 0`，lease 从 `21:32:05` 再次延长到 `21:47:05`，PID `69738` 仍存活。watch history 当前为 6 条。

2026-05-10 22:45 追加只读续刷：`qcloop-status.isolated-p0-full-v1-current.json` 仍为 `stale`，job `1778405842243079000` 保持 `4 success / 1 running / 3 pending / 1 stale`；active item `browser-runtime-site-adapter` stdout/stderr 仍为 `0 / 0`，stale 约 `17692s`。SQLite 只读复核显示 `lock_expires_at=2026-05-10T22:56:05+08:00`，PID `69738` 仍存活且 PPID=`1`、PGID=`69307`。已新增 `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.md` 并把 `.lime/qc/stale-owner-watch-history.jsonl` 追加到 14 条。未执行 kill / pause / interrupt / restart，未改 qcloop DB，未启动新 full GUI P0。

2026-05-11 01:02 追加只读续刷：`qcloop-status.isolated-p0-full-v1-current.json` 仍为 `stale`，job `1778405842243079000` 保持 `4 success / 1 running / 3 pending / 1 stale`；active item 仍为 `browser-runtime-site-adapter`，stale 约 `26202s`。SQLite 只读复核显示 active item `1778405842246191000` 仍为 `running`，`lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:17:06+08:00`，active attempt `dc625f8e-b3b9-46b7-9758-4b0273438d50` stdout/stderr 仍为空。已刷新 `.lime/qc/gui-owner-current.json`、追加 `.lime/qc/stale-owner-watch-history.jsonl`，并更新 `.lime/qc/qcloop-db-lease-isolated-p0-full-v1-latest.json` / `.md`。未执行 kill / pause / interrupt / restart，未改 qcloop DB，未启动新 full GUI P0。

2026-05-11 01:13 追加 GUI smoke 复核与 raw process owner：外部启动的 `verify:gui-smoke -- --reuse-running --timeout-ms 240000` 已自然通过，证据为 `.lime/qc/verify-gui-smoke-reuse-sensenova-session-restore-2026-05-11-0108.log` 与 `.lime/qc/verify-gui-smoke-current.json`。本次 Claw streaming / interrupt / resume summary 为 `verdict=pass`、`recoveryVisibleSource=live-stream`、`interruptedTurnStatus=aborted`、`followTurnStatus=completed`。同时新增 `.lime/qc/gui-process-owner-current.json` 作为 best-effort raw process owner snapshot；当前仍为 `busy`，包含长时间 `smoke:design-canvas`、stale qcloop Codex worker 和多个 Cargo / Rust 进程。因此仍不启动新的完整 `verify:local` 或 full GUI P0，只记录 sidecar。

2026-05-11 01:23 追加只读续刷与 raw process owner 脚本化：新增 `npm run agent-qc:process-owner-check`，用于生成 `.lime/qc/gui-process-owner-current.json` 与 `.lime/qc/gui-process-owner-current.md`，避免继续依赖临时 `ps` 片段。最新只读结果仍为 `busy`：`activeGuiSmoke=2`、`cargoOrRust=6`、`qcloopRelated=7`；其中仍包含长时间 `smoke:design-canvas`、stale qcloop Codex worker PID `69738`，以及 Tauri / Cargo / Rust owner。同步刷新后的 qcloop status 仍为 `stale`：job `1778405842243079000` 保持 `4 success / 1 running / 3 pending / 1 stale`，`browser-runtime-site-adapter` stale 约 `27359s`，SQLite lease 被续约到 `2026-05-11T01:38:06+08:00`，active attempt stdout/stderr 仍为空。本轮仍未 kill / pause / interrupt / restart，未改 qcloop DB，未启动新的 full GUI P0 或完整 `verify:local`。

2026-05-11 01:28 追加完成审计前只读续刷：`qcloop-status.isolated-p0-full-v1-current.json` 仍为 `stale`，job `1778405842243079000` 保持 `4 success / 1 running / 3 pending / 1 stale`；active item `browser-runtime-site-adapter` stale 约 `27786s`，worker stdout/stderr 仍为 `0 / 0`。`gui-process-owner-current.json` 仍为 `busy`：`activeGuiSmoke=2`、`cargoOrRust=5`、`qcloopRelated=7`。SQLite 只读复核显示 lease 被续约到 `2026-05-11T01:43:06+08:00`。因此仍不能启动完整 `verify:local` 或新的 full GUI P0；completion audit 仍为 `incomplete`，缺口为 `real-qcloop-evidence` 与 `local-verify-gate`。

2026-05-11 01:32 追加 DB lease 取证脚本化：新增 `npm run agent-qc:qcloop-db-lease`，用于从 qcloop SQLite DB 只读导出 active item、lease、attempt stdout/stderr 长度与进程快照，替代临时 `sqlite3` 片段。使用该脚本刷新后，job `1778405842243079000` 仍为 `running`，active item `1778405842246191000` 仍是 `browser-runtime-site-adapter`，`lock_owner=qcloop-worker-1`，`lock_expires_at=2026-05-11T01:47:06+08:00`，active attempt `dc625f8e-b3b9-46b7-9758-4b0273438d50` stdout/stderr 仍为空。raw process owner 仍为 `busy`：`activeGuiSmoke=2`、`cargoOrRust=4`、`qcloopRelated=7`。本轮仍未处理 PID `69738`、未改 DB、未启动完整 `verify:local` 或新 full GUI P0。

2026-05-11 02:47 追加 raw process owner 精确化：`agent-qc:process-owner-check` 现在把 observer shell、passive qcloop serve 与 passive Tauri dev runtime 从 active owner 中拆出，只把真正会抢 GUI / 构建 / worker 的进程计入阻断。最新 `.lime/qc/gui-process-owner-current.json` 显示 `activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`passiveQcloopServer=6`、`passiveTauriRuntime=4`、`observer=1`；唯一 active blocker 是 PID `59011` 的 `npm run smoke:design-canvas ...`，已运行约 7 小时并被标记为 `staleActiveGuiSmoke=1`。该 sidecar 给出 `ownerIntervention.status=requires_owner_confirmation` 和确认文本；确认前仍不得 kill / pause / interrupt，也不得启动完整 `verify:local` 或新 full GUI P0。

2026-05-11 02:51 追加 stale raw GUI owner 处置请求：再次只读刷新后，PID `59011` 仍是唯一 active raw GUI smoke owner，`etime=07:04:53`。已写入 `.lime/qc/stale-raw-gui-owner-intervention-request.json` / `.md`，其中 `guardrails` 明确 `processTerminated=false`、`qcloopDbModified=false`、`officialEvidenceOverwritten=false`、`gitMutation=false`、`newFullP0Started=false`、`verifyLocalStarted=false`。确认前仍不得处理进程或启动重型门禁。

2026-05-11 02:55 追加 process owner core 回归：新增 `scripts/lib/agent-qc-process-owner-core.mjs` 与 `scripts/lib/agent-qc-process-owner-core.test.ts`，覆盖 etime 解析、命令脱敏、active GUI owner / passive qcloop serve / passive Tauri runtime / observer 分类，以及 active qcloop worker 与 Cargo build 仍阻断的场景。`npx vitest run scripts/lib/agent-qc-process-owner-core.test.ts scripts/lib/agent-qc-completion-audit-core.test.ts` 通过 `21 tests`。最新 process owner check 仍失败，唯一 active blocker 仍是 PID `59011`。

2026-05-11 02:59 追加 objective checklist：新增 `.lime/qc/objective-completion-checklist-current.json` / `.md`，把用户目标逐项映射到 internal/tests、manifest/schema、qcloop tooling、owner gate、官方 Evidence Pack、`verify:local` 和 git guardrail。短暂运行的外部 `verify:gui-smoke` transient owner 已自然结束，最新 process owner 又只剩 PID `59011` 作为 active blocker。

2026-05-11 03:01 追加 raw process owner watch history：`agent-qc:process-owner-check -- --watch-history-output ./.lime/qc/raw-process-owner-watch-history.jsonl` 已可追加 JSONL 观察记录。最新记录仍为 `busy`，唯一 active blocker 是 PID `59011`，`etime=07:16:00`。该历史只用于证明持续 stale，不构成处置授权。

2026-05-11 03:04 追加 objective checklist 脚本化：新增 `scripts/agent-qc-objective-checklist.mjs` 与 `npm run agent-qc:objective-checklist`。该脚本读取 completion audit、GUI owner、raw process owner，生成 `.lime/qc/objective-completion-checklist-current.json` / `.md`，并在 `--check` 下对 incomplete 状态 exit `1`。当前 checklist 仍为 `4/7`，不会把 sidecar 或 partial pass 误判为完成。

2026-05-11 03:07 追加 objective checklist core 回归：新增 `scripts/lib/agent-qc-objective-checklist-core.mjs` 与 `scripts/lib/agent-qc-objective-checklist-core.test.ts`，覆盖 owner clear / owner busy / official evidence fail / verify:local fail / Markdown 渲染。`npx vitest run scripts/lib/agent-qc-objective-checklist-core.test.ts scripts/lib/agent-qc-process-owner-core.test.ts scripts/lib/agent-qc-completion-audit-core.test.ts` 通过 `25 tests`。当前实际 checklist 仍为 `4/7`，`--check` 继续按预期 exit `1`。

2026-05-11 03:09 追加 raw GUI owner runbook：`internal/tests/lime-agent-qc-stale-owner-intervention.md` 第 8 节已覆盖 raw GUI owner stale 场景，明确确认文本、禁止动作、post-confirmation 最小闭环和关闭条件。该文档不授权处理 PID `59011`，只为后续 owner 明确确认后的执行提供边界。

2026-05-11 03:11 追加 local verify gate 关闭：`.lime/qc/verify-local-current.json` 与 `.lime/qc/verify-gui-smoke-current.json` 已为 `status=pass`。`agent-qc:audit` 当前为 `16/17`，只剩 `real-qcloop-evidence`；`agent-qc:objective-checklist` 当前为 `5/7`，`verify:local` 项已 PASS。raw process owner 仍因 PID `59011` busy，不能启动新的 full P0 qcloop。

2026-05-11 03:50 追加隔离 P0 full v2 终态记录：观察到本地已有 job `1778440541478632000`（`lime-agent-qc-isolated-p0-full-v2-2026-05-11-0315`）运行在 `127.0.0.1:18086` 并进入终态 `failed`，`qcloop-status.isolated-p0-full-v2-current.json` 为 `3 success / 5 exhausted / 0 stale`。已导出 sidecar `.lime/qc/agent-qc-evidence.isolated-p0-full-v2-2026-05-11-0315.json`，release summary `--check` 正确 exit `1`。该批次不能覆盖官方 Evidence Pack；本轮未启动新批次、未 kill 进程、未改 DB、未 push。随后 direct `npm run test:contracts` 通过，说明 v2 中 `command-bridge-contract` 的 mock drift 是历史运行证据，不能回写为 pass。

2026-05-11 04:24 追加隔离 P0 full v3 终态记录：观察到 job `1778442773271496000`（`lime-agent-qc-isolated-p0-full-v3-2026-05-11-0354`）运行在 `127.0.0.1:18087` 并进入终态 `failed`，`qcloop-status.isolated-p0-full-v3-current.json` 为 `4 success / 4 exhausted / 0 stale`。已导出 sidecar `.lime/qc/agent-qc-evidence.isolated-p0-full-v3-2026-05-11-0354.json`，release summary `--check` 正确 exit `1`。v3 pass 场景为 `command-bridge-contract`、`claw-chat-ready-streaming`、`tool-approval-sandbox-boundary`、`harness-replay-regression`；剩余失败 / blocked 场景为 `skill-forge-register-bind-enable`、`browser-runtime-site-adapter`、`workspace-ready-session-restore`、`release-package-startup-smoke`。最新 process owner 仍为 `busy`：activeGuiSmoke=`1`、qcloopRelated=`0`，cargoOrRust 数量随外部编译进度波动。PID `59011` 仍是 stale `smoke:design-canvas`，`etime≈8h41m`；同时外部 Rust 定向测试 / rustc 编译仍在跑。因此仍不得覆盖官方 `.lime/qc/agent-qc-evidence.json`，也不得发布。

2026-05-11 04:31 追加 Skill Forge P0 定向补证：v3 中 `skill-forge-register-bind-enable` 失败的核心原因是此前 `smoke:agent-service-skill-entry` 的 Rust exact filter 实际运行 0 tests，verifier 正确拒绝 runtime / SkillTool gate 证据。随后观察到当前 `scripts/agent-service-skill-entry-smoke.mjs` 已改为显式 `-p lime` / `-p lime-agent`、完整 test path + `--exact`，并拒绝没有 `N passed` 的 Rust 定向测试。证据 `.lime/qc/smoke-agent-service-skill-entry-after-rust-exact-fix-2026-05-11-0430.log` 显示当前 smoke 已通过，关键 Rust tests 均出现 `running 1 test` / `1 passed`，服务技能入口路由与 Agent A2UI 挂起主链 Vitest 也通过。该结果只关闭 Skill Forge 的本地定向 smoke 缺口，不能回写 v3 sidecar，也不能替代新的 single-owner full P0。

2026-05-11 04:32 追加 owner 复核：外部 Rust/Cargo owner 已自然清空，`agent-qc:process-owner-check` 最新 sidecar 为 `activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`staleActiveGuiSmoke=1`。唯一 active blocker 仍是 PID `59011` 的 stale `smoke:design-canvas`；确认前仍不得 kill / pause / interrupt，也不得启动新的 full GUI P0。

2026-05-11 04:39 追加 Skill Forge 单项 qcloop 补证终态：job `1778445171616868000`（`lime-agent-qc-skill-forge-rust-exact-fix-2026-05-11-0432`）在 `127.0.0.1:18087` 进入终态 `failed`，`0 success / 1 exhausted / 0 stale`。已导出 `.lime/qc/agent-qc-evidence.skill-forge-rust-exact-fix.json`，release summary `--check` 正确 exit `1`，因为该 sidecar 只覆盖单项且仍缺 runtime-transcript 层。该批次证明 deterministic smoke 侧已不再卡在 Rust exact filter / running 0 tests；新的真实缺口是 `skill-forge-register-bind-enable` 需要 live submit / stream / tool-request / decision / result 级 runtime transcript artifact。

2026-05-11 04:44 追加 post-job runtime transcript 与 owner 复核：再次只读刷新后，qcloop worker 进程已清空，raw process owner 仍为 `busy`，唯一 active blocker 是 PID `59011` 的 stale `smoke:design-canvas`，`activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`staleActiveGuiSmoke=1`。同时 `.lime/qc/skill-forge-runtime-transcript-current.json` 已生成，`scenarioId=skill-forge-register-bind-enable`、`result=pass`、`evidenceLayersCovered=deterministic-smoke,runtime-transcript`、`runtimeTranscript.events=8`。该 artifact 生成时间晚于单项 qcloop 失败，不能回写 `1778445171616868000`，只能作为下一轮 single-owner 单项重跑的输入或对照。当前仍未 kill / pause / interrupt PID `59011`，未改 qcloop DB，未覆盖官方 Evidence Pack，未执行 git commit / push / tag / release。

2026-05-11 04:48 追加 Skill Forge runtime transcript 单项通过：观察到 job `1778445676473687000`（`lime-agent-qc-skill-forge-runtime-transcript-2026-05-11-0441`）已 completed，`qcloop-status.skill-forge-runtime-transcript-current.json` 为 `1 success / 0 stale`。已导出 sidecar `.lime/qc/agent-qc-evidence.skill-forge-runtime-transcript.json`，其中 `skill-forge-register-bind-enable` 为 `pass`。同时运行 release summary `--check` 到 `.lime/qc/release-agent-qc.sidecar-skill-forge-runtime-transcript.md`，按预期 exit `1`，因为单项 sidecar 缺少其余 7 个 P0 场景。该结果可以作为下一轮 full P0 的前置信号，但不能覆盖官方 `.lime/qc/agent-qc-evidence.json`。

2026-05-11 04:52 追加 stale raw GUI owner 处置请求刷新：`agent-qc:process-owner-check` 仍显示 `activeGuiSmoke=1`、`cargoOrRust=0`、`qcloopRelated=0`、`staleActiveGuiSmoke=1`，唯一 active blocker 是 PID `59011`，`etime=09:06:20`。已刷新 `.lime/qc/stale-raw-gui-owner-intervention-request.json` / `.md`，确认文本保持 `确认处理 stale raw GUI owner PID 59011，可以终止这些进程并记录 sidecar。`。确认前仍未 kill / pause / interrupt，未改 DB，未启动 full GUI P0，未覆盖官方 Evidence Pack。

2026-05-11 04:54 追加 single-owner full P0 ready payload：已运行 `agent-qc:qcloop-job -- --risk P0 --check` 生成 `.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.json`，并写入说明 `.lime/qc/qcloop-p0-single-owner-ready-2026-05-11-0454.md`。该 payload 覆盖 8 个 P0 scenario 且 `_validation.valid=true`，但仅为待执行产物，没有提交 qcloop job、没有启动 GUI P0、没有覆盖官方 Evidence Pack。启动前仍必须先通过 `agent-qc:process-owner-check -- --check`、`agent-qc:gui-owner-check -- --check` 与 `agent-qc:qcloop-preflight -- --require-devbridge --check`。

2026-05-11 04:55 追加 ready payload coverage：新增 `.lime/qc/qcloop-p0-single-owner-ready-coverage-2026-05-11-0455.json` / `.md`，比较 ready payload 与 `internal/test/agent-qc-scenarios.manifest.json`。结果为 manifest P0 count=`8`、payload item count=`8`、missing=`none`、extra=`none`、orderMatchesManifest=`true`、payloadValidation=`true`；整体 status 仍为 `blocked`，因为 raw process owner gate 仍 busy。该 coverage 只证明待执行 payload 完整，不是 qcloop 执行结果。

2026-05-11 04:57 追加 post-owner-clear full P0 runbook：新增 `.lime/qc/post-owner-clear-full-p0-runbook-2026-05-11-0457.md` 与 `.lime/qc/qcloop-p0-single-owner-ready-submit-curl-2026-05-11-0457.txt`。该 runbook 明确 owner 清空后先跑 process owner / GUI owner / DevBridge preflight，再使用 dedicated qcloop port 提交 ready payload；只有 8/8 P0 success 后才允许覆盖官方 `.lime/qc/agent-qc-evidence.json` 并运行 release summary / audit / objective checklist。生成时未提交 job，未改 DB，未覆盖官方 evidence。

2026-05-11 04:59 追加 payload coverage 脚本化：新增 `npm run agent-qc:payload-coverage`，由 `scripts/agent-qc-payload-coverage.mjs` 读取 manifest、ready payload 和 raw process owner sidecar，输出 coverage / owner gate 状态。当前 `.lime/qc/qcloop-p0-single-owner-ready-coverage-current.json` 显示 coverage `passed=true`、missing=`[]`、extra=`[]`、owner=`busy`、status=`blocked`。`scripts/lib/agent-qc-payload-coverage-core.test.ts` 已覆盖 P0 提取、字符串 item 解析、ready / blocked / missing 场景。

2026-05-11 05:02 追加 completion audit 同步：`agent-qc:audit` 新增 `qcloop-payload-coverage` 检查项，最新 `.lime/qc/objective-completion-audit-current.json` 为 `17/18`，只剩 `real-qcloop-evidence`。该同步把 ready payload coverage 纳入目标审计，但不放宽发布门禁；payload coverage pass 仍不能替代 qcloop 8/8 full P0 pass。

2026-05-11 05:04 追加执行矩阵同步：`internal/tests/lime-agent-autonomous-test-execution-matrix.md` 的执行前 Owner Gate 已加入 `npm run agent-qc:payload-coverage`，并把 payload coverage sidecar 缺失或 manifest 不一致列为阻断条件。该更新保证后续启动 full P0 前同时满足 owner clear、DB lease clear、DevBridge preflight 和 payload coverage pass。

2026-05-11 05:10 追加 stale owner runbook 同步：`internal/tests/lime-agent-qc-stale-owner-intervention.md` 第 8.6 节已纳入精确进程树与 intervention plan sidecar，要求确认前只读生成 process tree / recursive tree / intervention plan，确认后也必须重新生成以防 PID / PGID 变化。该更新不授权当前 Agent 处理 PID `59011`，只把后续 owner 确认后的最小处置范围固化到长期 runbook。
