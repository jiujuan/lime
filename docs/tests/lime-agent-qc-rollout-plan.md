# Lime Agent 运营级测试落地计划

> 本文件把 `docs/tests/agent-ops-qc.md` 的标准落到 Lime 当前产品上：Lime 只是标准协议的一个实现样本，但它需要在上线运营前证明 Agent Runtime、Agent UI、GUI 桌面壳、工具调用、发布包和 qcloop 证据链都能长期自测。

## 1. 建设目标

Lime 不能继续依赖“人工点一遍”来判断是否可运营。目标是让每次高风险改动都能自动进入以下闭环：

```text
Diff / Release Candidate
  -> 质量规划器识别风险
  -> qcloop 拆成 Agent QC 场景
  -> npm / Rust / Playwright MCP / Harness 执行
  -> Evidence Pack 落盘
  -> 独立 verifier 判定
  -> 失败样本进入 replay / smoke / regression
  -> release gate 只读证据，不读口头结论
```

完成后，人类只审核例外：高风险 waiver、语义争议、生产凭证、无法自动化的外部依赖。

## 2. Lime 当前基础

| 能力 | 当前入口 | 当前角色 |
| --- | --- | --- |
| 本地智能校验 | `npm run verify:local` | 选择前端、Rust、契约和 smoke 的最低门槛 |
| 桥接契约 | `npm run test:contracts` | 防止前端、Rust、DevBridge、mock、治理目录漂移 |
| GUI 冒烟 | `npm run verify:gui-smoke` | 验证 Tauri 壳、DevBridge、workspace、browser runtime 等主路径 |
| Runtime smoke | `npm run smoke:agent-runtime-tool-surface` | 验证 tool surface、runtime strip、工作台能力摘要 |
| Browser / Site Adapter | `npm run smoke:browser-runtime`、`npm run smoke:site-adapters` | 验证浏览器会话、adapter catalog 和清理边界 |
| Harness eval | `npm run harness:eval`、`npm run harness:eval:trend` | 验证 replay、grader、行为趋势 |
| Agent QC 标准 | `npm run agent-qc:check` | 校验 scenario manifest、GUI flow manifest 和 npm script 引用 |
| qcloop 证据 | `npm run agent-qc:export-evidence` | 把 qcloop job/items 转成 Evidence Pack |
| 发布证据 | `npm run agent-qc:release-summary` | 把 Evidence Pack 汇总到 release note 并作为硬门禁 |

当前最关键的缺口不是“没有测试命令”，而是还没有把完整 P0 qcloop 批次稳定导出为 `.lime/qc/agent-qc-evidence.json`。

## 3. 分阶段落地

### Phase 0：证据链打底

目标：所有 Agent QC 资产都可被机器校验。

执行：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
npm run agent-qc:audit
```

验收：

- `docs/test/agent-qc-scenarios.manifest.json` 有 P0/P1 场景、lane、命令、证据要求和 verifier。
- `docs/test/agent-qc-gui-flows.manifest.json` 有 GUI / Playwright MCP 步骤和断言。
- `docs/test/agent-qc-evidence.schema.json` 固定 Evidence Pack 形状。
- `npm run test:contracts` 已包含 `agent-qc:check`。

### Phase 1：qcloop 最小真实链路

目标：不启动重型 GUI、不影响其他本地进程，先证明 qcloop API -> Evidence Pack exporter 可用。

建议先读取现有完成批次，或只运行轻量 P0 场景。qcloop 本地 API 建议使用 IPv4 loopback，避免 `localhost` 被代理或 IPv6 解析干扰：

```bash
npm run agent-qc:qcloop-job -- \
  --scenario command-bridge-contract \
  --cwd "$(pwd)" \
  --base-url "http://127.0.0.1:8080" \
  --output "./.lime/qc/qcloop-command-bridge-job.json" \
  --check
```

如果只需要验证历史 qcloop 结果导出，不要写入正式发布门禁路径，先写 partial：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<completed-qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.partial.json" \
  --ref "local-qcloop-partial" \
  --check
```

验收：

- partial evidence 的 `verdict.status` 能反映真实 job/item 状态。
- scenario id 来自 `scenario_id`；历史 job 可退化读取 `name` / `entry`。
- partial evidence 不能作为 release pass 证据。

### Phase 2：P0 全量 Agent QC 批次

目标：把 8 个 P0 场景全部交给 qcloop 执行，并导出正式 Evidence Pack。

执行：

```bash
npm run agent-qc:qcloop-job -- \
  --risk P0 \
  --cwd "$(pwd)" \
  --base-url "http://127.0.0.1:8080" \
  --output "./.lime/qc/qcloop-p0-job.json" \
  --check
```

外层 Agent 创建并运行 qcloop job 后导出：

```bash
npm run agent-qc:export-evidence -- \
  --base-url "http://127.0.0.1:8080" \
  --job-id "<p0-qcloop-job-id>" \
  --output "./.lime/qc/agent-qc-evidence.json" \
  --ref "<release-or-pr-ref>" \
  --diff-base "origin/main" \
  --check
```

验收：

- `.lime/qc/agent-qc-evidence.json` 的 `verdict.status` 是 `pass`。
- `scenarioResults` 覆盖 manifest 中所有 P0 scenario id，而不是只满足数量。
- `npm run agent-qc:audit` 的 `real-qcloop-evidence` 通过。

### Phase 3：GUI / Agent UI 证据增强

目标：不只证明命令通过，还要证明 Lime 的 GUI 主路径真的可用。

每个 GUI 场景至少记录：

- DevBridge ready 状态。
- workspace ready 或 session restore 状态。
- 操作步骤和最终断言。
- console error 摘要。
- network error 摘要。
- 截图、trace 或结构化快照。
- mock fallback 是否预期。

推荐路径：

```bash
npm run verify:gui-smoke
npm run agent-qc:gui-flow:report
```

需要真实交互时，用 Playwright MCP 复用已有桌面 Chrome 会话，避免打断本地桌面工作流。证据保存到 `.lime/qc/gui-evidence/`，再由 release summary 引用。

### Phase 4：Runtime / Tool / Approval 深测

目标：让 Lime Agent 不是“能回答”，而是工具链、授权、sandbox 和恢复行为都可靠。

重点场景：

| 场景 | 必须采集的证据 |
| --- | --- |
| 工具调用 | tool name、input 摘要、result / error、timeline |
| approval | request id、decision、拒绝后的恢复行为 |
| sandbox | policy、允许/拒绝边界、危险工具未暴露证据 |
| streaming | first token、interrupt、resume、错误转态 |
| Skill Forge | draft、verify、register、binding、session enable、SkillTool allowlist |
| Browser runtime | session、adapter、console/network、cleanup |

失败后必须沉淀为至少一种长期资产：Vitest、Rust 定向测试、smoke、harness replay、qcloop scenario 或 Playwright MCP flow。

### Phase 5：Release Gate

目标：发布流程只接受证据，不接受口头结论。

发布前必须生成：

```bash
npm run agent-qc:release-summary -- \
  --evidence "./.lime/qc/agent-qc-evidence.json" \
  --require-scenario-manifest "docs/test/agent-qc-scenarios.manifest.json" \
  --require-risk P0 \
  --harness-summary "./.lime/harness/reports/harness-eval-summary.json" \
  --harness-trend "./.lime/harness/reports/harness-eval-trend.json" \
  --tag "<release-tag>" \
  --output "./.lime/qc/release-agent-qc.md" \
  --check
```

验收：

- release workflow 在 Evidence Pack 缺失、非 pass 或 blocker 未处理时失败。
- release note 包含质量证据摘要。
- waiver 必须有 owner、原因、过期时间和复测计划。

## 4. 让 Lime Agent 更强健的反馈闭环

运营级测试的价值不只是“拦发布”，还要持续强化 Agent：

| 失败类型 | 回写资产 | 强化效果 |
| --- | --- | --- |
| 命令合同漂移 | `test:contracts` / governance catalog | 防止桥接与 mock 分叉 |
| GUI ready 假阳性 | `verify:gui-smoke` / Playwright flow | 防止用户首屏不可用 |
| 工具误用 | runtime smoke / tool permission test | 防止危险工具绕过授权 |
| streaming 卡死 | harness replay / UI regression | 防止长回答或中断后失控 |
| Skill 误启用 | metadata builder test / Rust gate test | 防止 registered 被误认为 executable |
| Browser session 泄漏 | browser runtime smoke | 防止后台资源泄漏 |
| 语义退化 | harness eval / grader | 防止只看命令成功却回答变差 |
| 发布包启动失败 | release startup smoke | 防止源码可跑但安装包不可用 |

每次 P0 失败修复后，必须问一个问题：这次失败下次能否由机器先发现？如果不能，修复不算闭环。

## 5. 当前执行建议

在本地还有其他进程运行时，不建议直接启动完整 P0 qcloop 批次或重型 GUI release smoke。更安全的下一刀是：

1. 用现有完成的 qcloop job 导出 partial evidence，验证 exporter 链路。
2. 运行 `npm run agent-qc:check` 和 Agent QC 相关定向单测。
3. 保持 `npm run agent-qc:audit` 为 `incomplete`，直到完整 P0 evidence 真正存在。
4. 等本地环境空闲后再执行 Phase 2，把 `.lime/qc/agent-qc-evidence.json` 作为正式发布门禁证据。
