import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CONSUMER_PATHS = [
  "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
  "src/components/agent/chat/hooks/agentStreamInputRestoreTypes.ts",
  "src/components/agent/chat/hooks/agentQueuedTurnProjection.ts",
  "src/components/agent/chat/hooks/agentQueuedTurnProjection.unit.test.ts",
  "src/components/agent/chat/components/Inputbar/components/QueuedTurnsPanel.tsx",
  "src/components/agent/chat/components/Inputbar/components/InputbarCore.tsx",
  "src/components/agent/chat/hooks/agentStreamFlowControl.ts",
  "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
  "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx",
  "src/components/agent/chat/components/Inputbar/index.tsx",
  "src/components/agent/chat/hooks/agentSessionRefresh.ts",
  "src/components/agent/chat/hooks/agentStreamReadModelParsing.ts",
  "src/components/agent/chat/hooks/agentStreamPreparedSendEnv.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandlerTypes.ts",
  "src/components/agent/chat/workspace/workspaceConversationCodingViews.tsx",
  "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
  "src/components/agent/chat/hooks/agentStreamTurnEventBinding.ts",
  "src/components/agent/chat/hooks/useAgentStream.ts",
];

describe("queued turn current owner boundary", () => {
  it("declared consumers 只从 queuedTurn 读取队列快照类型", () => {
    for (const relativePath of CONSUMER_PATHS) {
      const source = readFileSync(join(cwd(), relativePath), "utf8");

      expect(source, relativePath).toContain('from "@/lib/api/queuedTurn"');
      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });
});
