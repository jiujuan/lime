# Agent Verification Contract 模板

> 状态：template
> 更新时间：2026-07-02
> 用途：Agent / Runtime / Agent App / Skill / Managed Objective / Harness / GUI 主链改动在实现前填写，用低 token 成本先定义“什么算对”。

## 0. 什么时候必须填写

遇到以下任一情况，执行计划必须包含本合同：

- 改动影响 Agent turn / subagent turn / automation job。
- 改动影响 App Server JSON-RPC、RuntimeCore、`src/lib/api/*` 网关、Electron Desktop Host bridge。
- 改动影响 streaming、stop / resume、tool lifecycle、approval、sandbox、MCP inventory。
- 改动影响 Skill Forge / SkillTool / workspace skill runtime enable。
- 改动影响 Agent App install / package / UI runtime / shell lifecycle。
- 改动影响 Harness Evidence Pack、replay、analysis handoff、review template。
- 改动影响 Managed Objective continuation / audit / automation owner binding。
- 改动影响 Agent UI projection、Subagents、review lane、work board、remote teammate。
- 改动需要宣称 Agent QC、GUI smoke、runtime fixture 或 release evidence 可交付。

可不填写：

- 纯文案解释、单次研究笔记、无执行主链影响的只读复核。
- 明确只改非 Agent 相关静态文档，且不宣称产品验证结论。

## 1. 预算标签

本次验证预算：

```text
budget:tight | budget:normal | budget:release
```

口径：

| 标签 | 允许范围 |
| --- | --- |
| `budget:tight` | 只跑 C0 / C1：静态、contract、fixture、离线 smoke；禁止 qcloop、live Provider、开放式 LLM judge |
| `budget:normal` | 可跑 targeted GUI smoke / 单场景 sidecar；LLM judge 只允许单 rubric、裁剪输入 |
| `budget:release` | 可跑 selected qcloop / live Provider / full P0，但必须有 owner、场景、上限、证据路径 |

成本层：

| 层 | 默认入口 |
| --- | --- |
| C0 | `npm run agent-qc:check`、`npm run test:contracts` |
| C1 | `npm run smoke:agent-runtime-current-fixture`、相关 fixture / unit |
| C2 | `npm run verify:gui-smoke -- --reuse-running` |
| C3 | `npm run agent-qc:qcloop-job` 单场景或 selected scenario |
| C4 | live Provider / long-turn / release full P0 |

## 2. 基本信息

```text
改动名称：
执行计划文件：
负责人：
预算标签：
风险等级：P0 | P1 | P2
影响模块：
不做范围：
```

## 3. Current 主链

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

如果任一项“不适用”，必须写明原因。不要用“暂不确定”作为完成状态。

## 4. Happy Path

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

## 5. Evidence Layers

| Layer | 本次是否需要 | 证据路径 / 计划路径 | 不需要的原因 |
| --- | --- | --- | --- |
| deterministic-smoke |  |  |  |
| gui-trace |  |  |  |
| runtime-transcript |  |  |  |
| release-artifact |  |  |  |

规则：

- GUI 场景不能只给截图，必须说明 DevBridge / console / network / owner。
- Runtime 场景不能只给最终回答，必须说明 turn / stream / tool / approval / sandbox。
- Release 场景必须说明 source-tree、installer artifact 或 CI artifact scope。

## 6. 必跑命令

```bash
# C0

# C1

# C2

# C3 / C4，仅 release 或明确授权
```

未跑命令必须写：

```text
未跑：
原因：
风险：
后续触发条件：
```

## 7. Agent QC 场景映射

受影响 P0 / P1 场景：

```text
P0:
P1:
P2:
```

选择依据：

```text
为什么需要：
为什么不需要其它 P0：
是否允许单场景 sidecar：
是否允许进入 official evidence：
```

## 8. Supervisor Rubric

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
5. release scope 是否明确
```

输入限制：

```text
只输入 evidence summary / transcript summary / artifact summary / rubric。
不输入完整 stderr、完整开发聊天、API key、未脱敏请求响应。
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

## 9. 回写规则

如果失败，必须至少回写一项：

- 单元测试
- Rust 定向测试
- fixture smoke
- qcloop scenario
- harness replay
- Playwright trace / GUI flow
- verifier rule
- evidence schema / summary contract

本次预期回写入口：

```text
失败类型：
回写资产：
关闭条件：
```

## 10. 完成标准

```text
主线目标是否完成：
已跑验证：
未跑验证及原因：
是否存在 token / Provider / GUI owner 风险：
是否可进入 release evidence：
下一刀：
```

## 11. 最小示例

```text
预算标签：budget:tight
风险等级：P1
影响模块：Agent runtime streaming completion
Current 主链：agentSession/turn/start -> RuntimeCore event -> thread_read -> GUI projection
Happy Path：stop 后同一 session 可继续提交下一轮，旧 terminal event 不误停新 stream
Evidence Layers：deterministic-smoke=yes，runtime-transcript=yes，gui-trace=no，release-artifact=no
必跑命令：test:contracts + smoke:agent-runtime-current-fixture
Agent QC 场景：claw-chat-ready-streaming 仅记录受影响，不跑 full P0
Supervisor：不需要
```
