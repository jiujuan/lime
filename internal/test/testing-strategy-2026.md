# Lime 测试策略（Refactor v2）

> status: current
> owner: quality-workflow
> last_verified: 2026-07-17
> source: `internal/research/refactor/v2/**`

## 1. 事实源与分类

### current

- 产品链：`Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item projection -> GUI`。
- Electron Desktop Host、preload/IPC、`app_server_handle_json_lines`：桌面进程边界。
- `packages/app-server-client`：TypeScript 公共 App Server client 与 generated protocol types。
- `src/lib/desktop-host/`：显式测试 fixture 与 host 边界；不得成为生产 fallback。
- `lime-rs/crates/app-server-protocol`、`app-server`、`agent-runtime`、`tool-runtime`、`model-provider`、`thread-store`：对应领域 owner。
- `npm run smoke:electron`、`npm run verify:gui-smoke`：Electron GUI 最小 current smoke。
- `npm run smoke:agent-runtime-current-fixture`：Agent runtime current fixture 门槛。
- related-first 的 TS/Rust test layer、`npm run test:contracts` 和 governance guards。
- Gate A Renderer 证据、真实 Electron Gate B fixture、显式授权 live provider lane。

### compat

- 测试 fixture 可以显式模拟 unavailable/external backend，但只能证明声明的边界。
- 未完成第二期场景映射的 Agent QC/Harness manifest 只作为迁移输入，不是 release required。
- 历史计划和 evidence 可以保留记录，但不得重新导航为 current 命令或 owner。

### deprecated

- 基于旧 owner、旧 command/type、旧 Team/roster/raw subagent 或大组件 mock 的测试。
- 重复的 source-string boundary guard；迁入治理扫描或 owner contract test 后删除。
- 依赖固定 sleep、共享用户目录、共享端口或前序测试状态的 smoke。

### dead

- 旧 `benchmark-release-v1`、外部数据集 release runner、旧 Managed Objective differential。
- 测试静态值、已删除实现正向行为、生产 mock fallback 和脱离构建图的 fixture。
- 用脚本报告生成成功冒充 runtime/product 正确性的测试。

## 2. 目标

测试体系需要回答四个不同问题：

1. current owner 的确定性逻辑是否正确？
2. 公共协议、运行时、存储与投影是否形成一致状态？
3. 用户是否能在真实 Electron 产品链看到并操作该状态？
4. 指定 provider/model/platform 下的能力、稳定性和性能是否达到发布要求？

每条证据只回答自己覆盖的问题。静态检查、全量单测、Gate A、Gate B、live eval 和平台测试不能互相代替。

## 3. 测试金字塔

```text
                  live eval / platform / soak
                 real Electron Gate B
                Renderer Gate A
             current runtime fixture
          App Server public integration
       domain integration / contracts
            pure unit/component
         static/governance preflight
```

目标不是让底层用例数量最大，而是让大多数业务分支在最便宜且真实的 owner 层可定位；每条关键用户链再补少量跨层证据。

## 4. 层级合同

### L0 静态与治理

验证 generated types、schema、catalog、依赖方向、i18n 和旧路回流。L0 不证明 runtime 行为。

主要入口：

```bash
npm run test:contracts
npm run governance:legacy-report
npm run governance:scripts
npm run verify:app-version
```

### L1 纯单元与组件

纯逻辑使用整对象、表驱动或 snapshot 断言。组件测试只验证 DOM、事件、hook 生命周期和关键接线；业务状态机下沉到 selector/projection/state machine。

不允许：真实网络、用户目录、共享数据库、Electron、App Server、固定等待。

### L2 领域集成

测试 current owner 和真实协作者：runtime queue、provider lowering、tool policy、store/materialization、MCP connection。只替换不可控外部边界，例如 provider HTTP server、时钟、权限响应。

Agent 逻辑变更默认必须有 L2 或更高集成测试。

### L3 App Server 集成

从 public JSON-RPC client 进入，断言 response、notification、captured provider request 和 read model。禁止直接调私有 handler 代替公共协议闭环。

必须覆盖：成功、结构化失败、取消/恢复、未知/非法输入、持久化后读取。

### L4 Current fixture

通过 RuntimeCore/App Server current 链运行可控 provider/tool/MCP fixture，观察真实事件和 terminal state。fixture backend 必须显式配置，不能成为生产 fallback。

### L5 Gate A

验证 Renderer projection、DOM、交互、文案、五语言和错误状态。普通 Chrome/browser mirror 只能算 Gate A。

### L6 Gate B

真实启动 Electron，经过 preload/IPC、`app_server_handle_json_lines`、App Server、runtime/read model，并在 GUI 观察同一 identity。Gate B 必须记录 backend mode；external/unavailable fixture 不等于 live provider。

### L7 Live/Eval

显式调用真实 provider，使用版本化 task、grader、模型和配置，记录 pass@k/pass^k、成本、延迟和失败类别。它不进入默认 PR。

### L8 Platform/Packaged/Soak

在 macOS/Windows 实际运行 installer/package/update/current chain，并覆盖长线程、并发 turn、重启和资源回收。

## 5. Codex 测试标准在 Lime 的落地

### 5.1 Agent 逻辑优先集成测试

Codex 把 Agent 核心行为放在 integration suite，通过可控 responses server 和 test builder 运行真实 agent loop。Lime 采用同一原则，但入口改成自己的 RuntimeCore/App Server owner；不复制 Codex TUI 或 crate 名。

### 5.2 捕获结构化请求

Provider fixture 返回可控 stream，同时保存 outbound request。测试优先比较完整 request、input、tool output、usage、event 和 read model，不手工在 JSON 字符串上做脆弱搜索。

### 5.3 等待业务事件

helper 提供 `wait_for_event(predicate)` 或等价能力。固定 sleep 只允许作为进程启动轮询的退避，不允许决定 turn 是否完成；超时必须打印最后事件、pending request 和当前 read model。

### 5.4 隔离环境

每个测试创建自己的 app data、workspace、数据库、端口和 provider server。不要在测试中修改全局 process env；由 builder 显式注入环境派生值。

### 5.5 测试有价值的行为

- 不测试静态常量、generated enum 的字面值或已删除逻辑的正向行为。
- negative test 验证 current boundary 拒绝非法输入，不为 dead API 维持可调用性。
- 修复 bug 后在根因 owner 层补回归；若 bug 穿越进程边界，再补一条产品级 vertical slice。

### 5.6 Provider transport capture

Responses WebSocket 场景必须让 localhost fixture 观察真实 Upgrade `GET`、`response.create` JSON frame、terminal event 和 HTTP fallback method sequence。capability=false 必须零 Upgrade；426、连接重试耗尽和首个可见 event 前断线必须证明完整 request 只重放一次 HTTP；同一 session 后续 Turn 必须零新增 Upgrade，正常路径还要证明一个连接串行承载多个 request。已经发出 text/tool event 的流不得自动 HTTP replay。只断言 config 布尔值、只运行 HTTP SSE 或在 benchmark adapter 内模拟 fallback，均不能作为 PRV-06 证据。

### 5.7 App Server transport 与宿主进程

- public JSON-RPC 集成必须在默认线程栈上从 `initialize` 进入；MCP/大 dispatcher 不允许依赖增大 `RUST_MIN_STACK` 才通过。
- `initialize` 必须先于业务 request 完成；初始化后用一个被控长请求和一个无冲突 list/read 证明 stdio 不发生 head-of-line blocking，响应按 request id 关联，不假设 notification/response 的到达位置。
- PTY 测试通过私有 builder/fixture 注入确定性 shell，不继承真实用户 rc、prompt 或全局 process env。
- Git/CLI 子进程测试必须覆盖 plain-directory fast path 和 deadline；production child 使用异步 wait、取消/kill-on-drop，测试不得靠机器上的挂起 Git 进程制造通过条件。

### 5.8 Renderer projection 的 v2 运行态合同

- `activeCurrentTurnId` 缺省不代表“所有带 turn identity 的消息都是历史态”。只有明确存在且不匹配的 active turn，或非发送态的 terminal turn，才能隐藏 reasoning、tool、action 和 streaming overlay；恢复中的 running/queued turn 必须保留结构化过程。
- runtime failure 的友好 fallback 属于用户可见终态，优先级高于历史 compact 过滤；不能让孤立标点、内部 reasoning 或 provider diagnostic 覆盖 fallback，也不能把 fallback 重新过滤为空。
- `file_changes_batch` 是过程汇总，canonical `file_artifact` 是结果快照；两者允许同时出现。artifact path 归一化只能用于真正相同的去重，不能用相对路径、项目根或文件名近似匹配误删 canonical 结果卡。
- patch timeline 的 renderer content parts 必须先保留结构化 diff，再投影文本；测试应断言完整 part type 顺序和 artifact identity，不只断言正文包含某个词。
- 这类规则优先落在 projection unit owner，覆盖 running tool、streaming final、reasoning 合并/替换、history restore、failure fallback、patch diff 和相对/绝对 artifact path；React 挂载测试只保留少量 DOM 接线回归。

## 6. 测试数据与 Fixture

Fixture 必须：

- 最小、可读、版本化；
- 使用稳定 identity，避免随机值污染 snapshot；
- 明确所属 scenario ID、owner、backend mode 和 allowed mocks；
- 不含 secret、真实用户对话、真实 app data 路径或未脱敏 provider payload；
- 与 production schema 一起演进，解析失败必须 fail closed。

Replay 只有在能证明来源、schema、预期结果和 grader 时才提升为仓库 fixture。历史 replay 不自动进入 current 测试集。

## 7. 断言策略

优先级从高到低：

1. 完整 typed object/read model equality。
2. 结构化 request/event sequence snapshot。
3. stable DOM/state snapshot 与用户动作结果。
4. 少量关键字段断言，用于突出 failure owner。
5. source-string guard，仅用于无法通过 AST/schema/catalog 表达的回流规则。

不要只断言“函数被调用”“数组非空”“文案包含某词”就宣称业务场景通过。

## 8. 场景设计

稳定场景定义见 [../roadmap/benchmark/scenario-matrix.md](../roadmap/benchmark/scenario-matrix.md)。每个高风险能力至少覆盖：

- happy path；
- provider/tool/bridge 失败；
- cancel/interrupt；
- queue/concurrency；
- restart/resume；
- stale/out-of-order/duplicate；
- pagination/large output；
- visible error/recovery state。

是否覆盖每一类取决于风险，不机械复制。协议常量不需要并发 case，Agent loop 不能只有 happy path。

## 9. CI 与运行策略

### PR related

使用 diff selector 运行 L0 和受影响 L1-L3。GUI/bridge/runtime 主路径按风险追加 current fixture、Gate A 或 Gate B。

### Nightly

运行更广的 deterministic 场景、故障注入、restart/soak 和 flaky 审计。Nightly 失败不能通过无限 retry 变绿；重试只用于诊断并单独计数。

### Release candidate

冻结候选 digest，运行 P0 场景、真实 Electron 主链和 macOS/Windows packaged matrix。任何产品源码变化使候选证据失效。

### Live quality

独立授权和预算。固定 task/model/config/grader 版本，输出质量、成本和延迟；不得把 live 波动阻塞确定性 PR，也不得用 deterministic fixture 冒充 live 质量。

## 10. Flaky 与超时

- 测试默认 retry=0；失败先归因，不自动掩盖。
- 超时分为 process startup、event wait、scenario deadline；分别记录。
- 长 timeout 不是稳定性修复。冷编译/冷 transform 预算与业务等待分开。
- 连续 flaky 测试必须修复或从 required lane 移出并登记 owner/退出条件；不能保留“偶尔过”的 release gate。

## 11. 覆盖与质量指标

不以行覆盖率作为单一目标。第二期主要指标：

- P0 scenario automation coverage；
- public boundary integration coverage；
- Gate A/B coverage；
- failure mode coverage；
- flaky rate 与 retry count；
- median/p95 duration；
- orphan/dead/duplicate test count；
- live pass@k/pass^k、成本和延迟；
- macOS/Windows RC parity。

代码覆盖率用于发现空白，不驱动静态值测试或重复分支。

## 12. 旧测试迁移

T0 inventory 按以下规则分类：

| 分类 | 条件 | 动作 |
| --- | --- | --- |
| current | owner、入口、fixture、断言都对齐 v2 | 保留并映射稳定场景 ID |
| rewrite | 风险有效但测试基础过时 | 先写新测试，再删除旧测试 |
| merge | 多个测试重复证明一个边界事实 | 合并到 owner 测试/治理 guard |
| dead | 静态值、旧实现、旧命令正向行为、无构建入口 | 直接删除 |
| live-only | 真实网络/provider/账号 | 移出默认 lane，显式授权 |

不新增 compat wrapper 来维持旧测试。历史路径只留在 Git history、不可变 evidence 或负向回流守卫。

## 13. Evidence

每次关键运行至少记录：scenario ID、candidate digest、proof level、command、status、duration、artifacts、failure owner、backend/mock mode。失败记录不可覆盖；修复后新增记录。

测试报告必须写清：

- 实际证明了什么；
- 没有证明什么；
- 是否真实 Electron；
- 是否 live provider；
- 是否使用显式 fixture；
- 下一阻塞 owner。

## 14. 当前实施入口

第二期执行顺序与退出条件见 [../roadmap/benchmark/phase-2-test-plan.md](../roadmap/benchmark/phase-2-test-plan.md)。当前先完成 T0 inventory 和 T1 public integration harness，不恢复旧 Benchmark 总 runner。
