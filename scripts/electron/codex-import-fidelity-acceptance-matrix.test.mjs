import fs from "node:fs";
import { describe, expect, it } from "vitest";

const MATRIX_PATH = "internal/roadmap/codeximport/fidelity-acceptance-matrix.md";
const TRACKER_PATH = "internal/roadmap/codeximport/implementation-tracker.md";
const ARTIFACT_ROADMAP_PATH = "internal/roadmap/artifacts/roadmap.md";
const RUNTIME_EVENTS_TEST_PATH =
  "lime-rs/crates/app-server/src/runtime/conversation_import/tests/runtime_events.rs";
const SECURITY_TEST_PATH =
  "lime-rs/crates/app-server/src/runtime/conversation_import/tests/security.rs";
const EVIDENCE_TEST_PATH =
  "lime-rs/crates/app-server/src/runtime/conversation_import/tests/evidence.rs";
const CLICK_THROUGH_SMOKE_TEST_PATH =
  "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs";
const REAL_SAMPLE_SMOKE_TEST_PATH =
  "scripts/electron/local-history-import-real-sample-visual-audit-smoke.test.mjs";
const VISUAL_AUDIT_SMOKE_TEST_PATH =
  "scripts/electron/local-history-import-visual-audit-smoke.test.mjs";
const CLICK_THROUGH_SMOKE_PATH =
  "scripts/electron/codex-import-click-through-fixture-smoke.mjs";
const CLICK_THROUGH_GUI_HELPER_PATH =
  "scripts/electron/lib/local-history-import-click-through-gui.mjs";
const CLICK_THROUGH_FIXTURE_HELPER_PATH =
  "scripts/electron/lib/local-history-import-click-through-fixture.mjs";
const PREVIEW_ARTIFACT_TEST_PATH = "src/lib/artifact/previewArtifact.test.ts";
const WORKSPACE_PREVIEW_ACTIONS_TEST_PATH =
  "src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.test.tsx";

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readFiles(...filePaths) {
  return filePaths.map(readFile).join("\n");
}

describe("codex import fidelity acceptance matrix guard", () => {
  it("documents the current fact source and excludes legacy implementation paths", () => {
    const matrix = readFile(MATRIX_PATH);

    expect(matrix).toContain("conversationImport/source/scan");
    expect(matrix).toContain("conversationImport/thread/preview");
    expect(matrix).toContain("conversationImport/thread/commit");
    expect(matrix).toContain("RuntimeCore StoredSession + AgentEvent");
    expect(matrix).toContain("agentSession/read + conversationImport/thread/runtimeEvents/read");
    expect(matrix).toContain("Preview Artifact Contract");
    expect(matrix).toContain("evidence/export / replay current 主链");
    expect(matrix).toContain("Renderer 不直接扫描 `.codex`");
    expect(matrix).toContain("旧 Tauri / `lime-rs/src/**` / 旧 `agent_runtime_*` 不作为新增能力落点");
    expect(matrix).not.toContain("WebviewWindow");
  });

  it("keeps every high-fidelity source category tied to a concrete guard", () => {
    const matrix = readFile(MATRIX_PATH);
    const runtimeTests = readFile(RUNTIME_EVENTS_TEST_PATH);
    const smokeGuards = readFiles(
      CLICK_THROUGH_SMOKE_TEST_PATH,
      CLICK_THROUGH_SMOKE_PATH,
      CLICK_THROUGH_FIXTURE_HELPER_PATH,
      REAL_SAMPLE_SMOKE_TEST_PATH,
      VISUAL_AUDIT_SMOKE_TEST_PATH,
    );

    const requiredRows = [
      "source discovery",
      "rollout path repair",
      "message ordering",
      "attachments",
      "reasoning",
      "shell command",
      "file read preview",
      "Markdown / HTML / DOCX / image preview",
      "patch",
      "approval",
      "web search",
      "MCP / dynamic / view image / image generation",
      "plan",
      "context / review / subagent / collab",
      "incomplete lifecycle",
      "high-volume rollout",
      "runtime detail drilldown",
      "continue same session",
      "evidence / replay",
      "privacy / source leak boundary",
      "non-Codex importer",
    ];

    for (const row of requiredRows) {
      expect(matrix).toContain(`| ${row} |`);
    }

    const requiredRustEvidence = [
      "commit_preserves_codex_tool_command_and_patch_timeline",
      "commit_preserves_high_volume_codex_tool_events_with_bounded_default_projection",
      "commit_applies_import_runtime_projection_budget_per_thread",
      "commit_preserves_imported_assistant_message_order_between_runtime_events",
      "commit_preserves_imported_update_plan_timeline_item",
      "commit_preserves_imported_completed_plan_item",
      "commit_projects_codex_runtime_specialized_items_into_existing_timeline_types",
      "commit_merges_duplicate_user_messages_when_response_item_precedes_event_msg",
      "commit_closes_incomplete_imported_lifecycles_without_failed_timeline_items",
      "mcp_tool_call_begin",
      "dynamic_tool_call_request",
      "view_image_tool_call",
      "image_generation_begin",
      "context_compacted",
      "subagent_activity",
      "collab_agent_spawn_begin",
    ];

    for (const token of requiredRustEvidence) {
      expect(runtimeTests).toContain(token);
    }

    const requiredGuiEvidence = [
      "hasReasoningVisible",
      "hasCommandRecordVisible",
      "hasPatchText",
      "hasSearchEvidence",
      "hasApprovalText",
      "openedAllImportedPreviewArtifacts",
      "Markdown",
      "HTML",
      "DOCX",
      "runtimeDetailDrilldown",
      "data-event-kind",
      "sourceThreadId",
      "sourcePath",
      "hidesRawSourceEventNames",
    ];

    for (const token of requiredGuiEvidence) {
      expect(smokeGuards).toContain(token);
    }
  });

  it("keeps preview artifacts as the unified opening path for imported files", () => {
    const matrix = readFile(MATRIX_PATH);
    const artifactRoadmap = readFile(ARTIFACT_ROADMAP_PATH);
    const previewArtifactTests = readFiles(
      PREVIEW_ARTIFACT_TEST_PATH,
      WORKSPACE_PREVIEW_ACTIONS_TEST_PATH,
    );
    const clickThroughSurface = readFiles(
      CLICK_THROUGH_SMOKE_PATH,
      CLICK_THROUGH_GUI_HELPER_PATH,
      CLICK_THROUGH_SMOKE_TEST_PATH,
    );

    expect(matrix).toContain("Preview Artifact Contract");
    expect(matrix).toContain("`thread_read.tool_calls.arguments.path` + `inline-tool-open-file` + Preview Artifact Contract");
    expect(artifactRoadmap).toContain("打开链路 artifact 化，业务事实源不 artifact 化");
    expect(artifactRoadmap).toContain("openArtifactInWorkbench");
    expect(artifactRoadmap).toContain("selectionKey=artifact:<id>");
    expect(artifactRoadmap).toContain("PDF、Excel、PPT");
    expect(artifactRoadmap).toContain("renderMode=system_open");
    expect(artifactRoadmap).toContain("open_with_default_app");
    expect(matrix).toContain("PDF、Excel、PPT 已有统一 Preview Artifact `system_open` 兜底");
    expect(previewArtifactTests).toContain("research.pdf");
    expect(previewArtifactTests).toContain("budget.xlsx");
    expect(previewArtifactTests).toContain("deck.pptx");
    expect(previewArtifactTests).toContain("interview.wav");
    expect(previewArtifactTests).toContain("demo.mp4");
    expect(previewArtifactTests).toContain('source: "url"');
    expect(previewArtifactTests).toContain('source: "database_record"');
    expect(previewArtifactTests).toContain('renderMode: "system_open"');
    expect(clickThroughSurface).toContain("inline-tool-open-file");
    expect(clickThroughSurface).toContain("inspectImportedFilePreviewArtifacts");
    expect(clickThroughSurface).toContain("openedAllImportedPreviewArtifacts");
    expect(clickThroughSurface).toContain("canvas-workbench-html-preview");
    expect(clickThroughSurface).toContain("word/document.xml");
    expect(clickThroughSurface).toContain("ZIP/OpenXML 噪音");
  });

  it("keeps continuation and evidence on the current App Server runtime chain", () => {
    const matrix = readFile(MATRIX_PATH);
    const tracker = readFile(TRACKER_PATH);
    const evidenceTests = readFile(EVIDENCE_TEST_PATH);
    const clickThroughSurface = readFiles(
      CLICK_THROUGH_SMOKE_TEST_PATH,
      CLICK_THROUGH_SMOKE_PATH,
    );

    expect(matrix).toContain("`agentSession/turn/start` current 主链");
    expect(matrix).toContain("`evidence/export` / replay 使用 Lime canonical events");
    expect(tracker).toContain("导入来源 runtime 的 `provider_name/model_name` 只表示来源上下文");
    expect(tracker).toContain("续聊 submit op 必须继续提交用户当前选择的 provider/model");
    expect(evidenceTests).toContain("imported_codex_thread_exports_evidence_with_source_provenance");
    expect(clickThroughSurface).toContain('"agentSession/turn/start"');
    expect(clickThroughSurface).toContain("backendMetadataImported");
    expect(clickThroughSurface).toContain("hasContinueUserMessage");
    expect(clickThroughSurface).toContain("hasContinueAssistantMessage");
    expect(clickThroughSurface).toContain('not.toContain("agent_runtime_")');
  });

  it("guards privacy and non-Codex compatibility as explicit boundaries", () => {
    const matrix = readFile(MATRIX_PATH);
    const securityTests = readFile(SECURITY_TEST_PATH);
    const tracker = readFile(TRACKER_PATH);
    const smokeGuards = readFiles(
      REAL_SAMPLE_SMOKE_TEST_PATH,
      VISUAL_AUDIT_SMOKE_TEST_PATH,
    );

    expect(matrix).toContain("敏感文件路径");
    expect(matrix).toContain("non-Codex importer");
    expect(matrix).toContain("compat / deferred");
    expect(matrix).toContain("未来 Codex 新事件类型默认先进入 unsupported / provenance-only");
    expect(securityTests).toContain("scan_rejects_sensitive_rollout_path_from_state_db");
    expect(securityTests).toContain("preview_rejects_sensitive_source_path");
    expect(securityTests).toContain("commit_rejects_source_path_outside_source_root");
    expect(tracker).toContain("Claude Code 需要后续导入，但不是当前架构主参考");
    expect(tracker).toContain("当前返回 unsupported，不污染 Codex-first 主线");
    expect(smokeGuards).toContain("leakedTokens");
    expect(smokeGuards).toContain("SOURCE_BRAND_PATTERN");
    expect(smokeGuards).toContain("GUI 可见文本仍泄漏来源品牌");
  });
});
