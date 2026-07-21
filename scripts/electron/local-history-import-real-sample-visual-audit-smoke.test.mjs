import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { renderExpectedVisibleExcerptHtml } from "./lib/local-history-import-smoke-utils.mjs";
import {
  selectCompactExpectedMessages,
  selectCompactExpectedMessageTexts,
} from "./lib/local-history-import-read-model-expectations.mjs";
import { assessExpectedMessageVisibility } from "./lib/local-history-import-visual-expectations.mjs";
import {
  DEFAULT_REAL_SAMPLE_STABILITY_MS,
  importSourceAgeMs,
  selectStableImportSourceThreads,
} from "./lib/local-history-import-source-selection.mjs";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/electron/local-history-import-real-sample-visual-audit-smoke.mjs",
    "utf8",
  );
}

function readSharedHelper() {
  return fs.readFileSync(
    "scripts/electron/lib/local-history-import-smoke-utils.mjs",
    "utf8",
  );
}

function readSessionOpenHelper() {
  return fs.readFileSync(
    "scripts/electron/lib/local-history-import-session-open.mjs",
    "utf8",
  );
}

describe("local history import real sample visual audit smoke guard", () => {
  it("only selects real source threads that have stopped changing", () => {
    const indexedAt = "2026-07-16T18:30:00.000Z";
    const stable = {
      sourceThreadId: "stable",
      updatedAt: "2026-07-16T18:00:00.000Z",
    };
    const active = {
      sourceThreadId: "active",
      updatedAt: "2026-07-16T18:29:59.000Z",
    };

    expect(
      selectStableImportSourceThreads([active, stable], indexedAt),
    ).toEqual([stable]);
    expect(importSourceAgeMs(stable, indexedAt)).toBe(30 * 60 * 1_000);
    expect(DEFAULT_REAL_SAMPLE_STABILITY_MS).toBe(10 * 60 * 1_000);
  });

  it("derives final-only historical text expectations from canonical item phases", () => {
    const readResult = {
      detail: {
        items: [
          {
            id: "user-1",
            type: "user_message",
            turn_id: "turn-1",
            sequence: 1,
            text: "请核对完整的 canonical timeline。",
          },
          {
            id: "commentary-1",
            type: "agent_message",
            turn_id: "turn-1",
            sequence: 2,
            phase: "commentary",
            text: "先读取所有 canonical item。",
          },
          {
            id: "final-1",
            type: "agent_message",
            turn_id: "turn-1",
            sequence: 3,
            phase: "final_answer",
            text: "canonical timeline 已核对完成。",
          },
          {
            id: "legacy-progress",
            type: "agent_message",
            turn_id: "turn-2",
            sequence: 4,
            text: "继续检查旧的无 phase 消息。",
          },
          {
            id: "legacy-final",
            type: "agent_message",
            turn_id: "turn-2",
            sequence: 5,
            text: "旧消息最终正文已经恢复。",
          },
        ],
      },
    };

    expect(selectCompactExpectedMessageTexts(readResult)).toEqual([
      "请核对完整的 canonical timeline。",
      "canonical timeline 已核对完成。",
      "旧消息最终正文已经恢复。",
    ]);
    expect(selectCompactExpectedMessages(readResult)).toEqual([
      expect.objectContaining({ itemId: "user-1", role: "user" }),
      expect.objectContaining({
        itemId: "final-1",
        role: "assistant",
        phase: "final_answer",
      }),
      expect.objectContaining({ itemId: "legacy-final", role: "assistant" }),
    ]);
  });

  it("compares canonical markdown through its rendered visible text", () => {
    const [html] = renderExpectedVisibleExcerptHtml([
      "Run `cargo test` and keep **all output** visible.",
    ]);

    expect(html).toContain("<code>cargo test</code>");
    expect(html).toContain("<strong>all output</strong>");
  });

  it("compares each canonical assistant identity after visible text normalization", () => {
    const audit = assessExpectedMessageVisibility({
      expectedVisibleMessages: [
        {
          itemId: "assistant-final",
          role: "assistant",
          excerpt: "当前目标 执行 Gate B-F",
        },
      ],
      messageComparableText: "",
      visibleAgentMessageTextById: {
        "assistant-final": {
          text: "当前目标执行 Gate B F",
          visible: true,
        },
      },
    });

    expect(audit).toMatchObject({
      visibleAgentMessageIdentityCount: 1,
      missingExpectedMessages: [],
      missingExpectedMessageIds: [],
      missingExpectedExcerpts: [],
    });
    expect(audit).not.toHaveProperty("visibleAgentMessageTextById");
    expect(
      assessExpectedMessageVisibility({
        expectedVisibleMessages: [
          {
            itemId: "assistant-hidden",
            role: "assistant",
            excerpt: "隐藏正文",
          },
        ],
        visibleAgentMessageTextById: {
          "assistant-hidden": { text: "隐藏正文", visible: false },
        },
      })?.missingExpectedMessageIds,
    ).toEqual(["assistant-hidden"]);
  });

  it("uses real Electron and App Server JSON-RPC with an isolated runtime", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain("resolveDevAppServerBinary");
    expect(content).toContain("resolveElectronAppServerRuntimeEnv");
    expect(content).toContain('APP_SERVER_BACKEND_MODE: "unavailable"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("createTempRuntimeEnv(");
    expect(content).toContain("waitForRendererReady");
    expect(content).toContain("initializeAppServer");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("agent_runtime_");
  });

  it("reads the real source as scan and preview, then commits only inside the isolated app data", () => {
    const content = readSmokeScript();
    const helper = readSharedHelper();

    expect(content).toContain("sourceClient: SOURCE_CLIENT");
    expect(content).toContain('"conversationImport/source/scan"');
    expect(content).toContain('"conversationImport/thread/preview"');
    expect(content).toContain('"conversationImport/thread/commit"');
    expect(content).toContain("waitForConversationImportJob");
    expect(helper).toContain('"conversationImport/job/read"');
    expect(content).toContain("confirmed: true");
    expect(content).toContain('"thread/read"');
    expect(content).toContain("scorePreview");
    expect(content).toContain("selectStableImportSourceThreads");
    expect(content).toContain("minSourceStabilityMs");
    expect(content).toContain("willImportTimelineItems");
    expect(content).toContain("willImportAttachments");
    expect(content).toContain("readModelSummary");
    expect(content).toContain("readSummary.itemCounts");
    expect(content).toContain("executionRuntime:");
    expect(content).toContain("hasImportedThreadSettings");
    expect(content).toContain("hasImportedContinuation");
  });

  it("opens the imported session through the GUI and audits multiple viewports and scroll positions", () => {
    const content = readSmokeScript();
    const helper = readSharedHelper();
    const sessionOpenHelper = readSessionOpenHelper();

    expect(content).toContain("openSessionFromSidebar");
    expect(content).toContain("inspectImportedConversationVisualState");
    expect(content).not.toContain(
      "captureImportedConversationCompactVisualState",
    );
    expect(content).not.toContain("inspectImportedRuntimeDetailDrilldown");
    expect(content).not.toContain("readRuntimeEventsProbe");
    expect(content).not.toContain(
      '"conversationImport/thread/runtimeEvents/read"',
    );
    expect(content).not.toContain("imported-runtime-detail-");
    expect(content).toContain(
      'const SCROLL_POSITIONS = ["top", "middle", "bottom"]',
    );
    expect(content).toContain(
      '{ label: "desktop", width: 1440, height: 1000 }',
    );
    expect(content).toContain('{ label: "compact", width: 1100, height: 820 }');
    expect(content).toContain('{ label: "narrow", width: 820, height: 900 }');
    expect(content).toContain("openSnapshot?.textareaVisible");
    expect(content).toContain("openSnapshot?.textareaSessionId");
    expect(content).toContain("openSnapshot?.messageListSessionId");
    expect(sessionOpenHelper).toContain("planDecisionHandled");
    expect(sessionOpenHelper).toContain("plan-composer-decision-ignore");
    expect(content).toContain("inputbarVisible");
    expect(content).toContain("toolbarMessageViewportOverlap");
    expect(helper).toContain("inspectConversationChromeLayout");
    expect(content).toContain("messageListVisible");
    expect(content).toContain("messageContentVisible");
    expect(content).toContain("messageContentTextLength");
    expect(content).toContain("turnGroupCount");
    expect(content).toContain("userMessageBubbleCount");
    expect(content).toContain("assistantMessageBubbleCount");
    expect(content).toContain("agentMessagePhaseCounts");
    expect(content).toContain("expectedExcerptHtml");
    expect(content).not.toContain("selectExpandedExpectedMessageTexts");
    expect(content).not.toContain("expandedExpectedExcerptHtml");
    expect(content).toContain("agentMessageTextPartCount");
    expect(content).toContain("uniqueAgentMessageTextPartCount");
    expect(helper).toContain('data-testid="agent-message-text-part"');
    expect(content).toContain("toolCallRowCount");
    expect(content).toContain("fileArtifactCardCount");
    expect(helper).toContain("timelineFileAttachmentCardCount");
    expect(helper).toContain("timelineFileArtifactCardCount");
    expect(helper).toContain("groupedFileArtifactRowCount");
    expect(helper).toContain("timeline-file-attachment-card");
    expect(helper).toContain("timeline-file-artifact-card");
    expect(helper).toContain("file-changes-summary-file-row");
    expect(content).toContain("imageAttachmentCount");
    expect(content).toContain("historicalTimelinePreviewCount");
    expect(content).toContain("deferredHistoricalPreviewCount");
    expect(content).toContain("operationalTimelineDetailsCount");
    expect(content).not.toContain("assertCompactVisualAudits");
    expect(content).toContain("hasRawContentPartJson");
    expect(content).toContain("missingExpectedExcerpts");
    expect(content).toContain("missingExpectedDomExcerpts");
    expect(content).toContain("expectedCounts");
    expect(content).toContain(
      "readSummary.itemsLength === importSummary.willImportTimelineItems",
    );
    expect(content).toContain("audit.scroll.maxScroll > 0");
    expect(content).toContain("audit.toolCallRowCount === 0");
    expect(helper).toContain('[data-testid="tool-call-row"]');
    expect(content).toContain("hasPatchText");
    expect(content).not.toContain("hasHistoricalCommandExecutionVisible");
    expect(content).not.toContain("hasSearchItem");
    expect(content).not.toContain("hasHistoricalApprovalText");
    expect(content).toContain("visibleTextCaptured");
    expect(helper).toContain("path: screenshotPath");
    expect(helper).toContain("fullPage: false");
    expect(helper).toContain("assessExpectedMessageVisibility");
    expect(helper).toContain("scrollMessageSurface");
    expect(sessionOpenHelper).toContain(
      '[data-testid="app-sidebar-conversation-open"]',
    );
    expect(helper).toContain('textarea[name="agent-chat-message"]');
    expect(helper).toContain('[data-testid="message-list-column"]');
    expect(helper).toContain("snapshot.messageContentTextLength > 0");
    expect(helper).toContain("audit.messageContentTextLength > 0");
    expect(helper).toContain("new DOMParser().parseFromString");
    expect(helper).not.toContain("expandCanonicalTimelineDetails");
    expect(helper).toContain(
      '[data-testid^="message-list-historical-timeline-preview:"]',
    );
    expect(helper).toContain("unavailable-");
  });

  it("guards product-facing source leak boundaries without writing raw conversation content to evidence", () => {
    const content = readSmokeScript();
    const helper = readSharedHelper();

    expect(helper).toContain('"task-center-run-control-imported"');
    expect(content).not.toContain('    ".codex",\n    "state_5.sqlite"');
    expect(content).toContain("sanitizeOpenSnapshot");
    expect(content).toContain("summarizeCommitResult");
    expect(content).toContain("readModelSummary: readModel.summary");
    expect(content).not.toContain("readModel,");
    expect(content).not.toContain("commit,");
    expect(helper).toContain("bodyText: undefined");
    expect(helper).toContain("sourceMetadataUiVisible");
  });
});
