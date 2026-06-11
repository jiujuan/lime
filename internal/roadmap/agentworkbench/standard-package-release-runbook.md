# Agent Workbench 标准包发布与产品接入 Runbook

> 状态：published-and-adopted; gui-smoke-pending
> 更新时间：2026-06-11
> 适用范围：`@limecloud/app-server-client@1.66.0`、`@limecloud/agent-runtime-client@0.1.1`、Content Studio 标准 runtime-client 接入。

## 目标

把已通过本地 conformance 的 Agent Runtime 标准包发布到 npm registry，然后让 Content Studio 通过正式 npm 依赖消费 `@limecloud/agent-runtime-client/sessionGateway`，完成：

```text
Content Studio App Server session gateway
  -> @limecloud/agent-runtime-client/sessionGateway
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
  -> AgentUiProjectionSurface
```

scoped 发布和产品依赖接入已完成；剩余 `98.5% -> 100%` 的主线缺口是 Content Studio GUI smoke / 产品回归。不得使用 `file:`、本机绝对路径、tarball 临时路径或复制源码的方式伪装完成。

## 当前状态

| 项 | 状态 | 证据 |
| --- | --- | --- |
| `@limecloud/app-server-client@1.66.0` | published | 已发布到 `@limecloud` organization；本地开发仍通过 scoped alias 指向 `packages/app-server-client/src/index.ts`。 |
| `@limecloud/agent-runtime-client@0.1.1` | published | 已发布到 `@limecloud` organization；runtime-client 依赖 `@limecloud/app-server-client@1.66.0`。 |
| `app-server-client@1.66.0` | compat-misrelease | 已误发布到 `wutongci` 用户包列表；不作为 Lime 标准链路完成证据，不继续扩展。 |
| `@limecloud/agent-runtime-client@0.1.0` | compat-misrelease | 已发布但依赖无 scope `app-server-client`；不作为 Content Studio 接入版本。 |
| npm 登录状态 | ready | `npm whoami -> wutongci`，账号对 `@limecloud` organization 包有 read-write 权限。 |
| Content Studio runtime-client 接入 | adopted | Content Studio 固定安装 registry 版 `@limecloud/agent-runtime-client@0.1.1`，lockfile 解析到间接 `@limecloud/app-server-client@1.66.0`，主路径通过 `@limecloud/agent-runtime-client/sessionGateway` 进入标准 `AgentRuntimeClient`。 |

## 风险分类

| 分类 | 路径 / 行为 | 规则 |
| --- | --- | --- |
| current | `@limecloud/app-server-client` | 当前 `@limecloud/agent-runtime-client` 的 App Server JSON-RPC 依赖包；开发态通过 scoped alias 指向本地 `packages/app-server-client/src/index.ts`。 |
| current | `@limecloud/agent-runtime-client/sessionGateway` | 标准 runtime client facade，负责 lifecycle、event、read、action response、evidence export。 |
| current | Content Studio `ContentStudioAgentRuntimeSessionGateway` | 产品侧 session gateway 适配层，已压薄为标准包 adapter，只保留 `agentSession/start`、`artifact/read` 和 sidecar transport。 |
| compat | Content Studio 本地 gateway 形状 | 只允许作为标准 runtime-client adapter 的产品侧补充，不允许继续长第二套 runtime client。 |
| dead | `file:` / 绝对路径依赖 / 复制 dist | 不允许作为产品接入完成证据。 |

## Registry 复核

当前已完成发布，复核时在 Lime 主仓运行：

```bash
npm view "@limecloud/app-server-client@1.66.0" version
npm view "@limecloud/agent-runtime-client@0.1.1" version
npm view "@limecloud/agent-runtime-client@0.1.1" dependencies
```

当前通过标准：

- `npm view "@limecloud/app-server-client@1.66.0"` 返回 `1.66.0`。
- `npm view "@limecloud/agent-runtime-client@0.1.1"` 返回 `0.1.1`。
- `@limecloud/agent-runtime-client@0.1.1` 依赖 `@limecloud/app-server-client: 1.66.0`。
- 无 scope `app-server-client@1.66.0` 和 `@limecloud/agent-runtime-client@0.1.0` 只保留为 `compat-misrelease` 记录，不作为任何产品接入证据。

## 已通过的发布门槛

发布前已在 Lime 主仓通过：

```bash
npm --prefix packages/app-server-client run test
npm --prefix packages/agent-runtime-client run test
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together
cd packages/app-server-client && npm pack --dry-run --json --ignore-scripts
cd ../agent-runtime-client && npm pack --dry-run --json --ignore-scripts
```

通过标准：

- 两个 dry-run 包只包含 `README.md`、`dist/**`、`package.json`。
- 不从 workspace root 运行目标包 pack，避免误把根包当成发布包。

## 发布动作记录

已按以下顺序发布 scoped 标准包：

```bash
cd packages/app-server-client
npm publish --access public

cd ../agent-runtime-client
npm publish --access public
```

发布后验证：

```bash
npm view "@limecloud/app-server-client@1.66.0" version
npm view "@limecloud/agent-runtime-client@0.1.1" version
```

后续如果需要新版本发布，仍必须重新走用户明确确认；commit、tag、push 也不自动执行。

## Content Studio 接入状态

路径：`/Users/coso/Documents/dev/ai/limecloud/content-studio`

已固定依赖：

```bash
"@limecloud/agent-runtime-client": "0.1.1"
```

已确认：

- lockfile 解析到 `@limecloud/agent-runtime-client@0.1.1`。
- 间接依赖解析到 `@limecloud/app-server-client@1.66.0`。
- lockfile 不再解析到无 scope `app-server-client`。
- `package.json` 不出现 `file:`、绝对路径或 tarball 临时路径。

代码接入结果：

1. Content Studio 主进程侧从 `@limecloud/agent-runtime-client/sessionGateway` 导入 `createAgentRuntimeClientFromSessionGateway`。
2. 现有 `ContentStudioAgentRuntimeSessionGateway` 被包装成标准 `AgentRuntimeClient`。
3. `startTurn/readThread/cancelTurn/respondAction/exportEvidence/nextEvent` 经过标准 client facade。
4. `ContentStudioAgentRuntimeSessionGateway.nextEvent()` 保留 `agentSession/event` notification 形状。
5. 边界审计已要求实际导入 `@limecloud/agent-runtime-client/sessionGateway`，并检查 scoped registry lockfile。

禁止：

- 不把 `nextEvent()` 改回裸 `RuntimeEvent`。
- 不在 Content Studio 复制 `@limecloud/agent-runtime-client` 的实现。
- 不让 renderer 直连 Provider key 或 App Server DB。
- 不恢复本地过程组件作为标准 AgentUI owner。

## Content Studio 验证

已运行：

```bash
npm run verify:lime-agent
npm run test:functional -- --test-name-pattern "Lime Agent 边界审计会阻断 runtime/key/UI 协议回流"
npx tsc --noEmit --pretty false
```

仍需补 GUI smoke / 产品回归，证明真实页面存在并可运行：

```text
.agent-ui-projection
.agent-ui-main
.agent-ui-sidecar
```

GUI smoke 未完成前，不得把整体目标标为 `100%`。

## 完成判定

只有同时满足以下条件，才能把整体目标从 `98.5%` 更新为 `100%`：

1. `@limecloud/app-server-client@1.66.0` 和 `@limecloud/agent-runtime-client@0.1.1` 都可从 npm registry 查询。
2. Content Studio 通过正式 npm 依赖安装 `@limecloud/agent-runtime-client@0.1.1`。
3. Content Studio 主路径实际消费 `@limecloud/agent-runtime-client/sessionGateway`。
4. `runtime-client -> projection -> runtime-ui -> AgentUiProjectionSurface` 链路有产品验证。
5. Content Studio GUI smoke / 产品回归通过。

## 当前剩余缺口

截至 `2026-06-11`，scoped registry 发布和 Content Studio runtime-client 接入已完成。下一刀是 Content Studio GUI smoke / 产品回归，证明 `.agent-ui-projection` / `.agent-ui-main` / `.agent-ui-sidecar` 在真实页面可运行。已误发的无 scope `app-server-client@1.66.0` 与依赖旧名的 `@limecloud/agent-runtime-client@0.1.0` 只作为 compat-misrelease 记录，不进入 Content Studio 接入。
