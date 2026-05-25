# Lime Agent QC P0 场景执行手册

> 本文件是 `docs/tests/agent-ops-qc.md` 的执行层补充，专门描述 P0 场景如何被 Agent / qcloop / Playwright MCP 执行和验收。

## 1. 使用方式

先生成场景报告，确认 manifest 自身有效：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
```

如果要让 qcloop 批量执行，把 P0 场景作为 items 提交给 qcloop。推荐 item 直接使用 scenario id，便于后续导出 Evidence Pack：

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

也可以直接生成 qcloop job payload，避免手工维护 items：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --output "./.lime/qc/qcloop-p0-job.json" \
  --check
```

生成后由外层 Agent 调 qcloop API 创建和运行批次；本脚本只生成 payload，不会主动启动 qcloop 或提交任务。

qcloop 完成后导出 Evidence Pack：

```bash
npm run agent-qc:export-evidence -- \
  --job-id "<qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "<git-ref-or-release>" \
  --diff-base "origin/main" \
  --check
```

正式发布门禁只接受覆盖全部 P0 scenario id 的 `.lime/qc/agent-qc-evidence.json`。如果只是验证 qcloop 导出链路，应写入 `.lime/qc/agent-qc-evidence.partial.json`，不能把 partial evidence 当成发布通过证据。

如果 qcloop 不在运行，也可以用离线 JSON：

```bash
node scripts/agent-qc-export-evidence.mjs \
  --job-json "./tmp/qcloop-job.json" \
  --items-json "./tmp/qcloop-items.json" \
  --output "./tmp/agent-qc-evidence.json" \
  --check
```

发布前生成 release note 可引用的 Agent QC 摘要：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "docs/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --tag "<release-tag>" \
  --output "./.lime/qc/release-agent-qc.md" \
  --check
```

正式 `release.yml` 默认也会读取 `.lime/qc/agent-qc-evidence.json`。如果团队把 evidence pack 放在其他路径，使用 workflow dispatch 时必须填写 `agent_qc_evidence_path`；否则发布会被 Agent QC 硬门禁阻断。

## 2. P0 场景矩阵

| Scenario | 最低入口 | 关键证据 | 阻断条件 |
| --- | --- | --- | --- |
| `command-bridge-contract` | `npm run test:contracts` | 命令合同日志、四侧同步摘要 | 前端/Rust/mock/catalog 任一侧缺失 |
| `claw-chat-ready-streaming` | `npm run verify:gui-smoke -- --include-live-provider-smokes` + Playwright MCP | GUI trace、DevBridge、runtime transcript、console/network | workspace 未 ready、流式卡死、中断不可恢复；未显式允许 live Provider 时不得把默认 GUI smoke 当作 runtime transcript 证据 |
| `tool-approval-sandbox-boundary` | `npm run smoke:agent-runtime-tool-surface` + `npm run smoke:agent-runtime-approval-sandbox -- --allow-live-provider` | tool timeline、approval decision、sandbox policy | 工具绕过授权、超时无恢复、危险工具暴露；默认确定性 smoke 不能替代 live runtime transcript |
| `skill-forge-register-bind-enable` | `npm run test:contracts` + `npm run smoke:agent-service-skill-entry` | draft、verify/register、runtime binding、`.lime/qc/skill-forge-runtime-transcript-current.json` 中的 SkillTool request/decision/result/source metadata | 把 registered 误判为 executable、metadata 自动启用 skill |
| `browser-runtime-site-adapter` | `npm run smoke:browser-runtime` + `npm run smoke:site-adapters` | browser session、adapter catalog、console/network、cleanup | session 泄漏、adapter 漂移、cleanup 缺失 |
| `workspace-ready-session-restore` | `npm run smoke:workspace-ready` + `npm run verify:gui-smoke` | workspace smoke、GUI smoke、DevBridge、design canvas 工程保存 / 打开结果 | ready 假阳性、会话恢复脏状态、设计画布导出无保存状态 |
| `harness-replay-regression` | `npm run harness:eval` + `npm run harness:eval:trend` | summary、trend、invalid case、observability outcome | fixture invalid、grader 合同漂移、trend 断裂 |
| `release-package-startup-smoke` | `npm run verify:app-version` + release / GUI startup smoke | 版本一致性、启动 smoke、artifact 或 source-tree 启动范围、waiver、GUI smoke 自然收口 | 手工口头放行、版本不一致、安装启动失败、把 source-tree smoke 伪装成 installer 验证、GUI smoke 卡在设计画布导出 |

### 2.1 证据深度分层

P0 场景允许先用确定性 smoke 快速证明主路径可执行，但 release gate 不能只看 smoke 摘要。每个 worker stdout 必须明确声明本次覆盖的是哪一层：

| 层级 | 允许证明什么 | 不能替代什么 |
| --- | --- | --- |
| `deterministic-smoke` | 命令能运行、DevBridge 可达、workspace ready、基础 runtime surface 可读 | live long-turn transcript、真实中断恢复、approval/sandbox 完整轨迹 |
| `gui-trace` | 用户路径截图 / trace、console/network 摘要、关键 UI 断言 | 后端 turn 持久化和 tool timeline |
| `runtime-transcript` | submit / stream / interrupt / resume / tool request / decision / result 顺序 | GUI 可见性、桌面壳启动、发布包启动 |
| `release-artifact` | 安装包或 source-tree 启动范围、版本一致性、waiver；若没有安装包，必须明确标记 `source-tree startup scope`，不能伪装 installer | 运行期 Agent 行为质量 |

如果当前只跑到 `deterministic-smoke`，worker 可以输出 `QCLOOP_WORKER_RESULT=PASS` 表示命令通过；但 verifier 仍应在缺少 deep evidence 时判该 P0 场景不满足 release pass。正确做法是补证据或拆分场景，不是降低 verifier。

`npm run agent-qc:check` 会机械校验 P0 场景必须声明合法 `evidenceLayers`。当前允许的层级是 `deterministic-smoke`、`gui-trace`、`runtime-transcript`、`release-artifact`；缺失或未知层级都应阻断。

## 3. GUI 场景证据要求

GUI 场景不能只提交截图，至少要包含：

- DevBridge 是否健康。
- GUI session owner / isolation statement：说明本次是否独占 Lime GUI / DevBridge 会话，或列出仍在 running/stale 的 GUI qcloop sidecar。
- 关键用户路径的页面状态。
- console error 摘要。
- network error 摘要。
- 如果使用 Playwright MCP，记录操作步骤和最终断言。
- 如果命中 mock fallback，必须说明这是预期 mock 还是错误退化。

同一台机器上的 GUI P0 不应并发运行多个 full P0 qcloop 批次。多个 worker 复用同一个 `127.0.0.1:1420` / `127.0.0.1:3030` 会话时，页面导航、按钮点击和状态断言可能互相抢占；这类失败必须按 `parallel GUI smoke interference` 记录，而不是直接归咎产品。

启动新的 GUI P0 批次前，先执行：

```bash
npm run agent-qc:gui-owner-check -- --check
```

该检查发现 active GUI qcloop owner 时必须阻断新批次。

## 4. Runtime 场景证据要求

Runtime 场景不能只提交最终回答，至少要包含：

- turn / request id。
- tool call timeline。
- approval decision。
- sandbox policy。
- tool result 或 error。
- 中断、超时、失败后的恢复动作。

## 5. Verifier 判定规则

- 缺证据时输出 `needs-human-review`，不要输出 `pass`。
- 环境或权限阻断时输出 `blocked`，不要输出 `fail`。
- `failed` / `exhausted` qcloop item 对应 Evidence Pack `fail`。
- `pending` / `running` qcloop item 对应 Evidence Pack `blocked`。
- qcloop job 的 `verifier_prompt_template` 必须显式包含 `{{stdout}}` 或 `{{output}}`，否则 verifier 看不到 worker 输出；`agent-qc:qcloop-job` 会自动补充 stdout / attempt 状态占位符。
- 只有所有必需证据齐全且 verifier 条件满足时才输出 `pass`。

## 6. 失败沉淀

P0 失败修复后必须至少做一项沉淀：

- 新增或提升 harness replay case。
- 新增 qcloop scenario item。
- 新增 Playwright MCP 操作手册或可复用 trace。
- 新增 Vitest / Rust 定向回归。
- 更新 Evidence Pack verifier 规则，防止同类缺证据再次误通过。
