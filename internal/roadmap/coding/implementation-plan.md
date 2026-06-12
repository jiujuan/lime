# Coding Profile 实施计划

> 状态：draft
> 更新时间：2026-06-12

## 完成口径

Coding profile 完成不是单次模型能改文件，而是以下链路成立：

```text
turn start
  -> coding profile resolved
  -> model/tool/policy resolved
  -> file/patch/command/test/action facts emitted
  -> read model hydratable
  -> AgentUI projection stable
  -> Coding Workbench usable
  -> evidence export joinable
```

## P0：标准与现状盘点

目标：把现有编程能力分类到 `current / compat / deprecated / dead`，避免后续实现继续长平行链路。

动作：

- 盘点 `code_orchestrated`、Project Shell、file checkpoint、AgentUI projection、sequence gate、Workspace Harness 编程面板。
- 把每个能力映射到 `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack`。
- 确认当前哪些 facts 已可从 App Server current API 读取。
- 建立 coding conformance fixture 名单。

验收：

- `runtime-capability-map.md` 的 `copy/rewrite/reference/forbidden` 分类可执行。
- 旧 UI / hook / local state 都有退出条件。

## P1：RuntimeEvent 最小事件族

目标：让 coding turn 的关键事实进入标准事件流。

新增或对齐事件语义：

- `file.read`
- `file.changed`
- `patch.started`
- `patch.applied`
- `patch.failed`
- `command.started`
- `command.output`
- `command.exited`
- `test.started`
- `test.completed`
- `sandbox.blocked`

动作：

- 事件入库前执行 schema gate。
- 扩展 sequence gate，检查 command/patch/test/action 配对。
- 大输出写入 output ref，不重复塞事件。
- 失败事件包含 failure category、exit code、recovery hint refs。

验收：

- 纯文本 turn、文件写入、补丁失败、命令审批、沙箱阻断 fixture 可 replay。
- Projection 不从 assistant prose 推断状态。

## P2：ExecutionBackend Coding Tools

目标：补齐文件、补丁、命令、测试执行面，并接 policy。

动作：

- 文件读取/写入统一产生 artifact/checkpoint refs。
- 补丁应用返回结构化 diff 和失败原因。
- 命令执行接入 approval policy、sandbox、stdout/stderr spill refs。
- 测试执行标记 `passed/failed/canceled/timed_out`，不靠输出文本判断。
- 搜索/上下文工具输出 source refs，供 evidence join。

验收：

- 拒绝审批后工具不继续执行。
- 沙箱阻断后 UI 显示 blocked。
- 测试失败可生成继续修复 turn metadata。

## P3：AgentUI Coding Projection

目标：把 RuntimeEvent / ReadModel 投影成 Coding Workbench view model。

动作：

- 在 projection 包内新增或扩展 coding selectors。
- 派生 `FileChangeView / PatchView / CommandOutputView / TestRunView / ApprovalView`。
- Hydration 支持 active command/test/action 恢复。
- `model.completed` 可修正 streaming delta，不重复追加文本。
- sequence gap 标记 `stale`，通过 read model repair。

验收：

- fixture replay 输出稳定 projection snapshot。
- 重复 event 幂等。
- 乱序或缺 id 进入 degraded，不伪造完成态。

## P4：前端 Coding Workbench

目标：把编程首屏改成中央主画布 + 右侧对话 + 诊断抽屉。

动作：

- 中央固定 tab：预览 / 文件 / 变更 / 输出 / 日志。
- 右侧固定对话、任务进度、审批和输入框。
- 诊断抽屉承载 runtime capability、provider readiness、policy、evidence。
- 失败输出、测试失败、补丁失败共用继续修复入口。
- 用户可见文案覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。

验收：

- 有预览 artifact 时默认展示预览。
- 无预览但有文件时展示主文件。
- 变更、输出、日志 tab 不改变 runtime facts。
- GUI smoke 覆盖提交编程需求、查看输出、继续修复。

## P5：多模型 Routing 与 Profile Slot

目标：让 coding profile 显式使用 Lime 多模型能力。

动作：

- 定义 base/coding/review/fast/local 槽位。
- Provider Store 支持 custom endpoint model 的 stable id、alias 和 capability tags。
- Runtime 记录 routing decision、fallback reason、provider readiness diagnostics。
- 前端只展示选择和诊断，不持有 key。

验收：

- 未配置 Provider 时返回 needs-setup / blocked。
- fallback 有 runtime diagnostics。
- 不存在产品页 local key 生产 fallback。

## P6：External Harness Compat Adapter

目标：允许外部 CLI agent 作为兼容执行器接入，但不让它成为主链。

动作：

- 定义 `external_harness` event adapter。
- 解析 session start、prompt submit、permission request、tool complete、stop 等事件。
- 输出标准 RuntimeEvent 和 diagnostics refs。
- 所有 artifact/evidence 写入仍委托 Lime owner。

验收：

- 外部 harness 缺事件时 UI degraded。
- 外部 harness 不能直接写 Provider key、artifact truth、evidence verdict。
- 生产默认不依赖外部 CLI。

## P7：Conformance 与证据闭环

目标：coding profile 可被机械验证。

Fixture 矩阵：

| Fixture | 覆盖 |
| --- | --- |
| `coding-text-basic` | 文本 turn、delta/final reconciliation。 |
| `coding-file-change` | 文件写入、checkpoint、diff。 |
| `coding-patch-failure` | patch failed、recovery hint。 |
| `coding-command-approval` | action required/resolved。 |
| `coding-sandbox-blocked` | sandbox blocked、UI blocked state。 |
| `coding-test-failure-fix` | 测试失败、继续修复 turn。 |
| `coding-hydration-repair` | sequence gap、read model repair。 |

建议验证：

```bash
npm run test:contracts
npm run governance:legacy-report
npm exec vitest run "packages/agent-runtime-projection/tests/*.test.mjs"
npm exec vitest run "packages/agent-runtime-ui/tests/*.test.mjs"
npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000
cargo test --manifest-path "lime-rs/Cargo.toml"
```

按实际改动选择最小验证；触及 GUI 主路径时必须补 GUI smoke。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 复制外部 runtime 后形成第二套事实源 | 先落 RuntimeEvent / ReadModel adapter，禁止 UI 直连。 |
| 多模型能力被单 Provider 假设污染 | Provider slot 和 routing decision 作为 profile facts。 |
| UI 继续从正文猜状态 | Projection tests 和 conformance fixture fail closed。 |
| 大输出拖慢流式 UI | output spill refs + timeline 摘要。 |
| 外部 CLI adapter 变成主链 | 标记 compat，生产默认不依赖。 |

## 本轮实施入口

后续第一轮代码实现建议从 P1 的事件族和 fixture 开始，不先重做完整 UI。只要 RuntimeEvent 和 projection fixture 稳定，UI 就能按标准递增迁移。
