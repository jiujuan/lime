# Agent QC 分级策略

> 目标：把 Agent QC 从“全量昂贵流程”改成“按风险选择最小证据集”。

## 1. 为什么要分级

Agent QC 以前做到一半停下来，核心原因不是方向错，而是默认路线太重：

- qcloop worker 会消耗大量 token。
- verifier 如果拿不到结构化证据，会反复失败并重试。
- GUI P0 会抢 owner，导致并发干扰。
- live Provider / 长程 Agent 会放大成本和不确定性。

因此，Agent QC 后续必须按风险分级运行。

## 2. 日常开发模式

适用：

- 非发布改动
- Agent 主链局部改动
- 文档 / contract / fixture 补强

默认命令：

```bash
npm run agent-qc:check
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
```

GUI 改动再加：

```bash
npm run verify:gui-smoke -- --reuse-running
```

禁止：

- full P0 qcloop
- live Provider
- 多 worker GUI 场景
- 开放式 LLM judge

## 3. P0 单场景模式

适用：

- 只影响某一个 P0 场景
- 需要复核 blocker 修复

做法：

1. 先跑 `agent-qc:gui-owner-check -- --check`。
2. 生成只包含目标 scenario 的 qcloop payload。
3. worker 必须输出 `QCLOOP_EVIDENCE_SUMMARY_JSON`。
4. sidecar 只作为该场景证据，不覆盖 official evidence。

## 4. Release 候选模式

适用：

- 发版前
- Agent runtime / GUI 主路径大改
- 多 P0 交叉影响

要求：

```text
8/8 P0 同一批次覆盖
8/8 structured evidence summary
official .lime/qc/agent-qc-evidence.json pass
agent-qc:release-summary --check pass
agent-qc:audit complete
```

禁止：

- 拼接多个 partial sidecar 当 official evidence。
- 降低 verifier 门槛。
- 把 source-tree smoke 伪装成 installer artifact smoke。

## 5. LLM Judge 使用模式

只有在以下情况才允许：

- deterministic checks 已经通过。
- 问题确实是语义质量。
- 输入是裁剪后的 evidence summary，不是完整日志。
- 输出是结构化 JSON verdict。

示例：

```json
{
  "score": 0.82,
  "verdict": "pass",
  "regressions": [],
  "needsHumanReview": false
}
```

## 6. 阻断分类

| 分类 | 处理方式 |
| --- | --- |
| 产品 blocker | 修产品，并补 deterministic 回归 |
| 环境 blocker | 修 qcloop / DevBridge / owner gate，不算产品失败 |
| 证据 blocker | 补 evidence summary / artifact / transcript |
| 并发 blocker | single-owner gate，禁止并发 GUI full P0 |
| 成本 blocker | 降级为 fixture / replay / targeted scenario |
