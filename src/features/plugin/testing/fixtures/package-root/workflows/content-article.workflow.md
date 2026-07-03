# 写文章工作流

## 目标

把用户通过 `@写文章` 或 `@写作` 发起的写作需求，编排成可恢复、可继续操作的内容工厂任务。聊天区只保留文章产物框的流式增长，文章正文进入右侧 Article Workspace 的 `articleDraft` 对象；workflow run / step / tool 明细进入宿主后台 JSONL 审计。

## 触发

- intent：`content_article_generate`
- taskKind：`content.article.generate`
- outputArtifactKind：`content_factory.workspace_patch`
- 默认右侧栏：`articleWorkspace`
- 主对象：`articleDraft`

## 步骤

| 顺序 | 子智能体 | 关联技能 | 输出 |
| --- | --- | --- | --- |
| 1 | `content-researcher` 资料检索 | `article-research` | `researchRounds`、`citations`、`keyTakeaways` |
| 2 | `content-strategist` 选题策划 | `article-strategy` | `titleCandidates`、`outline`、`writingPlan` |
| 3 | `article-writer` 正文写作 | `article-writing` | `articleDraft.source.processMarkdown`、`articleDraft.source.documentText`、`articleDraft.source.finalMarkdown` |
| 4 | `copy-editor` 审稿校对 | `article-editing` | `deliveryChecklist`、`reviewNotes` |
| 5 | `image-planner` 配图规划 | `article-image-plan` | `imageSlots`、`imageGenerationSet` |

## 不变量

1. 不在聊天正文里直接铺完整文章。
2. 每个步骤都写入 worker evidence 或宿主审计事件，供 Lime 宿主写入 `workflow-events.jsonl`，而不是投影成右侧流程轨。
3. 过程稿只进入 `articleDraft.source.processMarkdown`；最终正文只进入 Article Workspace Patch 的 `articleDraft.source.documentText` / `articleDraft.source.finalMarkdown`。
4. 点击聊天产物小框后，由 Lime 宿主打开右侧 Article Workspace。
5. 子智能体、skills 和 CLI 必须来自本插件目录，不能由宿主 hard code。
