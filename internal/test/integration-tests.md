# Lime 集成测试

> status: current / Refactor v2

## 1. 目标

集成测试验证 current owner 与真实协作者：Agent loop、App Server public JSON-RPC、Thread/Turn/Item materialization、provider request lowering、tool lifecycle、store、MCP、Skills 和 Multi-Agent。只替换不可控外部边界，不替换正在验证的 owner。

Agent 逻辑变更默认必须有集成测试。只补内部函数单测或 React mock 不能证明 runtime 行为。

## 2. 两个主要层级

### Domain integration

从 crate/package 的公共 API 进入，使用真实 domain owner、临时 store 和可控 provider/tool/clock/approval 依赖。适合 queue、state machine、lowering、policy、materialization。

### App Server integration

从 public JSON-RPC client 进入，走 protocol、handler、RuntimeCore、store/read model，再断言 response、notification 和结构化状态。禁止直接调用 handler 私有方法代替公共协议闭环。

## 3. Harness 合同

对齐 Codex 的 integration suite 思路，Lime 的最小 test builder 应提供：

```text
isolated app/data/workspace dirs
  + deterministic provider response server
  + RuntimeCore/App Server public client
  + captured structured requests
  + wait_for_event(predicate)
  + Thread/Turn/Item/read-model snapshot
```

Builder 只提供环境和观察能力，不暴露第二套 production API。仅一个测试使用的 helper 留在测试文件内。

## 4. 必要场景

按风险选择：

- success 与结构化 failure；
- cancel/interrupt 与单一 terminal；
- queue/concurrency 与 identity 隔离；
- restart/resume 与持久化恢复；
- stale/out-of-order/duplicate event；
- pagination/large output/truncation；
- approval allow/deny/cancel；
- provider/tool/MCP failure isolation。

稳定 ID 见 [../roadmap/benchmark/scenario-matrix.md](../roadmap/benchmark/scenario-matrix.md)。

## 5. Provider Fixture

Provider fixture 必须返回协议真实的 stream/response，并保存 outbound request。测试应断言完整 request、input、tool output、media parts、usage 和 terminal event。

不允许：

- 把 provider response 直接塞进 read model；
- 用 Renderer mock 代替 runtime；
- 用固定 timeout 合成 completed；
- 让 production path 在测试时自动回退 mock。

## 6. 隔离与等待

- 每个测试使用独立 app data、workspace、数据库和端口。
- 不依赖真实用户目录、已启动服务或前一个测试状态。
- 等待业务 event/predicate；超时打印最后事件、pending request、thread/turn/item identity 和 read model 摘要。
- process startup timeout 与 business event timeout 分开。

## 7. 运行

```bash
npm run test:integration -- <paths...>
npm run test:rust:integration:related -- <paths...>
npm run test:rust:integration -- -p <crate> --test <target>
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
```

先运行受影响 owner，再决定是否扩到 workspace/full。App Server/protocol/client 改动必须同时跑 contracts。

## 8. Evidence

至少记录 scenario ID、candidate、command、duration、backend mode、captured request/event/read model artifact 和 failure owner。集成测试通过不能自动宣称 GUI 或 Electron 可交付；对应产品证据见 [e2e-tests.md](e2e-tests.md)。
