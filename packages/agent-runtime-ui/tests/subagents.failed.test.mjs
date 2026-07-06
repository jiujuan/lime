import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";

import { projectAgentUiState } from "@limecloud/agent-runtime-projection";
import { SubagentsView } from "../dist/index.js";

test("SubagentsView renders failed subagent threads from projection state", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-subagent-started",
        kind: "handoff",
        status: "running",
        eventClass: "agent.spawned",
        title: "Research subagent started",
        threadId: "thread-parent",
        subagentId: "subagent-failed",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
      {
        id: "evt-subagent-failed",
        kind: "handoff",
        status: "failed",
        eventClass: "subagent.failed",
        title: "Research subagent failed",
        threadId: "thread-parent",
        subagentId: "subagent-failed",
        sequence: 2,
        createdAt: "2026-06-12T00:00:01.000Z",
        completedAt: "2026-06-12T00:00:01.000Z",
        payload: {
          summary: "检索工具失败",
        },
      },
    ],
  });

  const markup = renderToStaticMarkup(
    React.createElement(SubagentsView, {
      state,
      labels: {
        subagentsAriaLabel: "子代理",
      },
    }),
  );

  assert.deepEqual(state.subagents.activeThreadIds, []);
  assert.deepEqual(state.subagents.failedThreadIds, ["subagent-failed"]);
  assert.match(markup, /agent-subagents/);
  assert.match(markup, /data-subagent-id="subagent-failed"/);
  assert.match(markup, /Research subagent started/);
  assert.match(markup, /Research subagent failed/);
  assert.match(markup, /检索工具失败/);
});

test("SubagentsView exposes collaboration facts on threads, delegations, and activities", () => {
  const state = projectAgentUiState({
    executionEvents: [
      {
        id: "evt-subagent-running",
        kind: "handoff",
        status: "running",
        eventClass: "subagent.status",
        title: "Research subagent running",
        threadId: "thread-parent",
        subagentId: "subagent-facts",
        sequence: 1,
        createdAt: "2026-06-12T00:00:00.000Z",
        payload: {
          collaborationFacts: {
            source: "projection_facts",
            surface: "collaboration",
            collaborationSurface: "team_roster",
            collaborationPhase: "acting",
            collaborationKind: "subagent_status",
            profileId: "cool_confident_operator",
            packId: "stylepack.cool_confident_operator.v1",
            toneVariant: "cool_confident",
          },
          collaborationSurface: "team_roster",
          collaborationPhase: "acting",
          styleLevel: "L1",
          riskLevel: "normal",
          profileId: "cool_confident_operator",
          packId: "stylepack.cool_confident_operator.v1",
          toneVariant: "cool_confident",
        },
      },
    ],
  });

  const markup = renderToStaticMarkup(
    React.createElement(SubagentsView, {
      state,
    }),
  );

  assert.match(markup, /data-collaboration-facts="yes"/);
  assert.match(markup, /data-collaboration-surface="team_roster"/);
  assert.match(markup, /data-collaboration-phase="acting"/);
  assert.match(markup, /data-collaboration-kind="subagent_status"/);
  assert.match(markup, /data-soul-profile-id="cool_confident_operator"/);
  assert.match(markup, /data-soul-pack-id="stylepack.cool_confident_operator.v1"/);
  assert.match(markup, /data-soul-tone-variant="cool_confident"/);
  assert.equal(
    (markup.match(/data-collaboration-facts="yes"/g) ?? []).length,
    3,
  );
});
