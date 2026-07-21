import {
  APP_SERVER_METHOD_PLUGIN_INSTALLED_SAVE,
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_UPDATE,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_WORKFLOW_CANCEL,
  APP_SERVER_METHOD_WORKFLOW_READ,
  APP_SERVER_METHOD_WORKFLOW_RESPOND,
  APP_SERVER_METHOD_WORKFLOW_RETRY,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_STEP_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID,
} from "./claw-chat-current-fixture-constants.mjs";

export function buildContentFactoryArticleWorkspaceScenarioAssertions({
  appServerRequestMethods,
  backendLedger,
  pageText,
  summary,
}) {
  const gui = summary.contentFactoryArticleWorkspaceGui ?? {};
  const readModel = summary.contentFactoryArticleWorkspaceReadModel ?? {};
  const artifactRead = summary.contentFactoryArticleWorkspaceArtifactRead ?? {};
  const workflowRead = summary.contentFactoryArticleWorkspaceWorkflowRead ?? {};
  const workflowCancel =
    summary.contentFactoryArticleWorkspaceWorkflowCancel ?? {};
  const workflowRetry =
    summary.contentFactoryArticleWorkspaceWorkflowRetry ?? {};
  const identity =
    summary.contentFactoryArticleWorkspaceSessionCreation?.identity ?? {};
  const storyboardRendererContract =
    readModel.storyboardArtifact?.rendererContract ?? {};
  return {
    contentFactoryArticleWorkspaceRuntimeEventsAppended:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
      ) &&
      summary.contentFactoryArticleWorkspaceRuntimeEventsAppend?.eventTypes?.includes(
        "artifact.snapshot",
      ) === true &&
      summary.contentFactoryArticleWorkspaceRuntimeEventsAppend?.eventTypes?.includes(
        "runtime.error",
      ) === true,
    contentFactoryArticleWorkspaceRightSurfaceRequested:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
      ) &&
      summary.contentFactoryArticleWorkspaceRightSurfaceRequest?.surfaceKind ===
        "articleWorkspace" &&
      summary.contentFactoryArticleWorkspaceRightSurfaceRequest?.origin ===
        "runtime" &&
      summary.contentFactoryArticleWorkspaceRightSurfaceRequest?.status ===
        "pending",
    contentFactoryArticleWorkspaceSessionOpenedFromSidebar:
      summary.contentFactoryArticleWorkspaceSessionCreation?.sessionId ===
        identity.sessionId &&
      summary.guiContentFactoryArticleWorkspaceSessionVisible
        ?.hasSessionTitle === true &&
      summary.guiContentFactoryArticleWorkspaceSessionOpened?.readModel
        ?.sessionId === identity.sessionId &&
      pageText.includes(CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE),
    contentFactoryArticleWorkspaceRightSurfaceVisible:
      summary.contentFactoryArticleWorkspaceRightSurface?.activeSurface ===
        "articleWorkspace" &&
      summary.contentFactoryArticleWorkspaceRightSurface?.rootVisible ===
        true &&
      gui.activeSurface === "articleWorkspace" &&
      gui.rootVisible === true,
    contentFactoryArticleWorkspaceFinalArticleFrameVisible:
      summary.contentFactoryArticleWorkspaceArtifactFrame?.visible === true &&
      summary.contentFactoryArticleWorkspaceArtifactFrame
        ?.hasArticlePreviewContent === true &&
      gui.hasArticleDraftObject === true &&
      (gui.hasArticleCanvasContent === true ||
        gui.hasFixtureOnlyArticleHidden === true),
    contentFactoryArticleWorkspacePageShowsObjects:
      gui.hasArticleEditorTitle === true &&
      gui.hasArticleDraftObject === true &&
      (gui.hasArticleCanvasContent === true ||
        gui.hasFixtureOnlyArticleHidden === true) &&
      readModel.hasImageSetObject === true &&
      readModel.hasStoryboardObject === true &&
      readModel.hasChecklistObject === true,
    contentFactoryArticleWorkspaceReadModelProjected:
      readModel.hasArticleWorkspace === true &&
      readModel.appId === "content-factory-app" &&
      readModel.sessionId === identity.sessionId &&
      readModel.objectCount >= 2 &&
      readModel.hasArticleObject === true &&
      readModel.hasImageSetObject === true &&
      readModel.hasStoryboardObject === true &&
      readModel.hasChecklistObject === true,
    contentFactoryArticleWorkspaceWorkflowFactsHidden:
      readModel.workflowUiFactsHidden === true &&
      readModel.workflowRunCount === 0 &&
      readModel.workflowStepCount === 0,
    contentFactoryArticleWorkspaceWorkflowReadModelProjected:
      appServerRequestMethods.includes(APP_SERVER_METHOD_WORKFLOW_READ) &&
      workflowRead.sessionId === identity.sessionId &&
      workflowRead.runCount >= 1 &&
      workflowRead.stepCount >= 3 &&
      workflowRead.actionCount >= 1 &&
      workflowRead.run?.workflowRunId ===
        identity.workflowRunId &&
      workflowRead.run?.workflowKey === "content_article_workflow" &&
      workflowRead.run?.status === "running" &&
      workflowRead.run?.appId === "content-factory-app" &&
      workflowRead.run?.taskId === identity.workerTaskId &&
      workflowRead.run?.turnId === identity.workerTurnId &&
      workflowRead.run?.stepCounts?.total === 3 &&
      workflowRead.run?.stepCounts?.completed === 2 &&
      workflowRead.run?.stepCounts?.waiting === 1 &&
      workflowRead.waitingStep?.stepId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_REVIEW_STEP_ID &&
      workflowRead.waitingStep?.status === "waiting" &&
      workflowRead.waitingStep?.requestId ===
        identity.workflowReviewRequestId &&
      workflowRead.waitingStep?.agentActionType === "ask_user" &&
      workflowRead.respondAction == null,
    contentFactoryArticleWorkspaceWorkflowRespondHiddenWithoutPendingAction:
      !appServerRequestMethods.includes(APP_SERVER_METHOD_WORKFLOW_RESPOND) &&
      workflowRead.respondAction == null,
    contentFactoryArticleWorkspaceWorkflowCancelProjected:
      appServerRequestMethods.includes(APP_SERVER_METHOD_WORKFLOW_CANCEL) &&
      workflowCancel.sessionId ===
        identity.sessionId &&
      workflowCancel.run?.workflowRunId ===
        identity.workflowCancelRunId &&
      workflowCancel.run?.status === "canceled" &&
      workflowCancel.run?.stepCounts?.canceled === 1 &&
      workflowCancel.step?.stepId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_CANCEL_STEP_ID &&
      workflowCancel.step?.status === "canceled",
    contentFactoryArticleWorkspaceWorkflowRetryProjected:
      appServerRequestMethods.includes(APP_SERVER_METHOD_WORKFLOW_RETRY) &&
      workflowRetry.sessionId ===
        identity.sessionId &&
      Boolean(workflowRetry.rescheduledTurnId) &&
      workflowRetry.run?.workflowRunId ===
        identity.workflowRetryRunId &&
      workflowRetry.run?.status === "retrying" &&
      workflowRetry.run?.stepCounts?.retrying === 1 &&
      workflowRetry.run?.retrySource === "workflow/retry" &&
      workflowRetry.run?.retryReasonCode === "fixture_retry_requested" &&
      workflowRetry.run?.retrySourceTurnId ===
        identity.workerTurnId &&
      workflowRetry.run?.retryRescheduledTurnId ===
        workflowRetry.rescheduledTurnId &&
      workflowRetry.step?.stepId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKFLOW_RETRY_STEP_ID &&
      workflowRetry.step?.status === "retrying" &&
      workflowRetry.step?.attempt === 2 &&
      workflowRetry.step?.retrySource === "workflow/retry" &&
      workflowRetry.step?.retryReasonCode === "fixture_retry_requested" &&
      workflowRetry.step?.retrySourceTurnId ===
        identity.workerTurnId &&
      workflowRetry.step?.retryRescheduledTurnId ===
        workflowRetry.rescheduledTurnId &&
      summary.contentFactoryArticleWorkspaceWorkerHostGenerationFixture
        ?.requestCount >= 2,
    contentFactoryArticleWorkspaceArtifactsProjected:
      readModel.articleArtifact?.artifactRef ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID &&
      readModel.articleArtifact?.kind === "artifact_document" &&
      readModel.articleArtifact?.artifactSchema === "artifact_document.v1" &&
      readModel.articleArtifact?.artifactDocumentId ===
        "artifact-document:content-factory-app:artifact-article-1" &&
      readModel.articleArtifact?.articleWorkspaceObjectKind === "articleDraft",
    contentFactoryArticleWorkspaceRendererArtifactsProjected:
      readModel.storyboardArtifact?.artifactRef ===
        "artifact-video-storyboard" &&
      readModel.storyboardArtifact?.kind === "artifact_document" &&
      readModel.storyboardArtifact?.surfaceKind === "storyboard" &&
      readModel.storyboardArtifact?.articleWorkspaceObjectKind ===
        "videoStoryboard" &&
      readModel.storyboardArtifact?.articleWorkspaceSurfaceKind ===
        "storyboard" &&
      readModel.checklistArtifact?.artifactRef ===
        "artifact-delivery-checklist" &&
      readModel.checklistArtifact?.kind === "artifact_document" &&
      readModel.checklistArtifact?.surfaceKind === "checklist" &&
      readModel.checklistArtifact?.articleWorkspaceObjectKind ===
        "deliveryChecklist" &&
      readModel.checklistArtifact?.articleWorkspaceSurfaceKind === "checklist",
    contentFactoryArticleWorkspaceArtifactReadContent:
      appServerRequestMethods.includes(APP_SERVER_METHOD_ARTIFACT_READ) &&
      artifactRead.artifactRef ===
        (readModel.workerArticleObject?.previewArtifactId ||
          CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID) &&
      artifactRead.kind === "artifact_document" &&
      artifactRead.contentStatus === "available" &&
      artifactRead.contentIncludesSchema === true &&
      artifactRead.contentIncludesDocumentId === true &&
      artifactRead.documentObjectKind === "articleDraft" &&
      artifactRead.documentBlockCount >= 1 &&
      artifactRead.documentRichTextLength > 160 &&
      artifactRead.contentIncludesArticleTitle === true &&
      artifactRead.richTextHasForbiddenTemplate !== true &&
      artifactRead.contentIncludesWorkerArticle === true,
    contentFactoryArticleWorkspaceArticleCanvasSurfaceVisible:
      summary.contentFactoryArticleWorkspaceArticleObjectSelection?.selected ===
        true &&
      summary.contentFactoryArticleWorkspaceArticleObjectSelection
        ?.objectKind === "articleDraft" &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.rootVisible === true &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.documentCanvasVisible === true &&
      (summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasDocumentPreview === true ||
        summary.contentFactoryArticleWorkspaceArticleCanvasSurface
          ?.fixtureOnlyArticleHidden === true) &&
      (summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasFullArticleCanvas === true ||
        summary.contentFactoryArticleWorkspaceArticleCanvasSurface
          ?.fixtureOnlyArticleHidden === true) &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.articleCanvasHasForbiddenTemplate !== true &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.metadataPanelsHidden === true &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.structurePresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.researchPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.outlinePresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.citationsPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.imageSlotsPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.takeawaysPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.writingPlanPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.reviewPresent === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.workflowUiRailHidden === true &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.contentFactoryOrchestrationVisible === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.contentFactoryOrchestrationStepCount === 0 &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasVisibleContentFactoryOrchestration === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasVisibleSubagents === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasVisibleSkillRef === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasVisibleConnectors === false &&
      summary.contentFactoryArticleWorkspaceArticleCanvasSurface
        ?.hasVisibleHooks === false,
    contentFactoryArticleWorkspaceEditedDraftRestored:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_UPDATE) &&
      summary.contentFactoryArticleWorkspaceEditedDraftUpdate?.sessionId ===
        identity.sessionId &&
      summary.contentFactoryArticleWorkspaceEditedDraftUpdate?.objectRef
        ?.kind === "articleDraft" &&
      summary.contentFactoryArticleWorkspaceEditedDraftUpdate
        ?.markdownMarker === "E2E_EDITED_ARTICLE_DRAFT_RESTORED" &&
      summary.contentFactoryArticleWorkspaceEditedDraftReload?.renderer
        ?.supportsAppServer === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftReload?.sessionVisible
        ?.hasSessionTitle === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftSessionReopened
        ?.readModel?.sessionId ===
        identity.sessionId &&
      summary.contentFactoryArticleWorkspaceEditedDraftArtifactFrame
        ?.visible === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftArtifactFrame
        ?.hasEditedDraftMarker === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftRestored
        ?.canvasVisible === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftRestored
        ?.markerVisibleInCanvas === true &&
      summary.contentFactoryArticleWorkspaceEditedDraftRestored
        ?.hasEditedTitle === true &&
      readModel.editedDraft?.markdownIncludesEditedDraftMarker === true &&
      readModel.editedDraft?.objectRef?.kind === "articleDraft" &&
      readModel.workerArticleObject?.markdownIncludesEditedDraftMarker ===
        true &&
      readModel.workerArticleObject?.sourceEdited === true,
    contentFactoryArticleWorkspaceWorkerFailureEvidence:
      readModel.failedWorkerEvidence?.taskId === "image_job_1" &&
      readModel.failedWorkerEvidence?.status === "failed" &&
      readModel.failedWorkerEvidence?.errorCode ===
        "worker_invalid_json_output" &&
      readModel.failedWorkerEvidence?.failureCategory === "worker_output" &&
      readModel.failedWorkerEvidence?.retryable === false &&
      readModel.failedWorkerEvidence?.retryAdvice === "inspect_worker_output" &&
      readModel.failedWorkerEvidence?.retryAttempt === 0 &&
      readModel.failedWorkerEvidence?.retryMaxAttempts === 0,
    contentFactoryArticleWorkspaceWorkerTurnExecuted:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_PLUGIN_INSTALLED_SAVE,
      ) &&
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) &&
      summary.contentFactoryArticleWorkspaceInstalledStateSave?.appId ===
        "content-factory-app" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.turnStatus ===
        "inProgress" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.taskId ===
        identity.workerTaskId &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.readModel
        ?.workerTurnStatus === "completed" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.readModel
        ?.workerTurnId === identity.workerTurnId &&
      readModel.workerDogfoodEvidence?.taskId ===
        identity.workerTaskId &&
      readModel.workerDogfoodEvidence?.taskKind ===
        "content.article.generate" &&
      readModel.workerDogfoodEvidence?.status === "completed" &&
      readModel.workerDogfoodEvidence?.artifactKind ===
        "content_factory.workspace_patch" &&
      readModel.workerArticleObject?.sourceTaskId ===
        identity.workerTaskId &&
      readModel.workerArticleObject?.markdownIncludesResearch === true &&
      readModel.workerArticleObject?.markdownIncludesDraft === true &&
      readModel.workerArticleObject?.hostManagedGenerationStatus ===
        "completed" &&
      !readModel.workerArticleObject?.hostManagedGenerationReasonCode &&
      readModel.workerArticleObject?.hostManagedGenerationOutputIds?.includes(
        "article-draft-document",
      ) === true &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart
        ?.hostGenerationFixture?.requestCount >= 1 &&
      readModel.workerArticleObject?.researchRoundCount >= 3 &&
      readModel.workerArticleObject?.imageSlotCount >= 3,
    contentFactoryArticleWorkspaceWorkerAuditFactsHidden:
      !readModel.workerDogfoodEvidence?.workflowKey &&
      (readModel.workerDogfoodEvidence?.subagents?.length ?? 0) === 0 &&
      (readModel.workerDogfoodEvidence?.skillRefs?.length ?? 0) === 0 &&
      (readModel.workerDogfoodEvidence?.cliRefs?.length ?? 0) === 0 &&
      (readModel.workerDogfoodEvidence?.connectorRefs?.length ?? 0) === 0 &&
      (readModel.workerDogfoodEvidence?.hookRefs?.length ?? 0) === 0 &&
      (readModel.workerDogfoodEvidence?.orchestrationStepCount ?? 0) === 0,
    contentFactoryArticleWorkspaceActionResultPatchProjected:
      summary.contentFactoryArticleWorkspaceActionResultRuntimeEventsAppend
        ?.eventTypes?.[0] === "artifact.snapshot" &&
      readModel.completedActionWorkerEvidence?.taskId ===
        "image_regenerate_job_1" &&
      readModel.completedActionWorkerEvidence?.status === "completed" &&
      readModel.actionResultArtifacts?.some(
        (artifact) =>
          artifact.artifactRef === "artifact-image-regenerated" &&
          artifact.kind === "artifact_document",
      ) === true &&
      readModel.actionResultArtifacts?.some(
        (artifact) =>
          artifact.artifactRef ===
            "artifact-image-regenerate-workspace-patch" &&
          artifact.kind === "content_factory.workspace_patch",
      ) === true,
    contentFactoryArticleWorkspaceStoryboardRendererContractPreserved:
      summary.contentFactoryArticleWorkspaceStoryboardObjectSelection
        ?.objectKind === "videoStoryboard" &&
      (summary.contentFactoryArticleWorkspaceStoryboardObjectSelection
        ?.selected === true ||
        summary.contentFactoryArticleWorkspaceStoryboardObjectSelection
          ?.candidatePresent === true) &&
      storyboardRendererContract.pluginId === "content-factory-app" &&
      storyboardRendererContract.rendererKind === "app_declared" &&
      storyboardRendererContract.executionMode === "host_placeholder" &&
      storyboardRendererContract.reasonCode ===
        "app_declared_renderer_placeholder_only" &&
      storyboardRendererContract.entry === "./renderer/storyboard.tsx" &&
      storyboardRendererContract.allowedOutputArtifactKinds?.includes(
        "content_factory.workspace_patch",
      ) === true,
    contentFactoryArticleWorkspaceDoesNotUseModelTurn: backendLedger.every(
      (entry) => entry.kind !== "turnStart",
    ),
  };
}
