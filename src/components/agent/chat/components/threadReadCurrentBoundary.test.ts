import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CONSUMER_PATHS = [
  "src/components/agent/chat/components/MessageTimelineSection.tsx",
  "src/components/agent/chat/components/useMessageListTelemetry.ts",
  "src/components/agent/chat/components/MessageListItem.tsx",
  "src/components/agent/chat/components/AgentThreadTimeline.tsx",
  "src/components/agent/chat/components/generalWorkbenchRunControlSurfaceViewModel.ts",
];

describe("thread read current owner boundary", () => {
  it("declared UI consumers 只从 sessionTypes 读取 thread read model", () => {
    for (const relativePath of CONSUMER_PATHS) {
      const source = readFileSync(join(cwd(), relativePath), "utf8");

      expect(source, relativePath).toContain(
        'from "@/lib/api/agentRuntime/sessionTypes"',
      );
      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });
});
