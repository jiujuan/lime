# ArtifactDocument v1 Current 协议

> 状态：current，正式交付物协议继续演进
> 更新时间：2026-06-17
> 边界：本协议不是通用文件预览协议；source-backed preview artifact 另见 `roadmap.md` 与 `architecture-blueprint.md`。

## 结论

`ArtifactDocument v1` 是 Lime 的正式交付物事实源。

它服务：

- 报告
- PRD
- roadmap
- brief
- analysis
- comparison
- plan
- table_report

它不服务：

- 普通项目文件预览
- DOCX 原文件预览
- HTML 独立窗口
- 图片/音视频任务结果卡
- URL/知识库/数据库记录详情
- Plugin shell window

这些对象可以通过 Preview Artifact Contract 打开，但不会自动升级为 `ArtifactDocument v1`。

## 顶层模型

```ts
export type ArtifactKind =
  | "report"
  | "roadmap"
  | "prd"
  | "brief"
  | "analysis"
  | "comparison"
  | "plan"
  | "table_report";

export type ArtifactStatus =
  | "draft"
  | "streaming"
  | "ready"
  | "failed"
  | "archived";

export interface ArtifactDocumentV1 {
  schemaVersion: "artifact_document.v1";
  artifactId: string;
  workspaceId?: string;
  threadId?: string;
  turnId?: string;
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  language: "zh-CN";
  summary?: string;
  blocks: ArtifactBlockV1[];
  sources: ArtifactSourceV1[];
  metadata: ArtifactDocumentMetaV1;
}
```

## Block 原则

- `v1` 保持 flat ordered block list，不做复杂布局 DSL。
- 模型输出语义结构，不输出 CSS。
- renderer 可把 block 映射到视觉组件。
- 任意 block 渲染失败必须降级到 `rich_text` 或纯文本。

允许的核心 block：

- `section_header`
- `hero_summary`
- `key_points`
- `rich_text`
- `callout`
- `table`
- `checklist`
- `metric_grid`
- `quote`
- `citation_list`
- `image`
- `code_block`
- `divider`

## Source 与版本

正式交付物必须保留来源和版本上下文：

- `sources[]` 引用搜索、文件、网页、工具结果、人工输入。
- `metadata.sourceRunBinding` 绑定 thread/turn/item。
- rewrite 只能作用于目标 block 或明确声明的范围。
- diff 由版本快照计算，不靠消息文本猜测。

研究、报告、对比类输出如果声称“基于搜索/网页/文件”，必须有 source；否则 validator 应标记 issue。

## 与 Preview Artifact 的转换

允许从 preview artifact 显式升级为正式文档：

1. 用户选择“整理为正式文档”。
2. Agent 明确生成正式交付物。
3. 系统将 source-backed content 作为 source 输入，而不是直接把 preview meta 当 document meta。
4. 生成新的 `ArtifactDocument v1`，并进入正式版本链。

禁止隐式升级：

- 点击 DOCX 文件不会自动生成正式文档。
- 点击 HTML 文件不会自动进入 `ArtifactDocument`。
- 点击图片不会创建空 block document。

## Current 实现入口

- `src/lib/artifact-document/*`
- `src/components/agent/chat/workspace/ArtifactWorkbenchShell.tsx`
- `src/components/artifact/renderers/ArtifactDocumentRenderer.tsx`
- App Server / RuntimeCore 的 artifact snapshot、ops apply、validator、persist 链。

旧 `artifact_ops` 只作为 compat 输入壳；current 方向是 typed patch 与单条 incremental op。
