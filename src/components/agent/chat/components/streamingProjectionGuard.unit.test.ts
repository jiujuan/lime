import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const STREAM_PROJECTION_FILES = [
  "packages/agent-runtime-projection/src/lifecycle.ts",
  "packages/agent-runtime-projection/src/runtimeStatus.ts",
  "packages/agent-runtime-projection/src/statusSurfaceMatrix.ts",
  "packages/agent-runtime-projection/src/threadStatusRuntimeUpdate.ts",
  "src/components/agent/chat/components/messageListProjectionContentParts.ts",
  "src/components/agent/chat/components/messageListTimelineContentParts.ts",
  "src/components/agent/chat/components/streamingContentPartOrder.ts",
  "src/components/agent/chat/components/streamingContentPartSegments.ts",
  "src/components/agent/chat/hooks/agentStreamCompletionController.ts",
  "src/components/agent/chat/hooks/agentStreamProcessBoundaryCommit.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeLifecycleEvents.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts",
  "src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts",
  "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.ts",
  "src/components/agent/chat/hooks/agentStreamTurnEventBinding.ts",
  "src/components/agent/chat/projection/agentUiEventProjection.ts",
  "src/components/agent/chat/projection/messageTimelineRenderProjection.ts",
  "src/components/agent/chat/projection/phaseProjection.ts",
  "src/components/agent/chat/projection/runtimeLifecycleProjection.ts",
  "src/components/agent/chat/projection/sessionExecutionRuntimeProjection.ts",
  "src/components/agent/chat/projection/threadItemProjection.ts",
  "src/components/agent/chat/projection/toolEventProjection.ts",
  "src/components/agent/chat/utils/contentPartTimeline.ts",
  "src/lib/api/agentProtocol.ts",
  "src/lib/api/agentProtocolContentParsers.ts",
  "src/lib/api/agentProtocolEventParser.ts",
  "src/lib/api/agentProtocolParserUtils.ts",
  "src/lib/api/agentProtocolRuntimeParsers.ts",
  "src/lib/api/agentProtocolToolParsers.ts",
  "src/lib/api/agentRuntime/appServerEventStreamProjection.ts",
  "src/lib/api/agentRuntime/appServerEventStream.ts",
  "src/lib/api/agentRuntime/appServerEventTimelineReaders.ts",
];

const PRODUCTION_SCAN_ROOTS = [
  "packages/agent-runtime-projection/src",
  "src/components/agent/chat/components",
  "src/components/agent/chat/hooks",
  "src/components/agent/chat/projection",
  "src/lib/api/agentRuntime",
];

const TEXT_DERIVED_STATUS_SOURCE_ALLOWLIST = new Map([
  [
    "packages/agent-runtime-projection/src/threadStatusRuntimeUpdate.ts",
    new Set(["dom_text", "text_regex", "message_text"]),
  ],
]);

const FORBIDDEN_DISPLAY_LITERALS = [
  "启动处理流程",
  "已接收请求",
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

function productionFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(join(cwd(), root), { withFileTypes: true })) {
    const relativePath = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...productionFiles(relativePath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    if (
      /\.d\.ts$|\.test\.|\.unit\.test\.|\.component\.test\./.test(entry.name)
    ) {
      continue;
    }
    result.push(relativePath);
  }
  return result;
}

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
      expect(source, `${filePath} uses content regex test`).not.toContain(
        ".test(",
      );

      for (const helperName of FORBIDDEN_LEGACY_PROJECTION_HELPERS) {
        expect(source, `${filePath} contains ${helperName}`).not.toContain(
          helperName,
        );
      }
    }
  });

  it("文本派生 lifecycle source 只能停留在负向检测 owner", () => {
    const sourcePattern =
      /source\s*(?:===|!==)\s*["'](dom_text|text_regex|message_text)["']/g;
    const productionFilePaths = PRODUCTION_SCAN_ROOTS.flatMap(productionFiles);

    for (const filePath of productionFilePaths) {
      const source = readFileSync(join(cwd(), filePath), "utf8");
      const allowlist = TEXT_DERIVED_STATUS_SOURCE_ALLOWLIST.get(filePath);
      for (const match of source.matchAll(sourcePattern)) {
        const marker = match[1];
        expect(
          allowlist?.has(marker),
          `${filePath} must not derive lifecycle/status from ${marker}`,
        ).toBe(true);
      }
    }
  });
});
