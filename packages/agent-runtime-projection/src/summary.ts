import type {
  AgentUiEventClass,
  AgentUiProjectionEvent,
  AgentUiSurface,
} from "@limecloud/agent-ui-contracts";

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

export interface AgentUiTeamWorkbenchSurfaceLaneSummary
  extends AgentUiTeamWorkbenchSurfaceLaneDefinition {
  total: number;
  latestEvents: AgentUiProjectionEvent[];
}

export interface AgentUiTeamWorkbenchSurfaceDefinition {
  surface: AgentUiSurface;
  label: string;
  description: string;
}

export interface AgentUiTeamWorkbenchSurfaceSummary
  extends AgentUiTeamWorkbenchSurfaceDefinition {
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

export const AGENT_UI_TEAM_WORKBENCH_SURFACES = new Set<AgentUiSurface>([
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

function normalizeAgentUiLookupKey(value?: string | null): string | null {
  return value?.trim() || null;
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
  const normalizedArtifactId = normalizeAgentUiLookupKey(artifactId);
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
