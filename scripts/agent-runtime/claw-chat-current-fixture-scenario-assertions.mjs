import fs from "node:fs";
import {
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
  APP_SERVER_METHOD_SESSION_TURN_CANCEL,
  APP_SERVER_METHOD_WORKFLOW_READ,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  CONTINUE_PROMPT,
  CONTENT_FACTORY_INLINE_IMAGE_URL,
  EVENT_READ_PROBE_TOOL_NAME,
  EVENT_READ_PROBE_TURN_ID,
  GOAL_PROMPT,
  IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
  IMAGE_COMMAND_PROMPT,
  IMAGE_FIXTURE_MODEL,
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_RICH_RESTORE_PATH_NAME,
  INPUTBAR_RICH_RESTORE_PROMPT,
  NEWS_PROMPT,
  PLAN_PROMPT,
  PLAN_STEPS,
  SESSION_ID,
  SOUL_STYLE_SCENARIO,
} from "./claw-chat-current-fixture-constants.mjs";
import { buildContentFactoryArticleWorkspaceScenarioAssertions } from "./claw-chat-current-fixture-content-factory-assertions.mjs";
import {
  buildMcpStructuredContentScenarioAssertions,
  buildMediaReferenceScenarioAssertions,
  buildMultiAgentTeamScenarioAssertions,
  buildReasoningFirstVisibleScenarioAssertions,
} from "./claw-chat-current-fixture-runtime-surface-assertions.mjs";
import {
  buildExpertSkillsRuntimeScenarioAssertions,
  buildSkillsRuntimeScenarioAssertions,
} from "./claw-chat-current-fixture-skills-runtime-assertions.mjs";
import { buildPendingSteerPopFrontResumeScenarioAssertions } from "./claw-chat-current-fixture-pending-steer-assertions.mjs";
import { buildTerminalScenarioAssertions } from "./claw-chat-current-fixture-terminal-assertions.mjs";
import { buildWebToolsRenderingScenarioAssertions } from "./claw-chat-current-fixture-web-tools-assertions.mjs";
import { buildSoulStyleScenarioAssertions } from "./claw-chat-current-fixture-soul-style.mjs";

function readImageCommandTaskFromHarness(harness) {
  const launch =
    harness?.image_command_intent ?? harness?.imageCommandIntent ?? null;
  const requestContext = launch?.request_context ?? launch?.requestContext;
  return (
    launch?.image_task ??
    launch?.imageTask ??
    requestContext?.image_task ??
    requestContext?.imageTask ??
    null
  );
}

export function buildScenarioAssertions(context) {
  const {
    appServerRequestMethods,
    backendLedger,
    collaborationMode,
    continueTurnStart,
    expectedExpertHarnessSkillRef,
    expertHarnessMetadata,
    expertHarnessSkillRefs,
    expertRuntimeMetadata,
    expertPanelSkillsRuntimeTurnStart,
    expertSkillsRuntimeTurnStart,
    expectedImageIntentRoutedPrompt,
    goalHarness,
    goalObjectiveText,
    goalTurnStart,
    imageCommandHarness,
    imageCommandTurnStart,
    guiTurnStartReachedBackend,
    hasCancelPhase,
    inputbarPendingSteerActiveTurnStart,
    inputbarRichRestoreTurnStart,
    isAnyExpertSkillsRuntimeScenario,
    isCancelThenContinueScenario,
    isContentFactoryArticleWorkspaceScenario,
    isContentFactoryInlineImageArticleWorkspaceScenario,
    isExpertPanelSkillsRuntimeScenario,
    isExpertPlazaSkillsRuntimeScenario,
    isGoalScenario,
    isImageCommandScenario,
    isInputbarPendingSteerMultiQueueScenario,
    isInputbarPendingSteerPopFrontResumeScenario,
    isInputbarPendingSteerRichRestoreScenario,
    isInputbarRichRestoreScenario,
    isMcpStructuredContentScenario,
    isMediaReferenceScenario,
    isMultiAgentTeamScenario,
    isPlanScenario,
    isReasoningFirstVisibleScenario,
    isTerminalCanceledAfterAnswerScenario,
    isTerminalFailedAfterAnswerScenario,
    isRightSurfaceVisualMatrixScenario,
    isSkillsRuntimeScenario,
    isSoulStyleScenario,
    isTerminalStaleGuardScenario,
    isWebToolsRenderingScenario,
    latestTurnCancel,
    manualEnableRuntimeBinding,
    manualEnableRuntimeMetadata,
    mcpStructuredContentTurnStart,
    mediaReferenceTurnStart,
    multiAgentTeamTurnStart,
    pageText,
    planImplementationTurnStart,
    planTurnStart,
    skillsRuntimeTurnStart,
    explicitSkillsRuntimeTurnStart,
    manualEnableSkillsRuntimeTurnStart,
    summary,
    terminalCanceledAfterAnswerTurnStart,
    terminalFailedAfterAnswerTurnStart,
    terminalStaleGuardFirstTurnStart,
    terminalStaleGuardSecondTurnStart,
    webToolsRenderingTurnStart,
    reasoningFirstVisibleTurnStart,
    workspace,
  } = context;
  const rightSurfaceVisualMatrix = summary.rightSurfaceVisualMatrix ?? {};
  const rightSurfaceVisualCaptures = rightSurfaceVisualMatrix.captures ?? {};
  const rightSurfaceVisualAppSurface =
    rightSurfaceVisualCaptures.appSurface?.stable?.pluginSurface ?? {};
  const imageCommandTask = readImageCommandTaskFromHarness(imageCommandHarness);
  const imageCommandRuntimeContract =
    imageCommandTask?.runtime_contract ?? imageCommandTask?.runtimeContract;
  const imageCommandContractKey =
    imageCommandTask?.modality_contract_key ??
    imageCommandTask?.modalityContractKey ??
    imageCommandRuntimeContract?.contract_key ??
    imageCommandRuntimeContract?.contractKey;
  const scenarioAssertions = isSoulStyleScenario
    ? buildSoulStyleScenarioAssertions({ summary, guiTurnStartReachedBackend })
    : isContentFactoryArticleWorkspaceScenario
      ? {
          ...buildContentFactoryArticleWorkspaceScenarioAssertions({
            appServerRequestMethods,
            backendLedger,
            pageText,
            summary,
          }),
          ...(isContentFactoryInlineImageArticleWorkspaceScenario
            ? {
                contentFactoryInlineImageTaskSlotPersisted:
                  summary.contentFactoryInlineImageTaskCreated?.payloadUsage ===
                    "document-inline" &&
                  summary.contentFactoryInlineImageTaskCreated
                    ?.relationshipSlotId === "article-inline-image-slot-e2e",
                contentFactoryInlineImageTaskEventEmitted:
                  summary.contentFactoryInlineImageTaskSubmittedEvent
                    ?.emitted === true &&
                  summary.contentFactoryInlineImageTaskSubmittedEvent
                    ?.slotId === "article-inline-image-slot-e2e",
                contentFactoryInlineImageTaskCompleted:
                  summary.contentFactoryInlineImageTaskCompleted
                    ?.normalizedStatus === "succeeded" &&
                  summary.contentFactoryInlineImageTaskCompleted
                    ?.relationshipSlotId === "article-inline-image-slot-e2e" &&
                  summary.contentFactoryInlineImageTaskCompleted
                    ?.firstImageUrl === CONTENT_FACTORY_INLINE_IMAGE_URL,
                contentFactoryInlineImageReadModelRestored:
                  summary.contentFactoryInlineImageReadModel?.hasInlineTitle ===
                    true &&
                  summary.contentFactoryInlineImageReadModel?.hasAnchorText ===
                    true &&
                  summary.contentFactoryInlineImageReadModel?.hasImageUrl ===
                    true &&
                  summary.contentFactoryInlineImageReadModel
                    ?.hasPendingProtocol === false,
                contentFactoryInlineImageArticleRestored:
                  summary.contentFactoryInlineImageCanvas?.hasImageUrl ===
                    true &&
                  summary.contentFactoryInlineImageCanvas?.hasRenderedImage ===
                    true &&
                  summary.contentFactoryInlineImageCanvas
                    ?.hasRenderedImageNearAnchor === true &&
                  summary.contentFactoryInlineImageCanvas
                    ?.hasUnavailablePlaceholderForExpected === false &&
                  summary.contentFactoryInlineImageCanvas
                    ?.hasPendingProtocol === false,
              }
            : {}),
        }
      : isRightSurfaceVisualMatrixScenario
        ? {
            rightSurfaceVisualMatrixRequestedThroughAppServer:
              appServerRequestMethods.includes(
                APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
              ) &&
              appServerRequestMethods.includes(
                APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
              ) &&
              Boolean(rightSurfaceVisualMatrix.requests?.files?.requestId) &&
              Boolean(
                rightSurfaceVisualMatrix.requests?.objectCanvas?.requestId,
              ) &&
              Boolean(rightSurfaceVisualMatrix.requests?.browser?.requestId) &&
              Boolean(
                rightSurfaceVisualMatrix.requests?.appSurfaceContentFactory
                  ?.requestId,
              ) &&
              Boolean(
                rightSurfaceVisualMatrix.requests?.appSurfacePromptLab
                  ?.requestId,
              ),
            rightSurfaceVisualMatrixFilesSurfaceVisible:
              rightSurfaceVisualCaptures.files?.stable?.activeSurface ===
                "files" &&
              rightSurfaceVisualCaptures.files?.stable?.rootVisible === true,
            rightSurfaceVisualMatrixObjectCanvasSurfaceVisible:
              rightSurfaceVisualCaptures.objectCanvas?.stable?.activeSurface ===
                "objectCanvas" &&
              rightSurfaceVisualCaptures.objectCanvas?.stable
                ?.expectedActiveSurface === "objectCanvas" &&
              rightSurfaceVisualCaptures.objectCanvas?.stable?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.objectCanvas?.stable
                ?.visibleRootKinds?.[0] === "objectCanvas",
            rightSurfaceVisualMatrixExpertSurfaceVisible:
              rightSurfaceVisualCaptures.expertInfo?.stable?.activeSurface ===
                "expertInfo" &&
              rightSurfaceVisualCaptures.expertInfo?.stable?.rootVisible ===
                true,
            rightSurfaceVisualMatrixBrowserSurfaceVisible:
              rightSurfaceVisualCaptures.browser?.stable?.activeSurface ===
                "browser" &&
              rightSurfaceVisualCaptures.browser?.stable?.rootVisible ===
                true &&
              typeof rightSurfaceVisualCaptures.browser?.screenshot ===
                "string" &&
              rightSurfaceVisualCaptures.browser.screenshot.endsWith(
                "-right-surface-browser.png",
              ) &&
              fs.existsSync(rightSurfaceVisualCaptures.browser.screenshot) &&
              rightSurfaceVisualCaptures.browser?.stable?.browserSurface
                ?.sessionId === "fixture-browser-session" &&
              rightSurfaceVisualCaptures.browser?.stable?.browserSurface
                ?.profileKey === "fixture-profile" &&
              rightSurfaceVisualCaptures.browser?.stable?.browserSurface
                ?.controlOwner === "shared",
            rightSurfaceVisualMatrixAppSurfaceVisible:
              rightSurfaceVisualCaptures.appSurface?.stable?.activeSurface ===
                "appSurface" &&
              rightSurfaceVisualCaptures.appSurface?.stable?.rootVisible ===
                true,
            rightSurfaceVisualMatrixAppSurfaceMultiInstanceTabs:
              rightSurfaceVisualAppSurface.tabs?.visible === true &&
              rightSurfaceVisualAppSurface.tabCount >= 2 &&
              rightSurfaceVisualAppSurface.visibleFrameCount === 1 &&
              rightSurfaceVisualAppSurface.visibleViewportCount === 1 &&
              rightSurfaceVisualAppSurface.tabLabels?.includes("内容工厂") ===
                true &&
              rightSurfaceVisualAppSurface.tabLabels?.includes("Prompt Lab") ===
                true,
            rightSurfaceVisualMatrixSurfacesMutuallyExclusive: [
              rightSurfaceVisualCaptures.files?.stable,
              rightSurfaceVisualCaptures.objectCanvas?.stable,
              rightSurfaceVisualCaptures.expertInfo?.stable,
              rightSurfaceVisualCaptures.browser?.stable,
              rightSurfaceVisualCaptures.appSurface?.stable,
            ].every(
              (capture) =>
                Array.isArray(capture?.visibleRootKinds) &&
                capture.visibleRootKinds.length === 1 &&
                capture.visibleRootKinds[0] ===
                  (capture.expectedSurface ?? capture.activeSurface),
            ),
            rightSurfaceVisualMatrixHostsFillRightSide: [
              rightSurfaceVisualCaptures.files?.stable,
              rightSurfaceVisualCaptures.objectCanvas?.stable,
              rightSurfaceVisualCaptures.expertInfo?.stable,
              rightSurfaceVisualCaptures.browser?.stable,
              rightSurfaceVisualCaptures.appSurface?.stable,
            ].every(
              (capture) =>
                capture?.geometry?.hostFillsCanvasPanel === true &&
                capture?.geometry?.rootFillsSurfaceViewport === true,
            ),
            rightSurfaceVisualMatrixObjectCanvasRailVisible:
              rightSurfaceVisualCaptures.objectCanvas?.stable?.activeSurface ===
                "objectCanvas" &&
              rightSurfaceVisualCaptures.objectCanvas?.stable?.geometry
                ?.rootFillsSurfaceViewport === true,
            rightSurfaceVisualMatrixPendingConsumeKeepsSurfaceOpen:
              rightSurfaceVisualCaptures.files?.opened?.rootVisible === true &&
              rightSurfaceVisualCaptures.files?.stable?.rootVisible === true &&
              rightSurfaceVisualCaptures.objectCanvas?.opened?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.objectCanvas?.stable?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.browser?.opened?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.browser?.stable?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.appSurface?.opened?.rootVisible ===
                true &&
              rightSurfaceVisualCaptures.appSurface?.stable?.rootVisible ===
                true,
            rightSurfaceVisualMatrixDoesNotUseModelTurn: backendLedger.every(
              (entry) => entry.kind !== "turnStart",
            ),
          }
        : isPlanScenario
          ? {
              planModeEnabledInGui:
                summary.planModeEnabled?.statusChipVisible === true,
              planPromptReachedBackend:
                planTurnStart?.inputText === PLAN_PROMPT,
              planCollaborationModeReachedBackend: collaborationMode === "plan",
              guiPlanRailVisible:
                summary.guiPlanCompleted?.hasPlanSection === true ||
                summary.guiPlanCompleted?.hasAllPlanSteps === true,
              guiPlanStepsVisible:
                summary.guiPlanCompleted?.hasAllPlanSteps === true,
              guiPlanDecisionDrawerVisible:
                summary.guiPlanCompleted?.planDecisionVisible === true &&
                summary.guiPlanCompleted?.planDecisionHasTitle === true &&
                summary.guiPlanCompleted?.planDecisionHasAcceptOption ===
                  true &&
                summary.guiPlanCompleted?.planDecisionHasAdjustInput === true,
              guiPlanDidNotAutoImplement: !planImplementationTurnStart,
              readModelPlanCompleted:
                summary.readModelPlanCompleted?.includesPrompt === true &&
                summary.readModelPlanCompleted?.includesProposedPlanBlock ===
                  true &&
                summary.readModelPlanCompleted?.includesPlanItem === true &&
                summary.readModelPlanCompleted?.includesAllPlanSteps === true &&
                summary.readModelPlanCompleted?.latestTurnCompleted === true,
              readModelPlanThreadItemRevisioned:
                summary.readModelPlanThreadItem?.hasCompletedPlanThreadItem ===
                  true &&
                summary.readModelPlanThreadItem?.hasRevisionId === true &&
                summary.readModelPlanThreadItem?.source === "proposed_plan" &&
                summary.readModelPlanThreadItem?.includesAllPlanSteps === true,
              guiPlanHistoryHydrateCompleted:
                summary.guiPlanHistoryHydrateCompleted?.hasPrompt === true &&
                summary.guiPlanHistoryHydrateCompleted?.hasAllPlanSteps ===
                  true &&
                summary.guiPlanHistoryHydrateCompleted
                  ?.legacyUpdatePlanToolVisible === false,
              readModelPlanHistoryHydratePreserved:
                summary.readModelPlanHistoryHydrate
                  ?.hasCompletedPlanThreadItem === true &&
                summary.readModelPlanHistoryHydrate?.hasRevisionId === true &&
                summary.readModelPlanHistoryHydrate?.includesAllPlanSteps ===
                  true,
              legacyUpdatePlanToolHidden:
                summary.guiPlanHistoryHydrateCompleted
                  ?.legacyUpdatePlanToolVisible === false &&
                summary.readModelPlanThreadItem
                  ?.legacyUpdatePlanToolItemCount === 0,
              proposedPlanVisible:
                pageText.includes("计划") &&
                PLAN_STEPS.every((step) => pageText.includes(step.step)),
            }
          : isGoalScenario
            ? {
                goalModeEnabledInGui:
                  summary.goalModeEnabled?.statusChipVisible === true &&
                  summary.goalModeEnabled?.statusText?.includes("追求目标") ===
                    true,
                goalPromptReachedBackend:
                  goalTurnStart?.inputText === GOAL_PROMPT,
                goalObjectiveTextReachedBackend:
                  goalObjectiveText === GOAL_PROMPT,
                goalManagedObjectiveReachedBackend:
                  goalHarness?.managed_objective?.objective_text ===
                    GOAL_PROMPT ||
                  goalHarness?.managedObjective?.objectiveText === GOAL_PROMPT,
                guiGoalCompleted:
                  summary.guiGoalCompleted?.hasPrompt === true &&
                  (summary.guiGoalCompleted?.hasAssistantSummary === true ||
                    summary.guiGoalCompleted?.hasDoneText === true) &&
                  summary.guiGoalCompleted?.textareaVisible === true &&
                  summary.guiGoalCompleted?.textareaDisabled === false &&
                  summary.guiGoalCompleted?.stopButtonVisible === false,
                readModelGoalCompleted:
                  summary.readModelGoalCompleted?.includesPrompt === true &&
                  (summary.readModelGoalCompleted?.includesAssistantDone ===
                    true ||
                    summary.readModelGoalCompleted?.includesAssistantSummary ===
                      true),
              }
            : isImageCommandScenario
              ? {
                  imageCommandPromptReachedBackend:
                    imageCommandTurnStart?.inputText ===
                    expectedImageIntentRoutedPrompt,
                  imageCommandMetadataReachedBackend:
                    imageCommandContractKey === "image_generation" &&
                    imageCommandTurnStart?.providerPreference == null &&
                    imageCommandTurnStart?.modelPreference == null,
                  imageCommandLegacySkillLaunchNotSubmitted:
                    imageCommandHarness?.image_skill_launch == null &&
                    imageCommandHarness?.imageSkillLaunch == null,
                  imageCommandUsedCurrentMediaTaskArtifactMethods:
                    summary.imageCommandWorkflowUsed === true &&
                    appServerRequestMethods.includes(
                      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
                    ) &&
                    appServerRequestMethods.includes(
                      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
                    ),
                  imageCommandTaskArtifactWritten:
                    summary.imageCommandTaskArtifact?.exists === true &&
                    summary.imageCommandTaskArtifact
                      ?.pathIncludesImageGenerate === true &&
                    typeof summary.imageCommandTaskArtifact?.taskId ===
                      "string" &&
                    summary.imageCommandTaskArtifact.taskId.length > 0,
                  imageCommandTaskArtifactReadable:
                    summary.imageCommandTaskArtifact?.getReturned === true &&
                    summary.imageCommandTaskArtifact?.listReturned === true &&
                    summary.imageCommandTaskArtifact?.listContainsTask ===
                      true &&
                    summary.imageCommandTaskArtifact
                      ?.listContainsImageGenerate === true,
                  imageCommandTaskArtifactTerminal:
                    summary.imageCommandTaskArtifactTerminalPatch?.status ===
                      "succeeded" &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.completeMethodUsed === "media_runtime_worker" &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.completeReturned === true &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.normalizedStatus === "succeeded" &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.resultImageCount === 1 &&
                    summary.imageCommandTaskArtifactTerminal
                      ?.fileNormalizedStatus === "succeeded" &&
                    summary.imageCommandTaskArtifactTerminal
                      ?.fileResultImageCount === 1 &&
                    summary.imageCommandTaskArtifactAfterReload
                      ?.fileNormalizedStatus === "succeeded" &&
                    summary.imageCommandTaskArtifactAfterReload
                      ?.listContainsTask === true,
                  imageCommandTaskArtifactSameTaskUpdated:
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.sameTaskFileUpdated === true &&
                    summary.imageCommandTaskArtifactTerminalPatch?.taskId ===
                      summary.imageCommandTaskArtifact?.taskId &&
                    summary.imageCommandTaskArtifactTerminalPatch?.taskPath ===
                      summary.imageCommandTaskArtifact?.taskPath &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.currentAttemptStatus === "succeeded" &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.currentAttemptWorkerId === "lime-image-api-worker" &&
                    summary.imageCommandTaskArtifactTerminalPatch
                      ?.currentAttemptHasResultSnapshot === true,
                  imageCommandTaskAuditLogWritten:
                    summary.imageCommandTaskAuditLog?.exists === true &&
                    summary.imageCommandTaskAuditLog?.lineCount >= 6 &&
                    summary.imageCommandTaskAuditLog
                      ?.logsRefLooksLikeTaskLog === true,
                  imageCommandTaskAuditLogEventSequence:
                    summary.imageCommandTaskAuditLog
                      ?.hasExpectedEventSequence === true &&
                    summary.imageCommandTaskAuditLog?.events?.[0] ===
                      "worker_loaded" &&
                    summary.imageCommandTaskAuditLog?.events?.at(-1) ===
                      "task_succeeded" &&
                    summary.imageCommandTaskAuditLog?.allEventTaskIdsMatch ===
                      true &&
                    summary.imageCommandTaskAuditLog?.parseError == null,
                  imageCommandTaskAuditLogNoSensitiveTokens:
                    summary.imageCommandTaskAuditLog
                      ?.hasNoSensitiveTokenMarkers === true &&
                    Array.isArray(
                      summary.imageCommandTaskAuditLog?.forbiddenMarkerHits,
                    ) &&
                    summary.imageCommandTaskAuditLog.forbiddenMarkerHits
                      .length === 0,
                  imageCommandWorkflowAuditReadModelProjected:
                    appServerRequestMethods.includes(
                      APP_SERVER_METHOD_WORKFLOW_READ,
                    ) &&
                    summary.imageCommandWorkflowRead?.sessionId ===
                      SESSION_ID &&
                    summary.imageCommandWorkflowRead?.matchedRun
                      ?.workflowKey === "image_command_workflow" &&
                    summary.imageCommandWorkflowRead?.matchedRun?.status ===
                      "completed" &&
                    summary.imageCommandWorkflowRead?.matchedRun?.stepCounts
                      ?.total === 5 &&
                    summary.imageCommandWorkflowRead?.activeWorkflowRunId ===
                      "",
                  imageCommandWorkflowAuditStepsProjected:
                    summary.imageCommandWorkflowRead?.hasExpectedSteps ===
                      true &&
                    summary.imageCommandWorkflowRead?.matchedStepIds?.includes(
                      "intent",
                    ) === true &&
                    summary.imageCommandWorkflowRead?.matchedStepIds?.includes(
                      "create_tasks",
                    ) === true &&
                    summary.imageCommandWorkflowRead?.completedStepIds?.includes(
                      "intent",
                    ) === true &&
                    summary.imageCommandWorkflowRead?.completedStepIds?.includes(
                      "create_tasks",
                    ) === true &&
                    summary.imageCommandWorkflowRead?.createTasksStep
                      ?.status === "completed",
                  imageCommandWorkflowAuditSummaryRedacted:
                    summary.imageCommandWorkflowRead?.containsPrompt ===
                      false &&
                    summary.imageCommandWorkflowRead?.containsTaskPath ===
                      false,
                  imageCommandWorkerUsedFixtureProviderAndModel:
                    (summary.imageCommandTaskCreateRequest?.provider_id ??
                      summary.imageCommandTaskCreateRequest?.providerId) ===
                      summary.imageFixtureProvider?.providerId &&
                    (summary.imageCommandTaskCreateRequest?.model ?? null) ===
                      IMAGE_FIXTURE_MODEL &&
                    summary.imageProviderFixtureServer?.requestCount === 1 &&
                    summary.imageProviderFixtureServer?.requests?.[0]
                      ?.headerProviderId ===
                      summary.imageFixtureProvider?.providerId &&
                    summary.imageProviderFixtureServer?.requests?.[0]?.model ===
                      IMAGE_FIXTURE_MODEL &&
                    summary.imageProviderFixtureServer?.requests?.[0]
                      ?.bodyIncludesModel === true,
                  imageCommandWorkflowToolObserved:
                    summary.readModelImageCommandCompleted
                      ?.includesWorkflowSource === true ||
                    pageText.includes("image_command_workflow") ||
                    (summary.imageCommandTaskCreateRequest?.runtimeContract
                      ?.executor_adapter_key === "workflow:image_command" &&
                      summary.imageCommandTaskCreateRequest?.runtimeContract
                        ?.executor_binding_key === "image_command"),
                  imageCommandCreateTaskToolObserved:
                    summary.readModelImageCommandCompleted
                      ?.includesCreateTaskTool === true,
                  guiImageCommandInputSubmitted:
                    summary.imageCommandInputSend?.afterFill
                      ?.promptVisibleInTextarea === true &&
                    summary.imageCommandInputSend?.clicked?.clicked === true,
                  guiImageCommandToolProcessVisible:
                    summary.guiImageCommandCompleted
                      ?.hasVisibleImageTaskProcess === true,
                  guiImageCommandTaskCardVisible:
                    summary.guiImageCommandCompleted?.imageTaskCardVisible ===
                    true,
                  guiImageCommandTaskCardTerminal:
                    summary.guiImageCommandTerminal?.cardCount === 1 &&
                    summary.guiImageCommandTerminal?.mediaCount >= 1 &&
                    summary.guiImageCommandTerminal?.hasPresentationIntro ===
                      true &&
                    summary.guiImageCommandTerminal?.hasToolStripLabel ===
                      true &&
                    summary.guiImageCommandTerminal?.hasImageModelLabel ===
                      true &&
                    summary.guiImageCommandTerminal?.hasTokenUsage === true &&
                    summary.guiImageCommandTerminal?.hasPreviewImage === true &&
                    summary.guiImageCommandTerminal
                      ?.hasLoadedVisiblePreviewImage === true &&
                    summary.guiImageCommandTerminal?.visiblePendingStatus ===
                      false,
                  guiImageCommandSingleTaskCard:
                    summary.guiImageCommandTerminal?.cardCount === 1 &&
                    summary.guiImageCommandRestoredAfterReload?.cardCount === 1,
                  guiImageCommandRestoredAfterReload:
                    summary.guiImageCommandReload?.renderer?.electron ===
                      true &&
                    summary.guiImageCommandReload?.session?.inputReady
                      ?.hasMessageList === true &&
                    summary.guiImageCommandRestoredAfterReload?.cardCount ===
                      1 &&
                    summary.guiImageCommandRestoredAfterReload?.mediaCount >=
                      1 &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasPresentationIntro === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasToolStripLabel === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasImageModelLabel === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasTokenUsage === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasPreviewImage === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.hasLoadedVisiblePreviewImage === true &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.visiblePendingStatus === false,
                  guiImageCommandNoDraftCard:
                    summary.guiImageCommandCompleted?.draftImageVisible ===
                      false &&
                    summary.guiImageCommandTerminal?.draftImageVisible ===
                      false &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.draftImageVisible === false &&
                    summary.readModelImageCommandCompleted
                      ?.includesDraftTask === false,
                  guiImageCommandNoTemplateTaskId:
                    summary.guiImageCommandCompleted?.templateTaskIdVisible ===
                      false &&
                    summary.guiImageCommandTerminal?.templateTaskIdVisible ===
                      false &&
                    summary.guiImageCommandRestoredAfterReload
                      ?.templateTaskIdVisible === false &&
                    summary.readModelImageCommandCompleted
                      ?.includesTaskIdPlaceholder === false,
                  readModelImageCommandCompleted:
                    summary.readModelImageCommandCompleted?.includesPrompt ===
                      true &&
                    summary.readModelImageCommandCompleted?.latestTurnStatus ===
                      "completed" &&
                    summary.readModelImageCommandCompleted
                      ?.includesCreateTaskTool === true,
                  readModelImageCommandTaskPreviewObserved:
                    summary.readModelImageCommandCompleted
                      ?.createTaskOutputContainsTaskId === true &&
                    summary.readModelImageCommandCompleted
                      ?.createTaskOutputContainsTaskFile === true,
                }
              : isWebToolsRenderingScenario
                ? buildWebToolsRenderingScenarioAssertions({
                    summary,
                    webToolsRenderingTurnStart,
                  })
                : isReasoningFirstVisibleScenario
                  ? buildReasoningFirstVisibleScenarioAssertions({
                      reasoningFirstVisibleTurnStart,
                      summary,
                    })
                  : isTerminalStaleGuardScenario ||
                      isTerminalCanceledAfterAnswerScenario ||
                      isTerminalFailedAfterAnswerScenario
                    ? buildTerminalScenarioAssertions({
                        isTerminalCanceledAfterAnswerScenario,
                        isTerminalFailedAfterAnswerScenario,
                        isTerminalStaleGuardScenario,
                        summary,
                        terminalCanceledAfterAnswerTurnStart,
                        terminalFailedAfterAnswerTurnStart,
                        terminalStaleGuardFirstTurnStart,
                        terminalStaleGuardSecondTurnStart,
                      })
                  : isMcpStructuredContentScenario
                  ? buildMcpStructuredContentScenarioAssertions({
                      mcpStructuredContentTurnStart,
                      summary,
                    })
                  : isMediaReferenceScenario
                    ? buildMediaReferenceScenarioAssertions({
                        mediaReferenceTurnStart,
                        pageText,
                        summary,
                      })
                  : isMultiAgentTeamScenario
                    ? buildMultiAgentTeamScenarioAssertions({
                        multiAgentTeamTurnStart,
                        pageText,
                        summary,
                      })
                    : isSkillsRuntimeScenario
                      ? buildSkillsRuntimeScenarioAssertions({
                          explicitSkillsRuntimeTurnStart,
                          manualEnableRuntimeBinding,
                          manualEnableRuntimeMetadata,
                          manualEnableSkillsRuntimeTurnStart,
                          skillsRuntimeTurnStart,
                          summary,
                          workspace,
                        })
                      : isAnyExpertSkillsRuntimeScenario
                        ? buildExpertSkillsRuntimeScenarioAssertions({
                            expectedExpertHarnessSkillRef,
                            expertHarnessMetadata,
                            expertHarnessSkillRefs,
                            expertPanelSkillsRuntimeTurnStart,
                            expertRuntimeMetadata,
                            expertSkillsRuntimeTurnStart,
                            isExpertPanelSkillsRuntimeScenario,
                            isExpertPlazaSkillsRuntimeScenario,
                            summary,
                          })
                        : hasCancelPhase
                          ? {
                              usedCurrentTurnCancel:
                                appServerRequestMethods.includes(
                                  APP_SERVER_METHOD_SESSION_TURN_CANCEL,
                                ),
                              externalFixtureCancelUsed: backendLedger.some(
                                (entry) => entry.kind === "turnCancel",
                              ),
                              fixtureCancelReachedBackend:
                                latestTurnCancel?.sessionId === SESSION_ID &&
                                typeof latestTurnCancel?.turnId === "string" &&
                                latestTurnCancel.turnId.trim().length > 0,
                              guiStopClicked:
                                summary.stopClick?.clicked?.clicked === true,
                              readModelCanceled:
                                summary.readModelCanceled?.includesPrompt ===
                                  true &&
                                summary.readModelCanceled?.includesCanceled ===
                                  true,
                              ...(isCancelThenContinueScenario
                                ? {
                                    continuePromptReachedBackend:
                                      continueTurnStart?.inputText ===
                                      CONTINUE_PROMPT,
                                    guiContinueInputSubmitted:
                                      summary.continueInputSend?.afterFill
                                        ?.promptVisibleInTextarea === true &&
                                      summary.continueInputSend?.clicked
                                        ?.clicked === true,
                                    guiContinueCompleted:
                                      summary.guiContinueCompleted
                                        ?.hasPrompt === true &&
                                      (summary.guiContinueCompleted
                                        ?.hasAssistantSummary === true ||
                                        summary.guiContinueCompleted
                                          ?.hasDoneText === true) &&
                                      summary.guiContinueCompleted
                                        ?.textareaVisible === true &&
                                      summary.guiContinueCompleted
                                        ?.textareaDisabled === false &&
                                      summary.guiContinueCompleted
                                        ?.stopButtonVisible === false,
                                    readModelContinueCompleted:
                                      summary.readModelContinueCompleted
                                        ?.includesPrompt === true &&
                                      (summary.readModelContinueCompleted
                                        ?.includesAssistantDone === true ||
                                        summary.readModelContinueCompleted
                                          ?.includesAssistantSummary === true),
                                    backendRecordedCancelThenContinue:
                                      backendLedger.filter(
                                        (entry) => entry.kind === "turnStart",
                                      ).length >= 2 &&
                                      backendLedger.some(
                                        (entry) => entry.kind === "turnCancel",
                                      ),
                                  }
                                : {}),
                            }
                          : isInputbarRichRestoreScenario
                            ? {
                                inputbarRichRestorePromptReachedBackend:
                                  String(
                                    inputbarRichRestoreTurnStart?.inputText ||
                                      "",
                                  ).includes(INPUTBAR_RICH_RESTORE_PROMPT),
                                inputbarRichRestoreDraftPrepared:
                                  summary.inputbarRichRestoreDraftPrepared
                                    ?.prepared?.imageRestored === true &&
                                  summary.inputbarRichRestoreDraftPrepared
                                    ?.prepared?.pathRestored === true &&
                                  summary.inputbarRichRestoreDraftPrepared
                                    ?.prepared?.skillRestored === true,
                                inputbarRichRestoreInputSubmitted:
                                  summary.inputbarRichRestoreInputSend
                                    ?.afterFill?.promptVisibleInTextarea ===
                                    true &&
                                  summary.inputbarRichRestoreInputSend?.clicked
                                    ?.clicked === true,
                                inputbarRichRestoreBackendInputSummaryReached:
                                  summary.inputbarRichRestoreBackendTurnStart
                                    ?.inputSummary?.imageAttachmentCount >= 1 &&
                                  summary.inputbarRichRestoreBackendTurnStart
                                    ?.inputSummary?.fileReferenceCount >= 1 &&
                                  summary.inputbarRichRestoreBackendTurnStart
                                    ?.inputSummary?.fileReferenceNames?.includes(
                                      INPUTBAR_RICH_RESTORE_PATH_NAME,
                                    ) === true,
                                inputbarRichRestoreUsedCurrentTurnCancel:
                                  appServerRequestMethods.includes(
                                    APP_SERVER_METHOD_SESSION_TURN_CANCEL,
                                  ),
                                inputbarRichRestoreBackendCanceled:
                                  latestTurnCancel?.sessionId ===
                                    inputbarRichRestoreTurnStart?.sessionId &&
                                  latestTurnCancel?.turnId ===
                                    inputbarRichRestoreTurnStart?.turnId &&
                                  typeof latestTurnCancel?.turnId ===
                                    "string" &&
                                  latestTurnCancel.turnId.trim().length > 0,
                                inputbarRichRestoreGuiCanceled:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.stopButtonVisible === false &&
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.textareaDisabled === false,
                                inputbarRichRestoreTextRestored:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.textareaValue ===
                                  INPUTBAR_RICH_RESTORE_PROMPT,
                                inputbarRichRestoreImageRestored:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.imageRestored === true,
                                inputbarRichRestorePathRestored:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.pathRestored === true,
                                inputbarRichRestoreSkillRestored:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.skillRestored === true,
                                inputbarRichRestoreNoVisibleAssistantOutput:
                                  summary.inputbarRichRestoreGuiCanceled
                                    ?.noVisibleAssistantOutput === true,
                                inputbarRichRestoreReadModelCanceled:
                                  summary.inputbarRichRestoreReadModelCanceled
                                    ?.includesPrompt === true &&
                                  summary.inputbarRichRestoreReadModelCanceled
                                    ?.includesCanceled === true &&
                                  summary.inputbarRichRestoreReadModelCanceled
                                    ?.forbiddenAssistantOutput === false,
                              }
                            : isInputbarPendingSteerPopFrontResumeScenario
                              ? buildPendingSteerPopFrontResumeScenarioAssertions(
                                  context,
                                )
                            : isInputbarPendingSteerMultiQueueScenario
                              ? {
                                  inputbarPendingSteerActivePromptReachedBackend:
                                    inputbarPendingSteerActiveTurnStart
                                      ?.inputText ===
                                    INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
                                  inputbarPendingSteerActiveOutputVisible:
                                    summary.inputbarPendingSteerActiveStreaming
                                      ?.stopButtonVisible === true &&
                                    summary.inputbarPendingSteerActiveStreaming
                                      ?.bodyText?.includes(
                                        INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
                                      ) === true,
                                  inputbarPendingSteerRichInputDeferred:
                                    summary.inputbarPendingSteerInputDefer
                                      ?.afterFill?.promptVisibleInTextarea ===
                                      true &&
                                    summary.inputbarPendingSteerInputDefer
                                      ?.clicked?.clicked === true,
                                  inputbarPendingSteerMultipleQueued:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.queue?.multipleQueued === true,
                                  inputbarPendingSteerQueueOrderPreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.queue?.orderPreserved === true,
                                  inputbarPendingSteerSecondTextQueued:
                                    summary.inputbarPendingSteerSecondInputDefer
                                      ?.clicked?.clicked === true &&
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.queue?.secondTextQueued === true,
                                  inputbarPendingSteerRichPromptNotStartedBeforeCancel:
                                    summary.inputbarPendingSteerBackendBeforeCancel
                                      ?.richPromptStarted === false &&
                                    summary.inputbarPendingSteerBackendBeforeCancel
                                      ?.secondPromptStarted === false,
                                }
                            : isInputbarPendingSteerRichRestoreScenario
                              ? {
                                  inputbarPendingSteerActivePromptReachedBackend:
                                    inputbarPendingSteerActiveTurnStart
                                      ?.inputText ===
                                    INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
                                  inputbarPendingSteerActiveOutputVisible:
                                    summary.inputbarPendingSteerActiveStreaming
                                      ?.stopButtonVisible === true &&
                                    summary.inputbarPendingSteerActiveStreaming
                                      ?.bodyText?.includes(
                                        INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
                                      ) === true,
                                  inputbarPendingSteerRichDraftPrepared:
                                    summary.inputbarPendingSteerDraftPrepared
                                      ?.prepared?.imageRestored === true &&
                                    summary.inputbarPendingSteerDraftPrepared
                                      ?.prepared?.pathRestored === true &&
                                    summary.inputbarPendingSteerDraftPrepared
                                      ?.prepared?.skillRestored === true &&
                                    summary.inputbarPendingSteerDraftPrepared
                                      ?.prepared?.deferButtonExists === true,
                                  inputbarPendingSteerRichInputDeferred:
                                    summary.inputbarPendingSteerInputDefer
                                      ?.afterFill?.promptVisibleInTextarea ===
                                      true &&
                                    summary.inputbarPendingSteerInputDefer
                                      ?.clicked?.clicked === true,
                                  inputbarPendingSteerReadModelQueued:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.queuedTurnFound === true,
                                  inputbarPendingSteerQueuedRichTextPreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.includesPrompt === true &&
                                    (summary.inputbarPendingSteerQueuedReadModel
                                      ?.text === INPUTBAR_RICH_RESTORE_PROMPT ||
                                      summary.inputbarPendingSteerQueuedReadModel
                                        ?.textElementTexts?.includes(
                                          INPUTBAR_RICH_RESTORE_PROMPT,
                                        ) === true),
                                  inputbarPendingSteerQueuedRichImagePreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.imagePreserved === true,
                                  inputbarPendingSteerQueuedRichPathPreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.pathPreserved === true,
                                  inputbarPendingSteerQueuedRichTextElementsPreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.textElementsPreserved === true,
                                  inputbarPendingSteerQueuedRichSkillPreserved:
                                    summary.inputbarPendingSteerQueuedReadModel
                                      ?.skillPreserved === true,
                                  inputbarPendingSteerRichPromptNotStartedBeforeCancel:
                                    summary.inputbarPendingSteerBackendBeforeCancel
                                      ?.richPromptStarted === false,
                                  inputbarPendingSteerQueuedRestoreClicked:
                                    summary.inputbarPendingSteerStopClick
                                      ?.clicked?.clicked === true,
                                  inputbarPendingSteerGuiCanceled:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.stopButtonVisible === true &&
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.textareaDisabled === false,
                                  inputbarPendingSteerTextRestored:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.textareaValue ===
                                    INPUTBAR_RICH_RESTORE_PROMPT,
                                  inputbarPendingSteerImageRestored:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.imageRestored === true,
                                  inputbarPendingSteerPathRestored:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.pathRestored === true,
                                  inputbarPendingSteerSkillRestored:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.skillRestored === true,
                                  inputbarPendingSteerActiveAssistantOutputKept:
                                    summary.inputbarPendingSteerGuiCanceled
                                      ?.bodyText?.includes(
                                        INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
                                      ) === true,
                                }
                          : {
                              noEpochFallbackTitle:
                                summary.guiCompleted?.hasEpochFallbackTitle ===
                                false,
                              readModelCompleted:
                                summary.readModelCompleted?.includesPrompt ===
                                  true &&
                                (summary.readModelCompleted
                                  ?.includesAssistantDone === true ||
                                  summary.readModelCompleted
                                    ?.includesAssistantSummary === true),
                              eventReadProbeObserved:
                                summary.eventReadProbe?.events?.hasTextDelta ===
                                  true &&
                                summary.eventReadProbe?.events
                                  ?.hasToolStarted === true &&
                                summary.eventReadProbe?.events
                                  ?.hasToolResult === true &&
                                summary.eventReadProbe?.events?.hasTerminal ===
                                  true &&
                                summary.eventReadProbe?.events?.eventTurnIds
                                  ?.length === 1 &&
                                summary.eventReadProbe?.events
                                  ?.eventTurnIds?.[0] ===
                                  EVENT_READ_PROBE_TURN_ID,
                              readModelEventReadAligned:
                                summary.eventReadProbe?.readModel
                                  ?.containsTurnId === true &&
                                summary.eventReadProbe?.readModel
                                  ?.containsReadText === true,
                              readModelToolCallAligned:
                                summary.eventReadProbe?.readModel
                                  ?.containsToolCall === true &&
                                summary.eventReadProbe?.readModel?.toolName ===
                                  EVENT_READ_PROBE_TOOL_NAME &&
                                summary.eventReadProbe?.readModel
                                  ?.toolStatus === "completed" &&
                                summary.eventReadProbe?.readModel
                                  ?.containsToolOutput === true &&
                                summary.eventReadProbe?.readModel
                                  ?.toolTurnId === EVENT_READ_PROBE_TURN_ID,
                            };
  return scenarioAssertions;
}
