export type MinimalTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => unknown;

export function fallbackTranslate(key: string, options?: Record<string, unknown>) {
  const count = options?.count;
  const index = options?.index;
  const source = options?.source;
  const visible = options?.visible;
  const hidden = options?.hidden;
  switch (key) {
    case "generalWorkbench.taskRail.stepMeta":
      return `步骤 ${index ?? ""}`;
    case "generalWorkbench.taskRail.thinkingTitle":
      return "整理思路";
    case "generalWorkbench.taskRail.runTitle":
      return source ? `执行 ${source}` : "执行任务";
    case "generalWorkbench.taskRail.runTitleFallback":
      return "执行任务";
    case "generalWorkbench.taskRail.artifactsDetail":
      return `产物：${options?.paths ?? ""}`;
    case "generalWorkbench.taskRail.empty.withSteps":
      return "当前还没有执行记录，后续产物会出现在这里。";
    case "generalWorkbench.taskRail.empty.noSteps":
      return "发送任务后，这里会显示进度和输出。";
    case "generalWorkbench.taskRail.planOverflow":
      return `另有 ${count ?? 0} 步`;
    case "generalWorkbench.taskRail.activityOverflow":
      return `另有 ${count ?? 0} 项执行`;
    case "generalWorkbench.taskRail.approval.askTitle":
      return "等待回答";
    case "generalWorkbench.taskRail.approval.elicitationTitle":
      return "等待补充";
    case "generalWorkbench.taskRail.approval.toolTitle":
      return `确认 ${options?.tool ?? ""}`;
    case "generalWorkbench.taskRail.approval.importedReadOnlyTitle":
      return "导入的权限记录";
    case "generalWorkbench.taskRail.approval.status.approved":
      return "已允许";
    case "generalWorkbench.taskRail.approval.status.rejected":
      return "已拒绝";
    case "generalWorkbench.taskRail.approval.status.answered":
      return "已回答";
    case "generalWorkbench.taskRail.approval.status.resolved":
      return "已处理";
    case "generalWorkbench.taskRail.importedRuntime.open":
      return "查看完整记录";
    case "generalWorkbench.taskRail.importedRuntime.close":
      return "收起完整记录";
    case "generalWorkbench.taskRail.importedRuntime.title":
      return "完整运行记录";
    case "generalWorkbench.taskRail.importedRuntime.summary":
      return `已默认展示 ${options?.materialized ?? 0} / ${options?.total ?? 0} 条，完整来源记录保留 ${options?.sidecar ?? 0} 条`;
    case "generalWorkbench.taskRail.importedRuntime.loading":
      return "正在读取完整记录";
    case "generalWorkbench.taskRail.importedRuntime.loadMore":
      return "加载更多";
    case "generalWorkbench.taskRail.importedRuntime.empty":
      return "暂无更多记录";
    case "generalWorkbench.taskRail.importedRuntime.error":
      return "完整记录读取失败";
    case "generalWorkbench.taskRail.importedRuntime.eventMeta":
      return `轮次 ${options?.turn ?? ""} · 事件 ${options?.event ?? ""}`;
    case "generalWorkbench.taskRail.importedRuntime.kind.mcpTool":
      return "MCP 工具";
    case "generalWorkbench.taskRail.importedRuntime.kind.dynamicTool":
      return "动态工具";
    case "generalWorkbench.taskRail.importedRuntime.kind.imageView":
      return "图片查看";
    case "generalWorkbench.taskRail.importedRuntime.kind.imageGeneration":
      return "图片生成";
    case "generalWorkbench.taskRail.importedRuntime.kind.contextCompaction":
      return "上下文压缩";
    case "generalWorkbench.taskRail.importedRuntime.kind.review":
      return "代码审查";
    case "generalWorkbench.taskRail.importedRuntime.kind.subagent":
      return "子任务活动";
    case "generalWorkbench.taskRail.importedRuntime.kind.collaboration":
      return "协作任务";
    case "generalWorkbench.taskRail.importedRuntime.kind.webSearch":
      return "联网搜索";
    case "generalWorkbench.taskRail.importedRuntime.kind.patch":
      return "补丁";
    case "generalWorkbench.taskRail.importedRuntime.kind.command":
      return "命令";
    case "generalWorkbench.taskRail.importedRuntime.kind.approval":
      return "权限确认";
    case "generalWorkbench.taskRail.importedRuntime.kind.reasoning":
      return "思考记录";
    case "generalWorkbench.taskRail.importedRuntime.kind.message":
      return "消息";
    case "generalWorkbench.taskRail.importedRuntime.kind.plan":
      return "计划";
    case "generalWorkbench.taskRail.importedRuntime.kind.tool":
      return "工具";
    case "generalWorkbench.taskRail.importedRuntime.kind.event":
      return "运行事件";
    case "generalWorkbench.taskRail.importedRuntime.status.running":
      return "进行中";
    case "generalWorkbench.taskRail.importedRuntime.status.completed":
      return "已完成";
    case "generalWorkbench.taskRail.importedRuntime.status.failed":
      return "失败";
    case "generalWorkbench.taskRail.importedRuntime.status.canceled":
      return "已中断";
    case "generalWorkbench.taskRail.importedRuntime.fact.tool":
      return "工具";
    case "generalWorkbench.taskRail.importedRuntime.fact.server":
      return "服务";
    case "generalWorkbench.taskRail.importedRuntime.fact.namespace":
      return "命名空间";
    case "generalWorkbench.taskRail.importedRuntime.fact.command":
      return "命令";
    case "generalWorkbench.taskRail.importedRuntime.fact.cwd":
      return "工作目录";
    case "generalWorkbench.taskRail.importedRuntime.fact.arguments":
      return "参数";
    case "generalWorkbench.taskRail.importedRuntime.fact.query":
      return "查询";
    case "generalWorkbench.taskRail.importedRuntime.fact.path":
      return "路径";
    case "generalWorkbench.taskRail.importedRuntime.fact.prompt":
      return "提示";
    case "generalWorkbench.taskRail.importedRuntime.fact.savedPath":
      return "保存路径";
    case "generalWorkbench.taskRail.importedRuntime.fact.revisedPrompt":
      return "修订提示";
    case "generalWorkbench.taskRail.importedRuntime.fact.model":
      return "模型";
    case "generalWorkbench.taskRail.importedRuntime.fact.status":
      return "状态";
    case "generalWorkbench.taskRail.importedRuntime.fact.statusLabel":
      return "状态标签";
    case "generalWorkbench.taskRail.importedRuntime.fact.sourceEvent":
      return "来源事件";
    case "generalWorkbench.taskRail.importedRuntime.fact.output":
      return "输出";
    case "generalWorkbench.taskRail.importedRuntime.fact.stage":
      return "阶段";
    case "generalWorkbench.taskRail.importedRuntime.fact.trigger":
      return "触发";
    case "generalWorkbench.taskRail.importedRuntime.fact.detail":
      return "说明";
    case "generalWorkbench.taskRail.importedRuntime.fact.review":
      return "审查";
    case "generalWorkbench.taskRail.importedRuntime.fact.title":
      return "标题";
    case "generalWorkbench.taskRail.importedRuntime.fact.role":
      return "角色";
    case "generalWorkbench.taskRail.importedRuntime.fact.summary":
      return "摘要";
    case "generalWorkbench.taskRail.importedRuntime.fact.reasoningEffort":
      return "思考强度";
    case "generalWorkbench.taskRail.importedRuntime.fact.action":
      return "动作";
    case "generalWorkbench.taskRail.importedRuntime.fact.paths":
      return "路径";
    case "generalWorkbench.taskRail.importedRuntime.fact.phase":
      return "阶段";
    case "generalWorkbench.taskRail.importedRuntime.fact.text":
      return "正文";
    case "generalWorkbench.taskRail.importedRuntime.fact.plan":
      return "步骤";
    case "generalWorkbench.taskRail.importedRuntime.fact.explanation":
      return "说明";
    case "generalWorkbench.taskRail.importedRuntime.payload.empty":
      return "空负载";
    case "generalWorkbench.taskRail.importedRuntime.payload.record":
      return `${options?.count ?? 0} 个字段`;
    case "generalWorkbench.taskRail.importedRuntime.payload.array":
      return `${options?.count ?? 0} 项`;
    case "generalWorkbench.taskRail.importedRuntime.payload.scalar":
      return `${options?.type ?? ""}`;
    case "generalWorkbench.taskRail.importedRuntime.payload.scalarLength":
      return `${options?.type ?? ""} · ${options?.count ?? 0} 字符`;
    case "generalWorkbench.taskRail.context.model":
      return "模型";
    case "generalWorkbench.taskRail.context.permission":
      return "权限";
    case "generalWorkbench.taskRail.context.reasoning":
      return "思考";
    case "generalWorkbench.taskRail.context.workspace":
      return "工作区";
    case "generalWorkbench.taskRail.context.objective":
      return "目标";
    case "generalWorkbench.taskRail.context.sources":
      return "来源";
    case "generalWorkbench.taskRail.context.sourcesValue":
      return `${options?.count ?? 0} 项`;
    case "generalWorkbench.taskRail.context.sourcesTitle":
      return `来源：${options?.sources ?? ""}`;
    case "generalWorkbench.taskRail.context.sourcesMoreTitle":
      return `来源：${options?.sources ?? ""}，另有 ${options?.count ?? 0} 项`;
    case "generalWorkbench.taskRail.context.sourcesOverflow":
      return `另有 ${options?.count ?? 0} 项`;
    case "generalWorkbench.taskRail.context.sourcesStatus.linked":
      return "已关联";
    case "generalWorkbench.taskRail.context.sourcesStatus.linkedTitle":
      return `已关联 ${options?.evidence ?? 0} 条证据`;
    case "generalWorkbench.taskRail.context.sourcesStatus.needsEvidence":
      return "待补证据";
    case "generalWorkbench.taskRail.context.sourcesStatus.needsEvidenceTitle":
      return `已有 ${options?.sources ?? 0} 个来源，缺少证据引用`;
    case "generalWorkbench.taskRail.context.sourcesStatus.missingSource":
      return "待补来源";
    case "generalWorkbench.taskRail.context.sourcesStatus.missingSourceTitle":
      return `缺少 ${options?.missing ?? 0} 项上下文来源`;
    case "generalWorkbench.taskRail.context.changes":
      return "变更";
    case "generalWorkbench.taskRail.context.changesValue":
      return `${options?.files ?? 0} 文件`;
    case "generalWorkbench.taskRail.context.changesTitle":
      return `变更 ${options?.files ?? 0} 文件，补丁 ${options?.patches ?? 0} 个`;
    case "generalWorkbench.taskRail.context.changesFailedTitle":
      return `变更 ${options?.files ?? 0} 文件，${options?.failed ?? 0} 个补丁失败`;
    case "generalWorkbench.taskRail.context.changesRunningTitle":
      return `变更 ${options?.files ?? 0} 文件，${options?.running ?? 0} 个补丁进行中`;
    case "generalWorkbench.taskRail.context.subtasks":
      return "子任务";
    case "generalWorkbench.taskRail.context.subtasksValue":
      return `${options?.completed ?? 0}/${options?.total ?? 0}`;
    case "generalWorkbench.taskRail.context.subtasksTitle":
      return `子任务 ${options?.completed ?? 0}/${options?.total ?? 0} 完成`;
    case "generalWorkbench.taskRail.context.subtasksActiveTitle":
      return `子任务 ${options?.active ?? 0} 个进行中，${options?.completed ?? 0}/${options?.total ?? 0} 完成`;
    case "generalWorkbench.taskRail.context.subtasksFailedTitle":
      return `子任务 ${options?.failed ?? 0} 个需处理，${options?.completed ?? 0}/${options?.total ?? 0} 完成`;
    case "generalWorkbench.taskRail.context.access.readOnly":
      return "只读";
    case "generalWorkbench.taskRail.context.access.current":
      return "按需确认";
    case "generalWorkbench.taskRail.context.access.fullAccess":
      return "完全访问";
    case "generalWorkbench.taskRail.context.reasoning.low":
      return "低";
    case "generalWorkbench.taskRail.context.reasoning.medium":
      return "中";
    case "generalWorkbench.taskRail.context.reasoning.high":
      return "高";
    case "generalWorkbench.taskRail.surface.environmentTitle":
      return "环境";
    case "generalWorkbench.taskRail.surface.runTitle":
      return "运行";
    case "generalWorkbench.taskRail.surface.planTitle":
      return "计划";
    case "generalWorkbench.taskRail.surface.goalTitle":
      return "目标";
    case "generalWorkbench.taskRail.surface.provenanceTitle":
      return "来源";
    case "generalWorkbench.taskRail.surface.participantsTitle":
      return "参与";
    case "generalWorkbench.taskRail.surface.outputsTitle":
      return "结果";
    case "generalWorkbench.taskRail.surface.mode":
      return "模式";
    case "generalWorkbench.taskRail.surface.branch":
      return "分支";
    case "generalWorkbench.taskRail.surface.gitStatus":
      return "Git";
    case "generalWorkbench.taskRail.surface.runStatus":
      return "状态";
    case "generalWorkbench.taskRail.surface.thread":
      return "线程";
    case "generalWorkbench.taskRail.surface.turn":
      return "轮次";
    case "generalWorkbench.taskRail.surface.activityFailed":
      return `${options?.failed ?? 0} 项需处理`;
    case "generalWorkbench.taskRail.surface.activityRunning":
      return `${options?.running ?? 0} 项进行中`;
    case "generalWorkbench.taskRail.surface.activityCount":
      return `${count ?? 0} 项`;
    case "generalWorkbench.taskRail.surface.approvalPending":
      return `${count ?? 0} 条待确认`;
    case "generalWorkbench.taskRail.surface.approvalCount":
      return `${count ?? 0} 条`;
    case "generalWorkbench.taskRail.surface.outputCount":
      return `${count ?? 0} 项`;
    case "generalWorkbench.taskRail.surface.splitLane":
      return "分屏";
    case "generalWorkbench.taskRail.surface.splitLane.open":
      return "已打开";
    case "generalWorkbench.taskRail.surface.splitLane.available":
      return "可打开";
    case "generalWorkbench.taskRail.surface.splitLane.unavailable":
      return "未启用";
    case "generalWorkbench.workflow.queue.item":
      return `步骤 ${options?.index ?? ""}`;
    case "generalWorkbench.workflow.current.completedTitle":
      return "已完成";
    case "generalWorkbench.workflow.current.emptyTitle":
      return "等待开始";
    case "generalWorkbench.workflow.current.remaining":
      return `剩余 ${count ?? 0} 项`;
    case "generalWorkbench.workflow.current.allCompleted":
      return "全部完成";
    case "generalWorkbench.workflow.queue.hiddenCount":
      return `显示 ${visible ?? 0} 项，另有 ${hidden ?? 0} 项`;
    case "generalWorkbench.workflow.queue.pendingCount":
      return `待处理 ${count ?? 0} 项`;
    case "generalWorkbench.workflow.completed.count":
      return `已完成 ${count ?? 0} 项`;
    case "generalWorkbench.workflow.completed.hint":
      return "继续处理剩余事项";
    default:
      return key;
  }
}

export function createFallbackWorkflowTranslate(): MinimalTranslate {
  return (key: string, options?: Record<string, unknown>) =>
    fallbackTranslate(key, options);
}

export function translateTaskRailText(
  t: MinimalTranslate,
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  return String(t(key, { defaultValue, ...options }));
}
