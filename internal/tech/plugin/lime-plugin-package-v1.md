# Lime Plugin Package v1

更新时间：2026-07-02  
状态：Draft  
适用范围：Lime 本地插件、云端分发插件、领域型 Plugin、文章 / 文档类插件

## 1. 目标

Lime Plugin Package v1 的目标是让一个插件包可以被安装、解释、编排、运行、渲染和恢复。它不是外部插件包格式的兼容层，而是 Lime 自己的插件事实源；其中 `skills/` 能力层采用 Agent Skills 目录和 `SKILL.md` 元数据规则，便于跨 Agent 复用。

一个合格插件包必须回答六个问题：

1. 我是谁：插件身份、版本、展示信息、分发策略。
2. 我能做什么：activation、workflow、Agent Skills、subagents、CLI、connectors、hooks。
3. 我怎么运行：runtime bridge、worker、task、宿主托管生成、权限、失败策略、evidence。
4. 我产出什么：ArtifactFrame、articleArtifacts、artifact kind、workspace patch、内部 Product Profile 事实。
5. 用户在哪里继续工作：独立产物框、右侧 Article Editor、动作、历史恢复。
6. 如何验证：schema、路径、示例请求、示例产物、E2E 场景。

## 2. 包结构

```text
<plugin-id>/
  plugin.json
  app.runtime.yaml
  app.workbench.yaml
  skills/
    <skill-name>/SKILL.md
  subagents/
    <subagent-id>/prompt.md
    <subagent-id>/references/**
    <subagent-id>/scripts/**
    <subagent-id>/templates/**
  clis/clis.json
  connectors/connectors.json
  hooks/*.mjs
  resources/
    i18n.json
    recommend.json
    icons/**
    templates/**
  workflows/**
  artifacts/**
  examples/**
  README.md
```

### 目录职责

| 路径 | 职责 | 机器事实源 |
| --- | --- | --- |
| `plugin.json` | 插件包唯一入口，声明身份、展示、安装策略和能力索引。 | 是 |
| `app.runtime.yaml` | 声明 activation、task、workflow、worker、hook policy、runtime 权限和 evidence。 | 是 |
| `app.workbench.yaml` | 声明业务对象、ArtifactFrame、articleArtifacts、surface、materializer、动作和历史恢复。 | 是 |
| `skills/<skill-name>/SKILL.md` | 声明可复用 Agent Skill 的触发条件、输入、步骤、输出和失败处理。 | 是 |
| `subagents/**` | 声明子智能体 prompt、references、scripts、templates 和 skill 绑定。 | 是 |
| `clis/clis.json` | 声明 CLI 工具、来源、版本、校验命令、暴露范围。 | 是 |
| `connectors/connectors.json` | 声明账号、OAuth、API、MCP、数据源依赖。 | 是 |
| `hooks/*.mjs` | 声明 prompt / tool / task 生命周期 hook。 | 是 |
| `resources/**` | 声明 i18n、推荐入口、模板、图标和静态资源。 | 是 |
| `workflows/**` | 承载可审阅 workflow 说明、样例 evidence 和流程文档。 | 辅助 |
| `artifacts/**` | 承载 schema、样例 artifact 和 workspace patch。 | 是 |
| `examples/**` | 承载示例请求、示例输出和本地验证数据。 | 辅助 |
| `README.md` | 给人读的说明文档。 | 否 |

## 3. `plugin.json`

`plugin.json` 是插件包唯一机器入口。宿主安装、本地扫描、插件中心展示和能力加载都从它开始。

最小形状：

```json
{
  "schemaVersion": "lime.plugin.package.v1",
  "id": "content-factory-app",
  "name": "content-factory-app",
  "version": "2.0.0",
  "displayName": "内容工厂",
  "description": "生成文章、配图规划和交付检查清单的内容生产插件。",
  "kind": "domain-plugin",
  "publisher": {
    "name": "Lime"
  },
  "presentation": {
    "icon": "./resources/icons/icon.svg",
    "category": "content",
    "brandColor": "#10B981"
  },
  "install": {
    "local": true,
    "cloud": true,
    "authentication": "on_use"
  },
  "contributions": {
    "runtime": "./app.runtime.yaml",
    "workbench": "./app.workbench.yaml",
    "skills": "./skills",
    "subagents": "./subagents",
    "clis": "./clis/clis.json",
    "connectors": "./connectors/connectors.json",
    "hooks": "./hooks",
    "resources": "./resources",
    "workflows": "./workflows",
    "artifacts": "./artifacts"
  }
}
```

规则：

- `schemaVersion` 必须固定到 Lime 插件包标准版本。
- `id` 是运行时、artifact、workspace、权限和日志中的稳定标识。
- `contributions` 只声明路径索引，不承载业务编排细节。
- 业务编排进入 `app.runtime.yaml`，ArtifactFrame、articleArtifacts 和右侧工作台 contract 进入 `app.workbench.yaml`。
- 路径必须是插件包内相对路径，不能写用户机器绝对路径。

## 4. Runtime 能力

`app.runtime.yaml` 是运行事实源，至少覆盖：

- `activationEntries`：如 `@写文章`、`@写作`。
- `tasks`：输入、输出、artifact kind、权限和失败策略。
- `workflows`：步骤、subagent、skillRefs、CLI refs、connector refs、hook policy。
- `worker`：入口、sample request、输出 artifact kind。
- `hostManagedGeneration`：当 worker 需要宿主先执行受控模型生成时，声明输入和输出字段映射。
- `session`：new / resume / continue / fork 能力。
- `evidence`：必须记录 workflow key、步骤状态、数据来源、artifact refs。

推荐形状：

```yaml
runtime:
  bridge:
    kind: app-server-json-rpc
    required: true
  activationEntries:
    - key: content_article_generate
      title: 写文章
      aliases: ["@写文章", "@写作"]
      taskKind: content.article.generate
      defaultObjectKind: articleDraft
  worker:
    entrypoint: ./src/runtime/content-factory-worker.mjs
    sampleRequest: ./examples/runtime-request.sample.json
    outputArtifactKind: content_factory.workspace_patch
    hostManagedGeneration:
      enabled: true
      systemPrompt: |
        只生成可直接进入工作区的 Markdown 正文。
      requests:
        - id: article-draft-document
          kind: markdown_document
          targetObjectKind: articleDraft
          outputField: documentText
  workflows:
    - key: content_article_workflow
      taskKind: content.article.generate
      outputArtifactKind: content_factory.workspace_patch
      steps:
        - id: research
          subagent: content-researcher
          skillRefs: [article-research]
        - id: strategy
          subagent: content-strategist
          skillRefs: [article-strategy]
        - id: draft
          subagent: article-writer
          skillRefs: [article-writing]
        - id: review
          subagent: copy-editor
          skillRefs: [article-editing]
        - id: image-plan
          subagent: image-planner
          skillRefs: [article-image-plan]
```

### 宿主托管生成

`hostManagedGeneration` 是通用 worker 能力声明，不是内容工厂专属字段。适用场景是：插件 worker 需要真实模型生成，但不能直接接触 provider key、全局网关 key 或宿主内部凭证。

固定规则：

- 插件只在 `app.runtime.yaml#agentRuntime.worker.hostManagedGeneration` 声明生成需求，不在 worker 里直连 provider。
- 宿主在启动 worker 前完成模型路由和生成，把结果写进 worker request 的 `hostManagedGeneration` 与 `runtime.hostManagedGenerationResult`。
- worker 只消费 `status / provider / model / outputs[]`，并把消费结果回写到业务对象 source 字段。
- 没有可用 provider、模型路由失败或宿主禁用该能力时，宿主必须写 `status=unavailable`，worker 按插件自己的 deterministic fallback 或 fail-closed 逻辑处理。
- `outputs[]` 只传受控内容和最小元数据，不传 provider key、宿主 access token、文件系统句柄或 Electron IPC 能力。
- 该机制是通用宿主能力，不允许为了某个插件在宿主里增加垂直 `content_factory_*` 业务逻辑。

### 宿主工具请求

`hostToolRequests` 是 worker 产物里的通用受控工具请求，不是内容工厂私有搜索协议。适用场景是：worker 需要宿主调用已注册的 Agent 工具来补齐证据，但插件不能直接获得宿主凭证、Electron IPC、Provider key 或工具 registry。

推荐 worker 在 workspace patch 对象的 `source` 中声明：

```json
{
  "source": {
    "workflowKey": "content_article_workflow",
    "hostToolRequests": [
      {
        "id": "research-query-1",
        "toolName": "WebSearch",
        "params": {
          "query": "公众号文章结构 最新写法"
        },
        "purpose": "验证写作依据"
      }
    ]
  }
}
```

固定规则：

- 宿主只执行当前 Agent registry 已注册并允许的工具；不得在 App Server 里新增一套 `WebSearch` / `WebFetch` 私有实现。
- 工具事件统一标记 `source=workspace_patch_host_tool_requests`，并把 `workflowKey` 原样写入事件 metadata，便于审计和历史恢复。
- 工具结果必须回填为 `hostToolEvidence / hostToolStatus`；WebSearch 兼容场景可额外保留 `searchEvidence / hostSearchEvidence / hostSearchStatus` 给历史文章 artifact 读取。
- workflow step、工具事件和 hook progress 只进入 read model、artifact metadata、evidence pack 和 JSONL 审计，不作为右侧工作区固定 UI 面板。
- 旧 `searchRequests` 只允许作为历史 workspace patch 的兼容读取字段，新 worker 必须写 `hostToolRequests`。

## 5. Workbench / ArtifactFrame / articleArtifacts 能力

`app.workbench.yaml` 是业务对象、ArtifactFrame 和 articleArtifacts 的事实源，至少覆盖：

- `productionObjects`：如 `articleDraft`、`imageGenerationSet`、`deliveryChecklist`。
- `artifactFrames`：聊天区独立产物框 shell、renderer、打开目标和流式策略。
- `articleArtifacts`：文章类产物的内容 renderer、右侧 renderer、可编辑能力和恢复策略。
- `objectSurfaces`：对象默认 surface、renderer kind、layout。
- `artifactMaterializers`：artifact / workspace patch 如何物化为业务对象。
- `frames`：聊天独立产物框展示规则。
- `actions`：继续改写、生成配图、导出等受控动作。
- `historyRestore`：selected object、primary object、fallback 的恢复策略。

规则：

- 插件只能声明 ArtifactFrame / articleArtifacts / renderer contract，不能直接控制宿主右侧 dock。
- 文章类 ArtifactFrame 可以完整、流式展示正文；完整正文不得散落在普通 assistant message。
- 完整文章必须进入宿主 Article Editor 或 artifact viewer。
- workflow step、hook progress 和编排状态默认只写入宿主 JSONL / workflow audit 日志，不作为右侧工作区固定 UI 面板。
- Product Profile 只作为内部事实源 / 调度桥 / 历史恢复输入，不作为文章用户主界面。
- 历史恢复优先恢复 plugin workspace，再回退 artifact，最后才回退聊天。

## 6. 子智能体与 Agent Skills

子智能体和 Agent Skills 是插件包内的生产能力，不是宿主内置能力。Lime 插件包只在 `skills/` 层采用 Agent Skills 标准；runtime、workbench、worker、artifact 和安装合同仍以 Lime Plugin Package v1 为事实源。

子智能体目录推荐：

```text
subagents/article-writer/
  prompt.md
  references/style.md
  scripts/normalize-outline.mjs
  templates/article.md
```

子智能体规则：

- `prompt.md` 是该子智能体的角色、边界和输出格式。
- `references/**` 只放该子智能体需要的领域材料。
- `scripts/**` 只放该子智能体可调用的本地辅助脚本。
- 子智能体不能自行切换 workflow 或越权读其他插件资产。

Agent Skill 目录规则：

- 每个 skill 使用 `skills/<skill-name>/SKILL.md`，`<skill-name>` 只能包含小写字母、数字和连字符，不能以下划线、连续连字符、开头连字符或结尾连字符命名。
- `SKILL.md` 必须包含 YAML frontmatter，且 `name` 必须与父目录 `<skill-name>` 完全一致。
- `description` 必须非空，描述这个 skill 做什么以及何时使用，长度不超过 1024 字符。
- `license`、`compatibility`、`metadata`、`allowed-tools` 可以按 Agent Skills 规范作为可选 frontmatter 字段。
- Markdown 正文必须说明何时使用、输入、步骤、输出和失败回退；正文保持短而清晰，把长材料按渐进展开方式拆到同目录 `references/`，可执行辅助脚本放到同目录 `scripts/`，模板或静态资源放到同目录 `assets/`。
- `references/`、`scripts/` 和 `assets/` 只服务当前 skill；相对路径解析以 `SKILL.md` 所在目录为根，不把宿主仓库路径写进 skill 正文。
- workflow 引用 skill 时使用稳定 `skill-name`，也就是 `SKILL.md#name` 和父目录名，不使用文件路径作为业务 id。
- 宿主和 validator 必须严格按目录名读取 skill；禁止新增或继续兼容 `skills/article_writing` 这类下划线 legacy 目录。

## 7. CLI、Connectors、Hooks

### CLI

`clis/clis.json` 声明插件所需命令行工具：

```json
{
  "tools": [
    {
      "id": "content-factory",
      "displayName": "content-factory",
      "description": "Content Factory local validation and runtime helper.",
      "verifyArgs": ["validate"],
      "exposure": "declared-workflows",
      "source": {
        "type": "local-package",
        "bin": "./cli/content-factory.mjs"
      }
    }
  ]
}
```

### Connectors

`connectors/connectors.json` 声明账号、OAuth、API、MCP 或数据源依赖。宿主根据 connector 决定授权、可用性和错误展示。

### Hooks

`hooks/*.mjs` 只用于生命周期编排：

- prompt submit 前补充运行上下文。
- tool use 前做权限或路由检查。
- tool use 后做 evidence 归档。
- task 完成后做 artifact / workspace patch 校验。

hooks 不允许承担宿主级 UI 渲染，不允许绕过 App Server Runtime 直接调用模型。

## 8. 安装与发现

本地安装流程：

1. 用户选择插件包目录。
2. 宿主读取 `plugin.json`。
3. 校验 `schemaVersion`、`id`、`version`、`contributions` 路径。
4. 加载 runtime / workbench / skills / subagents / CLI / connectors / hooks。
5. 写入 installed registry。
6. 插件中心、输入框候选和 runtime activation 从 installed registry 投影。

未登录云端账号时：

- 云端列表失败不能阻断本地 installed registry。
- 本地插件只要 validator 通过，就能出现在插件中心和输入框候选中。
- 需要云端 connector 的能力可以置灰，但不能让整个本地插件消失。

## 9. 验证要求

插件包 validator 必须检查：

- `plugin.json` 存在且 schemaVersion 正确。
- `contributions` 指向的文件或目录存在。
- `app.runtime.yaml` 中 activation / workflow / task 引用合法。
- 如声明 `hostManagedGeneration`，其 `requests[].id / targetObjectKind / outputField` 必须完整，且 worker 仍声明 `directProviderAccess: false`。
- workflow step 引用的 subagent、skill、CLI、connector 存在。
- `skills/**/SKILL.md` 符合 Agent Skills 目录和 frontmatter 规则：父目录名等于 `name`，命名只用小写字母、数字和连字符，`description` 非空且不超过 1024 字符。
- 不存在下划线命名的 legacy skill 目录。
- `app.workbench.yaml` 中 object、surface、materializer、action 引用合法。
- worker sample request 可运行，输出符合 artifact schema。
- i18n、icon、recommend、template 等 resources 路径合法。
- 包内不能出现用户机器绝对路径。

宿主回归必须覆盖：

- 本地安装。
- 插件中心展示。
- 输入框 `@` 候选。
- activation metadata。
- runtime task start / stream / complete。
- 独立 ArtifactFrame。
- 右侧 Article Editor。
- 历史恢复。

## 10. 禁止事项

- 不允许为某个插件在宿主里 hard code 入口、workflow、subagent 或 skill。
- 不允许让说明文档成为机器事实源。
- 不允许插件 worker 直接拥有右侧栏布局。
- 不允许在聊天正文输出完整生产物来替代 Article Editor。
- 不允许把 Product Profile 调试面板做成文章用户界面。
- 不允许为未安装插件伪造 `@` 候选。
- 不允许生产路径依赖 mock fallback。
