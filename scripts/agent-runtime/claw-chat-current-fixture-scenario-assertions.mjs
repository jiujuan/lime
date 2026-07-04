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
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_ID,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_TITLE,
  GOAL_PROMPT,
  IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
  IMAGE_COMMAND_PROMPT,
  IMAGE_FIXTURE_MODEL,
  MCP_STRUCTURED_CONTENT_PROMPT,
  NEWS_PROMPT,
  PLAN_PROMPT,
  PLAN_STEPS,
  SESSION_ID,
  SOUL_STYLE_INTENSITY,
  SOUL_STYLE_PROFILE_ID,
  SOUL_STYLE_SCENARIO,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_PROMPT,
  SKILLS_RUNTIME_QUERY,
  SKILLS_RUNTIME_SKILL_NAME,
  WEB_TOOLS_RENDERING_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { buildContentFactoryArticleWorkspaceScenarioAssertions } from "./claw-chat-current-fixture-content-factory-assertions.mjs";
import { EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF } from "./claw-chat-current-fixture-expert-actions.mjs";

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
    isAnyExpertSkillsRuntimeScenario,
    isCancelThenContinueScenario,
    isContentFactoryArticleWorkspaceScenario,
    isContentFactoryInlineImageArticleWorkspaceScenario,
    isExpertPanelSkillsRuntimeScenario,
    isExpertPlazaSkillsRuntimeScenario,
    isGoalScenario,
    isImageCommandScenario,
    isMcpStructuredContentScenario,
    isPlanScenario,
    isRightSurfaceVisualMatrixScenario,
    isSkillsRuntimeScenario,
    isSoulStyleScenario,
    isWebToolsRenderingScenario,
    latestTurnCancel,
    manualEnableRuntimeBinding,
    manualEnableRuntimeMetadata,
    mcpStructuredContentTurnStart,
    pageText,
    planImplementationTurnStart,
    planTurnStart,
    skillsRuntimeTurnStart,
    explicitSkillsRuntimeTurnStart,
    manualEnableSkillsRuntimeTurnStart,
    summary,
    webToolsRenderingTurnStart,
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
    ? {
        soulStyleConfigEnabled:
          summary.soulStyleConfig?.enabled === true &&
          summary.soulStyleConfig?.style_profile_id ===
            SOUL_STYLE_PROFILE_ID &&
          summary.soulStyleConfig?.style_intensity === SOUL_STYLE_INTENSITY,
        soulStylePromptReachedBackend: guiTurnStartReachedBackend === true,
        soulStyleRuntimeProviderReached:
          summary.textProviderFixtureServer?.requestCount >= 1,
        soulStylePromptContextCoveredByRuntime:
          summary.soulStylePromptContextCoveredByRuntime === true &&
          summary.soulStylePromptContextMarkers?.hasInteractionSoul === true &&
          summary.soulStylePromptContextMarkers?.hasMemorySoulSchema === true &&
          summary.soulStylePromptContextMarkers?.hasProfileId === true &&
          summary.soulStylePromptContextMarkers?.hasStylePack === true &&
          summary.soulStylePromptContextMarkers?.hasIntensity === true,
        soulStyleReadModelCompleted:
          summary.readModelCompleted?.includesPrompt === true &&
          (summary.readModelCompleted?.includesAssistantDone === true ||
            summary.readModelCompleted?.includesAssistantSummary === true),
        soulStyleGuiCompleted:
          summary.guiCompleted?.hasPrompt === true &&
          (summary.guiCompleted?.hasAssistantSummary === true ||
            summary.guiCompleted?.hasDoneText === true) &&
          summary.guiCompleted?.stopButtonVisible === false,
      }
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
                summary.contentFactoryInlineImageTaskSubmittedEvent?.emitted ===
                  true &&
                summary.contentFactoryInlineImageTaskSubmittedEvent?.slotId ===
                  "article-inline-image-slot-e2e",
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
                summary.contentFactoryInlineImageCanvas?.hasImageUrl === true &&
                summary.contentFactoryInlineImageCanvas?.hasRenderedImage ===
                  true &&
                summary.contentFactoryInlineImageCanvas
                  ?.hasRenderedImageNearAnchor === true &&
                summary.contentFactoryInlineImageCanvas
                  ?.hasUnavailablePlaceholderForExpected === false &&
                summary.contentFactoryInlineImageCanvas?.hasPendingProtocol ===
                  false,
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
              rightSurfaceVisualMatrix.requests?.appSurfacePromptLab?.requestId,
            ),
          rightSurfaceVisualMatrixFilesSurfaceVisible:
            rightSurfaceVisualCaptures.files?.stable?.activeSurface ===
              "files" &&
            rightSurfaceVisualCaptures.files?.stable?.rootVisible === true,
          rightSurfaceVisualMatrixObjectCanvasSurfaceVisible:
            rightSurfaceVisualCaptures.objectCanvas?.stable?.activeSurface ===
              "articleWorkspace" &&
            rightSurfaceVisualCaptures.objectCanvas?.stable
              ?.expectedActiveSurface === "articleWorkspace" &&
            rightSurfaceVisualCaptures.objectCanvas?.stable?.rootVisible ===
              true &&
            rightSurfaceVisualCaptures.objectCanvas?.stable
              ?.visibleRootKinds?.[0] === "objectCanvas",
          rightSurfaceVisualMatrixExpertSurfaceVisible:
            rightSurfaceVisualCaptures.expertInfo?.stable?.activeSurface ===
              "expertInfo" &&
            rightSurfaceVisualCaptures.expertInfo?.stable?.rootVisible === true,
          rightSurfaceVisualMatrixBrowserSurfaceVisible:
            rightSurfaceVisualCaptures.browser?.stable?.activeSurface ===
              "browser" &&
            rightSurfaceVisualCaptures.browser?.stable?.rootVisible === true &&
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
            rightSurfaceVisualCaptures.appSurface?.stable?.rootVisible === true,
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
          rightSurfaceVisualMatrixArticleWorkspaceRailVisible:
            rightSurfaceVisualCaptures.objectCanvas?.stable?.activeSurface ===
              "articleWorkspace" &&
            rightSurfaceVisualCaptures.objectCanvas?.stable?.geometry
              ?.rootFillsSurfaceViewport === true,
          rightSurfaceVisualMatrixPendingConsumeKeepsSurfaceOpen:
            rightSurfaceVisualCaptures.files?.opened?.rootVisible === true &&
            rightSurfaceVisualCaptures.files?.stable?.rootVisible === true &&
            rightSurfaceVisualCaptures.objectCanvas?.opened?.rootVisible ===
              true &&
            rightSurfaceVisualCaptures.objectCanvas?.stable?.rootVisible ===
              true &&
            rightSurfaceVisualCaptures.browser?.opened?.rootVisible === true &&
            rightSurfaceVisualCaptures.browser?.stable?.rootVisible === true &&
            rightSurfaceVisualCaptures.appSurface?.opened?.rootVisible ===
              true &&
            rightSurfaceVisualCaptures.appSurface?.stable?.rootVisible === true,
          rightSurfaceVisualMatrixDoesNotUseModelTurn: backendLedger.every(
            (entry) => entry.kind !== "turnStart",
          ),
        }
      : isPlanScenario
        ? {
            planModeEnabledInGui:
              summary.planModeEnabled?.statusChipVisible === true,
            planPromptReachedBackend: planTurnStart?.inputText === PLAN_PROMPT,
            planCollaborationModeReachedBackend: collaborationMode === "plan",
            guiPlanRailVisible:
              summary.guiPlanCompleted?.hasPlanSection === true ||
              summary.guiPlanCompleted?.hasAllPlanSteps === true,
            guiPlanStepsVisible:
              summary.guiPlanCompleted?.hasAllPlanSteps === true,
            guiPlanDecisionDrawerVisible:
              summary.guiPlanCompleted?.planDecisionVisible === true &&
              summary.guiPlanCompleted?.planDecisionHasTitle === true &&
              summary.guiPlanCompleted?.planDecisionHasAcceptOption === true &&
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
              summary.readModelPlanThreadItem?.legacyUpdatePlanToolItemCount ===
                0,
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
                  summary.imageCommandTaskArtifact?.listContainsTask === true &&
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
                  summary.imageCommandTaskAuditLog?.logsRefLooksLikeTaskLog ===
                    true,
                imageCommandTaskAuditLogEventSequence:
                  summary.imageCommandTaskAuditLog?.hasExpectedEventSequence ===
                    true &&
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
                  summary.imageCommandWorkflowRead?.sessionId === SESSION_ID &&
                  summary.imageCommandWorkflowRead?.matchedRun?.workflowKey ===
                    "image_command_workflow" &&
                  summary.imageCommandWorkflowRead?.matchedRun?.status ===
                    "completed" &&
                  summary.imageCommandWorkflowRead?.matchedRun?.stepCounts
                    ?.total === 5 &&
                  summary.imageCommandWorkflowRead?.activeWorkflowRunId === "",
                imageCommandWorkflowAuditStepsProjected:
                  summary.imageCommandWorkflowRead?.hasExpectedSteps === true &&
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
                  summary.imageCommandWorkflowRead?.createTasksStep?.status ===
                    "completed",
                imageCommandWorkflowAuditSummaryRedacted:
                  summary.imageCommandWorkflowRead?.containsPrompt === false &&
                  summary.imageCommandWorkflowRead?.containsTaskPath === false,
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
                  summary.guiImageCommandTerminal?.hasToolStripLabel === true &&
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
                  summary.guiImageCommandReload?.renderer?.electron === true &&
                  summary.guiImageCommandReload?.session?.inputReady
                    ?.hasMessageList === true &&
                  summary.guiImageCommandRestoredAfterReload?.cardCount === 1 &&
                  summary.guiImageCommandRestoredAfterReload?.mediaCount >= 1 &&
                  summary.guiImageCommandRestoredAfterReload
                    ?.hasPresentationIntro === true &&
                  summary.guiImageCommandRestoredAfterReload
                    ?.hasToolStripLabel === true &&
                  summary.guiImageCommandRestoredAfterReload
                    ?.hasImageModelLabel === true &&
                  summary.guiImageCommandRestoredAfterReload?.hasTokenUsage ===
                    true &&
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
                  summary.readModelImageCommandCompleted?.includesDraftTask ===
                    false,
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
              ? {
                  webToolsRenderingPromptReachedBackend:
                    webToolsRenderingTurnStart?.inputText ===
                    WEB_TOOLS_RENDERING_PROMPT,
                  guiWebToolsRenderingInputSubmitted:
                    summary.webToolsRenderingInputSend?.afterFill
                      ?.promptVisibleInTextarea === true &&
                    summary.webToolsRenderingInputSend?.clicked?.clicked ===
                      true,
                  guiWebToolsLiveRunningStateCaptured:
                    (summary.guiWebToolsRenderingInProgress
                      ?.webToolsLiveRunningStateCaptured === true &&
                      summary.guiWebToolsRenderingInProgress?.hasPrompt ===
                        true &&
                      summary.guiWebToolsRenderingInProgress
                        ?.webProcessGroupExpanded === true &&
                      summary.guiWebToolsRenderingInProgress
                        ?.hasAssistantSummary === false &&
                      summary.guiWebToolsRenderingInProgress?.hasDoneText ===
                        false) ||
                    (summary.guiWebToolsRenderingInProgress
                      ?.fastCompletedBeforeLiveCapture === true &&
                      summary.guiWebToolsRenderingInProgress?.hasPrompt ===
                        true &&
                      summary.guiWebToolsRenderingInProgress
                        ?.hasAssistantSummary === true &&
                      summary.guiWebToolsRenderingInProgress
                        ?.hasFinalTextAfterProcess === true),
                  guiWebToolsLiveNoLegacyTextAfterProcess:
                    summary.guiWebToolsRenderingInProgress
                      ?.runningProcessHasLegacyTextAfterProcess === false &&
                    (summary.guiWebToolsRenderingInProgress
                      ?.webToolsLiveRunningStateCaptured === true
                      ? summary.guiWebToolsRenderingInProgress
                          ?.latestAssistantTextAfterProcessPart === false
                      : summary.guiWebToolsRenderingInProgress
                          ?.fastCompletedBeforeLiveCapture === true),
                  guiWebSearchProcessDefaultCollapsed:
                    summary.guiWebToolsRenderingCompleted
                      ?.webProcessGroupExpanded === false,
                  guiWebSearchProcessShowsSourcesAfterExpand:
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasSearchSourceSection === true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasSearchTitle === true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasSearchSourceLabel === true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasFullSearchUrlVisible === false,
                  guiWebFetchProcessShowsReadPagesAfterExpand:
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasFetchPageSection === true &&
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasFetchPageUrl === true,
                  guiWebToolsTimelineOrderPreserved:
                    summary.guiWebToolsRenderingCompleted?.expandedDetails
                      ?.hasTimelineOrderPreserved === true,
                  guiWebSearchNoiseHidden:
                    summary.guiWebToolsRenderingCompleted
                      ?.searchNoiseVisible === false,
                  guiMarkdownRendered:
                    summary.guiWebToolsRenderingCompleted
                      ?.rawMarkdownVisible === false &&
                    summary.guiWebToolsRenderingCompleted
                      ?.markdownHeadingVisible === true &&
                    summary.guiWebToolsRenderingCompleted
                      ?.markdownStrongVisible === true &&
                    summary.guiWebToolsRenderingCompleted
                      ?.markdownTableVisible === true,
                  guiWebSearchFinalTextInterleaved:
                    summary.guiWebToolsRenderingCompleted
                      ?.hasFinalTextAfterProcess === true,
                  guiWebFetchTransportEnvelopeHidden:
                    summary.guiWebToolsRenderingCompleted
                      ?.rawJsonEnvelopeVisible === false &&
                    summary.guiWebToolsRenderingCompleted
                      ?.hasFetchMarkdownHidden === true,
                  readModelWebToolsRenderingCompleted:
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesPrompt === true &&
                    (summary.readModelWebToolsRenderingCompleted
                      ?.includesAssistantDone === true ||
                      summary.readModelWebToolsRenderingCompleted
                        ?.includesAssistantSummary === true) &&
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesWebSearchTool === true &&
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesWebFetchTool === true,
                  readModelWebToolsReasoningProviderMetadataPreserved:
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesReasoningFinal === true &&
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesReasoningFinalProviderMetadata === true &&
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesReasoningItem === true &&
                    summary.readModelWebToolsRenderingCompleted
                      ?.includesReasoningItemProviderMetadata === true,
                  guiWebToolsReasoningDidNotOpenPlanRail:
                    summary.guiWebToolsRenderingCompleted?.hasAllPlanSteps ===
                      false &&
                    summary.guiWebToolsRenderingCompleted
                      ?.planDecisionVisible === false,
                }
              : isMcpStructuredContentScenario
                ? {
                    mcpStructuredContentPromptReachedBackend:
                      mcpStructuredContentTurnStart?.inputText ===
                      MCP_STRUCTURED_CONTENT_PROMPT,
                    guiMcpStructuredContentInputSubmitted:
                      summary.mcpStructuredContentInputSend?.afterFill
                        ?.promptVisibleInTextarea === true &&
                      summary.mcpStructuredContentInputSend?.clicked
                        ?.clicked === true,
                    guiMcpStructuredContentVisible:
                      summary.guiMcpStructuredContentCompleted?.hasPrompt ===
                        true &&
                      summary.guiMcpStructuredContentCompleted
                        ?.hasStructuredAnswer === true &&
                      (summary.guiMcpStructuredContentCompleted?.hasToolName ===
                        true ||
                        summary.guiMcpStructuredContentCompleted
                          ?.expandedDetails?.hasToolName === true) &&
                      summary.guiMcpStructuredContentCompleted
                        ?.textareaVisible === true &&
                      summary.guiMcpStructuredContentCompleted
                        ?.textareaDisabled === false &&
                      summary.guiMcpStructuredContentCompleted
                        ?.stopButtonVisible === false,
                    guiMcpStructuredContentEnvelopeHidden:
                      summary.guiMcpStructuredContentCompleted
                        ?.envelopeVisible === false,
                    readModelMcpStructuredContentCompleted:
                      summary.readModelMcpStructuredContentCompleted
                        ?.includesPrompt === true &&
                      (summary.readModelMcpStructuredContentCompleted
                        ?.includesAssistantDone === true ||
                        summary.readModelMcpStructuredContentCompleted
                          ?.includesAssistantSummary === true) &&
                      summary.readModelMcpStructuredContentCompleted
                        ?.includesMcpTool === true,
                    readModelMcpStructuredContentObserved:
                      summary.readModelMcpStructuredContentCompleted
                        ?.includesStructuredContent === true &&
                      summary.readModelMcpStructuredContentCompleted
                        ?.structuredContentAnswerVisible === true &&
                      summary.readModelMcpStructuredContentCompleted
                        ?.structuredContentReferenceVisible === true &&
                      summary.readModelMcpStructuredContentCompleted
                        ?.outputContainsEnvelope === true,
                  }
                : isSkillsRuntimeScenario
                  ? {
                      skillsRuntimePromptReachedBackend:
                        skillsRuntimeTurnStart?.inputText ===
                        SKILLS_RUNTIME_PROMPT,
                      guiSkillsRuntimeInputSubmitted:
                        summary.skillsRuntimeInputSend?.afterFill
                          ?.promptVisibleInTextarea === true &&
                        summary.skillsRuntimeInputSend?.clicked?.clicked ===
                          true,
                      guiSkillsRuntimeCompleted:
                        summary.guiSkillsRuntimeCompleted?.hasPrompt === true &&
                        (summary.guiSkillsRuntimeCompleted
                          ?.hasAssistantSummary === true ||
                          summary.guiSkillsRuntimeCompleted?.hasDoneText ===
                            true) &&
                        summary.guiSkillsRuntimeCompleted?.textareaVisible ===
                          true &&
                        summary.guiSkillsRuntimeCompleted?.textareaDisabled ===
                          false &&
                        summary.guiSkillsRuntimeCompleted?.stopButtonVisible ===
                          false,
                      readModelSkillsRuntimeCompleted:
                        summary.readModelSkillsRuntimeCompleted
                          ?.includesPrompt === true &&
                        (summary.readModelSkillsRuntimeCompleted
                          ?.includesAssistantDone === true ||
                          summary.readModelSkillsRuntimeCompleted
                            ?.includesAssistantSummary === true),
                      readModelSkillSearchObserved:
                        summary.readModelSkillsRuntimeCompleted
                          ?.includesSkillSearchTool === true,
                      readModelSkillInvocationObserved:
                        summary.readModelSkillsRuntimeCompleted
                          ?.includesSkillTool === true &&
                        summary.readModelSkillsRuntimeCompleted
                          ?.includesSkillName === true,
                      evidenceSkillBodyReadObserved:
                        summary.evidencePackSkillsRuntime
                          ?.skillBodyReadObserved === true,
                      evidenceSkillGateObserved:
                        summary.evidencePackSkillsRuntime?.skillGateObserved ===
                        true,
                      evidencePackSkillSearchObserved:
                        summary.evidencePackSkillsRuntime
                          ?.hasSkillSearchSummary === true &&
                        summary.evidencePackSkillsRuntime?.searchQuery ===
                          SKILLS_RUNTIME_QUERY,
                      evidencePackSkillInvocationObserved:
                        summary.evidencePackSkillsRuntime
                          ?.hasSkillInvocationSummary === true &&
                        summary.evidencePackSkillsRuntime
                          ?.invocationSkillName === SKILLS_RUNTIME_SKILL_NAME,
                      skillSearchBeforeSkillInvocation:
                        summary.evidencePackSkillsRuntime
                          ?.skillSearchBeforeSkillInvocation === true,
                      explicitSkillsRuntimePromptReachedBackend:
                        explicitSkillsRuntimeTurnStart?.inputText ===
                        SKILLS_RUNTIME_EXPLICIT_PROMPT,
                      guiExplicitSkillsRuntimeInputSubmitted:
                        summary.explicitSkillsRuntimeInputSend?.afterFill
                          ?.promptVisibleInTextarea === true &&
                        summary.explicitSkillsRuntimeInputSend?.clicked
                          ?.clicked === true,
                      guiExplicitSkillsRuntimeCompleted:
                        summary.guiExplicitSkillsRuntimeCompleted?.hasPrompt ===
                          true &&
                        (summary.guiExplicitSkillsRuntimeCompleted
                          ?.hasAssistantSummary === true ||
                          summary.guiExplicitSkillsRuntimeCompleted
                            ?.hasDoneText === true) &&
                        summary.guiExplicitSkillsRuntimeCompleted
                          ?.textareaVisible === true &&
                        summary.guiExplicitSkillsRuntimeCompleted
                          ?.textareaDisabled === false &&
                        summary.guiExplicitSkillsRuntimeCompleted
                          ?.stopButtonVisible === false,
                      readModelExplicitSkillsRuntimeCompleted:
                        summary.readModelExplicitSkillsRuntimeCompleted
                          ?.includesPrompt === true &&
                        (summary.readModelExplicitSkillsRuntimeCompleted
                          ?.includesAssistantDone === true ||
                          summary.readModelExplicitSkillsRuntimeCompleted
                            ?.includesAssistantSummary === true),
                      readModelExplicitSkillSearchObserved:
                        summary.readModelExplicitSkillsRuntimeCompleted
                          ?.includesSkillSearchTool === true,
                      readModelExplicitSkillInvocationObserved:
                        summary.readModelExplicitSkillsRuntimeCompleted
                          ?.includesSkillTool === true &&
                        summary.readModelExplicitSkillsRuntimeCompleted
                          ?.includesSkillName === true,
                      evidenceExplicitSkillBodyReadObserved:
                        summary.evidencePackExplicitSkillsRuntime
                          ?.skillBodyReadObserved === true,
                      evidenceExplicitSkillGateObserved:
                        summary.evidencePackExplicitSkillsRuntime
                          ?.skillGateObserved === true,
                      evidencePackExplicitSkillSearchObserved:
                        summary.evidencePackExplicitSkillsRuntime
                          ?.hasSkillSearchSummary === true &&
                        summary.evidencePackExplicitSkillsRuntime
                          ?.searchQuery === SKILLS_RUNTIME_QUERY,
                      evidencePackExplicitSkillInvocationObserved:
                        summary.evidencePackExplicitSkillsRuntime
                          ?.hasSkillInvocationSummary === true &&
                        summary.evidencePackExplicitSkillsRuntime
                          ?.invocationSkillName === SKILLS_RUNTIME_SKILL_NAME,
                      explicitSkillSearchBeforeSkillInvocation:
                        summary.evidencePackExplicitSkillsRuntime
                          ?.skillSearchBeforeSkillInvocation === true,
                      manualEnableSkillsRuntimePromptReachedBackend:
                        manualEnableSkillsRuntimeTurnStart?.inputText ===
                        SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
                      manualEnableSkillsRuntimeMetadataReachedBackend:
                        manualEnableRuntimeMetadata?.source ===
                          "manual_session_enable" &&
                        manualEnableRuntimeMetadata?.approval === "manual" &&
                        manualEnableRuntimeMetadata?.workspace_root ===
                          workspace.rootPath &&
                        manualEnableRuntimeBinding?.directory ===
                          "capability-report" &&
                        manualEnableRuntimeBinding?.skill ===
                          SKILLS_RUNTIME_SKILL_NAME &&
                        manualEnableRuntimeBinding?.registered_skill_directory ===
                          summary.manualEnableSkillsRuntimeSkill
                            ?.skillDirectory &&
                        manualEnableRuntimeBinding?.source_draft_id ===
                          "capdraft-fixture-capability-report" &&
                        manualEnableRuntimeBinding?.source_verification_report_id ===
                          "capver-fixture-capability-report",
                      manualEnableSkillsRuntimeLaunchedFromSkillsWorkspace:
                        summary.manualEnableSkillsRuntimeTurnStart?.launch
                          ?.clicked === true &&
                        summary.manualEnableSkillsRuntimeTurnStart?.launch
                          ?.registeredPanelVisible === true &&
                        summary.manualEnableSkillsRuntimeTurnStart?.launch
                          ?.enableButtonVisible === true &&
                        summary.manualEnableSkillsRuntimeTurnStart?.launch
                          ?.enableButtonDisabled === false,
                      manualEnableSkillsRuntimeUsedAgentSession:
                        typeof summary.manualEnableSkillsRuntimeTurnStart
                          ?.backend?.sessionId === "string" &&
                        summary.manualEnableSkillsRuntimeTurnStart.backend
                          .sessionId.length > 0 &&
                        typeof summary.manualEnableSkillsRuntimeTurnStart
                          ?.backend?.turnId === "string" &&
                        summary.manualEnableSkillsRuntimeTurnStart.backend
                          .turnId.length > 0,
                      manualEnableSkillsRuntimeSkillDirectoryPrepared:
                        typeof summary.manualEnableSkillsRuntimeSkill
                          ?.skillFilePath === "string" &&
                        fs.existsSync(
                          summary.manualEnableSkillsRuntimeSkill.skillFilePath,
                        ),
                      guiManualEnableSkillsRuntimeCompleted:
                        summary.guiManualEnableSkillsRuntimeCompleted
                          ?.hasPrompt === true &&
                        (summary.guiManualEnableSkillsRuntimeCompleted
                          ?.hasAssistantSummary === true ||
                          summary.guiManualEnableSkillsRuntimeCompleted
                            ?.hasDoneText === true) &&
                        summary.guiManualEnableSkillsRuntimeCompleted
                          ?.textareaVisible === true &&
                        summary.guiManualEnableSkillsRuntimeCompleted
                          ?.textareaDisabled === false &&
                        summary.guiManualEnableSkillsRuntimeCompleted
                          ?.stopButtonVisible === false,
                      readModelManualEnableSkillsRuntimeCompleted:
                        summary.readModelManualEnableSkillsRuntimeCompleted
                          ?.includesPrompt === true &&
                        (summary.readModelManualEnableSkillsRuntimeCompleted
                          ?.includesAssistantDone === true ||
                          summary.readModelManualEnableSkillsRuntimeCompleted
                            ?.includesAssistantSummary === true),
                      readModelManualEnableSkillSearchObserved:
                        summary.readModelManualEnableSkillsRuntimeCompleted
                          ?.includesSkillSearchTool === true,
                      readModelManualEnableSkillInvocationObserved:
                        summary.readModelManualEnableSkillsRuntimeCompleted
                          ?.includesSkillTool === true &&
                        summary.readModelManualEnableSkillsRuntimeCompleted
                          ?.includesSkillName === true,
                      evidenceManualEnableSkillBodyReadObserved:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.skillBodyReadObserved === true,
                      evidenceManualEnableSkillGateObserved:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.skillGateObserved === true &&
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.skillGateMode === "workspace_runtime_enable",
                      evidenceManualEnableWorkspaceRuntimeEnableObserved:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.skillGateWorkspaceRuntimeEnable === true &&
                        summary.evidencePackManualEnableSkillsRuntime?.skillGateSourceAllowlist?.includes(
                          SKILLS_RUNTIME_SKILL_NAME,
                        ) === true,
                      evidencePackManualEnableSkillSearchObserved:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.hasSkillSearchSummary === true &&
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.searchQuery === SKILLS_RUNTIME_QUERY,
                      evidencePackManualEnableSkillInvocationObserved:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.hasSkillInvocationSummary === true &&
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.invocationSkillName === SKILLS_RUNTIME_SKILL_NAME,
                      manualEnableSkillSearchBeforeSkillInvocation:
                        summary.evidencePackManualEnableSkillsRuntime
                          ?.skillSearchBeforeSkillInvocation === true,
                    }
                  : isAnyExpertSkillsRuntimeScenario
                    ? {
                        ...(isExpertPanelSkillsRuntimeScenario
                          ? {}
                          : {
                              expertSkillsRuntimePromptReachedBackend:
                                expertSkillsRuntimeTurnStart?.inputText?.includes(
                                  EXPERT_SKILLS_RUNTIME_PROMPT,
                                ) === true,
                              expertSkillsRuntimeMetadataReachedBackend:
                                (expertRuntimeMetadata?.expertId ===
                                  EXPERT_SKILLS_RUNTIME_ID ||
                                  expertRuntimeMetadata?.expert_id ===
                                    EXPERT_SKILLS_RUNTIME_ID) &&
                                (expertHarnessMetadata?.expert_id ===
                                  EXPERT_SKILLS_RUNTIME_ID ||
                                  expertHarnessMetadata?.expertId ===
                                    EXPERT_SKILLS_RUNTIME_ID) &&
                                expertHarnessSkillRefs.includes(
                                  expectedExpertHarnessSkillRef,
                                ) === true,
                              expertDeclaredSkillRefsObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.expertDeclaredObserved === true &&
                                summary.evidencePackExpertSkillsRuntime?.expertDeclaredSkillRefs?.includes(
                                  EXPERT_SKILLS_RUNTIME_SKILL_REF,
                                ) === true,
                              expertSelectedSkillObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.expertSelectedObserved === true &&
                                summary.evidencePackExpertSkillsRuntime
                                  ?.expertSelectedSkill ===
                                  SKILLS_RUNTIME_SKILL_NAME,
                              expertInvokedSkillObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.expertInvokedObserved === true &&
                                summary.evidencePackExpertSkillsRuntime
                                  ?.expertInvokedSkill ===
                                  SKILLS_RUNTIME_SKILL_NAME,
                              guiExpertSkillsRuntimeSessionVisible:
                                summary.guiExpertSkillsRuntimeSessionVisible
                                  ?.hasSessionTitle === true ||
                                summary.guiExpertSkillsRuntimeCompleted?.bodyText?.includes(
                                  EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
                                ) === true ||
                                summary.guiExpertSkillsRuntimeCompleted?.bodyText?.includes(
                                  EXPERT_SKILLS_RUNTIME_TITLE,
                                ) === true,
                              readModelExpertSkillsRuntimeCompleted:
                                summary.readModelExpertSkillsRuntimeCompleted
                                  ?.includesPrompt === true &&
                                (summary.readModelExpertSkillsRuntimeCompleted
                                  ?.includesAssistantDone === true ||
                                  summary.readModelExpertSkillsRuntimeCompleted
                                    ?.includesAssistantSummary === true),
                              readModelExpertSkillSearchObserved:
                                summary.readModelExpertSkillsRuntimeCompleted
                                  ?.includesSkillSearchTool === true,
                              readModelExpertSkillInvocationObserved:
                                summary.readModelExpertSkillsRuntimeCompleted
                                  ?.includesSkillTool === true &&
                                summary.readModelExpertSkillsRuntimeCompleted
                                  ?.includesSkillName === true,
                              evidenceExpertSkillBodyReadObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.skillBodyReadObserved === true,
                              evidenceExpertSkillGateObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.skillGateObserved === true &&
                                summary.evidencePackExpertSkillsRuntime
                                  ?.skillGateMode === "selected_skills",
                              evidencePackExpertSkillSearchObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.hasSkillSearchSummary === true &&
                                summary.evidencePackExpertSkillsRuntime
                                  ?.searchQuery === SKILLS_RUNTIME_QUERY,
                              evidencePackExpertSkillInvocationObserved:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.hasSkillInvocationSummary === true &&
                                summary.evidencePackExpertSkillsRuntime
                                  ?.invocationSkillName ===
                                  SKILLS_RUNTIME_SKILL_NAME,
                              expertSkillSearchBeforeSkillInvocation:
                                summary.evidencePackExpertSkillsRuntime
                                  ?.skillSearchBeforeSkillInvocation === true,
                            }),
                        ...(isExpertPlazaSkillsRuntimeScenario ||
                        isExpertPanelSkillsRuntimeScenario
                          ? {
                              expertPlazaCatalogInjected:
                                summary.expertPlazaSkillsRuntimeCatalog
                                  ?.expertId === EXPERT_SKILLS_RUNTIME_ID &&
                                summary.expertPlazaSkillsRuntimeCatalog?.skillRefs?.includes(
                                  isExpertPanelSkillsRuntimeScenario
                                    ? EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF
                                    : EXPERT_SKILLS_RUNTIME_SKILL_REF,
                                ) === true &&
                                summary.expertPlazaSkillsRuntimeCatalog
                                  ?.promptStarter ===
                                  EXPERT_SKILLS_RUNTIME_PROMPT,
                              expertPlazaCardClicked:
                                summary.expertPlazaSkillsRuntimeLaunch
                                  ?.clicked === true &&
                                summary.expertPlazaSkillsRuntimeLaunch
                                  ?.plazaVisible === true &&
                                summary.expertPlazaSkillsRuntimeLaunch
                                  ?.cardVisible === true &&
                                summary.expertPlazaSkillsRuntimeLaunch
                                  ?.startButtonVisible === true,
                              expertPlazaAutoSendTurnStarted:
                                typeof summary.expertSkillsRuntimeTurnStart
                                  ?.sessionId === "string" &&
                                summary.expertSkillsRuntimeTurnStart.sessionId
                                  .length > 0 &&
                                summary.expertSkillsRuntimeTurnStart?.inputText?.includes(
                                  EXPERT_SKILLS_RUNTIME_PROMPT,
                                ) === true,
                            }
                          : {}),
                        ...(isExpertPanelSkillsRuntimeScenario
                          ? {
                              expertPanelSkillPickerOpened:
                                summary.expertPanelSkillsRuntimeAddSkill
                                  ?.pickerOpened?.dialogVisible === true,
                              expertPanelSkillAdded:
                                summary.expertPanelSkillsRuntimeAddSkill
                                  ?.candidate?.addButtonVisible === true &&
                                summary.expertPanelSkillsRuntimeAddSkill
                                  ?.candidate?.addButtonDisabled === false,
                              expertPanelAddedSkillVisible:
                                summary.expertPanelSkillsRuntimeAddSkill?.added
                                  ?.baseSkillVisible === true &&
                                summary.expertPanelSkillsRuntimeAddSkill?.added
                                  ?.addedSkillVisible === true,
                              expertPanelSecondTurnPromptReachedBackend:
                                expertPanelSkillsRuntimeTurnStart?.inputText ===
                                EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
                              expertPanelSkillRefsOverrideReachedBackend:
                                summary.evidencePackExpertPanelSkillsRuntime?.expertDeclaredSkillRefs?.includes(
                                  EXPERT_PANEL_SKILLS_RUNTIME_UI_SKILL_REF,
                                ) === true,
                              expertPanelReadModelCompleted:
                                summary
                                  .readModelExpertPanelSkillsRuntimeCompleted
                                  ?.includesPrompt === true &&
                                (summary
                                  .readModelExpertPanelSkillsRuntimeCompleted
                                  ?.includesAssistantDone === true ||
                                  summary
                                    .readModelExpertPanelSkillsRuntimeCompleted
                                    ?.includesAssistantSummary === true),
                              expertPanelEvidenceSkillBodyReadObserved:
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.skillBodyReadObserved === true,
                              expertPanelEvidenceSkillGateObserved:
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.skillGateObserved === true &&
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.skillGateMode === "selected_skills",
                              expertPanelEvidenceSkillSearchObserved:
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.hasSkillSearchSummary === true &&
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.searchQuery === SKILLS_RUNTIME_QUERY,
                              expertPanelEvidenceSkillInvocationObserved:
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.hasSkillInvocationSummary === true &&
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.invocationSkillName ===
                                  SKILLS_RUNTIME_SKILL_NAME,
                              expertPanelSkillSearchBeforeSkillInvocation:
                                summary.evidencePackExpertPanelSkillsRuntime
                                  ?.skillSearchBeforeSkillInvocation === true,
                              expertPanelEvidencePackExportedFromHarnessPanel:
                                summary.expertPanelEvidencePackGuiExport
                                  ?.clicked?.clicked === true &&
                                summary.expertPanelEvidencePackGuiExport
                                  ?.exported?.hasExportedPack === true,
                            }
                          : {}),
                      }
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
                                  summary.guiContinueCompleted?.hasPrompt ===
                                    true &&
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
                            summary.eventReadProbe?.events?.hasToolStarted ===
                              true &&
                            summary.eventReadProbe?.events?.hasToolResult ===
                              true &&
                            summary.eventReadProbe?.events?.hasTerminal ===
                              true &&
                            summary.eventReadProbe?.events?.eventTurnIds
                              ?.length === 1 &&
                            summary.eventReadProbe?.events
                              ?.eventTurnIds?.[0] === EVENT_READ_PROBE_TURN_ID,
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
                            summary.eventReadProbe?.readModel?.toolStatus ===
                              "completed" &&
                            summary.eventReadProbe?.readModel
                              ?.containsToolOutput === true &&
                            summary.eventReadProbe?.readModel?.toolTurnId ===
                              EVENT_READ_PROBE_TURN_ID,
                        };
  return scenarioAssertions;
}
