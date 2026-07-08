import {
  ASSISTANT_DONE_TEXT,
  CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO,
  CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EXPERT_SKILLS_RUNTIME_SESSION_ID,
  EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  IMAGE_COMMAND_SCENARIO,
  INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO,
  INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO,
  INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO,
  INPUTBAR_RICH_RESTORE_SCENARIO,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  MULTI_AGENT_TEAM_DONE_TEXT,
  MULTI_AGENT_TEAM_PROMPT,
  MULTI_AGENT_TEAM_SCENARIO,
  MULTI_AGENT_TEAM_SUMMARY_TEXT,
  NEWS_PROMPT,
  PLAIN_IMAGE_INTENT_SCENARIO,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  REASONING_FIRST_VISIBLE_DONE_TEXT,
  REASONING_FIRST_VISIBLE_FINAL_TEXT,
  REASONING_FIRST_VISIBLE_PROMPT,
  REASONING_FIRST_VISIBLE_SCENARIO,
  REASONING_FIRST_VISIBLE_TEXT,
  RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
  SESSION_ID,
  SOUL_STYLE_SCENARIO,
  TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO,
  TERMINAL_FAILED_AFTER_ANSWER_SCENARIO,
  TERMINAL_STALE_GUARD_SCENARIO,
} from "./claw-chat-current-fixture-constants.mjs";
import { runContentFactoryArticleWorkspaceScenario } from "./claw-chat-current-fixture-content-factory-article-workspace.mjs";
import { runContentFactoryInlineImageArticleWorkspaceScenario } from "./claw-chat-current-fixture-inline-image-article-workspace.mjs";
import { collectAgentUiPerformanceTraceEvidence } from "./claw-chat-current-fixture-agent-ui-trace.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  enableGoalModeFromGui,
  enablePlanModeFromGui,
} from "./claw-chat-current-fixture-gui-input-modes.mjs";
import {
  runInputbarRichRestoreScenario,
} from "./claw-chat-current-fixture-inputbar-rich-restore.mjs";
import {
  runInputbarPendingSteerMultiQueueScenario,
  runInputbarPendingSteerPopFrontResumeScenario,
  runInputbarPendingSteerRichRestoreScenario,
} from "./claw-chat-current-fixture-inputbar-pending-steer.mjs";
import {
  waitForGuiChatCanceled,
  waitForGuiChatCompleted,
  waitForGuiPlanCompleted,
  waitForGuiReasoningFirstVisibleBeforeAnswer,
  waitForGuiReasoningFirstVisibleCompleted,
  waitForStopButtonVisibleAndClick,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForGuiMcpStructuredContentCompleted } from "./claw-chat-current-fixture-gui-tool-waits.mjs";
import { runImageCommandScenario } from "./claw-chat-current-fixture-image-command.mjs";
import {
  MEDIA_REFERENCE_SCENARIO,
  runMediaReferenceScenario,
} from "./claw-chat-current-fixture-media-reference.mjs";
import {
  runTerminalCanceledAfterAnswerScenario,
  runTerminalFailedAfterAnswerScenario,
} from "./claw-chat-current-fixture-terminal-after-answer.mjs";
import { runTerminalStaleGuardScenario } from "./claw-chat-current-fixture-terminal-stale-guard.mjs";
import {
  createExpertSkillsRuntimeSession,
  openSessionFromSidebar,
  sendNewsPromptFromGui,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  runExpertSkillsRuntimeScenario,
  runSkillsRuntimeScenario,
} from "./claw-chat-current-fixture-skills-runtime-flow.mjs";
import { verifyPlanHistoryHydrate } from "./claw-chat-current-fixture-plan-history.mjs";
import { runRightSurfaceVisualMatrix } from "./claw-chat-current-fixture-right-surface-visual.mjs";
import { runWebToolsRenderingScenario } from "./claw-chat-current-fixture-web-tools-rendering.mjs";
import {
  exportMultiAgentTeamEvidencePack,
  runEventReadProbe,
  waitForSessionReadCanceled,
  waitForSessionReadCompleted,
  waitForSessionReadMcpStructuredContentCompleted,
  waitForSessionReadPlanCompleted,
} from "./claw-chat-current-fixture-read-model-waits.mjs";
import {
  waitForBackendLedgerEntry,
  waitForBackendLedgerTurnStart,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import { resolveSoulStyleFixtureExpectedTexts } from "./claw-chat-current-fixture-soul-style.mjs";
import { logStage, sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

function collectReadModelThreadItems(readModel) {
  const detailItems = Array.isArray(readModel?.detail?.items)
    ? readModel.detail.items
    : [];
  const threadReadItems = Array.isArray(
    readModel?.detail?.thread_read?.thread_items,
  )
    ? readModel.detail.thread_read.thread_items
    : [];
  return [...detailItems, ...threadReadItems].filter(Boolean);
}

function summarizeReasoningFirstVisibleReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  const items = collectReadModelThreadItems(readModel);
  const reasoningItems = items.filter((item) => item?.type === "reasoning");
  const reasoningItem = reasoningItems.find((item) =>
    JSON.stringify(item || {}).includes(REASONING_FIRST_VISIBLE_TEXT),
  );
  const reasoningSequence =
    typeof reasoningItem?.sequence === "number" ? reasoningItem.sequence : null;
  const finalItem = items.find((item) =>
    JSON.stringify(item || {}).includes(REASONING_FIRST_VISIBLE_FINAL_TEXT),
  );
  const finalSequence =
    typeof finalItem?.sequence === "number" ? finalItem.sequence : null;

  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    threadReadItemCount: Array.isArray(
      readModel?.detail?.thread_read?.thread_items,
    )
      ? readModel.detail.thread_read.thread_items.length
      : null,
    latestTurnStatus:
      readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
      readModel?.detail?.thread_read?.status ??
      readModel?.detail?.status ??
      null,
    includesPrompt: serialized.includes(REASONING_FIRST_VISIBLE_PROMPT),
    includesAssistantDone: serialized.includes(
      REASONING_FIRST_VISIBLE_DONE_TEXT,
    ),
    includesFinalText: serialized.includes(REASONING_FIRST_VISIBLE_FINAL_TEXT),
    includesReasoningText: serialized.includes(REASONING_FIRST_VISIBLE_TEXT),
    includesReasoningItem: Boolean(reasoningItem),
    reasoningItemCount: reasoningItems.length,
    reasoningItemStatus: reasoningItem?.status ?? null,
    reasoningSequence,
    finalSequence,
    reasoningSequenceBeforeFinal:
      reasoningSequence != null &&
      finalSequence != null &&
      reasoningSequence < finalSequence,
  };
}

function traceEvidenceHasProviderAndClient(evidence) {
  return (
    evidence?.hasProviderWaitMs === true &&
    evidence?.hasClientLocalOutputMs === true &&
    evidence?.hasFirstVisibleOutputMs === true &&
    evidence?.hasFirstTextDeltaToFirstTextPaintMs === true
  );
}

async function recordAgentUiPerformanceTraceEvidence(summary, page) {
  const evidence = sanitizeJson(
    await collectAgentUiPerformanceTraceEvidence(page),
  );
  summary.agentUiPerformanceTraceLatest = evidence;
  if (
    !summary.agentUiPerformanceTrace ||
    !traceEvidenceHasProviderAndClient(summary.agentUiPerformanceTrace) ||
    traceEvidenceHasProviderAndClient(evidence)
  ) {
    summary.agentUiPerformanceTrace = evidence;
  }
}

export async function executeScenarioFlow({
  page,
  options,
  workspace,
  summary,
  appServerRequests,
  runtimeEnv,
}) {
  const isImageIntentScenario =
    options.scenario === IMAGE_COMMAND_SCENARIO ||
    options.scenario === PLAIN_IMAGE_INTENT_SCENARIO;
  if (options.scenario === CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO) {
    logStage("run-content-factory-article-workspace");
    Object.assign(
      summary,
      await runContentFactoryArticleWorkspaceScenario({
        page,
        options,
        workspace,
        summary,
        appServerRequests,
      }),
    );
  } else if (
    options.scenario === CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO
  ) {
    logStage("run-content-factory-inline-image-article-workspace");
    Object.assign(
      summary,
      await runContentFactoryInlineImageArticleWorkspaceScenario({
        page,
        options,
        workspace,
        summary,
        appServerRequests,
      }),
    );
  } else if (options.scenario === RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO) {
    logStage("create-right-surface-visual-expert-session");
    const expertSessionCreation = await createExpertSkillsRuntimeSession(
      page,
      workspace,
      appServerRequests,
    );
    summary.rightSurfaceVisualMatrixSessionCreation = sanitizeJson({
      sessionId:
        expertSessionCreation.session?.session?.sessionId ??
        expertSessionCreation.session?.sessionId ??
        null,
      expertId: expertSessionCreation.expertMetadata?.expert?.expertId ?? null,
      skillRefs: expertSessionCreation.expertMetadata?.expert?.skillRefs ?? [],
    });

    logStage("open-right-surface-visual-expert-session");
    summary.guiRightSurfaceVisualMatrixSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(
        page,
        options,
        EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
      ),
    );
    summary.guiRightSurfaceVisualMatrixSessionOpened = sanitizeJson(
      await openSessionFromSidebar(page, options, appServerRequests, {
        sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
        title: EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
      }),
    );

    logStage("run-right-surface-visual-matrix");
    summary.rightSurfaceVisualMatrix = sanitizeJson(
      await runRightSurfaceVisualMatrix({
        page,
        options,
        workspace,
        appServerRequests,
        sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      }),
    );
  } else if (options.scenario === INPUTBAR_RICH_RESTORE_SCENARIO) {
    logStage("run-inputbar-rich-restore");
    Object.assign(
      summary,
      await runInputbarRichRestoreScenario({
        page,
        options,
        summary,
        appServerRequests,
        runtimeEnv,
      }),
    );
  } else if (
    options.scenario === INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO
  ) {
    logStage("run-inputbar-pending-steer-rich-restore");
    Object.assign(
      summary,
      await runInputbarPendingSteerRichRestoreScenario({
        page,
        options,
        summary,
        appServerRequests,
        runtimeEnv,
      }),
    );
  } else if (options.scenario === INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO) {
    logStage("run-inputbar-pending-steer-multi-queue");
    Object.assign(
      summary,
      await runInputbarPendingSteerMultiQueueScenario({
        page,
        options,
        summary,
        appServerRequests,
        runtimeEnv,
      }),
    );
  } else if (
    options.scenario === INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO
  ) {
    logStage("run-inputbar-pending-steer-pop-front-resume");
    Object.assign(
      summary,
      await runInputbarPendingSteerPopFrontResumeScenario({
        page,
        options,
        summary,
        appServerRequests,
        runtimeEnv,
      }),
    );
  } else if (options.scenario === "plan") {
    logStage("enable-plan-mode-from-gui");
    summary.planModeEnabled = sanitizeJson(
      await enablePlanModeFromGui(page, options),
    );

    logStage("send-plan-prompt-from-gui");
    summary.planInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, PLAN_PROMPT),
    );

    logStage("wait-gui-plan-completed");
    summary.guiPlanCompleted = sanitizeJson(
      await waitForGuiPlanCompleted(page, options),
    );

    logStage("wait-read-model-plan-completed");
    const readModelPlanCompleted = await waitForSessionReadPlanCompleted(
      page,
      options,
      appServerRequests,
    );
    summary.readModelPlanCompleted = sanitizeJson({
      latestTurnCompleted:
        readModelPlanCompleted?.detail?.status === "completed" ||
        readModelPlanCompleted?.detail?.thread_read?.status === "completed" ||
        readModelPlanCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus === "completed",
      detailItemCount: Array.isArray(readModelPlanCompleted?.detail?.items)
        ? readModelPlanCompleted.detail.items.length
        : null,
      latestTurnStatus:
        readModelPlanCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelPlanCompleted?.detail?.thread_read?.status ??
        readModelPlanCompleted?.detail?.status ??
        null,
      includesPrompt: JSON.stringify(readModelPlanCompleted || {}).includes(
        PLAN_PROMPT,
      ),
      includesProposedPlanBlock:
        JSON.stringify(readModelPlanCompleted || {}).includes(
          "<proposed_plan>",
        ) &&
        JSON.stringify(readModelPlanCompleted || {}).includes(
          "</proposed_plan>",
        ),
      includesAssistantDone: JSON.stringify(
        readModelPlanCompleted || {},
      ).includes(PLAN_DONE_TEXT),
      includesPlanItem:
        JSON.stringify(readModelPlanCompleted || {}).includes("plan") ||
        JSON.stringify(readModelPlanCompleted || {}).includes("proposed_plan"),
      includesAllPlanSteps: PLAN_STEPS.every((step) =>
        JSON.stringify(readModelPlanCompleted || {}).includes(step.step),
      ),
    });
    await recordAgentUiPerformanceTraceEvidence(summary, page);

    logStage("verify-plan-history-hydrate-from-sidebar");
    Object.assign(
      summary,
      await verifyPlanHistoryHydrate({
        page,
        options,
        requestLog: appServerRequests,
        readModelPlanCompleted,
      }),
    );
  } else if (options.scenario === "goal") {
    logStage("enable-goal-mode-from-gui");
    summary.goalModeEnabled = sanitizeJson(
      await enableGoalModeFromGui(page, options),
    );

    logStage("send-goal-prompt-from-gui");
    summary.goalInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, GOAL_PROMPT),
    );

    logStage("wait-gui-goal-completed");
    summary.guiGoalCompleted = sanitizeJson(
      await waitForGuiChatCompleted(page, options, {
        prompt: GOAL_PROMPT,
        doneText: GOAL_DONE_TEXT,
        summaryText: "目标已绑定到本轮请求",
      }),
    );

    logStage("wait-read-model-goal-completed");
    const readModelGoalCompleted = await waitForSessionReadCompleted(
      page,
      options,
      appServerRequests,
      {
        prompt: GOAL_PROMPT,
        doneText: GOAL_DONE_TEXT,
        summaryText: "目标已绑定到本轮请求",
      },
    );
    summary.readModelGoalCompleted = sanitizeJson({
      detailItemCount: Array.isArray(readModelGoalCompleted?.detail?.items)
        ? readModelGoalCompleted.detail.items.length
        : null,
      latestTurnStatus:
        readModelGoalCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelGoalCompleted?.detail?.thread_read?.status ??
        readModelGoalCompleted?.detail?.status ??
        null,
      includesPrompt: JSON.stringify(readModelGoalCompleted || {}).includes(
        GOAL_PROMPT,
      ),
      includesAssistantDone: JSON.stringify(
        readModelGoalCompleted || {},
      ).includes(GOAL_DONE_TEXT),
      includesAssistantSummary: JSON.stringify(
        readModelGoalCompleted || {},
      ).includes("目标已绑定到本轮请求"),
    });
  } else if (isImageIntentScenario) {
    logStage("run-image-command-scenario");
    Object.assign(
      summary,
      await runImageCommandScenario({
        page,
        options,
        workspace,
        appServerRequests,
        runtimeEnv,
        imageFixtureProvider: summary.imageFixtureProvider,
        summary,
      }),
    );
  } else if (options.scenario === MEDIA_REFERENCE_SCENARIO) {
    logStage("run-media-reference-scenario");
    Object.assign(
      summary,
      await runMediaReferenceScenario({
        page,
        options,
        appServerRequests,
      }),
    );
  } else if (options.scenario === REASONING_FIRST_VISIBLE_SCENARIO) {
    logStage("send-reasoning-first-visible-prompt-from-gui");
    summary.reasoningFirstVisibleInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, REASONING_FIRST_VISIBLE_PROMPT),
    );

    logStage("wait-gui-reasoning-first-visible-before-answer");
    summary.guiReasoningFirstVisibleBeforeAnswer = sanitizeJson(
      await waitForGuiReasoningFirstVisibleBeforeAnswer(page, options),
    );

    logStage("wait-gui-reasoning-first-visible-completed");
    summary.guiReasoningFirstVisibleCompleted = sanitizeJson(
      await waitForGuiReasoningFirstVisibleCompleted(page, options),
    );

    logStage("wait-read-model-reasoning-first-visible-completed");
    const readModelReasoningFirstVisibleCompleted =
      await waitForSessionReadCompleted(page, options, appServerRequests, {
        prompt: REASONING_FIRST_VISIBLE_PROMPT,
        doneText: REASONING_FIRST_VISIBLE_DONE_TEXT,
        summaryText: REASONING_FIRST_VISIBLE_FINAL_TEXT,
      });
    summary.readModelReasoningFirstVisibleCompleted = sanitizeJson(
      summarizeReasoningFirstVisibleReadModel(
        readModelReasoningFirstVisibleCompleted,
      ),
    );

    await recordAgentUiPerformanceTraceEvidence(summary, page);
  } else if (options.scenario === TERMINAL_FAILED_AFTER_ANSWER_SCENARIO) {
    Object.assign(
      summary,
      await runTerminalFailedAfterAnswerScenario({
        page,
        options,
        appServerRequests,
        runtimeEnv,
        logStage,
      }),
    );
  } else if (options.scenario === TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO) {
    Object.assign(
      summary,
      await runTerminalCanceledAfterAnswerScenario({
        page,
        options,
        appServerRequests,
        runtimeEnv,
        logStage,
      }),
    );
  } else if (options.scenario === TERMINAL_STALE_GUARD_SCENARIO) {
    Object.assign(
      summary,
      await runTerminalStaleGuardScenario({
        page,
        options,
        appServerRequests,
        runtimeEnv,
        logStage,
      }),
    );
  } else if (options.scenario === "web-tools-rendering") {
    Object.assign(
      summary,
      await runWebToolsRenderingScenario({
        page,
        options,
        appServerRequests,
        logStage,
      }),
    );
  } else if (options.scenario === "mcp-structured-content") {
    logStage("send-mcp-structured-content-prompt-from-gui");
    summary.mcpStructuredContentInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, MCP_STRUCTURED_CONTENT_PROMPT),
    );

    logStage("wait-gui-mcp-structured-content-completed");
    summary.guiMcpStructuredContentCompleted = sanitizeJson(
      await waitForGuiMcpStructuredContentCompleted(page, options),
    );

    logStage("wait-read-model-mcp-structured-content-completed");
    const readModelMcpStructuredContentCompleted =
      await waitForSessionReadMcpStructuredContentCompleted(
        page,
        options,
        appServerRequests,
      );
    summary.readModelMcpStructuredContentCompleted =
      readModelMcpStructuredContentCompleted.summary;
  } else if (options.scenario === MULTI_AGENT_TEAM_SCENARIO) {
    logStage("send-multi-agent-team-prompt-from-gui");
    summary.multiAgentTeamInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, MULTI_AGENT_TEAM_PROMPT),
    );

    logStage("wait-multi-agent-team-backend-turn-start");
    const multiAgentTeamBackendTurn = await waitForBackendLedgerTurnStart(
      runtimeEnv.backendLedgerPath,
      MULTI_AGENT_TEAM_PROMPT,
      options,
    );
    const multiAgentTeamSessionId =
      multiAgentTeamBackendTurn.entry.sessionId ?? SESSION_ID;
    const multiAgentTeamTurnId = multiAgentTeamBackendTurn.entry.turnId ?? null;

    logStage("wait-gui-multi-agent-team-completed");
    summary.guiMultiAgentTeamCompleted = sanitizeJson(
      await waitForGuiChatCompleted(page, options, {
        prompt: MULTI_AGENT_TEAM_PROMPT,
        doneText: MULTI_AGENT_TEAM_DONE_TEXT,
        summaryText: MULTI_AGENT_TEAM_SUMMARY_TEXT,
      }),
    );

    logStage("wait-read-model-multi-agent-team-completed");
    const readModelMultiAgentTeamCompleted = await waitForSessionReadCompleted(
      page,
      options,
      appServerRequests,
      {
        sessionId: multiAgentTeamSessionId,
        prompt: MULTI_AGENT_TEAM_PROMPT,
        doneText: MULTI_AGENT_TEAM_DONE_TEXT,
        summaryText: MULTI_AGENT_TEAM_SUMMARY_TEXT,
      },
    );
    const serializedReadModel = JSON.stringify(
      readModelMultiAgentTeamCompleted || {},
    );
    summary.readModelMultiAgentTeamCompleted = sanitizeJson({
      detailItemCount: Array.isArray(
        readModelMultiAgentTeamCompleted?.detail?.items,
      )
        ? readModelMultiAgentTeamCompleted.detail.items.length
        : null,
      latestTurnStatus:
        readModelMultiAgentTeamCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelMultiAgentTeamCompleted?.detail?.thread_read?.status ??
        readModelMultiAgentTeamCompleted?.detail?.status ??
        null,
      includesPrompt: serializedReadModel.includes(MULTI_AGENT_TEAM_PROMPT),
      includesAssistantDone: serializedReadModel.includes(
        MULTI_AGENT_TEAM_DONE_TEXT,
      ),
      includesAssistantSummary: serializedReadModel.includes(
        MULTI_AGENT_TEAM_SUMMARY_TEXT,
      ),
      includesTeamSummary: serializedReadModel.includes(
        MULTI_AGENT_TEAM_SUMMARY_TEXT,
      ),
      includesSubagentStatus:
        serializedReadModel.includes("subagent_status_changed") ||
        serializedReadModel.includes("fixture-team-child-researcher") ||
        serializedReadModel.includes("fixture-team-child-reviewer"),
      forbiddenAgentFirstHistory:
        serializedReadModel.includes("subagentHistory") ||
        serializedReadModel.includes("subagent_history") ||
        serializedReadModel.includes("subagentSessionHistory"),
    });

    logStage("export-multi-agent-team-evidence-pack");
    const evidencePackMultiAgentTeam = await exportMultiAgentTeamEvidencePack(
      page,
      appServerRequests,
      {
        sessionId: multiAgentTeamSessionId,
        turnId: multiAgentTeamTurnId,
      },
    );
    summary.evidencePackMultiAgentTeam = evidencePackMultiAgentTeam.summary;
  } else if (options.scenario === "skills-runtime") {
    Object.assign(
      summary,
      await runSkillsRuntimeScenario({
        page,
        options,
        workspace,
        appServerRequests,
        runtimeEnv,
        logStage,
      }),
    );
  } else if (
    options.scenario === "expert-skills-runtime" ||
    options.scenario === "expert-plaza-skills-runtime" ||
    options.scenario === "expert-panel-skills-runtime"
  ) {
    Object.assign(
      summary,
      await runExpertSkillsRuntimeScenario({
        page,
        options,
        workspace,
        appServerRequests,
        runtimeEnv,
        logStage,
      }),
    );
  } else {
    logStage("send-news-prompt-from-gui");
    summary.inputSend = sanitizeJson(
      await sendNewsPromptFromGui(page, options),
    );
  }

  if (
    options.scenario === "cancel" ||
    options.scenario === "cancel-then-continue"
  ) {
    logStage("click-stop-from-gui");
    summary.stopClick = sanitizeJson(
      await waitForStopButtonVisibleAndClick(page, options, {
        requireVisibleOutput: true,
      }),
    );

    logStage("wait-gui-canceled");
    summary.guiCanceled = sanitizeJson(
      await waitForGuiChatCanceled(page, options),
    );

    logStage("wait-read-model-canceled");
    const readModelCanceled = await waitForSessionReadCanceled(
      page,
      options,
      appServerRequests,
    );
    summary.readModelCanceled = sanitizeJson({
      detailItemCount: Array.isArray(readModelCanceled?.detail?.items)
        ? readModelCanceled.detail.items.length
        : null,
      latestTurnStatus:
        readModelCanceled?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelCanceled?.detail?.thread_read?.status ??
        readModelCanceled?.detail?.status ??
        null,
      includesPrompt: JSON.stringify(readModelCanceled || {}).includes(
        NEWS_PROMPT,
      ),
      includesCanceled: JSON.stringify(readModelCanceled || {}).includes(
        "canceled",
      ),
    });
    const cancelLedger = await waitForBackendLedgerEntry(
      runtimeEnv.backendLedgerPath,
      (entry) => entry.kind === "turnCancel",
      options,
    );
    summary.backendCancelObserved = sanitizeJson({
      sessionId: cancelLedger.entry.sessionId,
      turnId: cancelLedger.entry.turnId,
      ledgerCount: cancelLedger.ledger.length,
    });

    if (options.scenario === "cancel-then-continue") {
      logStage("send-continue-prompt-from-gui");
      summary.continueInputSend = sanitizeJson(
        await sendPromptFromGui(page, options, CONTINUE_PROMPT),
      );

      logStage("wait-gui-continue-completed");
      summary.guiContinueCompleted = sanitizeJson(
        await waitForGuiChatCompleted(page, options, {
          prompt: CONTINUE_PROMPT,
          doneText: CONTINUE_DONE_TEXT,
          summaryText: "继续输出已恢复",
        }),
      );

      logStage("wait-read-model-continue-completed");
      const readModelContinueCompleted = await waitForSessionReadCompleted(
        page,
        options,
        appServerRequests,
        {
          prompt: CONTINUE_PROMPT,
          doneText: CONTINUE_DONE_TEXT,
          summaryText: "继续输出已恢复",
        },
      );
      summary.readModelContinueCompleted = sanitizeJson({
        detailItemCount: Array.isArray(
          readModelContinueCompleted?.detail?.items,
        )
          ? readModelContinueCompleted.detail.items.length
          : null,
        latestTurnStatus:
          readModelContinueCompleted?.detail?.thread_read?.runtime_summary
            ?.latestTurnStatus ??
          readModelContinueCompleted?.detail?.thread_read?.status ??
          readModelContinueCompleted?.detail?.status ??
          null,
        includesPrompt: JSON.stringify(
          readModelContinueCompleted || {},
        ).includes(CONTINUE_PROMPT),
        includesAssistantDone: JSON.stringify(
          readModelContinueCompleted || {},
        ).includes(CONTINUE_DONE_TEXT),
        includesAssistantSummary: JSON.stringify(
          readModelContinueCompleted || {},
        ).includes("继续输出已恢复"),
      });
    }
  } else if (
    options.scenario !== "plan" &&
    options.scenario !== "goal" &&
    !isImageIntentScenario &&
    options.scenario !== MEDIA_REFERENCE_SCENARIO &&
    options.scenario !== REASONING_FIRST_VISIBLE_SCENARIO &&
    options.scenario !== TERMINAL_FAILED_AFTER_ANSWER_SCENARIO &&
    options.scenario !== TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO &&
    options.scenario !== TERMINAL_STALE_GUARD_SCENARIO &&
    options.scenario !== "web-tools-rendering" &&
    options.scenario !== "mcp-structured-content" &&
    options.scenario !== MULTI_AGENT_TEAM_SCENARIO &&
    options.scenario !== "skills-runtime" &&
    options.scenario !== "expert-skills-runtime" &&
    options.scenario !== "expert-plaza-skills-runtime" &&
    options.scenario !== "expert-panel-skills-runtime" &&
    options.scenario !== RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO &&
    options.scenario !== INPUTBAR_RICH_RESTORE_SCENARIO &&
    options.scenario !== INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO &&
    options.scenario !== INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO &&
    options.scenario !== INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO &&
    options.scenario !== CONTENT_FACTORY_ARTICLE_WORKSPACE_SCENARIO &&
    options.scenario !== CONTENT_FACTORY_INLINE_IMAGE_ARTICLE_WORKSPACE_SCENARIO
  ) {
    const soulStyleExpectedTexts =
      options.scenario === SOUL_STYLE_SCENARIO
        ? resolveSoulStyleFixtureExpectedTexts(summary.soulStyleExpectation)
        : null;
    const defaultSummaryText = "今日国际新闻简要整理";
    const summaryText =
      soulStyleExpectedTexts?.summaryText ?? defaultSummaryText;
    logStage("wait-gui-completed");
    summary.guiCompleted = sanitizeJson(
      await waitForGuiChatCompleted(
        page,
        options,
        soulStyleExpectedTexts ?? undefined,
      ),
    );

    logStage("wait-read-model-completed");
    const readModelCompleted = await waitForSessionReadCompleted(
      page,
      options,
      appServerRequests,
      {
        summaryText,
      },
    );
    summary.readModelCompleted = sanitizeJson({
      detailItemCount: Array.isArray(readModelCompleted?.detail?.items)
        ? readModelCompleted.detail.items.length
        : null,
      latestTurnStatus:
        readModelCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelCompleted?.detail?.thread_read?.status ??
        readModelCompleted?.detail?.status ??
        null,
      includesPrompt: JSON.stringify(readModelCompleted || {}).includes(
        NEWS_PROMPT,
      ),
      includesAssistantDone: JSON.stringify(readModelCompleted || {}).includes(
        ASSISTANT_DONE_TEXT,
      ),
      includesAssistantSummary: JSON.stringify(
        readModelCompleted || {},
      ).includes(summaryText),
    });

    if (options.scenario !== SOUL_STYLE_SCENARIO) {
      logStage("probe-agent-session-event-read");
      summary.eventReadProbe = await runEventReadProbe(
        page,
        options,
        appServerRequests,
      );
    }
  }
}
