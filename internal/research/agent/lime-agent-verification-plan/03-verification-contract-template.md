# Agent Verification Contract 模板

> 用途：每个 Agent / Runtime / Plugin / Skill / Managed Objective 主链改动，在实现前先填这份合同。
> 执行计划主模板已迁入：`internal/exec-plans/templates/agent-verification-contract.md`

## 0. 当前入口

后续执行计划请优先使用：

- `internal/exec-plans/templates/agent-verification-contract.md`

本文件保留为 research 目录内的轻量说明和索引。

## 1. 基本信息

```text
改动名称：
负责人：
预算标签：budget:tight | budget:normal | budget:release
风险等级：P0 | P1 | P2
影响模块：
```

## 2. Current 主链

```text
前端入口：
前端网关：
Electron Desktop Host bridge：
App Server method：
RuntimeCore / service owner：
read model：
runtime event：
Evidence Pack 字段：
GUI surface：
```

## 3. Happy Path

```text
用户输入 / Agent 输入：
预期 runtime events：
预期 tool calls：
预期 approval / sandbox：
预期 artifact：
预期 evidence：
预期 GUI 状态：
失败时应停在哪一层：
```

## 4. Evidence Layers

| Layer | 本次是否需要 | 证据路径 |
| --- | --- | --- |
| deterministic-smoke |  |  |
| gui-trace |  |  |
| runtime-transcript |  |  |
| release-artifact |  |  |

## 5. 必跑命令

```bash
# C0

# C1

# C2

# C3 / C4，仅 release 或明确授权
```

## 6. Supervisor Rubric

Supervisor 只判断：

```text
1.
2.
3.
```

Supervisor 不判断：

```text
1. schema / contract / bridge 是否同步
2. mock 是否误入生产
3. Evidence Pack 是否导出
4. GUI owner 是否独占
```

输出格式：

```json
{
  "score": 0,
  "verdict": "pass|fail|needs-human-review",
  "regressions": [],
  "reason": ""
}
```

## 7. 回写规则

如果失败，必须至少回写一项：

- 单元测试
- Rust 定向测试
- fixture smoke
- qcloop scenario
- harness replay
- Playwright trace / GUI flow
- verifier rule
- evidence schema / summary contract

## 8. 完成标准

```text
主线目标是否完成：
已跑验证：
未跑验证及原因：
是否存在 token / Provider / GUI owner 风险：
是否可进入 release evidence：
```
