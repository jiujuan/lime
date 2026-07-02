# 内容工厂插件包

内容工厂是 Lime Plugin Package v1 的生产型插件样板包。它不复用旧 `content-studio` 或旧版内容工厂程序，只声明内容生产业务对象、任务、子智能体、skills、CLI、connectors、hooks、右侧 Article Workspace 和历史恢复契约。

## 当前形态

- 中间区域由 Lime Claw 承接对话、输入和文章产物流式反馈；workflow run / step / tool 明细进入宿主 JSONL 审计，不占右侧 UI。
- 右侧 `articleWorkspace` tab 展示文章、图片组、视频分镜和交付清单。
- 插件包通过应用中心发布、安装、激活和打开。
- Runtime 走 Lime App Server JSON-RPC，不直接调用模型、文件系统、secret 或旧 Tauri command；正文生成通过宿主托管的 `hostManagedGeneration` 注入到 worker request。
- `@写文章` / `@写作` 是插件 activation entry，启动 `content_article_workflow`，而不是宿主内置写作命令。
- 写作相关子智能体、Agent Skills、CLI、connectors 和 hooks 由 `plugin.json` 及分层能力文件声明并随本目录安装，插件中心可以展示子智能体、CLI 工具、连接器、hooks、授权和技能。

## 骨架文件

- `plugin.json`：插件包唯一入口，声明身份、展示、安装策略和能力索引。
- `app.workbench.yaml`：生产对象、任务、surface、materializer 和历史恢复策略。
- `app.runtime.yaml`：Agent task runtime 和 structured output contract。
- `workflows/content-article.workflow.md`：写文章工作流、子智能体和 skills 编排。
- `subagents/<id>/prompt.md`：写文章工作流使用的 5 个子智能体说明。
- `skills/<skill-name>/SKILL.md`：插件自带的 5 个写作技能，采用 Agent Skills 目录规则，`SKILL.md` frontmatter 的 `name` 必须与父目录一致，不依赖宿主内置技能。
- `clis/clis.json`：CLI 工具声明和本地校验入口。
- `connectors/connectors.json`：知识库、搜索和媒体生成等外部依赖声明。
- `hooks/`：prompt / task 生命周期 hook。
- `resources/`：图标、推荐入口和本地化资源索引。
- `cli/content-factory.mjs`：本地安装后的 inspect / run / validate 入口。
- `src/runtime/content-factory-worker.mjs`：本地 worker，输入 task request，先输出 audit-only `workflow.connector.requested`，再输出段落级 `artifact.snapshot` progress，最后输出最终 `content_factory.workspace_patch`。
- `app.operations.yaml`：受控动作、风险和证据规则。
- `artifacts/content-factory-workspace-patch.schema.json`：Article Workspace patch schema。
- `examples/workspace-patch.sample.json`：Claw 历史恢复和右侧 Article Workspace 的最小样例。
- `docs/development.md`：开发边界、输出合同和本地验证顺序。
- `docs/release.md`：应用中心发布包口径。

## 本地校验

```bash
npm test
npm run runtime:sample
npm run validate:app
npm run cli:inspect
npm run cli:run
```

这些校验证明插件包骨架文件完整、子智能体 / skills / CLI / connectors / hooks 随包落盘、worker 能生成包含检索轮次、标题候选、大纲、正文、配图占位和交付清单的 Article Workspace Patch，worker 自己输出 audit-only connector 请求和段落级 artifact partial；如果宿主注入 `hostManagedGeneration.outputs[]`，worker 会直接使用宿主生成的 Markdown 正文；如果宿主当前 backend 没返回结果，worker 会把 `hostManagedGeneration.status` 收敛为 `unavailable` 后继续 deterministic fallback。完整应用中心安装、`@写作` 激活和 Claw 历史恢复仍由 Lime 宿主侧验证。

## 下一步开发

1. 在 Lime 宿主里继续验证 Claw 中间对话、右侧 Article Workspace、历史恢复和 action 回流。
2. 把图片 / 视频媒体缓存 executor 接到宿主受控执行链，不让 worker 直接落文件。
3. 最后补发布签名、包 hash、应用中心远程 catalog 和 evidence。
