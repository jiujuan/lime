# Agent App P7 Schema Validator / Reference Snapshot Gate

更新时间：2026-05-15

## 一句话目标

P7 的目标是把 P6 新增的 v0.3 projection / readiness 字段变成可机械验证的门禁，防止后续靠散文记忆维护 schema coverage。当前实现先做本地 schema gate，不引入外部依赖、不接正式主路径。

## 当前落地

| 项 | 证据 |
|---|---|
| Projection gate | `src/features/agent-app/schema/schemaGate.ts` 提供 `validateProjectionSchemaCoverage()`，验证 v0.3 projection 必需 object / array 字段与 provenance。 |
| Readiness gate | `validateReadinessSchemaCoverage()` 验证 readiness arrays，以及 setup issue 的 `kind / key / remediation`。 |
| Snapshot test | `src/features/agent-app/schema/schemaGate.test.ts` 固定 content factory fixture 的 projection keys、readiness setup codes，并验证缺失字段会失败。 |
| 导出入口 | `src/features/agent-app/index.ts` 导出 schema gate API，便于后续接 CI / verify script。 |
| 无外部依赖 | 当前不新增 `ajv` 等依赖；P7 只提供本地结构门禁。 |

## Gate 范围

| 对象 | 当前检查 |
|---|---|
| Projection objects | `app / package / runtimePackage / provenance / lifecycle`。 |
| Projection arrays | `entries / requiredCapabilities / knowledgeBindings / artifactTypes / policies / services / workflows / skillRequirements / toolRequirements / evals / events / secrets / overlayTemplates / readinessHints`。 |
| Provenance | projection 和 entry provenance 必须包含 `appId / appVersion / packageHash / manifestHash`。 |
| Readiness arrays | `blockers / warnings / supportedCapabilities / missingCapabilities / entryReadiness`。 |
| Setup issues | `KNOWLEDGE_BINDING_REQUIRED / SKILL_REQUIRED / TOOL_REQUIRED / ARTIFACT_TYPE_REQUIRED / EVAL_REQUIRED / SECRET_REQUIRED / OVERLAY_REQUIRED / SERVICE_REQUIRED / WORKFLOW_REQUIRED` 必须包含 `kind / key / remediation`。 |

## 验证记录

| 命令 | 结果 |
|---|---|
| `npm run test -- src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/manifest/parseManifest.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/readiness/checkReadiness.test.ts` | 通过，10 tests。 |
| `npm run test -- src/features/agent-app/schema/schemaGate.test.ts src/features/agent-app/manifest/parseManifest.test.ts src/features/agent-app/projection/projectApp.test.ts src/features/agent-app/readiness/checkReadiness.test.ts src/features/agent-app/install/cloudBootstrap.test.ts src/features/agent-app/featureFlag.test.ts src/features/agent-app/sdk/MockCapabilityHost.test.ts src/features/agent-app/adapters/AdapterCapabilityHost.test.ts src/features/agent-app/runtime/contentFactoryDemo.test.ts src/features/agent-app/runtime/workflowRuntimeHost.test.ts src/features/agent-app/ui/AgentAppLabPage.test.tsx` | 通过，49 tests。 |
| `npm run typecheck` | 通过。 |
| `npm run test:contracts` | 通过。 |

## 剩余差距

| 差距 | 处理 |
|---|---|
| 尚未使用上游 JSON Schema 文件做完整 validation。 | P8 可评估引入轻量 schema validator 或生成本地 schema snapshot。 |
| Gate 只验证结构，不验证每个 descriptor 的深层字段类型。 | 后续按风险补充 descriptor-level validator。 |
| Reference CLI 输出没有纳入自动测试。 | 后续可通过 env 指定 `AGENTAPP_STANDARD_ROOT` 后运行 optional reference check。 |
| setup issues 仍是 warning / degraded。 | 进入正式主路径前需要 setup resolver 和 `needs-setup` 语义。 |

## 下一刀

P7 已完成本地 schema gate，后续 P8-P13 已继续完成 setup resolver、setup state store、installed state snapshot、local persistence adapter、package cache / verify / rollback 与 runtime package loader。[P14 Entry Runtime Guard / Permission Prompt](./p14-entry-runtime-guard-permission-prompt.md) 与 [P15 Lab Install / Launch Flow](./p15-lab-install-launch-flow.md) 已完成当前实现与定向验证，P15-H 已补 Agent App Lab 专用 GUI smoke / cleanup rehearsal 证据，P16 已完成最小 Agent App Manager；P17 Gate 审计、P17.0 Formal Entry Contract、P17.1 Formal route / nav / copy hardening、P17.2.1 Source state model、P17.2.2 Install review descriptor、P17.2.3 Registration hardening 与 P17.2.4a Cloud release descriptor / verification gate、P17.2.4b-1 acquisition seam / verified cache source、P17.2.4b-2 packageUrl fetch / staging / manifest extraction 与 P17.2.5 public schema / reference CLI / standard example package cross-check 已完成，P17.3 lifecycle / cleanup contract 与 P17.4 runtime surface production hardening 已完成，当前进入 P17.5 formal entry GUI smoke。
