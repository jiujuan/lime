import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CONSUMER_PATHS = [
  "src/components/agent/chat/hooks/handleSendTypes.ts",
  "src/components/agent/chat/hooks/agentChatShared.ts",
] as const;

describe("runtime search mode current owner boundary", () => {
  it("declared consumers 只从 app-server-client 读取 RuntimeSearchMode", () => {
    for (const relativePath of CONSUMER_PATHS) {
      const source = readFileSync(join(cwd(), relativePath), "utf8");

      expect(source, relativePath).toContain(
        'from "@limecloud/app-server-client"',
      );
      expect(source, relativePath).not.toContain(
        'from "@/lib/api/agentRuntime"',
      );
    }
  });
});
