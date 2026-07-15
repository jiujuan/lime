import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = cwd();

const RETIRED_SUBAGENT_CHANNEL_FILES = [
  "src/lib/api/agentRuntimeEvents.ts",
  "src/components/agent/chat/hooks/agentRuntimeAdapter.ts",
  "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts",
  "src/components/agent/chat/hooks/useAgentChat.ts",
  "src/components/agent/chat/components/ChatModelSelector.integration.test.tsx",
  "src/lib/dev-bridge/commandPolicy.ts",
] as const;

const RETIRED_SUBAGENT_CHANNEL_PATTERNS = [
  "agent_subagent_status:",
  "agent_subagent_stream:",
  "getAgentSubagentStatusEventName",
  "getAgentSubagentStreamEventName",
  "listenAgentSubagentStatus",
  "listenAgentSubagentStream",
  "listenSubagentStatus(",
  "listenSubagentStream(",
  "listenToTeamEvents",
] as const;

const RETIRED_RAW_STATUS_FILES = [
  "src/components/agent/chat/projection/subagentStatusProjection.ts",
  "src/components/agent/chat/projection/subagentStatusProjection.test.ts",
  "packages/agent-runtime-projection/src/subagentStatusEvents.ts",
  "packages/agent-runtime-projection/tests/subagentStatusEvents.test.mjs",
] as const;

const RAW_STATUS_PRODUCTION_FILES = [
  "src/lib/api/agentProtocolEventTypes.ts",
  "src/lib/api/agentProtocol.d.ts",
  "src/components/agent/chat/projection/runtimeLifecycleProjection.ts",
  "src/components/agent/chat/projection/agentUiProjectionSummary.ts",
  "packages/agent-runtime-projection/src/index.ts",
  "packages/agent-runtime-projection/src/index.js",
  "packages/agent-runtime-projection/src/index.d.ts",
  "packages/agent-runtime-projection/src/runtimeFacts.ts",
] as const;

const RETIRED_RAW_STATUS_PATTERNS = [
  "subagent_status_changed",
  "AgentEventSubagentStatusChanged",
  "AgentSubagentRuntimeStatus",
  "buildAgentUiSubagentStatusChangedEvents",
  "buildSubagentRuntimeFacts",
  "buildSubagentProjectionPayload",
  "buildWorkerUsageProjection",
  "subagentStatusEvents",
  "subagentStatusProjection",
] as const;

describe("Agent subagent channel boundary", () => {
  it("应阻止已删除的专用 status/stream channel 和包装层回流", () => {
    for (const relativePath of RETIRED_SUBAGENT_CHANNEL_FILES) {
      const content = readFileSync(join(REPO_ROOT, relativePath), "utf8");
      for (const pattern of RETIRED_SUBAGENT_CHANNEL_PATTERNS) {
        expect(content, `${relativePath} contains ${pattern}`).not.toContain(
          pattern,
        );
      }
    }
  });

  it("应保持旧 team subscription 正向测试为已删除", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "src/components/agent/chat/hooks/useAgentChat.test/teamSubscriptions.case.tsx",
        ),
      ),
    ).toBe(false);
  });

  it("应保持 raw status projector 和 package helper 为已删除", () => {
    for (const relativePath of RETIRED_RAW_STATUS_FILES) {
      expect(existsSync(join(REPO_ROOT, relativePath)), relativePath).toBe(
        false,
      );
    }
  });

  it("应阻止 raw status 类型、helper 和 fixture producer 回流", () => {
    for (const relativePath of RAW_STATUS_PRODUCTION_FILES) {
      const content = readFileSync(join(REPO_ROOT, relativePath), "utf8");
      for (const pattern of RETIRED_RAW_STATUS_PATTERNS) {
        expect(content, `${relativePath} contains ${pattern}`).not.toContain(
          pattern,
        );
      }
    }
  });
});
