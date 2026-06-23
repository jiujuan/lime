import {
  APP_SERVER_METHOD_SESSION_READ,
  ASSISTANT_DONE_TEXT,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_SESSION_ID,
  EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_EXPLICIT_SCENARIO,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
  SKILLS_RUNTIME_PROMPT,
  SKILLS_RUNTIME_SCENARIO,
  WEB_TOOLS_FETCH_TOOL_CALL_ID,
  WEB_TOOLS_MID_THINKING_TEXT,
  WEB_TOOLS_REASONING_FINAL_SIGNATURE,
  WEB_TOOLS_RENDERING_DONE_TEXT,
  WEB_TOOLS_RENDERING_PROMPT,
  WEB_TOOLS_REASONING_ITEM_ID,
  WEB_TOOLS_REASONING_ITEM_SIGNATURE,
  WEB_TOOLS_REASONING_NATIVE_ITEM_ID,
  WEB_TOOLS_REASONING_PROVIDER_BACKEND,
  WEB_TOOLS_SEARCH_TOOL_CALL_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  addExpertSkillsRuntimeSkillFromInfoPanel,
  exportExpertPanelEvidencePackFromHarnessPanel,
  launchExpertSkillsRuntimeFromExpertPlaza,
  reloadRendererAfterExpertPanelSkillCatalogInjection,
  selectExpertPanelSkillsRuntimeSessionId,
  summarizeExpertPanelSkillsRuntimeTurnStart,
  waitForExpertPanelEvidenceSummary,
} from "./claw-chat-current-fixture-expert-actions.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  enableGoalModeFromGui,
  enablePlanModeFromGui,
} from "./claw-chat-current-fixture-gui-input-modes.mjs";
import {
  waitForGuiChatCanceled,
  waitForGuiChatCompleted,
  waitForGuiPlanCompleted,
  waitForGuiSkillsRuntimeCompleted,
  waitForStopButtonVisibleAndClick,
} from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForGuiMcpStructuredContentCompleted } from "./claw-chat-current-fixture-gui-tool-waits.mjs";
import {
  inspectGuiWebToolsRenderingDebug,
  waitForGuiWebToolsRenderingCompleted,
} from "./claw-chat-current-fixture-gui-web-tools-waits.mjs";
import {
  createExpertSkillsRuntimeSession,
  injectExpertSkillsRuntimeCatalog,
  openSessionFromSidebar,
  sendNewsPromptFromGui,
  waitForGuiSessionVisible,
} from "./claw-chat-current-fixture-session.mjs";
import {
  ensureManualEnableWorkspaceSkill,
  ensureUserVisibleCapabilityReportSkill,
  launchSkillsRuntimeFromWorkspacePanel,
  waitForExpertPanelSkillsRuntimeSessionReady,
} from "./claw-chat-current-fixture-skills-workspace.mjs";
import {
  clearInvokeBuffers,
  invokeAppServerFromPage,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { verifyPlanHistoryHydrate } from "./claw-chat-current-fixture-plan-history.mjs";
import { runRightSurfaceVisualMatrix } from "./claw-chat-current-fixture-right-surface-visual.mjs";
import { collectReadModelToolCalls } from "./claw-chat-current-fixture-read-model-core.mjs";
import {
  exportSkillsRuntimeEvidencePack,
  runEventReadProbe,
  waitForBackendTurnStartWithCurrentQueueResume,
  waitForSessionReadCanceled,
  waitForSessionReadCompleted,
  waitForSessionReadMcpStructuredContentCompleted,
  waitForSessionReadPlanCompleted,
  waitForSessionReadSkillsRuntimeCompleted,
} from "./claw-chat-current-fixture-read-model-waits.mjs";
import {
  waitForBackendLedgerEntry,
  waitForBackendLedgerTurnStart,
  waitForBackendLedgerTurnStartContaining,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import { logStage, sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

export async function executeScenarioFlow({
  page,
  options,
  workspace,
  summary,
  appServerRequests,
  runtimeEnv,
}) {
  if (options.scenario === RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO) {
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
  } else if (options.scenario === "web-tools-rendering") {
    logStage("send-web-tools-rendering-prompt-from-gui");
    summary.webToolsRenderingInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, WEB_TOOLS_RENDERING_PROMPT),
    );

    logStage("wait-gui-web-tools-rendering-completed");
    try {
      summary.guiWebToolsRenderingCompleted = sanitizeJson(
        await waitForGuiWebToolsRenderingCompleted(page, options),
      );
    } catch (error) {
      try {
        summary.guiWebToolsRenderingDebug = sanitizeJson(
          await inspectGuiWebToolsRenderingDebug(page),
        );
      } catch (debugError) {
        summary.guiWebToolsRenderingDebug = sanitizeJson({
          error: String(debugError?.message || debugError),
        });
      }
      try {
        const probe = await invokeAppServerFromPage(
          page,
          APP_SERVER_METHOD_SESSION_READ,
          {
            sessionId: SESSION_ID,
            historyLimit: 100,
          },
          appServerRequests,
        );
        const serializedProbe = JSON.stringify(probe.result || {});
        summary.readModelWebToolsRenderingFailureProbe = sanitizeJson({
          detailItemCount: Array.isArray(probe.result?.detail?.items)
            ? probe.result.detail.items.length
            : null,
          includesMidThinking: serializedProbe.includes(
            WEB_TOOLS_MID_THINKING_TEXT,
          ),
          includesWebSearchTool: serializedProbe.includes(
            WEB_TOOLS_SEARCH_TOOL_CALL_ID,
          ),
          includesWebFetchTool: serializedProbe.includes(
            WEB_TOOLS_FETCH_TOOL_CALL_ID,
          ),
        });
      } catch (probeError) {
        summary.readModelWebToolsRenderingFailureProbe = sanitizeJson({
          error: String(probeError?.message || probeError),
        });
      }
      throw error;
    }

    logStage("wait-read-model-web-tools-rendering-completed");
    const readModelWebToolsRenderingCompleted =
      await waitForSessionReadCompleted(page, options, appServerRequests, {
        prompt: WEB_TOOLS_RENDERING_PROMPT,
        doneText: WEB_TOOLS_RENDERING_DONE_TEXT,
        summaryText: "网页搜索渲染结论",
      });
    summary.readModelWebToolsRenderingCompleted = sanitizeJson({
      detailItemCount: Array.isArray(
        readModelWebToolsRenderingCompleted?.detail?.items,
      )
        ? readModelWebToolsRenderingCompleted.detail.items.length
        : null,
      toolCallCount: collectReadModelToolCalls(
        readModelWebToolsRenderingCompleted,
      ).length,
      latestTurnStatus:
        readModelWebToolsRenderingCompleted?.detail?.thread_read
          ?.runtime_summary?.latestTurnStatus ??
        readModelWebToolsRenderingCompleted?.detail?.thread_read?.status ??
        readModelWebToolsRenderingCompleted?.detail?.status ??
        null,
      includesPrompt: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_RENDERING_PROMPT),
      includesAssistantDone: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_RENDERING_DONE_TEXT),
      includesAssistantSummary: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes("网页搜索渲染结论"),
      includesWebSearchTool: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_SEARCH_TOOL_CALL_ID),
      includesWebFetchTool: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_FETCH_TOOL_CALL_ID),
      includesReasoningFinal: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_REASONING_FINAL_SIGNATURE),
      includesReasoningFinalProviderMetadata:
        JSON.stringify(readModelWebToolsRenderingCompleted || {}).includes(
          WEB_TOOLS_REASONING_FINAL_SIGNATURE,
        ) &&
        JSON.stringify(readModelWebToolsRenderingCompleted || {}).includes(
          WEB_TOOLS_REASONING_PROVIDER_BACKEND,
        ),
      includesReasoningItem: JSON.stringify(
        readModelWebToolsRenderingCompleted || {},
      ).includes(WEB_TOOLS_REASONING_ITEM_ID),
      includesReasoningItemProviderMetadata:
        JSON.stringify(readModelWebToolsRenderingCompleted || {}).includes(
          WEB_TOOLS_REASONING_ITEM_SIGNATURE,
        ) &&
        JSON.stringify(readModelWebToolsRenderingCompleted || {}).includes(
          WEB_TOOLS_REASONING_NATIVE_ITEM_ID,
        ),
    });
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
  } else if (options.scenario === "skills-runtime") {
    logStage("send-skills-runtime-prompt-from-gui");
    summary.skillsRuntimeInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, SKILLS_RUNTIME_PROMPT),
    );

    logStage("wait-gui-skills-runtime-completed");
    summary.guiSkillsRuntimeCompleted = sanitizeJson(
      await waitForGuiSkillsRuntimeCompleted(page, options),
    );

    logStage("wait-read-model-skills-runtime-completed");
    const readModelSkillsRuntimeCompleted =
      await waitForSessionReadSkillsRuntimeCompleted(
        page,
        options,
        appServerRequests,
      );
    summary.readModelSkillsRuntimeCompleted =
      readModelSkillsRuntimeCompleted.summary;

    logStage("export-skills-runtime-evidence-pack");
    const evidencePackSkillsRuntime = await exportSkillsRuntimeEvidencePack(
      page,
      appServerRequests,
      SKILLS_RUNTIME_SCENARIO,
    );
    summary.evidencePackSkillsRuntime = evidencePackSkillsRuntime.summary;

    logStage("send-explicit-skills-runtime-prompt-from-gui");
    summary.explicitSkillsRuntimeInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, SKILLS_RUNTIME_EXPLICIT_PROMPT),
    );

    logStage("wait-gui-explicit-skills-runtime-completed");
    summary.guiExplicitSkillsRuntimeCompleted = sanitizeJson(
      await waitForGuiSkillsRuntimeCompleted(
        page,
        options,
        SKILLS_RUNTIME_EXPLICIT_SCENARIO,
      ),
    );

    logStage("wait-read-model-explicit-skills-runtime-completed");
    const readModelExplicitSkillsRuntimeCompleted =
      await waitForSessionReadSkillsRuntimeCompleted(
        page,
        options,
        appServerRequests,
        SKILLS_RUNTIME_EXPLICIT_SCENARIO,
      );
    summary.readModelExplicitSkillsRuntimeCompleted =
      readModelExplicitSkillsRuntimeCompleted.summary;

    logStage("export-explicit-skills-runtime-evidence-pack");
    const evidencePackExplicitSkillsRuntime =
      await exportSkillsRuntimeEvidencePack(
        page,
        appServerRequests,
        SKILLS_RUNTIME_EXPLICIT_SCENARIO,
      );
    summary.evidencePackExplicitSkillsRuntime =
      evidencePackExplicitSkillsRuntime.summary;

    logStage("launch-manual-enable-skills-runtime-from-workspace-panel");
    const manualEnableSkillsRuntimeLaunch =
      await launchSkillsRuntimeFromWorkspacePanel(page, options, workspace);
    summary.manualEnableSkillsRuntimeTurnStart = sanitizeJson({
      launch: manualEnableSkillsRuntimeLaunch,
    });
    summary.manualEnableSkillsRuntimeSkill =
      manualEnableSkillsRuntimeLaunch.workspaceSkill;

    logStage("wait-manual-enable-skills-runtime-backend-turn-start");
    const manualEnableSkillsRuntimeBackendTurn =
      await waitForBackendLedgerTurnStart(
        runtimeEnv.backendLedgerPath,
        SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
        options,
      );
    const manualEnableSkillsRuntimeSessionId =
      manualEnableSkillsRuntimeBackendTurn.entry.sessionId ?? SESSION_ID;
    summary.manualEnableSkillsRuntimeTurnStart = sanitizeJson({
      ...summary.manualEnableSkillsRuntimeTurnStart,
      backend: {
        sessionId: manualEnableSkillsRuntimeSessionId,
        turnId: manualEnableSkillsRuntimeBackendTurn.entry.turnId ?? null,
        inputText: manualEnableSkillsRuntimeBackendTurn.entry.inputText ?? null,
      },
    });

    logStage("wait-gui-manual-enable-skills-runtime-completed");
    summary.guiManualEnableSkillsRuntimeCompleted = sanitizeJson(
      await waitForGuiSkillsRuntimeCompleted(
        page,
        options,
        SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
      ),
    );

    logStage("wait-read-model-manual-enable-skills-runtime-completed");
    const readModelManualEnableSkillsRuntimeCompleted =
      await waitForSessionReadSkillsRuntimeCompleted(
        page,
        options,
        appServerRequests,
        SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
        manualEnableSkillsRuntimeSessionId,
      );
    summary.readModelManualEnableSkillsRuntimeCompleted =
      readModelManualEnableSkillsRuntimeCompleted.summary;

    logStage("export-manual-enable-skills-runtime-evidence-pack");
    const evidencePackManualEnableSkillsRuntime =
      await exportSkillsRuntimeEvidencePack(
        page,
        appServerRequests,
        SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
        manualEnableSkillsRuntimeSessionId,
      );
    summary.evidencePackManualEnableSkillsRuntime =
      evidencePackManualEnableSkillsRuntime.summary;
  } else if (options.scenario === "expert-skills-runtime") {
    logStage("prepare-expert-skills-runtime-workspace-skill");
    summary.expertSkillsRuntimeSkill = sanitizeJson(
      ensureManualEnableWorkspaceSkill(workspace.rootPath),
    );

    logStage("create-expert-skills-runtime-session");
    const expertSessionCreation = await createExpertSkillsRuntimeSession(
      page,
      workspace,
      appServerRequests,
    );
    summary.expertSkillsRuntimeSessionCreation = sanitizeJson({
      sessionId:
        expertSessionCreation.session?.session?.sessionId ??
        expertSessionCreation.session?.sessionId ??
        null,
      updatedSessionId:
        expertSessionCreation.update?.session?.sessionId ??
        expertSessionCreation.update?.sessionId ??
        null,
      expertId: expertSessionCreation.expertMetadata?.expert?.expertId ?? null,
      skillRefs: expertSessionCreation.expertMetadata?.expert?.skillRefs ?? [],
    });

    logStage("open-expert-skills-runtime-session-from-sidebar");
    summary.guiExpertSkillsRuntimeSessionVisible = sanitizeJson(
      await waitForGuiSessionVisible(
        page,
        options,
        EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
      ),
    );
    summary.guiExpertSkillsRuntimeSessionOpened = sanitizeJson(
      await openSessionFromSidebar(page, options, appServerRequests, {
        sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
        title: EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
      }),
    );

    logStage("send-expert-skills-runtime-prompt-from-gui");
    summary.expertSkillsRuntimeInputSend = sanitizeJson(
      await sendPromptFromGui(page, options, EXPERT_SKILLS_RUNTIME_PROMPT, {
        expectedSessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      }),
    );

    logStage("wait-expert-skills-runtime-backend-turn-start");
    const expertSkillsRuntimeBackendStart =
      await waitForBackendTurnStartWithCurrentQueueResume(
        page,
        options,
        appServerRequests,
        runtimeEnv.backendLedgerPath,
        EXPERT_SKILLS_RUNTIME_SESSION_ID,
        EXPERT_SKILLS_RUNTIME_PROMPT,
      );
    const expertSkillsRuntimeBackendTurn =
      expertSkillsRuntimeBackendStart.backendTurn;
    const expertSkillsRuntimeSessionId =
      expertSkillsRuntimeBackendTurn.entry.sessionId ??
      EXPERT_SKILLS_RUNTIME_SESSION_ID;
    summary.expertSkillsRuntimeQueueResume = sanitizeJson(
      expertSkillsRuntimeBackendStart.queueResume,
    );
    summary.expertSkillsRuntimeTurnStart = sanitizeJson({
      sessionId: expertSkillsRuntimeSessionId,
      turnId: expertSkillsRuntimeBackendTurn.entry.turnId ?? null,
      inputText: expertSkillsRuntimeBackendTurn.entry.inputText ?? null,
    });

    logStage("wait-read-model-expert-skills-runtime-completed");
    const readModelExpertSkillsRuntimeCompleted =
      await waitForSessionReadSkillsRuntimeCompleted(
        page,
        options,
        appServerRequests,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
        expertSkillsRuntimeSessionId,
      );
    summary.readModelExpertSkillsRuntimeCompleted =
      readModelExpertSkillsRuntimeCompleted.summary;

    logStage("export-expert-skills-runtime-evidence-pack");
    const evidencePackExpertSkillsRuntime =
      await exportSkillsRuntimeEvidencePack(
        page,
        appServerRequests,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
        expertSkillsRuntimeSessionId,
      );
    summary.evidencePackExpertSkillsRuntime =
      evidencePackExpertSkillsRuntime.summary;

    logStage("wait-gui-expert-skills-runtime-completed");
    summary.guiExpertSkillsRuntimeCompleted = sanitizeJson(
      await waitForGuiSkillsRuntimeCompleted(
        page,
        options,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
      ),
    );
  } else if (
    options.scenario === "expert-plaza-skills-runtime" ||
    options.scenario === "expert-panel-skills-runtime"
  ) {
    const isExpertPanelSkillsRuntimeScenario =
      options.scenario === "expert-panel-skills-runtime";
    logStage(
      isExpertPanelSkillsRuntimeScenario
        ? "prepare-expert-panel-skills-runtime-workspace-skill"
        : "prepare-expert-plaza-skills-runtime-workspace-skill",
    );
    const expertSkillsRuntimeSkill = ensureManualEnableWorkspaceSkill(
      workspace.rootPath,
    );
    summary.expertSkillsRuntimeSkill = sanitizeJson(expertSkillsRuntimeSkill);
    if (isExpertPanelSkillsRuntimeScenario) {
      summary.expertPanelSkillsRuntimeUserSkill = sanitizeJson(
        ensureUserVisibleCapabilityReportSkill(runtimeEnv),
      );
    }

    logStage(
      isExpertPanelSkillsRuntimeScenario
        ? "inject-expert-panel-skills-runtime-catalog"
        : "inject-expert-plaza-skills-runtime-catalog",
    );
    summary.expertPlazaSkillsRuntimeCatalog = sanitizeJson(
      await injectExpertSkillsRuntimeCatalog(page, {
        ...(isExpertPanelSkillsRuntimeScenario
          ? {
              releaseSkillRefs: [EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF],
            }
          : {}),
        workspaceSkill: expertSkillsRuntimeSkill,
      }),
    );
    if (isExpertPanelSkillsRuntimeScenario) {
      logStage("reload-expert-panel-skills-runtime-catalog");
      summary.expertPanelSkillsRuntimeCatalogReload = sanitizeJson(
        await reloadRendererAfterExpertPanelSkillCatalogInjection(
          page,
          options,
          waitForRendererReady,
          clearInvokeBuffers,
        ),
      );
    }

    logStage("launch-expert-skills-runtime-from-expert-plaza");
    summary.expertPlazaSkillsRuntimeLaunch = sanitizeJson(
      await launchExpertSkillsRuntimeFromExpertPlaza(page, options),
    );

    logStage("wait-expert-plaza-skills-runtime-backend-turn-start");
    const expertPlazaSkillsRuntimeBackendTurn =
      await waitForBackendLedgerTurnStartContaining(
        runtimeEnv.backendLedgerPath,
        EXPERT_SKILLS_RUNTIME_PROMPT,
        options,
      );
    const expertPlazaSkillsRuntimeSessionId =
      expertPlazaSkillsRuntimeBackendTurn.entry.sessionId ??
      EXPERT_SKILLS_RUNTIME_SESSION_ID;
    summary.expertSkillsRuntimeTurnStart = sanitizeJson({
      sessionId: expertPlazaSkillsRuntimeSessionId,
      turnId: expertPlazaSkillsRuntimeBackendTurn.entry.turnId ?? null,
      inputText: expertPlazaSkillsRuntimeBackendTurn.entry.inputText ?? null,
    });

    logStage("wait-read-model-expert-plaza-skills-runtime-completed");
    const readModelExpertSkillsRuntimeCompleted =
      await waitForSessionReadSkillsRuntimeCompleted(
        page,
        options,
        appServerRequests,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
        expertPlazaSkillsRuntimeSessionId,
      );
    summary.readModelExpertSkillsRuntimeCompleted =
      readModelExpertSkillsRuntimeCompleted.summary;

    logStage("export-expert-plaza-skills-runtime-evidence-pack");
    const evidencePackExpertSkillsRuntime =
      await exportSkillsRuntimeEvidencePack(
        page,
        appServerRequests,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
        expertPlazaSkillsRuntimeSessionId,
      );
    summary.evidencePackExpertSkillsRuntime =
      evidencePackExpertSkillsRuntime.summary;

    logStage("wait-gui-expert-plaza-skills-runtime-completed");
    summary.guiExpertSkillsRuntimeCompleted = sanitizeJson(
      await waitForGuiSkillsRuntimeCompleted(
        page,
        options,
        EXPERT_SKILLS_RUNTIME_SCENARIO,
      ),
    );

    if (isExpertPanelSkillsRuntimeScenario) {
      logStage("add-expert-panel-skills-runtime-skill");
      summary.expertPanelSkillsRuntimeAddSkill = sanitizeJson(
        await addExpertSkillsRuntimeSkillFromInfoPanel(page, options),
      );

      logStage("wait-expert-panel-skills-runtime-session-ready");
      summary.guiExpertPanelSkillsRuntimeSessionReady = sanitizeJson(
        await waitForExpertPanelSkillsRuntimeSessionReady(
          page,
          options,
          expertPlazaSkillsRuntimeSessionId,
        ),
      );

      logStage("send-expert-panel-skills-runtime-followup");
      summary.expertPanelSkillsRuntimeInputSend = sanitizeJson(
        await sendPromptFromGui(
          page,
          options,
          EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
          { expectedSessionId: expertPlazaSkillsRuntimeSessionId },
        ),
      );

      logStage("wait-expert-panel-skills-runtime-backend-turn-start");
      const expertPanelSkillsRuntimeBackendStart =
        await waitForBackendTurnStartWithCurrentQueueResume(
          page,
          options,
          appServerRequests,
          runtimeEnv.backendLedgerPath,
          expertPlazaSkillsRuntimeSessionId,
          EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
        );
      const expertPanelSkillsRuntimeBackendTurn =
        expertPanelSkillsRuntimeBackendStart.backendTurn;
      const expertPanelSkillsRuntimeSessionId =
        selectExpertPanelSkillsRuntimeSessionId(
          expertPanelSkillsRuntimeBackendTurn,
          expertPlazaSkillsRuntimeSessionId,
        );
      summary.expertPanelSkillsRuntimeQueueResume = sanitizeJson(
        expertPanelSkillsRuntimeBackendStart.queueResume,
      );
      summary.expertPanelSkillsRuntimeTurnStart =
        summarizeExpertPanelSkillsRuntimeTurnStart(
          expertPanelSkillsRuntimeBackendTurn,
        );
      summary.expertPanelSkillsRuntimeSessionId =
        expertPanelSkillsRuntimeSessionId;

      logStage("wait-read-model-expert-panel-skills-runtime-completed");
      const readModelExpertPanelSkillsRuntimeCompleted =
        await waitForSessionReadSkillsRuntimeCompleted(
          page,
          options,
          appServerRequests,
          EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
          expertPanelSkillsRuntimeSessionId,
        );
      summary.readModelExpertPanelSkillsRuntimeCompleted =
        readModelExpertPanelSkillsRuntimeCompleted.summary;

      logStage("export-expert-panel-skills-runtime-evidence-pack");
      const evidencePackExpertPanelSkillsRuntime =
        await exportSkillsRuntimeEvidencePack(
          page,
          appServerRequests,
          EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
          expertPanelSkillsRuntimeSessionId,
        );
      summary.evidencePackExpertPanelSkillsRuntime =
        evidencePackExpertPanelSkillsRuntime.summary;

      logStage("wait-gui-expert-panel-skills-runtime-completed");
      summary.guiExpertPanelSkillsRuntimeCompleted = sanitizeJson(
        await waitForGuiSkillsRuntimeCompleted(
          page,
          options,
          EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
        ),
      );

      logStage("export-expert-panel-evidence-pack-from-harness-panel");
      summary.expertPanelEvidencePackGuiExport = sanitizeJson(
        await exportExpertPanelEvidencePackFromHarnessPanel(page, options),
      );

      logStage("wait-expert-panel-evidence-summary");
      summary.expertPanelEvidenceSummary = sanitizeJson(
        await waitForExpertPanelEvidenceSummary(page, options),
      );
    }
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
      await waitForStopButtonVisibleAndClick(page, options),
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
    options.scenario !== "web-tools-rendering" &&
    options.scenario !== "mcp-structured-content" &&
    options.scenario !== "skills-runtime" &&
    options.scenario !== "expert-skills-runtime" &&
    options.scenario !== "expert-plaza-skills-runtime" &&
    options.scenario !== "expert-panel-skills-runtime" &&
    options.scenario !== RIGHT_SURFACE_VISUAL_MATRIX_SCENARIO
  ) {
    logStage("wait-gui-completed");
    summary.guiCompleted = sanitizeJson(
      await waitForGuiChatCompleted(page, options),
    );

    logStage("wait-read-model-completed");
    const readModelCompleted = await waitForSessionReadCompleted(
      page,
      options,
      appServerRequests,
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
      ).includes("今日国际新闻简要整理"),
    });

    logStage("probe-agent-session-event-read");
    summary.eventReadProbe = await runEventReadProbe(
      page,
      options,
      appServerRequests,
    );
  }
}
