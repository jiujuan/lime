import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const STREAM_PROJECTION_FILES = [
  "src/components/agent/chat/components/messageListProjectionContentParts.ts",
  "src/components/agent/chat/components/messageListTimelineContentParts.ts",
  "src/components/agent/chat/components/streamingContentPartOrder.ts",
  "src/components/agent/chat/components/streamingContentPartSegments.ts",
  "src/components/agent/chat/hooks/agentStreamCompletionController.ts",
  "src/components/agent/chat/hooks/agentStreamProcessBoundaryCommit.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts",
  "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.ts",
  "src/components/agent/chat/utils/contentPartTimeline.ts",
];

const FORBIDDEN_DISPLAY_LITERALS = [
  "已完成思考",
  "网页搜索渲染结论",
  "今天的国际新闻",
  "Finding",
];

const FORBIDDEN_LEGACY_PROJECTION_HELPERS = [
  "restoreMissingLeadingTextFromDisplayContent",
  "normalizeDuplicatedLeadingTextBeforeProcess",
  "removeTextPartsCoveredByThinking",
  "normalizeDuplicateTextSignature",
  "findDuplicateTextSignatureRange",
  "normalizeFinalTextSignature",
  "normalizeSparseProcessText",
  "shouldRenderTimelineAgentMessageAsThinking",
];

describe("streaming projection guard", () => {
  it("核心投影文件不得用展示文案或内容正则识别生命周期", () => {
    for (const filePath of STREAM_PROJECTION_FILES) {
      const source = readFileSync(join(cwd(), filePath), "utf8");

      for (const literal of FORBIDDEN_DISPLAY_LITERALS) {
        expect(source, `${filePath} contains ${literal}`).not.toContain(
          literal,
        );
      }
      expect(source, `${filePath} uses dynamic regex`).not.toContain(
        "new RegExp",
      );
      expect(source, `${filePath} uses content match`).not.toContain(".match(");

      for (const helperName of FORBIDDEN_LEGACY_PROJECTION_HELPERS) {
        expect(source, `${filePath} contains ${helperName}`).not.toContain(
          helperName,
        );
      }
    }
  });
});
