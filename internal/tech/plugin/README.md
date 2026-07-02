# Lime 插件技术规范

本目录沉淀 Lime 自己的插件包标准。这里的规范是宿主、插件包、插件中心、Agent Runtime、ArtifactFrame、articleArtifacts、Article Editor、内部 Product Profile 事实源和验证工具共同遵守的事实源。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [lime-plugin-package-v1.md](./lime-plugin-package-v1.md) | Lime Plugin Package v1 标准：插件入口、能力目录、runtime、workbench、子智能体、Agent Skills、CLI、connectors、hooks 和验证口径。 |

## 核心原则

1. 一个插件包只有一个机器入口：`plugin.json`。
2. 插件能力通过标准目录和分层能力文件声明，不在宿主里 hard code；`skills/` 层采用 Agent Skills 的 `skills/<skill-name>/SKILL.md` 目录和 frontmatter 规则。
3. 宿主负责安装、权限、运行、右侧栏、历史恢复、受控模型生成注入和治理守卫；workflow step 事件只进入 JSONL 审计，不直接进入右侧工作区 UI。
4. 插件负责声明能力、编排流程、运行 worker、产出 ArtifactFrame / articleArtifacts / workspace patch / evidence；需要模型正文时只声明 `hostManagedGeneration` 合同，不直接持有 provider key。
5. 说明文档只给人读，不能成为机器事实源。
