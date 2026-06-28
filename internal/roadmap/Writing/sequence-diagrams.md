# Writing 时序图

更新时间：2026-06-28  
状态：In Progress

## 1. 插件中心安装态展示

```mermaid
sequenceDiagram
  autonumber
  participant User as 用户
  participant Page as 插件中心
  participant Cloud as Cloud Marketplace
  participant Installed as Installed Registry
  participant Contract as Plugin Contract

  User->>Page: 打开插件中心
  Page->>Cloud: 拉取 marketplace
  Cloud-->>Page: 可能返回 401/403
  Page->>Installed: 读取本地已安装插件包
  Installed-->>Page: content-factory-app
  Page->>Contract: projectPluginRegistryFromInstalledPackages
  Contract-->>Page: activationEntries / subagents / skills / CLI / connectors / hooks / workflows
  Page-->>User: 展示内容工厂和能力详情
```

## 2. `@写文章` 激活

```mermaid
sequenceDiagram
  autonumber
  participant User as 用户
  participant Composer as Claw 输入框
  participant Registry as Plugin Registry
  participant Intent as Intent Resolver
  participant Runtime as App Server Runtime

  User->>Composer: 输入 @写文章 写一篇文章
  Composer->>Registry: buildPluginActivationMentionCatalog
  Registry-->>Composer: 内容工厂插件包 activation entry
  Composer->>Intent: resolveWorkspaceAgentAppIntent
  Intent-->>Composer: content_article_generate + plugin contract
  Composer->>Runtime: agentSession/turn/start + plugin_activation metadata
  Runtime-->>Composer: turn started
```

## 3. 写作 workflow 执行

```mermaid
sequenceDiagram
  autonumber
  participant Runtime as App Server Runtime
  participant Worker as Content Factory Worker
  participant Research as content-researcher
  participant Strategy as content-strategist
  participant Writer as article-writer
  participant Editor as copy-editor
  participant Image as image-planner
  participant Store as Artifact / Read Model

  Runtime->>Worker: content.article.generate
  Worker->>Research: 搜索主题和事实
  Research-->>Worker: research notes
  Worker->>Strategy: 生成角度和大纲
  Strategy-->>Worker: brief + outline
  Worker->>Writer: 写正文
  Writer-->>Worker: markdown draft
  Worker->>Editor: 审稿校对
  Editor-->>Worker: revised draft + issues
  Worker->>Image: 规划配图
  Image-->>Worker: image slots + prompts
  Worker->>Store: workspace patch + worker evidence
  Store-->>Runtime: articleDraft artifact refs
```

## 4. 小产物卡到右侧 Product Profile

```mermaid
sequenceDiagram
  autonumber
  participant Runtime as App Server Runtime
  participant Chat as Message List
  participant Card as Article Card
  participant Surface as Right Surface
  participant Profile as Product Profile

  Runtime-->>Chat: artifact / workspace patch
  Chat->>Card: 渲染小产物卡
  Card-->>Chat: objectRef / artifactRef
  User->>Card: 点击打开
  Card->>Surface: selectObject(articleDraft)
  Surface->>Profile: render articleDraft
  Profile-->>User: 展示正文、结构、引用、配图和动作
```

## 5. 历史恢复

```mermaid
sequenceDiagram
  autonumber
  participant User as 用户
  participant Sidebar as 历史列表
  participant Runtime as agentSession/read
  participant Workspace as Plugin Workspace
  participant Surface as Right Surface

  User->>Sidebar: 打开历史写作会话
  Sidebar->>Runtime: read session
  Runtime-->>Sidebar: messages + artifacts + plugin workspace
  Sidebar->>Workspace: hydrate content-factory workspace
  Workspace-->>Sidebar: selected articleDraft
  Sidebar->>Surface: open productProfile(articleDraft)
  Surface-->>User: 恢复右侧文章草稿
```

## 6. 继续改写

```mermaid
sequenceDiagram
  autonumber
  participant User as 用户
  participant Profile as Product Profile
  participant Action as Surface Action Router
  participant Runtime as App Server Runtime
  participant Worker as Content Factory Worker

  User->>Profile: 点击继续改写
  Profile->>Action: revise(articleDraftRef, instruction)
  Action->>Runtime: agentSession/action/respond
  Runtime->>Worker: content.article.revise
  Worker-->>Runtime: updated articleDraft artifact
  Runtime-->>Profile: 新版本 / workspace patch
```
