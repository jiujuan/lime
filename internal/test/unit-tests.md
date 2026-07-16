# Lime 单元与组件测试

> status: current / Refactor v2

## 1. 边界

单元测试验证不触碰外部边界的确定性逻辑：parser、formatter、selector、projection、state transition、provider lowering 和 request builder。React component test 验证 DOM、事件、hook 生命周期和关键接线。

以下行为不属于单元层：App Server、Electron、文件系统、数据库、子进程、网络、真实 timer、DevBridge/desktop host。出现这些边界时使用 contract/integration/current fixture 或 Gate A/B。

## 2. 前端命名

| 后缀 | 用途 |
| --- | --- |
| `*.unit.test.ts` | 纯 View Model/projection/selector/parser/state machine |
| `*.component.test.tsx` | React DOM 与事件 |
| `*.contract.test.ts` | protocol/client/host/catalog 边界 |
| `*.integration.test.ts` | 文件系统、进程、server、数据库、多模块流程 |
| `*.e2e.test.ts` | Vitest e2e layer；不自动等于 Electron Gate B |
| `*.live.test.ts` | 真实 provider/网络，默认跳过 |

运行：

```bash
npm run test:related -- <paths...>
npm run test:unit -- <paths...>
npm run test:component -- <paths...>
npm run test:layers:stats
```

复杂组件先抽纯逻辑，再让 component test 只守住渲染和 action 接线。不要把 runtime 状态机复制到 React fixture 中。

## 3. Rust 单元测试

Rust unit test 与被测 owner 放在同一 crate。新增较大测试模块使用描述性 sibling 文件，避免继续扩大实现文件；跨 owner 的 Agent/runtime 行为进入 integration test。

运行：

```bash
npm run test:rust:related -- <paths...>
npm run test:rust:unit -- -p <crate> <filter>
npm run test:rust:layers:stats
```

## 4. 断言规则

- 优先比较完整 typed object 或完整 projection。
- 表驱动 case 覆盖边界输入；不要为每个字段复制测试。
- snapshot 适合稳定结构/可见输出，必须人工审查变化。
- 不测试静态常量、generated 值或已删除实现的正向行为。
- 不修改进程全局环境；通过函数参数、builder 或 dependency 注入。
- 错误断言比较结构化 error kind/code/context，不只匹配模糊文案。

## 5. 退出条件

一个单元/组件测试只有在失败能定位到当前 owner、无需外部环境、没有固定 sleep 且不重复跨层测试时才属于本层。否则升级到 [integration-tests.md](integration-tests.md) 或 [e2e-tests.md](e2e-tests.md)。
