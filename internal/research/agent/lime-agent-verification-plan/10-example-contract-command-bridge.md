# 样例：`command-bridge-contract` Verification Contract

> 状态：example
> 更新时间：2026-07-02
> 目标：示范如何在低 token 预算下填写 Agent Verification Contract。本文是样例，不代表已经执行本场景验证。

## 1. 基本信息

```text
改动名称：command bridge contract 低成本复核样例
执行计划文件：internal/research/agent/lime-agent-verification-plan/10-example-contract-command-bridge.md
负责人：TBD
预算标签：budget:tight
风险等级：P0 scenario / deterministic-only sample
影响模块：App Server / Electron Desktop Host / 前端网关 / governance catalog / mock guard
不做范围：不跑 qcloop，不跑 GUI smoke，不跑 live Provider，不写 official Evidence Pack
```

## 2. Current 主链

```text
前端入口：src/lib/api/* 中声明的 current 网关
前端网关：按具体命令族选择
Electron Desktop Host bridge：仅桌面壳能力需要进入；App Server method 走 AppServerClient
App Server method：按具体命令族选择
RuntimeCore / service owner：按具体命令族选择
read model：不适用，contract 场景只验证命令边界一致性
runtime event：不适用，contract 场景只验证命令边界一致性
Evidence Pack 字段：不写 official evidence；如进入 Agent QC，仅输出 structured summary
GUI surface：不适用
```

## 3. Happy Path

```text
用户输入 / Agent 输入：一次命令边界改动或 contract 复核
预期 runtime events：不适用
预期 tool calls：不适用
预期 approval / sandbox：不适用
预期 artifact：contract 检查日志
预期 evidence：deterministic-smoke evidence summary
预期 GUI 状态：不适用
失败时应停在哪一层：contract / governance guard，不进入 qcloop
```

## 4. Evidence Layers

| Layer | 本次是否需要 | 证据路径 / 计划路径 | 不需要的原因 |
| --- | --- | --- | --- |
| deterministic-smoke | 是 | `npm run test:contracts` 输出摘要 | 结构同步必须由确定性检查证明 |
| gui-trace | 否 | 无 | 本样例不涉及 GUI 表面 |
| runtime-transcript | 否 | 无 | 本样例不涉及 turn / tool runtime |
| release-artifact | 否 | 无 | 本样例不是 release 验证 |

## 5. 必跑命令

```bash
# C0
npm run agent-qc:check
npm run test:contracts

# C1
# 不需要。除非具体命令族还影响 runtime fixture。

# C2
# 不需要。无 GUI surface。

# C3 / C4
# 禁止。budget:tight 下不跑 qcloop / live Provider。
```

未跑命令：

```text
未跑：qcloop full P0
原因：本样例只证明 contract 低成本路径，不需要 worker/verifier。
风险：不能作为 official Evidence Pack。
后续触发条件：release 候选或 command-bridge-contract 作为 P0 official evidence 时再进入 qcloop。
```

## 6. Agent QC 场景映射

受影响 P0 / P1 场景：

```text
P0: command-bridge-contract
P1: 无
P2: 无
```

选择依据：

```text
为什么需要：命令边界、mock guard、catalog 和协议同步属于该 P0 场景。
为什么不需要其它 P0：本样例不触达 GUI、runtime transcript、tool approval、SkillTool、browser runtime、release artifact。
是否允许单场景 sidecar：允许，但不是本样例目标。
是否允许进入 official evidence：不允许。official evidence 必须同一批次 8/8 P0 pass。
```

## 7. Supervisor Rubric

Supervisor 只判断：

```text
不需要 Supervisor。
```

Supervisor 不判断：

```text
1. schema / contract / bridge 是否同步
2. mock 是否误入生产
3. command catalog 是否一致
```

原因：

```text
这些都属于确定性检查，应由 test:contracts 和治理脚本证明。
```

## 8. 回写规则

如果失败，必须至少回写一项：

```text
失败类型：contract / governance guard 失败
回写资产：对应 contract test、command catalog guard、mock fallback guard 或 boundary doc
关闭条件：同一命令族的 test:contracts 通过，并说明失败归因
```

## 9. 完成标准

```text
主线目标是否完成：本样例只示范合同填写，不宣称产品验证完成
已跑验证：无
未跑验证及原因：所有命令均未执行，避免样例文档消耗环境成本
是否存在 token / Provider / GUI owner 风险：无
是否可进入 release evidence：否
下一刀：选择真实低风险 command boundary 改动，按本样例填入对应 current owner 和证据路径
```
