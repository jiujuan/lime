import { afterEach, describe, expect, it } from "vitest";

import type { TeamWorkspaceRuntimeFormationState } from "../teamWorkspaceRuntime";
import {
  clearAgentUiProjectionEvents,
  conversationProjectionStore,
  selectAgentUiProjectionEvents,
  selectAgentUiProjectionEventsBySurface,
} from "./conversationProjectionStore";
import {
  buildAgentUiTeamFormationProjectionEvents,
  recordTeamFormationAgentUiProjection,
} from "./teamFormationAgentUiProjection";

function createFormationState(): TeamWorkspaceRuntimeFormationState {
  return {
    requestId: "team-request-1",
    status: "formed",
    label: "研究协作组",
    summary: "按检索、整理两段推进",
    members: [
      {
        id: "researcher",
        label: "研究员",
        summary: "负责收集资料",
        profileId: "profile-researcher",
        roleKey: "research",
        skillIds: ["web-search"],
        status: "running",
        sessionId: "session-worker-1",
        latestSnippet: "正在检索资料",
      },
      {
        id: "writer",
        label: "撰稿员",
        summary: "负责整理输出",
        roleKey: "writer",
        skillIds: ["draft"],
        status: "planned",
        latestSnippet: null,
      },
    ],
    blueprint: {
      label: "研究协作组",
      summary: "按检索、整理两段推进",
      roles: [
        {
          id: "researcher",
          label: "研究员",
          summary: "负责收集资料",
          skillIds: ["web-search"],
        },
        {
          id: "writer",
          label: "撰稿员",
          summary: "负责整理输出",
          skillIds: ["draft"],
        },
      ],
    },
    errorMessage: null,
    updatedAt: 1_710_000_000_000,
  };
}

describe("teamFormationAgentUiProjection", () => {
  afterEach(() => {
    clearAgentUiProjectionEvents();
  });

  it("应把 team formation 映射为 roster 与 work board projection", () => {
    const events = buildAgentUiTeamFormationProjectionEvents(
      createFormationState(),
      {
        sessionId: "session-main",
        sequence: 7,
      },
    );

    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({
      type: "team.changed",
      sourceType: "team_formation_projection",
      sequence: 7,
      timestamp: "2024-03-09T16:00:00.000Z",
      sessionId: "session-main",
      teamId: "team-request-1",
      teamName: "研究协作组",
      surface: "team_roster",
      persistence: "snapshot",
      topology: "coordinator_team",
      payload: expect.objectContaining({
        teamEvent: "team_formation_changed",
        memberCount: 2,
        blueprintRoleCount: 2,
      }),
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.changed",
        sequence: 8,
        taskId: "session-worker-1",
        agentId: "session-worker-1",
        agentName: "研究员",
        surface: "team_roster",
        control: "assign",
        runtimeEntity: "subagent_turn",
        runtimeStatus: "running",
        transcriptRef: "session-worker-1",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "task.changed",
        sequence: 9,
        taskId: "session-worker-1",
        agentId: "session-worker-1",
        surface: "work_board",
        control: "assign",
        runtimeEntity: "subagent_turn",
        runtimeStatus: "running",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.changed",
        sequence: 10,
        taskId: "team-request-1:writer",
        agentId: "writer",
        workItemId: "team-request-1:writer",
        agentName: "撰稿员",
        surface: "team_roster",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "queued",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "task.changed",
        sequence: 11,
        taskId: "team-request-1:writer",
        agentId: "writer",
        workItemId: "team-request-1:writer",
        surface: "work_board",
        control: "assign",
        runtimeEntity: "work_item",
        runtimeStatus: "queued",
      }),
    );
  });

  it("应把记录结果写入 conversationProjectionStore.agentUi", () => {
    const recorded = recordTeamFormationAgentUiProjection(
      createFormationState(),
      { sessionId: "session-main" },
    );

    expect(recorded).toHaveLength(5);
    const snapshot = conversationProjectionStore.getSnapshot();
    expect(selectAgentUiProjectionEvents(snapshot)).toHaveLength(5);
    expect(
      selectAgentUiProjectionEventsBySurface(snapshot, "team_roster"),
    ).toHaveLength(3);
    expect(
      selectAgentUiProjectionEventsBySurface(snapshot, "work_board"),
    ).toEqual([
      expect.objectContaining({
        sourceType: "team_formation_projection",
        taskId: "session-worker-1",
        runtimeEntity: "subagent_turn",
      }),
      expect.objectContaining({
        sourceType: "team_formation_projection",
        taskId: "team-request-1:writer",
        workItemId: "team-request-1:writer",
        runtimeEntity: "work_item",
      }),
    ]);
  });
});
