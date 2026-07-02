import {
  APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE,
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_UPDATE,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_TITLE,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID,
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
  const storyboardRendererContract =
    readModel.storyboardArtifact?.rendererContract ?? {};
  const remoteRuntimeRejection =
    summary.contentFactoryArticleWorkspaceRemoteRuntimeRejection ?? {};

  return {
    contentFactoryArticleWorkspaceRuntimeEventsAppended:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
      ) &&
      summary.contentFactoryArticleWorkspaceRuntimeEventsAppend
        ?.eventTypes?.[0] === "artifact.snapshot" &&
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
        CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID &&
      summary.guiContentFactoryArticleWorkspaceSessionVisible
        ?.hasSessionTitle === true &&
      summary.guiContentFactoryArticleWorkspaceSessionOpened?.readModel
        ?.sessionId === CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID &&
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
      gui.hasArticleCanvasContent === true,
    contentFactoryArticleWorkspacePageShowsObjects:
      gui.hasArticleEditorTitle === true &&
      gui.hasArticleDraftObject === true &&
      gui.hasArticleCanvasContent === true &&
      readModel.hasImageSetObject === true &&
      readModel.hasStoryboardObject === true &&
      readModel.hasChecklistObject === true,
    contentFactoryArticleWorkspaceReadModelProjected:
      readModel.hasArticleWorkspace === true &&
      readModel.appId === "content-factory-app" &&
      readModel.sessionId === CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID &&
      readModel.objectCount >= 2 &&
      readModel.hasArticleObject === true &&
      readModel.hasImageSetObject === true &&
      readModel.hasStoryboardObject === true &&
      readModel.hasChecklistObject === true,
    contentFactoryArticleWorkspaceWorkflowFactsHidden:
      readModel.workflowUiFactsHidden === true &&
      readModel.workflowRunCount === 0 &&
      readModel.workflowStepCount === 0,
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
      artifactRead.documentRichTextLength > 300 &&
      artifactRead.contentIncludesArticleTitle === true &&
      artifactRead.contentIncludesWorkerArticle === true,
    contentFactoryArticleWorkspaceArticleWritingStructureVisible:
      summary.contentFactoryArticleWorkspaceArticleObjectSelection?.selected ===
        true &&
      summary.contentFactoryArticleWorkspaceArticleObjectSelection
        ?.objectKind === "articleDraft" &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.structurePresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.researchPresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.outlinePresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.citationsPresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.imageSlotsPresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.documentCanvasVisible === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.documentImageSlotsPresent === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasDocumentPreview === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasWritingStructureTitle === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasResearchRound === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasOutline === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasTitleCandidate === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasKeyTakeaway === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasCitation === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasImagePrompt === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasWritingPlan === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.workflowUiRailHidden === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.contentFactoryOrchestrationVisible === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.contentFactoryOrchestrationStepCount === 0 &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasVisibleContentFactoryOrchestration === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasVisibleSubagents === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasVisibleSkillRef === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasVisibleConnectors === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasVisibleHooks === false &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasReviewNote === true &&
      summary.contentFactoryArticleWorkspaceArticleWritingStructure
        ?.hasFullArticleCanvas === true,
    contentFactoryArticleWorkspaceEditedDraftRestored:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_UPDATE) &&
      summary.contentFactoryArticleWorkspaceEditedDraftUpdate?.sessionId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID &&
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
        CONTENT_FACTORY_ARTICLE_WORKSPACE_SESSION_ID &&
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
        APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE,
      ) &&
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) &&
      summary.contentFactoryArticleWorkspaceInstalledStateSave?.appId ===
        "content-factory-app" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.turnStatus ===
        "accepted" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.taskId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.readModel
        ?.workerTurnStatus === "completed" &&
      summary.contentFactoryArticleWorkspaceWorkerTurnStart?.readModel
        ?.workerTurnId === CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TURN_ID &&
      readModel.workerDogfoodEvidence?.taskId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID &&
      readModel.workerDogfoodEvidence?.taskKind ===
        "content.article.generate" &&
      readModel.workerDogfoodEvidence?.status === "completed" &&
      readModel.workerDogfoodEvidence?.artifactKind ===
        "content_factory.workspace_patch" &&
      readModel.workerArticleObject?.sourceTaskId ===
        CONTENT_FACTORY_ARTICLE_WORKSPACE_WORKER_TASK_ID &&
      readModel.workerArticleObject?.markdownIncludesResearch === true &&
      readModel.workerArticleObject?.markdownIncludesDraft === true &&
      readModel.workerArticleObject?.hostManagedGenerationStatus ===
        "unavailable" &&
      readModel.workerArticleObject?.hostManagedGenerationReasonCode ===
        "host_generation_unavailable" &&
      readModel.workerArticleObject?.hostManagedGenerationOutputIds?.length ===
        0 &&
      readModel.workerArticleObject?.researchRoundCount >= 3 &&
      readModel.workerArticleObject?.imageSlotCount >= 3,
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
    contentFactoryArticleWorkspaceRemoteRuntimeFailClosed:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) &&
      remoteRuntimeRejection.turnStatus === "accepted" &&
      remoteRuntimeRejection.appId === "creator-pack" &&
      remoteRuntimeRejection.errorCode ===
        "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED" &&
      remoteRuntimeRejection.failureCategory === "configuration" &&
      remoteRuntimeRejection.readModel?.status === "failed" &&
      remoteRuntimeRejection.readModel?.errorCode ===
        "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED",
    contentFactoryArticleWorkspaceDoesNotUseModelTurn: backendLedger.every(
      (entry) => entry.kind !== "turnStart",
    ),
  };
}
