# 内容工厂 Workbench Profile PRD

更新时间：2026-06-23
状态：Draft

## 1. 定位

内容工厂是 Agent App v3 的首个 Workbench Profile dogfood。`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 是独立 Agent App 仓库和 current 事实源，通过 Lime 应用中心发布、安装、激活和打开。它参考 `content-studio` 已验证的业务核心：文章生成、图片生成和视频脚本 / 分镜生成；但不复用其任何代码、桌面壳、IPC、store 或 renderer。

```text
内容工厂不是嵌入式旧 App
内容工厂是 Claw 内的生产型 Agent App
内容工厂通过应用中心发布和安装
```

## 2. v1 业务闭环

```text
创作需求
  -> 内容简报
  -> 文章草稿
  -> 图片生成任务 / 图片组
  -> 视频脚本 / 分镜
  -> 审核清单
  -> 导出 / 继续迭代
```

## 3. 业务对象

| object kind | 说明 | 默认 surface | 主动作 |
| --- | --- | --- | --- |
| `contentBrief` | 用户目标、平台、主题、受众、限制和素材引用。 | form | refine / startArticle |
| `articleDraft` | Markdown 文章草稿、标题、摘要、结构和引用。 | documentCanvas | revise / continueWriting / generateImages / export |
| `imageGenerationSet` | 图片提示词、生成结果、状态、变体和适用位置。 | imageGrid | regenerate / createVariant / applyToArticle |
| `videoScript` | 短视频脚本、口播、节奏和平台规格。 | documentCanvas | rewrite / createStoryboard |
| `videoStoryboard` | 镜头列表、画面描述、旁白、素材需求和视频任务状态。 | storyboard | rewriteShot / generateVideoTask / export |
| `deliveryChecklist` | 发布前检查、风险、缺口和交付项。 | checklist | approve / requestRevision / export |

## 4. 生产任务

| task kind | 输入 | 输出 | 必需能力 |
| --- | --- | --- | --- |
| `content.article.generate` | `contentBrief` / 用户 prompt / 素材引用 | `articleDraft` | `lime.agent`、`lime.artifacts`、`lime.knowledge` |
| `content.image.generate` | `articleDraft` section / image prompt / style | `imageGenerationSet` | `lime.agent`、`lime.media`、`lime.artifacts` |
| `content.video.script.generate` | `contentBrief` / `articleDraft` | `videoScript` | `lime.agent`、`lime.artifacts` |
| `content.video.storyboard.generate` | `videoScript` | `videoStoryboard` | `lime.agent`、`lime.media`、`lime.artifacts` |
| `content.delivery.review` | 任意产物组 | `deliveryChecklist` | `lime.agent`、`lime.evidence` |

## 5. 首屏体验

用户进入内容工厂 session 时：

1. 中间区域始终是 Claw 对话和运行过程，不显示独立产物画布。
2. 右侧产物 Profile 显示当前对象 surface；新 session 可显示内容简报 profile、生成中状态或空态。
3. 历史任务打开后优先恢复上次主产物和选中对象。
4. 当前阶段必须在右侧产物 Profile 或对话操作区显示下一步主动作，例如“继续改写”“生成配图”“生成分镜”。

## 6. MVP 验收

- [ ] 从自然语言需求生成一篇 `articleDraft`。
- [ ] 从文章段落生成一个 `imageGenerationSet`。
- [ ] 从文章或简报生成一个 `videoStoryboard`。
- [ ] 三类产物都能进入对象 surface。
- [ ] 打开历史任务能恢复至少一个主产物。
- [ ] 对历史产物执行一次继续动作并产生新 turn / artifact。

## 7. 非目标

- 不做完整素材库后台。
- 不做云端团队协作。
- 不做发布平台账号绑定。
- 不内置真实视频模型网关。
- 不把 Content Studio 的参数舱、设置页和桌面壳搬进 Lime。
