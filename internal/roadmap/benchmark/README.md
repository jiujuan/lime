# Refactor v2 测试与 Benchmark 第二期

> status: active / T9 DeepSWE adapter v3 evidence complete, scoring blocked
> owner: quality-workflow + runtime domain owners
> last_verified: 2026-07-16
> refactor_source: `internal/research/refactor/v2/**`
> codex_commit: `5c19155cbd93bfa099016e7487259f61669823ff`

## 1. 结论

重构前的 Benchmark 体系已经退役。旧体系把 release checklist、外部数据集下载、脚本 dry-run 和一次性报告拼成版本门禁，但它没有以 Refactor v2 的唯一产品链为测试对象，不能证明 current runtime 正确：

```text
Electron Desktop Host
  -> App Server JSON-RPC
  -> RuntimeCore
  -> Thread / Turn / Item projection
  -> GUI
```

第二期从零建立测试基线，不继承旧 runner 的通过状态。旧 `benchmark-release-v1`、旧 DeepSWE/Terminal-Bench true-run、Managed Objective differential 和历史 progress 只存在于 Git history。DeepSWE 本身继续使用，但改为 [v2 Coding 切片](./deepswe-coding-slice.md) 和新的 App Server current adapter。

## 2. 第二期目标

1. 用确定性集成测试守住 Agent loop、公共 JSON-RPC、状态机、持久化和恢复。
2. 用 current fixture 守住 provider/tool/runtime 的真实事件链，不靠生产 mock fallback。
3. 用 Gate A 验证 Renderer projection，用 Gate B 验证真实 Electron 产品链。
4. 把 live provider、随机性评估、外部 benchmark 与确定性 release gate 分开。
5. 每个测试都有明确 owner、风险、证据等级和失败归属；不再用“跑了很多脚本”代替覆盖证明。

## 3. 文档索引

| 文档                                                                                                             | 作用                                                    |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [phase-2-test-plan.md](./phase-2-test-plan.md)                                                                   | 第二期实施切片、顺序、owner、退出条件和退役账本         |
| [scenario-matrix.md](./scenario-matrix.md)                                                                       | v2/Codex 对齐的稳定场景 ID、证据等级与优先级            |
| [deepswe-coding-slice.md](./deepswe-coding-slice.md)                                                             | DeepSWE Smoke 10 / Release 20 选题、adapter、指标与门禁 |
| [../../aiprompts/quality-workflow.md](../../aiprompts/quality-workflow.md)                                       | 仓库级最低门禁与交付规则                                |
| [../../test/testing-strategy-2026.md](../../test/testing-strategy-2026.md)                                       | 测试分层、作者合同、CI lane 与 evidence 规则            |
| [../../research/refactor/v2/13-evidence/verification.md](../../research/refactor/v2/13-evidence/verification.md) | v2 历史切片的验证合同和不可变 evidence                  |
| [../../exec-plans/refactor-v2-test-phase-2-plan.md](../../exec-plans/refactor-v2-test-phase-2-plan.md)           | 本轮重建执行记录                                        |

## 4. 测试层级

| 层级               | 主要对象                                                  | 证据                                    | 是否阻断发布            |
| ------------------ | --------------------------------------------------------- | --------------------------------------- | ----------------------- |
| L0 静态与治理      | schema、generated client、依赖、旧路回流                  | lint/typecheck/contracts/governance     | 是                      |
| L1 纯单元          | parser、selector、projection、lowering、状态转换          | 整对象断言、表驱动 case                 | 是，按受影响范围        |
| L2 领域集成        | agent-runtime、tool-runtime、model-provider、thread-store | 真实 domain owner + 可控依赖            | 是                      |
| L3 App Server 集成 | public JSON-RPC、notification、read model、恢复           | client round trip + 结构化事件          | 是                      |
| L4 current fixture | RuntimeCore、provider fixture、工具、MCP、multi-agent     | current event stream + terminal state   | 是，Agent 主路径        |
| L5 Gate A          | Renderer projection、DOM、交互、五语言                    | browser fixture + 可见状态              | GUI 变更时是            |
| L6 Gate B          | Electron/preload/IPC/App Server/runtime/read model/GUI    | 真实 Electron + 同一 identity 链        | 主路径/桌面边界变更时是 |
| L7 live/eval       | live provider、非确定性任务、外部 benchmark               | transcript、grader、pass@k/pass^k、成本 | 显式 release lane 才是  |
| L8 platform/soak   | macOS/Windows、packaged app、并发、长稳                   | 平台矩阵、资源与恢复报告                | release candidate 是    |

L0-L6 主要验证确定性正确性；L7 验证模型能力和稳定性；L8 验证交付环境。三者不能互相替代。

## 5. Codex 对齐规则

- Agent 逻辑变更优先写集成测试，而不是只补内部函数单测。
- App Server 测试必须经过公共 JSON-RPC API；不直接调用 handler 私有实现伪造成功。
- Provider 使用可控 response server/fixture，保存并断言结构化 request、tool output 和 terminal event。
- 等待业务事件，不用固定 sleep 或 grace timer 合成完成态。
- 优先比较完整对象和完整投影；字段逐个断言只用于解释关键差异。
- 不测试静态常量，不为已经删除的实现继续写正向或行为测试。
- GUI 可见变化必须有稳定 DOM/快照证据；Lime 的最终产品证据仍是 Electron Gate B，而不是 Codex TUI snapshot。
- 测试资源和首方 binary 必须通过仓库统一 helper 定位，不能依赖当前工作目录偶然成立。

## 6. Release Lane

| Lane              | 触发                            | 必须包含                                                                 |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------ |
| PR related        | 每次改动                        | L0 + 受影响 L1/L2；命令边界加 contracts                                  |
| Runtime current   | Agent/runtime 改动              | L2 + L3 + `smoke:agent-runtime-current-fixture`                          |
| GUI current       | GUI/Workspace 改动              | related tests + Gate A + `verify:gui-smoke`                              |
| Desktop current   | Electron/bridge/read model 改动 | contracts + 对应 Gate B fixture                                          |
| Nightly           | 每夜或定期                      | 扩展 L2-L6、恢复/故障注入、flaky/retry 统计                              |
| Release candidate | 版本候选                        | L0-L6 全部 required 场景 + L8 平台矩阵                                   |
| Live quality      | 显式授权                        | L7 provider/eval 与 DeepSWE coding slice；记录模型、配置、成本与样本版本 |

外部公开 benchmark 只进入 `Live quality` 或研究 lane。没有 current adapter、固定环境和可复核 grader 前，不得进入 release required。

## 7. 当前状态

- `current`：仓库现有 related tests、Rust layer runner、App Server contracts、current runtime fixture、Gate A/B smoke。
- `current`：DeepSWE adapter v3 使用仓库外系统临时 workspace，经 App Server current chain 投影逐步 provider usage，并以 step/token/wall time 三类预算约束 Agnes；gpt-5.5 只在区分 Lime 与模型问题时作固定对照。
- `deprecated`：现有 Agent QC/Harness manifest 只作为第二期场景迁移输入，未逐项映射到 [scenario-matrix.md](./scenario-matrix.md) 前不算新门禁。
- `dead`：旧 Benchmark runner、旧 release manifest、旧外部数据集 wrapper 和旧 progress 文档，已删除；DeepSWE 数据集不属于 dead。
- `current / closed`：原 3 条 session/projection Rust blocker 和 Gate B queue/restore identity 已有定向回归与真实 Electron 通过证据；App Server orphan child restart 也已补 fail-closed cleanup。
- `current / closed`：provider 每步 usage 丢失、multi-step usage 只保留最后一步和 timeout/cancel usage 丢失已在 current owner 修复；adapter v3 的 Agnes Go run 已验证 16/16 step usage、累计 272,324 budget tokens 和 current cancel 终态。
- `blocked`：Agnes 在 adapter v3 的 16-provider-step 诊断预算内继续只读探索且无 patch；本机 Pier `0.3.0` 可用但无容器运行时。DeepSWE trial 只作缺陷诊断，尚不能生成有效分数。
- `next`：暂停继续刷 Go/Rust 题；先恢复能在固定 step/token 预算内产生 non-empty candidate 的 Agnes coding 路由，并提供 Docker/Podman/nerdctl/Colima 之一，再恢复 Pier verifier 和 Smoke 10 calibration。

## 8. 完成口径

第二期只有在以下条件全部满足后才能标记完成：

1. P0 场景全部有稳定自动化 owner，且失败可定位到单一边界。
2. Agent runtime 关键逻辑均有 L2/L3 集成证据。
3. GUI 主路径均有 Gate A；关键桌面链均有 Gate B。
4. restart、resume、cancel、queue、stale/out-of-order、tool approval、MCP、multi-agent 和 multimodal 至少各有一条失败恢复场景。
5. macOS 与 Windows 的 release candidate 证据齐全。
6. current 导航中不存在旧 Benchmark 命令、manifest 或伪代码测试指南。
