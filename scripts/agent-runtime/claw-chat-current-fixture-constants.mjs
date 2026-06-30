import path from "node:path";
import process from "node:process";
import {
  buildExpertSkillsRuntimeCatalog,
  buildExpertSkillsRuntimeMetadata,
  createExplicitSkillsRuntimeFixtureScenario,
  createExpertSkillsRuntimeFixtureScenario,
  createExpertPanelSkillsRuntimeFixtureScenario,
  createManualEnableSkillsRuntimeFixtureScenario,
  createSkillsRuntimeFixtureScenario,
  EXPERT_PANEL_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_ID,
  EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_TITLE,
  renderSkillsRuntimeBackendEvents,
  SKILLS_RUNTIME_ASSERTION_KEYS,
  SKILLS_RUNTIME_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_PROMPT,
  SKILLS_RUNTIME_QUERY,
  SKILLS_RUNTIME_SKILL_NAME,
  summarizeSkillsRuntimeEvidenceExport,
} from "./skills-runtime-fixture-scenario.mjs";

export {
  buildExpertSkillsRuntimeCatalog,
  buildExpertSkillsRuntimeMetadata,
  createExplicitSkillsRuntimeFixtureScenario,
  createExpertSkillsRuntimeFixtureScenario,
  createExpertPanelSkillsRuntimeFixtureScenario,
  createManualEnableSkillsRuntimeFixtureScenario,
  createSkillsRuntimeFixtureScenario,
  EXPERT_PANEL_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_PLAZA_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_ASSERTION_KEYS,
  EXPERT_SKILLS_RUNTIME_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_ID,
  EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_TITLE,
  renderSkillsRuntimeBackendEvents,
  SKILLS_RUNTIME_ASSERTION_KEYS,
  SKILLS_RUNTIME_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_PROMPT,
  SKILLS_RUNTIME_QUERY,
  SKILLS_RUNTIME_SKILL_NAME,
  summarizeSkillsRuntimeEvidenceExport,
};

export const DEFAULTS = {
  appUrl: "",
  evidenceDir: path.join(
    process.cwd(),
    ".lime",
    "qc",
    "gui-evidence",
    "claw-chat-current-fixture",
  ),
  prefix: "claw-chat-current-fixture",
  timeoutMs: 180_000,
  intervalMs: 500,
  keepTemp: false,
  scenario: "complete",
};

export const LOG_PREFIX = "[smoke:claw-chat-current-fixture]";
export const APP_SERVER_HANDLE_JSON_LINES_COMMAND =
  "app_server_handle_json_lines";
export const APP_SERVER_DRAIN_EVENTS_COMMAND = "app_server_drain_events";
export const APP_SERVER_METHOD_INITIALIZE = "initialize";
export const APP_SERVER_METHOD_INITIALIZED = "initialized";
export const APP_SERVER_METHOD_AGENT_SESSION_EVENT = "agentSession/event";
export const APP_SERVER_METHOD_SESSION_START = "agentSession/start";
export const APP_SERVER_METHOD_SESSION_UPDATE = "agentSession/update";
export const APP_SERVER_METHOD_SESSION_TURN_START = "agentSession/turn/start";
export const APP_SERVER_METHOD_SESSION_TURN_CANCEL = "agentSession/turn/cancel";
export const APP_SERVER_METHOD_SESSION_READ = "agentSession/read";
export const APP_SERVER_METHOD_SESSION_THREAD_RESUME =
  "agentSession/thread/resume";
export const APP_SERVER_METHOD_SESSION_LIST = "agentSession/list";
export const APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND =
  "agentSession/runtimeEvents/append";
export const APP_SERVER_METHOD_ARTIFACT_READ = "artifact/read";
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE =
  "mediaTaskArtifact/image/create";
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE =
  "mediaTaskArtifact/image/complete";
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET =
  "mediaTaskArtifact/get";
export const APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST =
  "mediaTaskArtifact/list";
export const APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE =
  "agentAppInstalled/save";
export const APP_SERVER_METHOD_EVIDENCE_EXPORT = "evidence/export";
export const APP_SERVER_METHOD_DIAGNOSTICS_TRACE_LIST =
  "diagnostics/trace/list";
export const APP_SERVER_METHOD_DIAGNOSTICS_TRACE_READ =
  "diagnostics/trace/read";
export const APP_SERVER_METHOD_DIAGNOSTICS_TRACE_EXPORT =
  "diagnostics/trace/export";
export const APP_SERVER_METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT =
  "diagnostics/supportBundle/export";
export const APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE =
  "workspace/default/ensure";
export const APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST =
  "workspaceRightSurface/request";
export const APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST =
  "workspaceRightSurface/pending/list";
export const RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO =
  "right-surface-visual-matrix";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO =
  "content-factory-article-workspace";
export const NEWS_PROMPT = "整理今天的国际新闻";
export const CONTINUE_PROMPT = "继续输出";
export const PLAN_PROMPT = "先给我一个修复计划，不要直接改代码";
export const GOAL_PROMPT = "本周完成 Goal E2E 修复";
export const WEB_TOOLS_RENDERING_PROMPT = "验证网页搜索渲染";
export const MCP_STRUCTURED_CONTENT_PROMPT = "验证 MCP structuredContent 展示";
export const ASSISTANT_DONE_TEXT = "CLAW_NEWS_FIXTURE_DONE";
export const CONTINUE_DONE_TEXT = "CLAW_CONTINUE_FIXTURE_DONE";
export const PLAN_DONE_TEXT = "CLAW_PLAN_FIXTURE_DONE";
export const GOAL_DONE_TEXT = "CLAW_GOAL_FIXTURE_DONE";
export const WEB_TOOLS_RENDERING_DONE_TEXT = "CLAW_WEB_TOOLS_RENDERING_DONE";
export const MCP_STRUCTURED_CONTENT_DONE_TEXT =
  "CLAW_MCP_STRUCTURED_CONTENT_DONE";
export const IMAGE_COMMAND_SCENARIO = "image-command";
export const IMAGE_COMMAND_PROMPT =
  "@配图 E2E 图片命令路由测试，请生成一张青柠插画";
export const IMAGE_COMMAND_IMAGE_PROMPT =
  "E2E 图片命令路由测试，请生成一张青柠插画";
export const IMAGE_COMMAND_DONE_TEXT = "CLAW_IMAGE_COMMAND_FIXTURE_DONE";
export const WEB_TOOLS_SEARCH_TITLE = "Lime WebSearch Rendering Source";
export const WEB_TOOLS_SEARCH_URL =
  "https://example.com/lime-websearch-rendering";
export const WEB_TOOLS_SEARCH_SOURCE_LABEL =
  "example.com/lime-websearch-rendering";
export const WEB_TOOLS_SEARCH_SNIPPET =
  "Search source used to verify inline rendering";
export const WEB_TOOLS_MID_THINKING_TEXT =
  "搜索结果还需要继续筛掉广告软文，我先读取有效来源。";
export const WEB_TOOLS_REASONING_FINAL_SIGNATURE =
  "web-tools-reasoning-final-signature";
export const WEB_TOOLS_REASONING_ITEM_SIGNATURE =
  "web-tools-reasoning-item-signature";
export const WEB_TOOLS_REASONING_NATIVE_ITEM_ID = "rs_web_tools_fixture";
export const WEB_TOOLS_REASONING_PROVIDER_BACKEND = "reasoning_fixture";
export const WEB_TOOLS_FETCH_MARKDOWN =
  "WebFetch 正文摘要：页面确认搜索来源可以展开，同时最终正文继续输出。";
export const WEB_TOOLS_BROKEN_MARKDOWN_TEXT = [
  "五年级选购指南###",
  "####如果孩子基础一般，优先看护眼、内容和家长管理。",
  "**推荐 型号 **：Lime 学习机 S30",
  "**理由 **：系统清晰，适合五年级基础巩固。",
  "对比表：",
  "| 品牌 | 型号 | 场景 |",
  "| --- | --- | --- |",
  "| Lime | S30 | 五年级巩固 |",
].join("\n");
export const PLAN_STEPS = [
  { step: "确认计划模式请求进入 App Server", status: "completed" },
  { step: "输出 proposed_plan", status: "in_progress" },
  { step: "验证右侧计划轨显示", status: "pending" },
];
export const PROPOSED_PLAN_BLOCK = `<proposed_plan>
${PLAN_STEPS.map((step) => `- ${step.step}`).join("\n")}
</proposed_plan>`;
export const FIXTURE_PROVIDER = "fixture-provider";
export const FIXTURE_MODEL = "fixture-model";
export const SESSION_ID = `claw-chat-current-${Date.now()}-${process.pid}`;
export const THREAD_ID = `${SESSION_ID}-thread`;
export const SESSION_TITLE = "Claw 新闻输入 Electron fixture";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID = `${SESSION_ID}-content-factory-article-workspace`;
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_THREAD_ID = `${CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID}-thread`;
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE =
  "内容工厂 Article Editor Fixture";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_TURN_ID =
  "turn_content_factory_article_workspace";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY =
  "worker_dogfood";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID = `${CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID}-worker-turn`;
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID = `${CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID}:${CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_ACTION_KEY}`;
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_REMOTE_REJECT_TURN_ID = `${CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID}-remote-reject-turn`;
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_REMOTE_REJECT_ERROR_CODE =
  "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID =
  "artifact-article-1";
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_IMAGE_ARTIFACT_ID =
  "artifact-image-1";
export const WEB_TOOLS_SEARCH_TOOL_CALL_ID = `${SESSION_ID}:tool:websearch-rendering`;
export const WEB_TOOLS_REASONING_FINAL_ID = `${SESSION_ID}:reasoning:web-tools-rendering-final`;
export const WEB_TOOLS_REASONING_ITEM_ID = `${SESSION_ID}:reasoning:web-tools-rendering`;
export const WEB_TOOLS_FETCH_TOOL_CALL_ID = `${SESSION_ID}:tool:webfetch-rendering`;
export const MCP_STRUCTURED_CONTENT_TOOL_CALL_ID = `${SESSION_ID}:tool:mcp-structured-content`;
export const MCP_STRUCTURED_CONTENT_TOOL_NAME = "mcp__docs__diagnostic_probe";
export const MCP_STRUCTURED_CONTENT_TOOL_DISPLAY_LABEL =
  "docs / diagnostic probe";
export const MCP_STRUCTURED_CONTENT_ANSWER =
  "MCP 结构化答案已进入 Agent Chat GUI";
export const MCP_STRUCTURED_CONTENT_REFERENCE_ID = "doc-structured-1";
export const MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT = JSON.stringify({
  request_metadata: {
    projection: "mcp_tool_result_projection",
    trace_id: "mcp-structured-content-fixture-trace",
  },
  diagnostics: {
    elapsed_ms: 12,
    raw_transport_payload: "doc-hidden-envelope",
  },
  content: [
    {
      type: "text",
      text: "control-plane envelope only; user answer is stored in structuredContent",
    },
  ],
});
export const MCP_STRUCTURED_CONTENT_RESULT = {
  answer: MCP_STRUCTURED_CONTENT_ANSWER,
  ids: [MCP_STRUCTURED_CONTENT_REFERENCE_ID],
};
export const IMAGE_COMMAND_SKILL_TOOL_CALL_ID = `${SESSION_ID}:tool:image-skill-generate`;
export const IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID = `${SESSION_ID}:tool:image-create-task`;
export const IMAGE_COMMAND_SKILL_NAME = "image_generate";
export const IMAGE_COMMAND_CREATE_TASK_TOOL_NAME =
  "lime_create_image_generation_task";
export const SKILLS_RUNTIME_SCENARIO =
  createSkillsRuntimeFixtureScenario(SESSION_ID);
export const SKILLS_RUNTIME_EXPLICIT_SCENARIO =
  createExplicitSkillsRuntimeFixtureScenario(SESSION_ID);
export const SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO =
  createManualEnableSkillsRuntimeFixtureScenario(SESSION_ID);
export const EXPERT_SKILLS_RUNTIME_SCENARIO =
  createExpertSkillsRuntimeFixtureScenario(SESSION_ID);
export const EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO =
  createExpertPanelSkillsRuntimeFixtureScenario(SESSION_ID);
export const EXPERT_SKILLS_RUNTIME_SESSION_ID = `${SESSION_ID}-expert-skills`;
export const EXPERT_SKILLS_RUNTIME_THREAD_ID = `${EXPERT_SKILLS_RUNTIME_SESSION_ID}-thread`;
export const EXPERT_SKILLS_RUNTIME_SESSION_TITLE =
  "专家 Skills Runtime Fixture";
export const EVENT_READ_PROBE_PROMPT =
  "验证 agentSession/event 与 read model 同 turn 对齐。";
export const EVENT_READ_PROBE_TURN_ID = `${SESSION_ID}-event-read-probe`;
export const EVENT_READ_PROBE_READ_TEXT = "事件流 probe 已进入 RuntimeCore";
export const EVENT_READ_PROBE_DONE_TEXT = "EVENT_READ_PROBE_DONE";
export const EVENT_READ_PROBE_TOOL_CALL_ID = `${EVENT_READ_PROBE_TURN_ID}:tool:webfetch`;
export const EVENT_READ_PROBE_TOOL_NAME = "WebFetch";
export const EVENT_READ_PROBE_TOOL_OUTPUT =
  "fixture fetched https://example.com/claw-event-read";
export const WEB_TOOLS_RENDERING_ASSERTION_KEYS = [
  "webToolsRenderingPromptReachedBackend",
  "guiWebToolsRenderingInputSubmitted",
  "guiWebSearchProcessDefaultCollapsed",
  "guiWebSearchProcessShowsSourcesAfterExpand",
  "guiWebFetchProcessShowsReadPagesAfterExpand",
  "guiWebToolsTimelineOrderPreserved",
  "guiWebSearchNoiseHidden",
  "guiMarkdownRendered",
  "guiWebSearchFinalTextInterleaved",
  "guiWebFetchTransportEnvelopeHidden",
  "readModelWebToolsRenderingCompleted",
  "readModelWebToolsReasoningProviderMetadataPreserved",
  "guiWebToolsReasoningDidNotOpenPlanRail",
];
export const MCP_STRUCTURED_CONTENT_ASSERTION_KEYS = [
  "mcpStructuredContentPromptReachedBackend",
  "guiMcpStructuredContentInputSubmitted",
  "guiMcpStructuredContentVisible",
  "guiMcpStructuredContentEnvelopeHidden",
  "readModelMcpStructuredContentCompleted",
  "readModelMcpStructuredContentObserved",
];
export const IMAGE_COMMAND_ASSERTION_KEYS = [
  "imageCommandPromptReachedBackend",
  "imageCommandMetadataReachedBackend",
  "imageCommandUsedCurrentMediaTaskArtifactMethods",
  "imageCommandTaskArtifactWritten",
  "imageCommandTaskArtifactReadable",
  "imageCommandTaskArtifactTerminal",
  "imageCommandTaskArtifactSameTaskUpdated",
  "imageCommandSkillToolObserved",
  "imageCommandCreateTaskToolObserved",
  "guiImageCommandInputSubmitted",
  "guiImageCommandToolProcessVisible",
  "guiImageCommandTaskCardVisible",
  "guiImageCommandTaskCardTerminal",
  "guiImageCommandSingleTaskCard",
  "guiImageCommandRestoredAfterReload",
  "guiImageCommandNoDraftCard",
  "guiImageCommandNoTemplateTaskId",
  "readModelImageCommandCompleted",
  "readModelImageCommandTaskPreviewObserved",
];
export const RIGHT_SURFACE_VISUAL_MATRIX_ASSERTION_KEYS = [
  "rightSurfaceVisualMatrixRequestedThroughAppServer",
  "rightSurfaceVisualMatrixFilesSurfaceVisible",
  "rightSurfaceVisualMatrixObjectCanvasSurfaceVisible",
  "rightSurfaceVisualMatrixExpertSurfaceVisible",
  "rightSurfaceVisualMatrixBrowserSurfaceVisible",
  "rightSurfaceVisualMatrixSurfacesMutuallyExclusive",
  "rightSurfaceVisualMatrixHostsFillRightSide",
  "rightSurfaceVisualMatrixPendingConsumeKeepsSurfaceOpen",
  "rightSurfaceVisualMatrixDoesNotUseModelTurn",
];
export const CONTENT_FACTORY_ARTICLE_WORKSPACE_ASSERTION_KEYS = [
  "contentFactoryArticleWorkspaceRuntimeEventsAppended",
  "contentFactoryArticleWorkspaceRightSurfaceRequested",
  "contentFactoryArticleWorkspaceSessionOpenedFromSidebar",
  "contentFactoryArticleWorkspaceRightSurfaceVisible",
  "contentFactoryArticleWorkspacePageShowsObjects",
  "contentFactoryArticleWorkspaceReadModelProjected",
  "contentFactoryArticleWorkspaceArtifactsProjected",
  "contentFactoryArticleWorkspaceRendererArtifactsProjected",
  "contentFactoryArticleWorkspaceArtifactReadContent",
  "contentFactoryArticleWorkspaceArticleWritingStructureVisible",
  "contentFactoryArticleWorkspaceEditedDraftRestored",
  "contentFactoryArticleWorkspaceWorkerFailureEvidence",
  "contentFactoryArticleWorkspaceWorkerTurnExecuted",
  "contentFactoryArticleWorkspaceActionResultPatchProjected",
  "contentFactoryArticleWorkspaceStoryboardRendererContractPreserved",
  "contentFactoryArticleWorkspaceRemoteRuntimeFailClosed",
  "contentFactoryArticleWorkspaceDoesNotUseModelTurn",
];
