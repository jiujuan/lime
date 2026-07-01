# Writing 路线图

更新时间：2026-06-30
状态：In Progress
主线：Lime 插件包标准下的内容工厂写文章闭环

## 1. 目标

Writing 的目标很简单：用户在 Claw 里发起“写一篇文章”，Lime 应该启动已安装的内容工厂插件，通过 Lime 插件包标准声明的 workflow、子智能体、skills、CLI、连接器和 hooks 完成资料搜索、结构策划、正文写作、审稿和配图规划。对话区任务卡和对话流过程态留在对话流里，最终文章成熟后再进入独立 `ArtifactFrame`。文章类 `ArtifactFrame` 内部使用 `articleArtifacts` renderer，可流式输出最终文章；`ArtifactFrame` 注册链已抽成通用扩展点，后续其他产物只需新增 renderer；点击框头或打开按钮后，按 `../rightsurface/README.md` 的 dock / tab 标准展开右侧 Article Editor 可编辑画布。

```text
@写文章 / @写作
  -> 内容工厂插件激活
  -> 任务卡 / 对话流过程态
  -> content_article_workflow
  -> 声明 searchRequests，由宿主 connector / tool timeline 执行并回填 evidence
  -> 策划 / 写作 / 校对 / 配图规划
  -> 聊天 ArtifactFrame(articleArtifacts renderer) 最终产物
  -> 右侧 Article Editor 可编辑画布
```

## 2. 设计结论

| 结论                       | 口径                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Lime 形成自己的插件包标准  | 入口、能力、运行、工作台和资源都按 Lime Plugin Package v1 组织，不再把外部产品格式当发布目标。                           |
| 写作不是宿主内置能力       | `@写文章`、workflow、subagents、skills、CLI 和 hooks 都来自已安装内容工厂插件包。                                        |
| 产物有独立框架             | 普通 assistant message 不承载整篇文章；过程态先在对话区回显，最终文章在独立 `ArtifactFrame` 内流式输出，右侧 Article Editor 负责编辑和深加工。 |
| 旧 Profile 路径已删除      | Article Workspace 是右侧产物事实源，Article Editor 是唯一文章编辑界面；旧 Profile 路径不再保留。                         |
| 右侧布局归宿主             | 右侧 dock / tab / pane 规则统一遵循 `../rightsurface/README.md`；内容工厂只贡献 contract / article renderer / workflow。 |
| 不登录也能用本地已安装插件 | 云端 marketplace 登录失败不能阻断本地 installed catalog 和本地插件激活。                                                 |
| 旧临时 manifest 不是主路径 | 旧说明文档只给人读；机器事实源迁到 Lime 插件包 manifest 和分层能力文件。                                                 |

## 3. 插件标准

内容工厂是 [Lime Plugin Package v1](../../tech/plugin/lime-plugin-package-v1.md) 的第一个样板包。标准目标是让 Lime 的插件可以被安装、解释、编排、运行和恢复。

Writing 路线图只描述写文章闭环；插件包结构、字段、目录契约和 validator 规则以 `internal/tech/plugin/` 为事实源。
右侧 dock / tab / pane 的统一标准见 `../rightsurface/README.md`；Writing 只保留 articleDraft / Article Editor 相关子面说明。

## 4. 文档索引

| 文档                                                                                     | 用途                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`product-requirements.md`](./product-requirements.md)                                   | 背景、目的、收益、用户故事、用户用例和验收标准。                                                              |
| [`architecture.md`](./architecture.md)                                                   | Lime 插件包标准、宿主、内容工厂插件、workflow、runtime、`articleArtifacts` 和右侧 Article Editor 的架构边界。 |
| [`workflow-design.md`](./workflow-design.md)                                             | 写文章 workflow、子 Agent、skills、CLI、hooks、工具和产物卡规则。                                             |
| [`sequence-diagrams.md`](./sequence-diagrams.md)                                         | 触发、编排、产物物化、点击展开和历史恢复时序图。                                                              |
| [`implementation-plan.md`](./implementation-plan.md)                                     | 实施切片、当前进展、验证入口和剩余缺口。                                                                      |
| [`prototypes/article-artifacts-editor.html`](./prototypes/article-artifacts-editor.html) | 通用 `ArtifactFrame`、文章 renderer 和右侧 Article Editor 的静态交互原型。                                    |

## 5. 与 Agent App v4 的关系

Writing 是 Agent App v4 内容工厂主线的第一个可用闭环。v4 的总边界仍然成立：

- 插件是分发和授权根对象。
- Agent App 是插件内 UI 能力，不是宿主内置页面。
- Claw 中间区域保留对话、运行过程和审批。
- 右侧 Article Editor 是文章产物的唯一编辑承载区。
- Article Workspace 承接插件工作区事实，旧 Profile 路径不再作为内部或外部事实源。
- 历史恢复恢复插件上下文和业务对象，不只恢复聊天。

## 6. MVP 完成判定

- [x] 内容工厂迁到 Lime Plugin Package v1，`plugin.json` 成为唯一插件包入口。
- [x] 旧说明文档退出机器事实源，只保留人类说明。
- [x] 内容工厂插件包声明 `@写文章` / `@写作` / `@内容工厂` 入口。
- [x] 内容工厂插件包声明 `content_article_workflow`、subagents、skillRefs、CLI、connectors、hooks 和 resources。
- [x] 宿主插件 contract 读取并投影 activation entries、subagents、workflows、skills、CLI、`ArtifactFrame` 和 articleArtifacts renderer contract。
- [x] `@写作` 激活时向 request metadata 写入 workflow、subagents、skill refs、CLI refs 和 hook policy。
- [x] Electron fixture 真实点击验证：插件中心可见内容工厂，输入框可 `@写文章`，发送后先出现任务卡 / 对话流过程态，再出现独立 `ArtifactFrame`，框内流式输出最终文章，点击展开右侧 Article Editor。
- [x] App Server 在 `content.article.generate` 接受后立即发出 `content_factory.workspace_patch` streaming snapshot；最终 worker patch 覆盖同一 articleDraft，不被初始草稿污染历史恢复。
- [x] 宿主 connector / tool timeline 执行 `searchRequests` 并把真实 evidence 回填到 articleDraft metadata，不退化成普通聊天长文。
- [x] 历史会话恢复后默认看到 articleDraft Article Editor，并恢复已编辑正文。

## 7. 非目标

- 不把写文章做成 `src/components` 里的硬编码内置入口。
- 不恢复旧内容工厂独立 App shell。
- 不把整篇文章直接散落在普通 assistant message；完整文章必须在独立 `ArtifactFrame` 中输出。
- 不为未安装插件伪造 `@写文章` 候选。
- 不让内容工厂 worker 直接拥有右侧栏布局。
- 不恢复旧 Profile 调试面板或相关兼容入口。
- 不把其他产品的插件格式作为 Lime 发布标准。
