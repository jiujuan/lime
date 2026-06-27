import {
  APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE,
  APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
  APP_SERVER_METHOD_ARTIFACT_READ,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE,
  CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID,
} from "./claw-chat-current-fixture-constants.mjs";

export function buildContentFactoryProductProfileScenarioAssertions({
  appServerRequestMethods,
  backendLedger,
  pageText,
  summary,
}) {
  const gui = summary.contentFactoryProductProfileGui ?? {};
  const readModel = summary.contentFactoryProductProfileReadModel ?? {};
  const artifactRead = summary.contentFactoryProductProfileArtifactRead ?? {};
  const rendererHost = gui.rendererHost ?? {};
  const remoteRuntimeRejection =
    summary.contentFactoryProductProfileRemoteRuntimeRejection ?? {};

  return {
    contentFactoryProductProfileRuntimeEventsAppended:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND,
      ) &&
      summary.contentFactoryProductProfileRuntimeEventsAppend?.eventTypes?.[0] ===
        "artifact.snapshot" &&
      summary.contentFactoryProductProfileRuntimeEventsAppend?.eventTypes?.includes(
        "runtime.error",
      ) === true,
    contentFactoryProductProfileRightSurfaceRequested:
      appServerRequestMethods.includes(
        APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
      ) &&
      summary.contentFactoryProductProfileRightSurfaceRequest?.surfaceKind ===
        "productProfile" &&
      summary.contentFactoryProductProfileRightSurfaceRequest?.origin ===
        "runtime" &&
      summary.contentFactoryProductProfileRightSurfaceRequest?.status ===
        "pending",
    contentFactoryProductProfileSessionOpenedFromSidebar:
      summary.contentFactoryProductProfileSessionCreation?.sessionId ===
        CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID &&
      summary.guiContentFactoryProductProfileSessionVisible
        ?.hasSessionTitle === true &&
      summary.guiContentFactoryProductProfileSessionOpened?.readModel
        ?.sessionId === CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID &&
      pageText.includes(CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_TITLE),
    contentFactoryProductProfileRightSurfaceVisible:
      summary.contentFactoryProductProfileRightSurface?.stable
        ?.activeSurface === "productProfile" &&
      summary.contentFactoryProductProfileRightSurface?.stable?.rootVisible ===
        true &&
      gui.activeSurface === "productProfile" &&
      gui.rootVisible === true,
    contentFactoryProductProfilePageShowsObjects:
      gui.hasProductProfileTitle === true &&
      gui.hasArticleTitle === true &&
      gui.hasImageSetTitle === true &&
      gui.hasStoryboardTitle === true &&
      gui.hasChecklistTitle === true &&
      gui.hasWorkerEvidenceTitle === true,
    contentFactoryProductProfileReadModelProjected:
      readModel.hasProductWorkspace === true &&
      readModel.appId === "content-factory-app" &&
      readModel.sessionId === CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID &&
      readModel.objectCount >= 2 &&
      readModel.hasArticleObject === true &&
      readModel.hasImageSetObject === true &&
      readModel.hasStoryboardObject === true &&
      readModel.hasChecklistObject === true,
    contentFactoryProductProfileArtifactsProjected:
      readModel.articleArtifact?.artifactRef ===
        CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID &&
      readModel.articleArtifact?.kind === "artifact_document" &&
      readModel.articleArtifact?.artifactSchema === "artifact_document.v1" &&
      readModel.articleArtifact?.artifactDocumentId ===
        "artifact-document:content-factory-app:artifact-article-1" &&
      readModel.articleArtifact?.productProfileObjectKind === "articleDraft",
    contentFactoryProductProfileRendererArtifactsProjected:
      readModel.storyboardArtifact?.artifactRef === "artifact-video-storyboard" &&
      readModel.storyboardArtifact?.kind === "artifact_document" &&
      readModel.storyboardArtifact?.surfaceKind === "storyboard" &&
      readModel.storyboardArtifact?.productProfileObjectKind ===
        "videoStoryboard" &&
      readModel.storyboardArtifact?.productProfileSurfaceKind ===
        "storyboard" &&
      readModel.checklistArtifact?.artifactRef ===
        "artifact-delivery-checklist" &&
      readModel.checklistArtifact?.kind === "artifact_document" &&
      readModel.checklistArtifact?.surfaceKind === "checklist" &&
      readModel.checklistArtifact?.productProfileObjectKind ===
        "deliveryChecklist" &&
      readModel.checklistArtifact?.productProfileSurfaceKind === "checklist",
    contentFactoryProductProfileArtifactReadContent:
      appServerRequestMethods.includes(APP_SERVER_METHOD_ARTIFACT_READ) &&
      artifactRead.artifactRef ===
        CONTENT_FACTORY_PRODUCT_PROFILE_ARTICLE_ARTIFACT_ID &&
      artifactRead.kind === "artifact_document" &&
      artifactRead.contentStatus === "available" &&
      artifactRead.contentIncludesSchema === true &&
      artifactRead.contentIncludesDocumentId === true &&
      artifactRead.contentIncludesArticleTitle === true,
    contentFactoryProductProfileWorkerFailureEvidence:
      readModel.failedWorkerEvidence?.taskId === "image_job_1" &&
      readModel.failedWorkerEvidence?.status === "failed" &&
      readModel.failedWorkerEvidence?.errorCode ===
        "worker_invalid_json_output" &&
      readModel.failedWorkerEvidence?.failureCategory === "worker_output" &&
      readModel.failedWorkerEvidence?.retryable === false &&
      readModel.failedWorkerEvidence?.retryAdvice === "inspect_worker_output" &&
      readModel.failedWorkerEvidence?.retryAttempt === 0 &&
      readModel.failedWorkerEvidence?.retryMaxAttempts === 0 &&
      gui.hasWorkerEvidenceTitle === true,
    contentFactoryProductProfileWorkerTurnExecuted:
      appServerRequestMethods.includes(APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE) &&
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) &&
      summary.contentFactoryProductProfileInstalledStateSave?.appId ===
        "content-factory-app" &&
      summary.contentFactoryProductProfileWorkerTurnStart?.turnStatus ===
        "accepted" &&
      summary.contentFactoryProductProfileWorkerTurnStart?.taskId ===
        CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID &&
      readModel.workerDogfoodEvidence?.taskId ===
        CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID &&
      readModel.workerDogfoodEvidence?.status === "completed" &&
      readModel.workerDogfoodEvidence?.artifactKind ===
        "content_factory.workspace_patch" &&
      readModel.workerDogfoodEvidence?.outputObjectCount >= 1,
    contentFactoryProductProfileActionResultPatchProjected:
      summary.contentFactoryProductProfileActionResultRuntimeEventsAppend
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
    contentFactoryProductProfileRendererHostPlaceholderVisible:
      summary.contentFactoryProductProfileStoryboardObjectSelection
        ?.selected === true &&
      rendererHost.visible === true &&
      rendererHost.pluginVisible === true &&
      rendererHost.rendererKindVisible === true &&
      rendererHost.executionModeVisible === true &&
      rendererHost.rendererExecutionModelVisible === true &&
      rendererHost.entryLoadPolicyVisible === true &&
      rendererHost.executableHostAbsent === true &&
      rendererHost.reasonVisible === true &&
      rendererHost.allowedOutputVisible === true &&
      rendererHost.entryVisible === true &&
      rendererHost.actionVisible === true,
    contentFactoryProductProfileRemoteRuntimeFailClosed:
      appServerRequestMethods.includes(APP_SERVER_METHOD_SESSION_TURN_START) &&
      remoteRuntimeRejection.turnStatus === "accepted" &&
      remoteRuntimeRejection.appId === "creator-pack" &&
      remoteRuntimeRejection.errorCode ===
        "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED" &&
      remoteRuntimeRejection.failureCategory === "configuration" &&
      remoteRuntimeRejection.readModel?.status === "failed" &&
      remoteRuntimeRejection.readModel?.errorCode ===
        "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED",
    contentFactoryProductProfileDoesNotUseModelTurn: backendLedger.every(
      (entry) => entry.kind !== "turnStart",
    ),
  };
}
