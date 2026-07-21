import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const RETIRED_SNAPSHOT_CONSUMER_PATHS = [
  "src/components/agent/chat/components/MessageList.types.ts",
  "src/components/agent/chat/components/useMessageListTimelineState.ts",
  "src/components/agent/chat/utils/agentTaskRuntime.ts",
  "src/components/agent/chat/utils/inputbarRuntimeStatusLine.ts",
  "src/components/agent/chat/workspace/useSessionRuntimeProjectionDeferral.ts",
  "src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts",
  "src/components/agent/chat/hooks/agentStreamInputRestoreTypes.ts",
  "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts",
  "src/components/agent/chat/hooks/agentStreamPreparedSendEnv.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandlerTypes.ts",
  "src/components/agent/chat/workspace/workspaceConversationCodingViews.tsx",
  "src/components/agent/chat/hooks/agentStreamResumeBinding.ts",
  "src/components/agent/chat/hooks/agentStreamTurnEventBinding.ts",
  "src/components/agent/chat/hooks/useAgentStream.ts",
];
const RETIRED_INPUTBAR_QUEUE_PATHS = [
  "src/components/agent/chat/components/Inputbar/components/QueuedTurnsPanel.tsx",
  "src/components/agent/chat/components/Inputbar/components/QueuedTurnsPanel.test.tsx",
  "src/components/agent/chat/components/Inputbar/components/inputbarQueuedTurnsCopy.ts",
];

describe("queued turn current owner boundary", () => {
  it("已迁出的 Renderer/UI/send surface 不得重新读取 queued snapshot", () => {
    for (const relativePath of RETIRED_SNAPSHOT_CONSUMER_PATHS) {
      const source = readFileSync(join(cwd(), relativePath), "utf8");

      expect(source, relativePath).not.toContain('from "@/lib/api/queuedTurn"');
      expect(source, relativePath).not.toContain("QueuedTurnSnapshot");
      expect(source, relativePath).not.toContain("setQueuedTurns");
    }
  });

  it("Inputbar queued-turn 控制保持删除且 composer 不再读取 queuedTurns", () => {
    for (const relativePath of RETIRED_INPUTBAR_QUEUE_PATHS) {
      expect(existsSync(join(cwd(), relativePath)), relativePath).toBe(false);
    }

    const inputbarCore = readFileSync(
      join(
        cwd(),
        "src/components/agent/chat/components/Inputbar/components/InputbarCore.tsx",
      ),
      "utf8",
    );
    expect(inputbarCore).not.toContain("queuedTurns");
  });
});
