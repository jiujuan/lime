import type {
  AgentUiEventClass,
  AgentUiProjectionEvent,
  AgentUiSurface,
} from "./agentUiEventProjection";

export interface AgentUiProjectionSummary {
  total: number;
  actionCount: number;
  taskCount: number;
  artifactCount: number;
  evidenceCount: number;
  diagnosticsCount: number;
  latestEvent: AgentUiProjectionEvent | null;
  latestNotableEvents: AgentUiProjectionEvent[];
}

export interface AgentUiTeamWorkbenchProjectionSummary {
  total: number;
  rosterCount: number;
  workBoardCount: number;
  delegationCount: number;
  handoffCount: number;
  workerNotificationCount: number;
  reviewCount: number;
  transcriptCount: number;
  backgroundCount: number;
  remoteCount: number;
  policyCount: number;
  latestEvents: AgentUiProjectionEvent[];
}

export interface AgentUiTeamWorkbenchSurfaceLaneDefinition {
  id: string;
  label: string;
  description: string;
  surfaces: AgentUiSurface[];
}

export interface AgentUiTeamWorkbenchSurfaceLaneSummary extends AgentUiTeamWorkbenchSurfaceLaneDefinition {
  total: number;
  latestEvents: AgentUiProjectionEvent[];
}

export interface AgentUiTeamWorkbenchSurfaceDefinition {
  surface: AgentUiSurface;
  label: string;
  description: string;
}

export interface AgentUiTeamWorkbenchSurfaceSummary extends AgentUiTeamWorkbenchSurfaceDefinition {
  total: number;
  latestEvents: AgentUiProjectionEvent[];
}

export const EMPTY_AGENT_UI_PROJECTION_SUMMARY: AgentUiProjectionSummary = {
  total: 0,
  actionCount: 0,
  taskCount: 0,
  artifactCount: 0,
  evidenceCount: 0,
  diagnosticsCount: 0,
  latestEvent: null,
  latestNotableEvents: [],
};

export const EMPTY_AGENT_UI_TEAM_WORKBENCH_PROJECTION_SUMMARY: AgentUiTeamWorkbenchProjectionSummary =
  {
    total: 0,
    rosterCount: 0,
    workBoardCount: 0,
    delegationCount: 0,
    handoffCount: 0,
    workerNotificationCount: 0,
    reviewCount: 0,
    transcriptCount: 0,
    backgroundCount: 0,
    remoteCount: 0,
    policyCount: 0,
    latestEvents: [],
  };

export const AGENT_UI_EVENT_LABELS: Partial<Record<AgentUiEventClass, string>> =
  {
    "action.required": "Action 等待",
    "action.resolved": "Action 已处理",
    "agent.changed": "Agent 状态",
    "agent.completed": "Agent 完成",
    "agent.handoff": "Agent 交接",
    "agent.spawned": "Agent 已创建",
    "artifact.preview.ready": "Artifact 预览",
    "artifact.updated": "Artifact 更新",
    "context.changed": "Context 更新",
    "context.compaction.completed": "Context 压缩完成",
    "context.compaction.started": "Context 压缩开始",
    "diagnostic.changed": "Diagnostics",
    "evidence.changed": "Evidence",
    "metric.changed": "Metric",
    "permission.changed": "Permission",
    "queue.changed": "Queue",
    "run.failed": "Run 失败",
    "run.finished": "Run 完成",
    "run.started": "Run 开始",
    "run.status": "Run 状态",
    "task.changed": "Task",
    "team.changed": "Team 状态",
    "tool.failed": "Tool 失败",
    "tool.output.delta": "Tool 输出",
    "tool.progress": "Tool 进度",
    "tool.result": "Tool 结果",
    "tool.started": "Tool 开始",
    "worker.notification": "Worker 通知",
    "review.requested": "Review 请求",
    "review.completed": "Review 完成",
  };

export const AGENT_UI_ACTION_EVENT_TYPES = new Set<AgentUiEventClass>([
  "action.required",
  "action.resolved",
  "permission.changed",
]);

export const AGENT_UI_TASK_EVENT_TYPES = new Set<AgentUiEventClass>([
  "queue.changed",
  "task.changed",
  "agent.changed",
  "agent.spawned",
  "agent.completed",
  "agent.handoff",
  "team.changed",
  "worker.notification",
]);

export const AGENT_UI_ARTIFACT_EVENT_TYPES = new Set<AgentUiEventClass>([
  "artifact.created",
  "artifact.updated",
  "artifact.preview.ready",
  "artifact.version.created",
  "artifact.diff.ready",
  "artifact.export.started",
  "artifact.export.completed",
  "artifact.failed",
  "artifact.deleted",
  "artifact.changed",
]);

export const AGENT_UI_DIAGNOSTIC_EVENT_TYPES = new Set<AgentUiEventClass>([
  "context.changed",
  "context.compaction.started",
  "context.compaction.completed",
  "diagnostic.changed",
  "metric.changed",
  "permission.changed",
]);

export const AGENT_UI_EVIDENCE_EVENT_TYPES = new Set<AgentUiEventClass>([
  "evidence.changed",
  "review.requested",
  "review.completed",
]);

export const AGENT_UI_TEAM_WORKBENCH_SURFACES = new Set([
  "team_roster",
  "work_board",
  "delegation_graph",
  "handoff_lane",
  "worker_notifications",
  "review_lane",
  "teammate_transcript",
  "background_teammate",
  "remote_teammate",
  "team_policy",
]);

export const AGENT_UI_TEAM_WORKBENCH_SURFACE_DEFINITIONS: AgentUiTeamWorkbenchSurfaceDefinition[] =
  [
    {
      surface: "team_roster",
      label: "Roster",
      description: "成员、角色、来源与当前状态",
    },
    {
      surface: "delegation_graph",
      label: "Delegation",
      description: "分派关系、父子任务与委派来源",
    },
    {
      surface: "work_board",
      label: "Board",
      description: "任务项、assignment 与 work item",
    },
    {
      surface: "worker_notifications",
      label: "Worker",
      description: "worker 完成、失败、停止与归档通知",
    },
    {
      surface: "handoff_lane",
      label: "Handoff",
      description: "分析交接、上下文边界与恢复目标",
    },
    {
      surface: "review_lane",
      label: "Review",
      description: "审核请求、审核结论与后续处理",
    },
    {
      surface: "teammate_transcript",
      label: "Transcript",
      description: "队友 transcript ref 与局部会话线索",
    },
    {
      surface: "background_teammate",
      label: "Background",
      description: "后台 automation job 与持续刷新",
    },
    {
      surface: "remote_teammate",
      label: "Remote",
      description: "远端 teammate / external task 状态",
    },
    {
      surface: "team_policy",
      label: "Policy",
      description: "并行预算、队列、控制与策略事实",
    },
  ];

export const AGENT_UI_TEAM_WORKBENCH_SURFACE_LANES: AgentUiTeamWorkbenchSurfaceLaneDefinition[] =
  [
    {
      id: "team-topology",
      label: "Team 拓扑",
      description: "成员、分派、任务板与策略事实",
      surfaces: [
        "team_roster",
        "delegation_graph",
        "work_board",
        "team_policy",
      ],
    },
    {
      id: "worker-flow",
      label: "Worker 流",
      description: "执行通知、队友 transcript 与后台/远端伙伴",
      surfaces: [
        "worker_notifications",
        "teammate_transcript",
        "background_teammate",
        "remote_teammate",
      ],
    },
    {
      id: "review-handoff",
      label: "Review / Handoff",
      description: "交接、评审请求与评审完成",
      surfaces: ["handoff_lane", "review_lane"],
    },
  ];

export const AGENT_UI_TEAM_WORKBENCH_EVENT_TYPES = new Set<AgentUiEventClass>([
  "agent.changed",
  "agent.spawned",
  "agent.completed",
  "agent.handoff",
  "team.changed",
  "worker.notification",
  "review.requested",
  "review.completed",
]);

export const AGENT_UI_NOTABLE_EVENT_TYPES = new Set<AgentUiEventClass>([
  ...AGENT_UI_ACTION_EVENT_TYPES,
  ...AGENT_UI_TASK_EVENT_TYPES,
  ...AGENT_UI_ARTIFACT_EVENT_TYPES,
  ...AGENT_UI_DIAGNOSTIC_EVENT_TYPES,
  ...AGENT_UI_EVIDENCE_EVENT_TYPES,
  "run.failed",
  "run.finished",
  "run.started",
  "run.status",
  "tool.failed",
  "tool.output.delta",
  "tool.progress",
  "tool.result",
  "tool.started",
]);

function normalizeLookupKey(value?: string | null): string | null {
  return value?.trim() || null;
}

export function formatAgentUiProjectionEventType(
  type: AgentUiEventClass,
): string {
  return AGENT_UI_EVENT_LABELS[type] || type;
}

export function formatAgentUiProjectionPhase(phase: string): string {
  switch (phase) {
    case "accepted":
      return "已接受";
    case "acting":
      return "执行中";
    case "archived":
      return "已归档";
    case "cancelled":
      return "已取消";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "hydrating":
      return "恢复中";
    case "interrupted":
      return "已中断";
    case "planning":
      return "规划中";
    case "preparing":
      return "准备中";
    case "producing":
      return "生成中";
    case "reasoning":
      return "思考中";
    case "reconciling":
      return "对齐中";
    case "reviewing":
      return "评审中";
    case "routing":
      return "路由中";
    case "submitted":
      return "已提交";
    case "unknown":
      return "未知";
    case "waiting":
      return "等待中";
    default:
      return phase;
  }
}

function isTeamReassignmentEvent(event: AgentUiProjectionEvent): boolean {
  return (
    event.surface === "work_board" &&
    readAgentUiProjectionPayloadValue(event, "taskEvent") ===
      "team_reassignment"
  );
}

function formatTeamReassignmentPrimaryDetail(
  event: AgentUiProjectionEvent,
): string {
  const target = event.workItemId ?? event.taskId ?? event.agentId;
  return target ? `重新指派：${target}` : "重新指派";
}

function formatTeamReassignmentAuxiliaryDetail(
  event: AgentUiProjectionEvent,
): string | null {
  const previousAssigneeId = readAgentUiProjectionPayloadValue(
    event,
    "previousAssigneeId",
  );
  const nextAssigneeId = readAgentUiProjectionPayloadValue(
    event,
    "nextAssigneeId",
  );
  const reassignmentReason = readAgentUiProjectionPayloadValue(
    event,
    "reassignmentReason",
  );
  const route =
    previousAssigneeId && nextAssigneeId
      ? `${previousAssigneeId} → ${nextAssigneeId}`
      : (nextAssigneeId ?? previousAssigneeId);
  const detailParts = [
    route ? `负责人：${route}` : null,
    reassignmentReason ? `原因：${reassignmentReason}` : null,
  ].filter(Boolean);

  return detailParts.length > 0 ? detailParts.join(" / ") : null;
}

function formatHandoffLaneAuxiliaryDetail(
  event: AgentUiProjectionEvent,
): string | null {
  const status = readAgentUiProjectionPayloadValue(event, "status");
  const from = readAgentUiProjectionPayloadValue(event, "from");
  const to = readAgentUiProjectionPayloadValue(event, "to");
  const resumeTarget = readAgentUiProjectionPayloadValue(event, "resumeTarget");
  const contextBoundary = readAgentUiProjectionPayloadValue(
    event,
    "contextBoundary",
  );
  const route = from && to ? `${from} → ${to}` : (to ?? from);
  const detailParts = [
    status ? `状态：${status}` : null,
    route ? `交接：${route}` : null,
    resumeTarget ? `恢复：${resumeTarget}` : null,
    contextBoundary ? `边界：${contextBoundary}` : null,
  ].filter(Boolean);

  return detailParts.length > 0 ? detailParts.join(" / ") : null;
}

function formatPlanApprovalAuxiliaryDetail(
  event: AgentUiProjectionEvent,
): string | null {
  if (
    readAgentUiProjectionPayloadValue(event, "actionType") !== "plan_approval"
  ) {
    return null;
  }

  const decisionKind = readAgentUiProjectionPayloadValue(event, "decisionKind");
  const from = readAgentUiProjectionPayloadValue(event, "from");
  const targetSessionId = readAgentUiProjectionPayloadValue(
    event,
    "targetSessionId",
  );
  const deliveryTarget = readAgentUiProjectionPayloadValue(
    event,
    "deliveryTarget",
  );
  const permissionMode = readAgentUiProjectionPayloadValue(
    event,
    "permissionMode",
  );
  const approved = readAgentUiProjectionPayloadValue(event, "approved");
  const awaitingLeaderApproval = readAgentUiProjectionPayloadValue(
    event,
    "awaitingLeaderApproval",
  );
  const planFilePath = readAgentUiProjectionPayloadValue(event, "planFilePath");
  const planFile = readAgentUiProjectionPayloadValue(event, "planFile");
  const planId = readAgentUiProjectionPayloadValue(event, "planId");
  const detailParts = [
    decisionKind ? `决策：${decisionKind}` : null,
    from ? `请求方：${from}` : null,
    targetSessionId ? `目标：${targetSessionId}` : null,
    deliveryTarget ? `投递：${deliveryTarget}` : null,
    permissionMode ? `权限：${permissionMode}` : null,
    approved ? `结果：${approved === "true" ? "已批准" : "已拒绝"}` : null,
    awaitingLeaderApproval === "true" ? "等待 leader 审批" : null,
    planFilePath ? `计划：${planFilePath}` : null,
    planFile ? `计划：${planFile}` : null,
    planId ? `Plan：${planId}` : null,
  ].filter(Boolean);

  return detailParts.length > 0 ? detailParts.join(" / ") : null;
}

export function readAgentUiProjectionPayloadText(
  event: AgentUiProjectionEvent,
): string | null {
  const payload = event.payload;
  if (!payload) {
    return null;
  }

  const candidates = [
    "summaryPreview",
    "status",
    "verdict",
    "taskEvent",
    "decisionKind",
    "actionType",
    "toolName",
    "kind",
    "reason",
    "phase",
  ];

  for (const key of candidates) {
    const value = payload[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return `${value}`;
    }
  }

  return null;
}

export function formatAgentUiProjectionEventDetail(
  event: AgentUiProjectionEvent,
): string {
  if (isTeamReassignmentEvent(event)) {
    return formatTeamReassignmentPrimaryDetail(event);
  }

  return (
    readAgentUiProjectionPayloadText(event) ||
    event.actionId ||
    event.taskId ||
    event.artifactId ||
    event.evidenceId ||
    event.toolCallId ||
    event.sourceType
  );
}

function readAgentUiProjectionPayloadValue(
  event: AgentUiProjectionEvent,
  key: string,
): string | null {
  const value = event.payload?.[key];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const normalized = `${value}`.trim();
    return normalized || null;
  }

  return null;
}

function readAgentUiProjectionPayloadStringList(
  event: AgentUiProjectionEvent,
  key: string,
): string[] {
  const value = event.payload?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function formatPreviewListItem(label: string, values: string[]): string | null {
  const firstValue = values[0];
  if (!firstValue) {
    return null;
  }
  const suffix = values.length > 1 ? ` +${values.length - 1}` : "";
  return `${label}：${firstValue}${suffix}`;
}

export function formatAgentUiProjectionEventAuxiliaryDetail(
  event: AgentUiProjectionEvent,
): string | null {
  if (isTeamReassignmentEvent(event)) {
    return formatTeamReassignmentAuxiliaryDetail(event);
  }

  if (event.surface === "handoff_lane" || event.type === "agent.handoff") {
    return formatHandoffLaneAuxiliaryDetail(event);
  }

  if (event.type === "action.required" || event.type === "action.resolved") {
    return formatPlanApprovalAuxiliaryDetail(event);
  }

  if (
    event.surface !== "review_lane" &&
    event.type !== "review.requested" &&
    event.type !== "review.completed"
  ) {
    return null;
  }

  const decisionStatus = readAgentUiProjectionPayloadValue(
    event,
    "decisionStatus",
  );
  const reviewer = readAgentUiProjectionPayloadValue(event, "reviewer");
  const riskLevel = readAgentUiProjectionPayloadValue(event, "riskLevel");
  const checklistCount = readAgentUiProjectionPayloadValue(
    event,
    "checklistCount",
  );
  const followupActionCount = readAgentUiProjectionPayloadValue(
    event,
    "followupActionCount",
  );
  const regressionRequirementCount = readAgentUiProjectionPayloadValue(
    event,
    "regressionRequirementCount",
  );
  const requestedFixes = readAgentUiProjectionPayloadStringList(
    event,
    "requestedFixes",
  );
  const regressionRequirements = readAgentUiProjectionPayloadStringList(
    event,
    "regressionRequirements",
  );
  const detailParts = [
    decisionStatus ? `决策：${decisionStatus}` : null,
    reviewer ? `审核人：${reviewer}` : null,
    riskLevel ? `风险：${riskLevel}` : null,
    checklistCount ? `清单 ${checklistCount}` : null,
    followupActionCount ? `后续 ${followupActionCount}` : null,
    regressionRequirementCount ? `回归 ${regressionRequirementCount}` : null,
    formatPreviewListItem("修复", requestedFixes),
    formatPreviewListItem("回归项", regressionRequirements),
  ].filter(Boolean);

  return detailParts.length > 0 ? detailParts.join(" / ") : null;
}

export function summarizeAgentUiProjectionEvents(
  events: AgentUiProjectionEvent[],
): AgentUiProjectionSummary {
  if (events.length === 0) {
    return EMPTY_AGENT_UI_PROJECTION_SUMMARY;
  }

  const latestNotableEvents = events
    .slice()
    .reverse()
    .filter((event) => AGENT_UI_NOTABLE_EVENT_TYPES.has(event.type))
    .slice(0, 8);

  return {
    total: events.length,
    actionCount: events.filter((event) =>
      AGENT_UI_ACTION_EVENT_TYPES.has(event.type),
    ).length,
    taskCount: events.filter((event) =>
      AGENT_UI_TASK_EVENT_TYPES.has(event.type),
    ).length,
    artifactCount: events.filter((event) =>
      AGENT_UI_ARTIFACT_EVENT_TYPES.has(event.type),
    ).length,
    evidenceCount: events.filter((event) =>
      AGENT_UI_EVIDENCE_EVENT_TYPES.has(event.type),
    ).length,
    diagnosticsCount: events.filter((event) =>
      AGENT_UI_DIAGNOSTIC_EVENT_TYPES.has(event.type),
    ).length,
    latestEvent: events[events.length - 1] ?? null,
    latestNotableEvents,
  };
}

export function summarizeAgentUiTeamWorkbenchProjectionEvents(
  events: AgentUiProjectionEvent[],
): AgentUiTeamWorkbenchProjectionSummary {
  const teamEvents = events.filter(
    (event) =>
      AGENT_UI_TEAM_WORKBENCH_EVENT_TYPES.has(event.type) ||
      Boolean(
        event.surface && AGENT_UI_TEAM_WORKBENCH_SURFACES.has(event.surface),
      ),
  );

  if (teamEvents.length === 0) {
    return EMPTY_AGENT_UI_TEAM_WORKBENCH_PROJECTION_SUMMARY;
  }

  return {
    total: teamEvents.length,
    rosterCount: teamEvents.filter((event) => event.surface === "team_roster")
      .length,
    workBoardCount: teamEvents.filter((event) => event.surface === "work_board")
      .length,
    delegationCount: teamEvents.filter(
      (event) => event.surface === "delegation_graph",
    ).length,
    handoffCount: teamEvents.filter((event) => event.surface === "handoff_lane")
      .length,
    workerNotificationCount: teamEvents.filter(
      (event) => event.surface === "worker_notifications",
    ).length,
    reviewCount: teamEvents.filter((event) => event.surface === "review_lane")
      .length,
    transcriptCount: teamEvents.filter(
      (event) => event.surface === "teammate_transcript",
    ).length,
    backgroundCount: teamEvents.filter(
      (event) => event.surface === "background_teammate",
    ).length,
    remoteCount: teamEvents.filter(
      (event) => event.surface === "remote_teammate",
    ).length,
    policyCount: teamEvents.filter((event) => event.surface === "team_policy")
      .length,
    latestEvents: teamEvents.slice().reverse().slice(0, 5),
  };
}

export function summarizeAgentUiTeamWorkbenchSurfaceLanes(
  events: AgentUiProjectionEvent[],
): AgentUiTeamWorkbenchSurfaceLaneSummary[] {
  return AGENT_UI_TEAM_WORKBENCH_SURFACE_LANES.map((lane) => {
    const surfaceSet = new Set(lane.surfaces);
    const laneEvents = events.filter(
      (event) => event.surface && surfaceSet.has(event.surface),
    );

    return {
      ...lane,
      total: laneEvents.length,
      latestEvents: laneEvents.slice().reverse().slice(0, 2),
    };
  }).filter((lane) => lane.total > 0);
}

export function summarizeAgentUiTeamWorkbenchSurfaces(
  events: AgentUiProjectionEvent[],
  options: { latestLimit?: number } = {},
): AgentUiTeamWorkbenchSurfaceSummary[] {
  const latestLimit = Math.max(1, options.latestLimit ?? 3);
  return AGENT_UI_TEAM_WORKBENCH_SURFACE_DEFINITIONS.map((definition) => {
    const surfaceEvents = events.filter(
      (event) => event.surface === definition.surface,
    );

    return {
      ...definition,
      total: surfaceEvents.length,
      latestEvents: surfaceEvents.slice().reverse().slice(0, latestLimit),
    };
  }).filter((surface) => surface.total > 0);
}

export function findLatestAgentUiProjectionEventForArtifact(
  events: AgentUiProjectionEvent[],
  artifactId?: string | null,
): AgentUiProjectionEvent | null {
  const normalizedArtifactId = normalizeLookupKey(artifactId);
  if (!normalizedArtifactId) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.artifactId === normalizedArtifactId ||
      event.refs?.artifactIds?.includes(normalizedArtifactId)
    ) {
      return event;
    }
  }

  return null;
}
