import fs from "node:fs";
import { CONTENT_FACTORY_ARTICLE_WORKSPACE_ASSERTION_KEYS } from "./claw-chat-current-fixture-constants.mjs";
import {
  MULTI_AGENT_TEAM_PROMPT,
  summarizeMultiAgentTeamEvidenceExport,
} from "./multi-agent-team-fixture-scenario.mjs";

function expectAllToContain(expect, content, fragments) {
  for (const fragment of fragments) expect(content).toContain(fragment);
}

function expectAllNotToContain(expect, content, fragments) {
  for (const fragment of fragments) expect(content).not.toContain(fragment);
}

function readImageCommandScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs",
    "utf8",
  );
}

function readRpcScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-rpc.mjs",
    "utf8",
  );
}

function readContentFactoryArticleWorkspaceScript() {
  return fs.readFileSync(
    "scripts/agent-runtime/claw-chat-current-fixture-content-factory-article-workspace.mjs",
    "utf8",
  );
}

function readMultiAgentTeamFixtureScenario() {
  return fs.readFileSync(
    "scripts/agent-runtime/multi-agent-team-fixture-scenario.mjs",
    "utf8",
  );
}

export function registerImageContentAndTeamSmokeGuards({
  expect,
  it,
  readSmokeScript,
  readCurrentFixtureRegressionSmokeScript,
  removeContentFactoryForbiddenMarkerGuard,
}) {
  it("covers Claw @配图 through ImageCommandWorkflow and current task artifact", () => {
    const content = readSmokeScript();
    const imageCommandContent = readImageCommandScript();
    const rpcContent = readRpcScript();

    expectAllToContain(expect, content, [
      "image-command",
      "plain-image-intent",
      "IMAGE_COMMAND_SCENARIO",
      "PLAIN_IMAGE_INTENT_SCENARIO",
      "@配图 E2E 图片命令路由测试，请生成一张青柠插画",
      "画一张广州夏天的图",
      "@配图 ${PLAIN_IMAGE_INTENT_PROMPT}",
      "ensure-fixture-image-provider",
      "image_command_intent",
      "imageCommandLegacySkillLaunchNotSubmitted",
      "image_task",
      "lime_create_image_generation_task",
      "IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID",
      "mediaTaskArtifact/image/create",
      "mediaTaskArtifact/get",
      "mediaTaskArtifact/list",
      'APP_SERVER_BACKEND_MODE: "runtime"',
      "media_runtime_worker",
      "lime-image-api-worker",
      ".lime/tasks/image_generate",
      "runImageCommandScenario",
      "waitForImageCommandWorkflowTaskArtifact",
      "isImageIntentScenario",
      "waitForGuiImageCommandCompleted",
      "waitForGuiImageCommandTerminal",
      "waitForSessionReadImageCommandCompleted",
      "waitForImageCommandTaskArtifactTerminal",
      "imageCommandTaskArtifactTerminalPatch",
      "completeMethodUsed",
      "imageCommandTaskArtifactTerminal",
      "imageCommandTaskArtifactAfterReload",
      "imageCommandTaskAuditLog",
      "EXPECTED_IMAGE_TASK_AUDIT_EVENTS",
      "worker_loaded",
      "request_slot_succeeded",
      "task_succeeded",
      "guiImageCommandRestoredAfterReload",
      "agentUiPerformanceTracePreReload",
      "collectAgentUiPerformanceTraceEvidence",
      "image-workbench-message-preview-${taskId}",
      "page.reload",
      "imageCommandTaskArtifact",
      "imageCommandPromptReachedBackend",
      "imageCommandMetadataReachedBackend",
      "imageCommandUsedCurrentMediaTaskArtifactMethods",
      "imageCommandTaskArtifactWritten",
      "imageCommandTaskArtifactSameTaskUpdated",
      "imageCommandTaskAuditLogWritten",
      "imageCommandTaskAuditLogEventSequence",
      "imageCommandTaskAuditLogNoSensitiveTokens",
      "readImageCommandWorkflowAudit",
      "APP_SERVER_METHOD_WORKFLOW_READ",
      "workflow/read",
      "imageCommandWorkflowRead",
      "imageCommandWorkflowAuditReadModelProjected",
      "imageCommandWorkflowAuditStepsProjected",
      "imageCommandWorkflowAuditSummaryRedacted",
      "image-command-run-${turnId}",
      "imageCommandWorkerUsedFixtureProviderAndModel",
      "imageCommandFixtureProvider",
      "bodyIncludesModel",
      "headerProviderId",
      "imageCommandWorkflowToolObserved",
      "imageCommandCreateTaskToolObserved",
      "guiImageCommandToolProcessVisible",
      "guiImageCommandTaskCardVisible",
      "guiImageCommandTaskCardTerminal",
      "guiImageCommandSingleTaskCard",
      "hasLoadedVisiblePreviewImage",
      "guiImageCommandNoDraftCard",
      "guiImageCommandNoTemplateTaskId",
      "readModelImageCommandTaskPreviewObserved",
      "IMAGE_COMMAND_ASSERTION_KEYS",
      "draft-image-",
      "{task_id}",
    ]);
    expectAllToContain(expect, imageCommandContent, [
      "expectedSessionId: SESSION_ID",
      'entrySource: "at_image_command"',
      "image_command_workflow",
      "snapshot.hasVisibleImageTaskProcess",
      "hasPresentationIntroInAssistantText",
      "hasPresentationCaptionAfterCard",
      "cardHasPresentationCaption",
      "completionAfterCard",
    ]);
    expectAllToContain(expect, rpcContent, [
      "modelProvider/create",
      "modelProviderKey/create",
      "media_defaults",
    ]);
    expectAllNotToContain(expect, content, [
      "createImageCommandTaskArtifact",
      "completeImageCommandTaskArtifact",
      "completeImageCommandTaskArtifactFile",
      "execute_skill",
      "agent_runtime_submit_turn",
    ]);
    expectAllNotToContain(expect, imageCommandContent, [
      'entrySource: "plain_image_intent"',
      "IMAGE_COMMAND_SKILL_NAME",
      "IMAGE_COMMAND_SKILL_TOOL_CALL_ID",
      "(snapshot.hasAssistantSummary || snapshot.hasDoneText) &&",
      "cardText.includes(presentationCaption) ||",
    ]);
  });

  it("covers content factory Article Workspace through runtime event append and artifact read", () => {
    const content = readSmokeScript();
    const contentFactoryScenario = readContentFactoryArticleWorkspaceScript();

    expectAllToContain(expect, content, [
      "content-factory-article-workspace",
      "content-factory-inline-image-article-workspace",
      "runContentFactoryArticleWorkspaceScenario",
      "runContentFactoryInlineImageArticleWorkspaceScenario",
      "pluginInstalled/save",
      "agentSession/turn/start",
      "agentSession/runtimeEvents/append",
      "workflow/read",
      "workflow/respond",
      "workflow/cancel",
      "workflow/retry",
      "artifact/read",
      "content_factory.workspace_patch",
      "contentFactoryWorkspacePatch",
      "内容工厂 Article Editor Fixture",
      "公众号文章草稿",
      "配图组",
      "视频分镜",
      "交付检查清单",
      "artifact-article-1",
      "artifact-image-1",
      "artifact-video-storyboard",
      "artifact-delivery-checklist",
      "artifact-image-regenerate-workspace-patch",
      "artifact-image-regenerated",
      "image_regenerate_job_1",
      "worker_dogfood",
      "contentFactoryArticleWorkspaceWorkerTurnStart",
      "contentFactoryArticleWorkspaceWorkerHostGenerationFixture",
      "contentFactoryHostGenerationAgentRuntimeRequest",
      "startContentFactoryHostGenerationFixture",
      "fixture-openai",
      "article-draft-document",
      "contentFactoryArticleWorkspaceWorkerTurnExecuted",
      "contentFactoryArticleWorkspaceWorkerAuditFactsHidden",
      "contentFactoryArticleWorkspaceWorkflowRead",
      "contentFactoryArticleWorkspaceWorkflowReadModelProjected",
      "contentFactoryArticleWorkspaceWorkflowRespondProjected",
      "contentFactoryArticleWorkspaceWorkflowCancelProjected",
      "contentFactoryArticleWorkspaceWorkflowRetryProjected",
      "content.article.generate",
      "options.scenario === CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO",
      "options.scenario !== CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO",
      "CONTENT_FACTORY_INLINE_IMAGE_SLOT_ID",
      "contentFactoryInlineImageTaskEventEmitted",
      "contentFactoryInlineImageArticleRestored",
      "mediaTaskArtifact/image/create",
      "mediaTaskArtifact/image/complete",
      "readModel.workerArticleObject?.hostManagedGenerationStatus ===",
      '"completed"',
      "CONTENT_FACTORY_ARTICLE_WORKSPACE_CONTRACT_REJECT_TURN_ID",
      "PLUGIN_WORKER_CONTRACT_UNSUPPORTED",
      "runRuntimeContractRejectionProbe",
      "contentFactoryArticleWorkspaceRuntimeContractRejection",
      "contentFactoryArticleWorkspaceRuntimeContractFailClosed",
      "contentFactoryArticleWorkspaceStoryboardObjectSelection",
      "contentFactoryArticleWorkspaceArticleObjectSelection",
      "contentFactoryArticleWorkspaceArticleCanvasSurface",
      "contentFactoryArticleWorkspaceArticleCanvasSurfaceVisible",
      "contentFactoryArticleWorkspaceEditedDraftUpdate",
      "contentFactoryArticleWorkspaceEditedDraftSessionReopened",
      "contentFactoryArticleWorkspaceEditedDraftReload",
      "contentFactoryArticleWorkspaceEditedDraftArtifactFrame",
      "contentFactoryArticleWorkspaceEditedDraftRestored",
      "E2E_EDITED_ARTICLE_DRAFT_RESTORED",
      "workspace-article-editor-related-articleDraft",
      "workspace-article-editor-related-videoStoryboard",
      "workspace-article-editor-title-candidates",
      "workspace-article-editor-research",
      "workspace-article-editor-outline",
      "workspace-article-editor-citations",
      "workspace-article-editor-image-slots",
      "workspace-article-editor-canvas",
      "documentCanvasText.includes",
      "snapshot.hasArticleCanvasContent",
      "readModel.hasImageSetObject",
      "readModel.hasStoryboardObject",
      "readModel.hasChecklistObject",
      "workspace-article-workspace-app-declared-renderer",
      "app_declared",
      "host_placeholder",
      "host_placeholder_only",
      "rendererContract",
      "not_loaded",
      "rendererExecutionModelVisible",
      "entryLoadPolicyVisible",
      "executableHostAbsent",
      "app_declared_renderer_placeholder_only",
      "./renderer/storyboard.tsx",
      "open_storyboard",
      "contentFactoryArticleWorkspaceStoryboardRendererContractPreserved",
      "已重新生成 2 张候选图",
      "workspace-article-editor-surface",
      "workspace-right-surface-host",
      "artifact_document.v1",
      "worker_invalid_json_output",
      "failureCategory",
      "retryAdvice",
      "inspect_worker_output",
      "contentFactoryArticleWorkspaceDoesNotUseModelTurn",
      "contentFactoryArticleWorkspaceActionResultPatchProjected",
    ]);
    expectAllToContain(expect, contentFactoryScenario, [
      "workflow.run.started",
      "workflow.step.waiting",
      "summarizeContentFactoryWorkflowRead",
      "summarizeContentFactoryWorkflowControl",
      "articleCanvasHasForbiddenTemplate",
      "reloadContentFactoryArticleWorkspaceSession",
      "reloadRendererDocument",
      "updateContentFactoryArticleWorkspaceEditedDraft",
      "waitForContentFactoryArticleWorkspaceEditedDraftRestored",
      "readContentFactoryArticleDraftObjectRef",
      "article-artifact-frame",
      "clickContentFactoryArticleArtifactFrame",
      "waitForContentFactoryArticleEditorOpened",
      "FORBIDDEN_CONTENT_FACTORY_ARTICLE_TEMPLATE_MARKERS",
      "metadataPanelsHidden",
      "snapshot.metadataPanelsHidden",
      "snapshot.hasFullArticleCanvas",
    ]);

    const contentWithoutForbiddenMarkerGuard =
      removeContentFactoryForbiddenMarkerGuard(content);
    expectAllNotToContain(expect, contentWithoutForbiddenMarkerGuard, [
      "受控宿主生成标题",
      "内容工厂插件化写作：让文章生产可审计",
    ]);
    expectAllNotToContain(expect, contentFactoryScenario, [
      'toggleTestId: "task-center-object-canvas-toggle"',
      "researchText.includes",
      "takeawaysText.length",
      "writingPlanText.length",
    ]);
    for (const assertionKey of CONTENT_FACTORY_ARTICLE_WORKSPACE_ASSERTION_KEYS) {
      expect(content).toContain(assertionKey);
    }
    expectAllNotToContain(expect, content, [
      'readModel.workerArticleObject?.hostManagedGenerationStatus ===\n        "unavailable"',
      "APP_SERVER_METHOD_CONTENT_FACTORY",
      "content_factory/start",
      "content_factory/generate",
      "BrowserView",
    ]);
  });

  it("covers multi-agent Team facts as parent Thread Evidence Pack data instead of Agent-first history", () => {
    const content = readSmokeScript();
    const scenarioContent = readMultiAgentTeamFixtureScenario();
    const regressionContent = readCurrentFixtureRegressionSmokeScript();

    expectAllToContain(expect, content, [
      "multi-agent-team",
      "MULTI_AGENT_TEAM_SCENARIO",
      MULTI_AGENT_TEAM_PROMPT,
      "renderMultiAgentTeamBackendEvents",
      "summarizeMultiAgentTeamEvidenceExport",
      "send-multi-agent-team-prompt-from-gui",
      "wait-gui-multi-agent-team-completed",
      "wait-read-model-multi-agent-team-completed",
      "export-multi-agent-team-evidence-pack",
      "evidencePackMultiAgentTeam",
      "readModelMultiAgentTeamCompleted",
      "multiAgentTeamPromptReachedBackend",
      "guiMultiAgentTeamInputSubmitted",
      "guiMultiAgentTeamCompleted",
      "readModelMultiAgentTeamFactsObserved",
      "evidencePackMultiAgentTeamExported",
      "evidencePackMultiAgentTeamParentThreadBound",
      "evidencePackMultiAgentTeamHandoffObserved",
      "evidencePackMultiAgentTeamWorkerNotificationObserved",
      "evidencePackMultiAgentTeamReviewLaneObserved",
      "multiAgentTeamNoAgentFirstHistory",
    ]);
    expectAllToContain(expect, scenarioContent, [
      'type: "subagent_status_changed"',
      'type: "team.changed"',
      'type: "task.changed"',
      'type: "agent.handoff"',
      'type: "agent.completed"',
      'type: "worker.notification"',
      'type: "artifact.snapshot"',
      "parentSessionId",
      "currentThreadId()",
      "currentTurnId()",
      "parent_thread",
      "review_lane",
      "parentSessionIds",
      "threadIds",
      "turnIds",
      "handoffIds",
      "workerNotificationIds",
      "reviewIds",
    ]);
    expectAllToContain(expect, regressionContent, [
      "Claw Multi-Agent Team parent Thread Evidence Pack Electron fixture",
      '"multi-agent-team"',
      "claw-chat-current-fixture-multi-agent-team-regression",
      "Multi-Agent Team parent Thread Evidence Pack Electron fixture",
    ]);

    const summary = summarizeMultiAgentTeamEvidenceExport(
      {
        evidencePack: {
          observabilitySummary: {
            team_facts: {
              status: "exported",
              parentSessionIds: ["sess-team"],
              childSessionIds: [
                "fixture-team-child-researcher",
                "fixture-team-child-reviewer",
              ],
              threadIds: ["thread-team"],
              turnIds: ["turn-team"],
              handoffIds: ["sess-team:handoff:fixture-team-child-researcher"],
              workerNotificationIds: [
                "fixture-team-child-researcher:completed",
              ],
              reviewIds: ["fixture-team-review-1"],
              teamPhases: ["running", "queued", "completed"],
              handoffCount: 1,
              workerNotificationCount: 1,
              reviewLaneCount: 1,
            },
          },
        },
        events: [
          { eventType: "subagent_status_changed" },
          { eventType: "team.changed" },
          { eventType: "worker.notification" },
        ],
        artifacts: [{ artifactRef: "fixture-team-worker-result" }],
      },
      {
        sessionId: "sess-team",
        threadId: "thread-team",
        turnId: "turn-team",
      },
    );

    expect(summary.exported).toBe(true);
    expect(summary.includesParentSession).toBe(true);
    expect(summary.includesThread).toBe(true);
    expect(summary.includesTurn).toBe(true);
    expect(summary.includesResearcher).toBe(true);
    expect(summary.includesReviewer).toBe(true);
    expect(summary.includesHandoff).toBe(true);
    expect(summary.includesWorkerNotification).toBe(true);
    expect(summary.includesReview).toBe(true);
    expect(summary.includesRunningPhase).toBe(true);
    expect(summary.includesQueuedPhase).toBe(true);
    expect(summary.includesCompletedPhase).toBe(true);
    expect(summary.hasSubagentStatusEvent).toBe(true);
    expect(summary.hasTeamChangedEvent).toBe(true);
    expect(summary.hasWorkerNotificationEvent).toBe(true);
    expect(summary.hasWorkerResultArtifact).toBe(true);
    expect(summary.forbiddenAgentFirstHistory).toBe(false);
    expect(scenarioContent).not.toContain("subagentSessionHistory:");
    expect(scenarioContent).not.toContain("childSubagentHistory:");
  });
}
