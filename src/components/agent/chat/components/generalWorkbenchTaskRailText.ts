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
    case "generalWorkbench.taskRail.approval.status.approved":
      return "已允许";
    case "generalWorkbench.taskRail.approval.status.rejected":
      return "已拒绝";
    case "generalWorkbench.taskRail.approval.status.answered":
      return "已回答";
    case "generalWorkbench.taskRail.approval.status.resolved":
      return "已处理";
    case "generalWorkbench.taskRail.context.model":
      return "模型";
    case "generalWorkbench.taskRail.context.permission":
      return "权限";
    case "generalWorkbench.taskRail.context.reasoning":
      return "思考";
    case "generalWorkbench.taskRail.context.workspace":
      return "工作区";
    case "generalWorkbench.taskRail.context.imported":
      return "导入";
    case "generalWorkbench.taskRail.context.importedValue":
      return `${options?.source ?? ""} 导入`;
    case "generalWorkbench.taskRail.context.importedValueFallback":
      return "已导入";
    case "generalWorkbench.taskRail.context.importedTitle":
      return `来自 ${options?.source ?? ""}`;
    case "generalWorkbench.taskRail.context.importedThreadTitle":
      return `源线程 ${options?.thread ?? ""}`;
    case "generalWorkbench.taskRail.context.importedDetail.messages":
      return `消息 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.reasoning":
      return `思考 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.commands":
      return `命令 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.tools":
      return `工具 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.patches":
      return `补丁 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.approvals":
      return `确认 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedDetail.webSearch":
      return `搜索 ${options?.count ?? 0}`;
    case "generalWorkbench.taskRail.context.importedStatus.restored":
      return "已还原";
    case "generalWorkbench.taskRail.context.importedStatus.restoredTitle":
      return "导入细节已进入当前会话轨迹";
    case "generalWorkbench.taskRail.context.importedStatus.partial":
      return "部分保留";
    case "generalWorkbench.taskRail.context.importedStatus.partialTitle":
      return `有 ${options?.unsupported ?? 0} 项未完整映射，${options?.budgetDropped ?? 0} 项因预算裁剪`;
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
