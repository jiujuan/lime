# v1 知识迁移对照

> status: current
> v1_snapshot: `56e4e7d9a9e59189a39021e461e7ba3431924a23`
> rule: revalidate, split, or retire; never inherit a v1 conclusion without current-code evidence

## 目的

v1 有较完整的架构、模块、provider 和产品研究，但也混入了过期 checkpoint、实施日志和已失效缺口。v2 不按篇幅复制 v1，而是把仍有效的知识拆到唯一 current owner，并明确哪些结论只保留为历史 evidence。

本页只做迁移索引。v2 文档、当前代码和已固定的 Codex/OpenCode commit 才是当前事实源。

## 逐文件对照

| v1 历史来源 | v2 current owner | 处理 | 说明 |
| --- | --- | --- | --- |
| `v1/README.md@56e4e7d9` | `README.md`、`00-decisions/record.md` | replaced | 保留双参考源定位和分类语言；删除 v1 导航与阶段性口径 |
| `v1/architecture.md@56e4e7d9` | `04-target/architecture.md`、`05-boundaries/ownership.md`、`11-gui/electron-gates.md` | split + revalidated | 保留 Codex-first 主链和 OpenCode provider 边界；明确 Lime 是 GUI，不复制 TUI |
| `v1/codex-architecture-map.md@56e4e7d9` | `02-codex/current-map.md`、`07-runtime/lifecycle.md`、`10-tool-context/policy.md` | split + revalidated | 按当前 Codex commit 重读；只列可复制模块、适配点和拒绝项 |
| `v1/codex-origin-comparison.md@56e4e7d9` | `02-codex/current-map.md`、`12-plan/slices.md` | replaced | P0/P1 gap 改为有依赖和退出条件的实施 slice |
| `v1/diagrams.md@56e4e7d9` | `04-target/architecture.md`、`06-protocol/contracts.md`、`08-projection/read-model.md` | split | 只保留能约束依赖方向、事件时序和 GUI projection 的图 |
| `v1/fast-alignment-roadmap.md@56e4e7d9` | `12-plan/slices.md`、`internal/exec-plans/refactor-v2-implementation.md` | replaced | 时间估算改为依赖门禁、claim、handoff 和可验证退出条件 |
| `v1/follow-up-strategy.md@56e4e7d9` | `14-upstream/ledger.md`、`13-evidence/verification.md` | replaced | 上游跟进改为 commit ledger、allowlist 和证据模板 |
| `v1/lime-current-state.md@56e4e7d9` | `01-current-facts/snapshot.md`、`05-boundaries/ownership.md`、`15-cleanup/inventory.md` | revalidated | 仅保留由当前工作树可复核的 owner、构建图和旧 surface 分类 |
| `v1/module-alignment-plan.md@56e4e7d9` | `05-boundaries/ownership.md`、`12-plan/slices.md` | replaced | 模块 A-M 改成不相交写集和有序依赖，防止多进程夹写 |
| `v1/naming-alignment.md@56e4e7d9` | `00-decisions/record.md`、`05-boundaries/ownership.md`、`15-cleanup/inventory.md` | revalidated | 保留短领域名；历史品牌和退役 runtime 名只允许出现在 evidence/guard |
| `v1/opencode-reference-comparison.md@56e4e7d9` | `03-opencode/module-map.md`、`09-provider/capability.md` | revalidated | OpenCode 仅用于多模型、多模态、capability/lowering 与模块 owner 参照 |
| `v1/prd.md@56e4e7d9` | `00-decisions/record.md`、`04-target/architecture.md`、`11-gui/electron-gates.md` | split | 保留 GUI 产品目标、用户工作流和非目标；移除与 runtime 契约无关的阶段描述 |
| `v1/provider-model-capability-audit.md@56e4e7d9` | `09-provider/capability.md`、`14-upstream/ledger.md`、S3/S3c/S3d handoff | split + revalidated | 旧“第 N 刀”日志只作历史；current owner、lowering 和 production consumer 重新取证 |
| `v1/thread-turn-item-invariant.md@56e4e7d9` | `06-protocol/contracts.md`、`07-runtime/lifecycle.md`、`08-projection/read-model.md` | split + strengthened | invariant 扩为 typed item、ordinal、changeset、pagination、repair 和 GUI read model |
| `v1/upstream-checkpoint.md@56e4e7d9` | `14-upstream/ledger.md` | replaced | 旧 Codex/OpenCode SHA 失效，只保留为历史 checkpoint |

## 不得丢失的 v1 知识

以下主题必须在 v2 的实现、测试或 evidence 中有明确落点，不能因文档精简而消失：

1. Agent loop、Thread/Turn/Item、工具生命周期、审批、sandbox、context、compaction、MCP、Skills、Multi-Agent、恢复与 replay 对齐 Codex。
2. provider/model/capability、文本/图片/音频/文件 part、provider lowering 对齐 OpenCode 的领域边界，但不复制其产品壳。
3. Electron Desktop Host 只做 host；App Server JSON-RPC 是唯一 runtime 主链；React GUI 只消费 typed read model。
4. 正常、失败、中断、队列、stale/duplicate event、remove/rollback、resume、双向分页和 repair 都必须有测试或 evidence。
5. macOS 与 Windows 的路径、权限、进程、窗口和凭证行为必须走平台边界；生产路径不得回退 mock。

## 退役规则

- v1 的 gap、checkpoint、完成百分比和“第 N 刀”不是 v2 backlog。
- v1 中与当前代码冲突的 owner、命令名、状态枚举和 adapter 结论直接失效。
- 需要引用 v1 时必须带历史 commit；不得从 v1 恢复已删除文件或创建 compat owner。
- 新发现的知识缺口应补到对应 v2 current owner，不向本 crosswalk 堆实现细节。

