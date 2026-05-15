# Agent App P8 Setup Resolver / Needs-Setup Semantics

更新时间：2026-05-15

## 一句话目标

P8 的目标是把 P6/P7 中“结构可见”的 setup checks 推进成明确的 readiness 语义：当 Knowledge、Skill、Tool、Secret、Overlay、Eval、Service、Workflow 等 resolver 输入缺失时，App 进入 `needs-setup`，而不是被误判为 `ready` 或普通 `degraded`。

## 当前落地

| 项 | 证据 |
|---|---|
| 状态语义 | `ReadinessStatus` 增加 `needs-setup`。 |
| Resolver 输入 | `AgentAppSetupState` 支持 `knowledgeBindings / skills / tools / artifactTypes / evals / secrets / overlays / services / workflows`。 |
| Readiness 合并 | `checkReadiness()` 接收 `setup?: AgentAppSetupState`；未 resolved 的 setup descriptor 生成 setup issue，已 resolved 的 descriptor 不再报缺口。 |
| UI 文案 | Agent App Lab 五语言新增 `agentApp.lab.status.needs-setup`。 |
| UI 表现 | `needs-setup` 使用蓝色状态，图标走待处理提示，不显示成成功。 |
| 运行边界 | P8 没有接真实 resolver / ToolHub / Secret Manager；只定义 readiness 输入和状态语义。 |

## 状态决策

```text
存在 hard blocker（capability 缺失、Cloud disabled、hash/policy 阻断等） -> blocked
无 hard blocker，但存在 required setup issue -> needs-setup
无 required setup issue，但存在 warning -> degraded
无 issue -> ready
```

说明：当前 setup issue 的 `severity` 仍是 warning，以避免破坏 P1-P4 Lab runtime；但全局 `status` 会进入 `needs-setup`，从产品语义上避免假 ready。进入正式主路径前，runtime guard 应按入口策略决定是否允许 `needs-setup` 下的 demo / preview 动作。

## Resolver 输入草案

```ts
type AgentAppSetupState = {
  knowledgeBindings?: Record<string, boolean>
  skills?: Record<string, boolean>
  tools?: Record<string, boolean>
  artifactTypes?: Record<string, boolean>
  evals?: Record<string, boolean>
  secrets?: Record<string, boolean>
  overlays?: Record<string, boolean>
  services?: Record<string, boolean>
  workflows?: Record<string, boolean>
}
```

## 验证记录

| 命令 | 结果 |
|---|---|
| `npm run test -- src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx src/i18n/__tests__/translation-coverage.test.ts src/i18n/__tests__/loadNamespace.test.ts src/i18n/__tests__/types.test.ts` | 通过，29 tests。 |
| `npm run test -- src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/manifest/parseManifest.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/install/cloudBootstrap.test.ts src/features/agent-app/featureFlag.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/adapters/AdapterCapabilityHost.test.ts src/features/agent-app/runtime/contentFactoryDemo.test.ts src/features/agent-app/runtime/workflowRuntimeHost.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，50 tests。 |
| `npm run typecheck` | 通过。 |
| `npm run test:contracts` | 通过。 |

## 剩余差距

| 差距 | 处理 |
|---|---|
| Resolver 现在只有布尔输入，没有真实数据来源。 | P9 接本地 installed setup state store。 |
| Tool / Secret / Overlay / Skill 尚未接真实服务。 | 后续分别接 ToolHub、Secret Manager、Overlay Resolver、AgentSkills catalog。 |
| Entry-specific setup 尚未细分到每个 workflow / page。 | P9/P10 增加 entry-level setup resolver。 |
| `needs-setup` 下 runtime guard 仍允许 Lab demo。 | 正式主路径前按 entry policy 加严格 guard。 |

## 下一刀

P8 已完成 readiness 语义层，后续 P9-P13 已继续完成本地 setup state store、installed state snapshot、local persistence adapter、package cache / verify / rollback 与 runtime package loader。[P14 Entry Runtime Guard / Permission Prompt](./p14-entry-runtime-guard-permission-prompt.md) 与 [P15 Lab Install / Launch Flow](./p15-lab-install-launch-flow.md) 已完成当前实现与定向验证，P15-H 已补 Agent App Lab 专用 GUI smoke / cleanup rehearsal 证据，P16 已完成最小 Agent App Manager；P17 Gate 审计、P17.0 Formal Entry Contract、P17.1 Formal route / nav / copy hardening、P17.2.1 Source state model、P17.2.2 Install review descriptor、P17.2.3 Registration hardening 与 P17.2.4a Cloud release descriptor / verification gate、P17.2.4b-1 acquisition seam / verified cache source、P17.2.4b-2 packageUrl fetch / staging / manifest extraction 与 P17.2.5 public schema / reference CLI / standard example package cross-check 已完成，P17.3 lifecycle / cleanup contract 与 P17.4 runtime surface production hardening 已完成，当前进入 P17.5 formal entry GUI smoke。
