# @limecloud/agent-capability-catalog

`@limecloud/agent-capability-catalog` 是共享 Agent Runtime capability 的 headless catalog。它把 Claw / Plugin / Product App 都要用到的能力 ID、alias、metadata contract 和 tool policy 输入收敛为纯 TypeScript 函数。

这个包不调用 runtime，不渲染 UI，不依赖 Electron，也不复制 Claw Chat 的 `@` 命令页面。

## Boundary

这个包负责：

- 定义稳定 capability id，例如 `lime.capability.research.search`。
- 把 `research`、`web_search`、`image_generation` 等历史 alias 规整为稳定 id。
- 生成 runtime payload 中可复用的 `requiredCapabilities`、`capabilityHints` 和 `toolPolicy`。
- 为业务 surface 提供 allowlist 校验和最小 metadata contract。

这个包不负责：

- 启动 `turn/start`。
- 订阅 runtime events。
- 持久化 session。
- 渲染工作台。
- 定义具体产品的 Prompt 或业务流程。

## Usage

```ts
import {
  buildAgentCapabilityPolicy,
  resolveAgentCapabilityIds,
} from "@limecloud/agent-capability-catalog";

const requiredCapabilities = resolveAgentCapabilityIds([
  "research",
  "pdf_extract",
]);

const policy = buildAgentCapabilityPolicy({
  selectedSkillSlugs: ["copywriting-master"],
  permissionMode: "ask",
  requiredCapabilities,
});
```

## Capability IDs

首批共享能力：

- `lime.capability.image.generate`
- `lime.capability.cover.generate`
- `lime.capability.video.generate`
- `lime.capability.research.search`
- `lime.capability.report.generate`
- `lime.capability.site.search`
- `lime.capability.pdf.read`
- `lime.capability.summary.generate`
- `lime.capability.webpage.generate`
- `lime.capability.presentation.generate`
