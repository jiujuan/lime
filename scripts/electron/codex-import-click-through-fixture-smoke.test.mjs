import fs from "node:fs";
import { describe, expect, it } from "vitest";

const SMOKE_SCRIPT_PATH =
  "scripts/electron/codex-import-click-through-fixture-smoke.mjs";
const GUI_HELPER_PATH =
  "scripts/electron/lib/local-history-import-click-through-gui.mjs";
const FIXTURE_HELPER_PATH =
  "scripts/electron/lib/local-history-import-click-through-fixture.mjs";
const SMOKE_UTILS_PATH =
  "scripts/electron/lib/local-history-import-smoke-utils.mjs";

function readFiles(...paths) {
  return paths.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}

function readSmokeSurface() {
  return readFiles(
    SMOKE_SCRIPT_PATH,
    GUI_HELPER_PATH,
    FIXTURE_HELPER_PATH,
    SMOKE_UTILS_PATH,
  );
}

describe("codex import click-through Electron fixture smoke guard", () => {
  it("drives the real sidebar import dialog instead of direct import API only", () => {
    const content = readSmokeSurface();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("resolveDevAppServerBinary");
    expect(content).toContain("APP_SERVER_BIN: appServerBinary");
    expect(content).toContain("electron.launch({");
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain("window.electronAPI.supportsCommand");
    expect(content).toContain("app_server_handle_json_lines");
    expect(content).toContain("app-sidebar-import-conversation-button");
    expect(content).toContain("app-sidebar-conversation-import-dialog");
    expect(content).toContain("app-sidebar-conversation-import-confirm");
    expect(content).toContain('textarea[name="agent-chat-message"]');
    expect(content).toContain("clickSidebarImport");
    expect(content).toContain("waitForImportPreview");
    expect(content).toContain("confirmImport");
    expect(content).toContain("sendFollowUpFromGui");
  });

  it("creates a temporary source home fixture that scan can discover", () => {
    const content = readSmokeSurface();

    expect(content).toContain("CODEX_HOME: sourceRoot");
    expect(content).toContain("session_index.jsonl");
    expect(content).toContain("rollout-${SOURCE_THREAD_ID}.jsonl");
    expect(content).toContain("writeSessionIndexFixture");
    expect(content).toContain("writeSourceRolloutFixture");
    expect(content).toContain('type: "session_meta"');
    expect(content).toContain('type: "reasoning"');
    expect(content).toContain('type: "function_call"');
    expect(content).toContain('type: "web_search_call"');
    expect(content).toContain('type: "patch_apply_end"');
    expect(content).toContain('type: "exec_approval_request"');
    expect(content).toContain("将保留工具、命令、补丁、确认与思考记录");
    expect(content).toContain("IMPORTED_REASONING_TEXT");
    expect(content).toContain("IMPORTED_ASSISTANT_MARKDOWN_TEXT");
    expect(content).toContain("IMPORTED_ASSISTANT_SUMMARY_TEXT");
    expect(content).toContain("IMPORTED_MARKDOWN_HEADING_TEXT");
    expect(content).toContain("导入选购指南###");
    expect(content).toContain("####如果历史会话");
    expect(content).toContain("**推荐 做法 **");
    expect(content).toContain("| 场景 | 过程 | 正文 |");
    expect(content).toContain("bodyText.includes(importedReasoningText)");
    expect(content).toContain("hasReasoningItem");
    expect(content).toContain("hasReasoningVisible");
    expect(content).toContain("hasCommandExecutionVisible");
    expect(content).toContain("hasCommandOutput");
    expect(content).toContain('bodyText.includes("npm test")');
    expect(content).toContain("hasCommandText");
    expect(content).toContain("hasPatchText");
    expect(content).toContain("hasSearchEvidence");
    expect(content).toContain("IMPORTED_WEB_SEARCH_TITLE");
    expect(content).toContain("IMPORTED_WEB_SEARCH_SOURCE_LABEL");
    expect(content).toContain("IMPORTED_WEB_SEARCH_URL");
    expect(content).toContain("Lime Codex Import Rendering Source");
    expect(content).toContain("https://example.com/lime-codex-import-rendering");
    expect(content).toContain("Yahoo Scout");
    expect(content).toContain("hasApprovalText");
    expect(content).toContain('bodyText.includes("权限记录")');
    expect(content).toContain("IMPORTED_ATTACHMENT_DATA_URL");
    expect(content).toContain("inspectImportedAttachmentPreview");
    expect(content).toContain("IMPORTED_PREVIEW_MARKDOWN_FILE");
    expect(content).toContain("IMPORTED_PREVIEW_HTML_FILE");
    expect(content).toContain("IMPORTED_PREVIEW_DOCX_FILE");
    expect(content).toContain("IMPORTED_PREVIEW_XLSX_FILE");
    expect(content).toContain("IMPORTED_PREVIEW_PPTX_FILE");
    expect(content).toContain("IMPORTED_PREVIEW_PDF_FILE");
    expect(content).toContain("imported-preview.md");
    expect(content).toContain("imported-preview.html");
    expect(content).toContain("imported-preview.docx");
    expect(content).toContain("imported-preview.xlsx");
    expect(content).toContain("imported-preview.pptx");
    expect(content).toContain("imported-preview.pdf");
    expect(content).toContain("writeMinimalDocx");
    expect(content).toContain("writeMinimalXlsx");
    expect(content).toContain("writeMinimalPptx");
    expect(content).toContain("writeMinimalPdf");
    expect(content).toContain("read_file");
    expect(content).toContain("call_read_docx");
    expect(content).toContain("call_read_xlsx");
    expect(content).toContain("call_read_pptx");
    expect(content).toContain("inline-tool-open-file");
    expect(content).toContain('button[title="展开过程详情"]');
    expect(content).toContain("timeline-file-artifact-card");
    expect(content).toContain("inspectImportedFilePreviewArtifacts");
    expect(content).toContain("canvas-workbench-html-preview");
    expect(content).toContain("IMPORTED_PREVIEW_PDF_TEXT");
    expect(content).toContain("word/document.xml");
    expect(content).toContain("xl/worksheets/sheet1.xml");
    expect(content).toContain("ppt/slides/slide1.xml");
    expect(content).toContain("ZIP/OpenXML 噪音");
    expect(content).toContain("summarizeImportedFilePreviewArtifacts");
  });

  it("asserts imported Markdown and WebSearch render like the live Claw path", () => {
    const content = readSmokeSurface();

    expect(content).toContain("inspectImportedMarkdownAndSearchRendering");
    expect(content).toContain("importedMarkdownAndSearchRenderingSummary");
    expect(content).toContain("expandImportedSearchProcessGroup");
    expect(content).toContain("markdownHeadingVisible");
    expect(content).toContain("markdownStrongVisible");
    expect(content).toContain("markdownTableVisible");
    expect(content).toContain("rawMarkdownVisible");
    expect(content).toContain("hasImportedSearchResult");
    expect(content).toContain("searchProcessGroupVisible");
    expect(content).toContain("searchNoiseVisible");
    expect(content).toContain("hasFullSearchUrlVisible");
    expect(content).toContain("markdown-table-scroll");
    expect(content).toContain("streaming-process-group");
    expect(content).toContain("inline-tool-process-step");
    expect(content).toContain("已搜索网页");
    expect(content).toContain("正在搜索网页");
    expect(content).toContain("导入 Markdown 标题未渲染为 heading");
    expect(content).toContain("导入 Markdown 加粗未渲染为 strong");
    expect(content).toContain("导入 Markdown 表格未渲染为 table");
    expect(content).toContain("导入正文暴露了原始 Markdown 语法");
    expect(content).toContain("导入搜索结果未展示有效来源");
    expect(content).toContain("导入搜索过程未按过程组展示");
    expect(content).toContain("导入搜索结果暴露了搜索导航噪音");
    expect(content).toContain("导入搜索结果暴露了完整 URL");
  });

  it("continues the imported session through the GUI inputbar and external backend", () => {
    const content = readSmokeSurface();

    expect(content).toContain('"conversationImport/source/scan"');
    expect(content).toContain('"conversationImport/thread/preview"');
    expect(content).toContain('"conversationImport/thread/commit"');
    expect(content).toContain('"agentSession/read"');
    expect(content).toContain('"agentSession/turn/start"');
    expect(content).toContain("extractInvokeTraceMethods");
    expect(content).toContain("REQUIRED_BACKEND_METHODS");
    expect(content).toContain("LEGACY_CONTINUATION_SENTINEL");
    expect(content).toContain("hidesFixtureSentinel");
    expect(content).toContain("hidesRawSourceEventNames");
    expect(content).toContain("hasReadableSourceLabels");
    expect(content).toContain("hidesFixtureSentinel");
    expect(content).toContain("inspectEnvironmentPopoverImportBoundary");
    expect(content).toContain("task-center-environment-trigger");
    expect(content).toContain("task-center-environment-popover");
    expect(content).toContain("task-center-run-control-imported");
    expect(content).toContain("inspectImportedHistoryBanner");
    expect(content).toContain("imported-source-banner");
    expect(content).toContain("importedHistoryBannerSummary");
    expect(content).toContain("hiddenFromMainTimeline");
    expect(content).toContain("inspectSidebarImportDiscoverability");
    expect(content).toContain("app-sidebar-conversation-shelf");
    expect(content).toContain("importedEntryVisible");
    expect(content).toContain("sidebarImportDiscoverabilitySummary");
    expect(content).toContain("VISUAL_AUDIT_VIEWPORTS");
    expect(content).toContain("collectImportedSessionVisualAudit");
    expect(content).toContain("visual-audit");
    expect(content).toContain("inputbarOccludesMainContent");
    expect(content).toContain("importedBannerVisible");
    expect(content).toContain("hidesImportedRunControlCard");
    expect(content).toContain("environment-trigger-not-rendered");
    expect(content).toContain("backendMetadataImported");
    expect(content).toContain("backendCwd === IMPORTED_CWD");
    expect(content).toContain("hasContinueUserMessage");
    expect(content).toContain("hasContinueAssistantMessage");
    expect(content).toContain(
      'String(item?.command || "").includes("npm test")',
    );
    expect(content).not.toContain('!bodyText.includes("npm test")');
    expect(content).not.toContain('"npm test",\n      "thread-codex"');
  });

  it("uses external fixture backend only, not live provider, legacy runtime, or mock fallback", () => {
    const content = readSmokeSurface();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("writeFixtureBackend");
    expect(content).toContain('input.kind === "turnStart"');
    expect(content).toContain('type: "message.delta"');
    expect(content).toContain('type: "turn.completed"');
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("--allow-live-provider");
    expect(content).not.toContain("agent_runtime_");
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
  });
});
