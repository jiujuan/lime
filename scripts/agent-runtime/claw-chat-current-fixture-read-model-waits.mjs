import {
  APP_SERVER_METHOD_EVIDENCE_EXPORT,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_THREAD_RESUME,
  APP_SERVER_METHOD_SESSION_TURN_START,
  ASSISTANT_DONE_TEXT,
  EVENT_READ_PROBE_DONE_TEXT,
  EVENT_READ_PROBE_PROMPT,
  EVENT_READ_PROBE_READ_TEXT,
  EVENT_READ_PROBE_TOOL_CALL_ID,
  EVENT_READ_PROBE_TOOL_NAME,
  EVENT_READ_PROBE_TOOL_OUTPUT,
  EVENT_READ_PROBE_TURN_ID,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  MCP_STRUCTURED_CONTENT_ANSWER,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  MCP_STRUCTURED_CONTENT_REFERENCE_ID,
  MCP_STRUCTURED_CONTENT_TOOL_CALL_ID,
  MCP_STRUCTURED_CONTENT_TOOL_NAME,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  SESSION_ID,
  SKILLS_RUNTIME_SCENARIO,
  THREAD_ID,
  summarizeMultiAgentTeamEvidenceExport,
  summarizeSkillsRuntimeEvidenceExport,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  collectAgentSessionEvents,
  drainAppServerEventsFromPage,
  invokeAppServerFromPage,
  mergeAgentSessionEvents,
  summarizeAgentSessionEvents,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  collectReadModelToolCalls,
  findReadModelQueuedTurnForPrompt,
  findReadModelToolCall,
  readModelQueuedTurnId,
  readModelQueuedTurnText,
  summarizeReadModelQueueState,
  readModelLatestTurnStatus,
  summarizeSkillsRuntimeReadModel,
} from "./claw-chat-current-fixture-read-model-core.mjs";
import {
  waitForBackendLedgerTurnStart,
  waitForBackendLedgerTurnStartOrNull,
} from "./claw-chat-current-fixture-backend-ledger.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

export async function waitForSessionReadCompleted(
  page,
  options,
  requestLog,
  {
    sessionId = SESSION_ID,
    prompt = NEWS_PROMPT,
    doneText = ASSISTANT_DONE_TEXT,
    summaryText = "今日国际新闻简要整理",
  } = {},
) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (
      serialized.includes(prompt) &&
      (serialized.includes(doneText) || serialized.includes(summaryText))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成输入闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

export async function waitForSessionReadFailedAfterAnswer(
  page,
  options,
  requestLog,
  { sessionId = SESSION_ID, prompt, partialText, failureText } = {},
) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (
      readModelLatestTurnStatus(read.result) === "failed" &&
      serialized.includes(prompt) &&
      serialized.includes(partialText) &&
      serialized.includes(failureText)
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成 failed-after-answer 闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

export async function waitForSessionReadSkillsRuntimeCompleted(
  page,
  options,
  requestLog,
  scenario = SKILLS_RUNTIME_SCENARIO,
  sessionId = SESSION_ID,
) {
  const startedAt = Date.now();
  let lastRead = null;
  let lastSummary = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    lastSummary = summarizeSkillsRuntimeReadModel(lastRead, scenario);
    if (
      lastSummary.includesPrompt === true &&
      (lastSummary.includesAssistantDone === true ||
        lastSummary.includesAssistantSummary === true) &&
      lastSummary.includesSkillSearchTool === true &&
      lastSummary.includesSkillTool === true &&
      lastSummary.readModelTurnTerminal === true
    ) {
      return {
        readModel: lastRead,
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server skills runtime read model 未完成 terminal turn 闭环: ${JSON.stringify(
      sanitizeJson({
        summary: lastSummary,
        readModel: lastRead,
      }),
    )}`,
  );
}

export async function resumeQueuedTurnForPromptIfNeeded(
  page,
  options,
  requestLog,
  sessionId,
  prompt,
) {
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs, 30_000);
  let lastRead = null;
  let lastQueuedTurn = null;
  while (Date.now() - startedAt < timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    lastQueuedTurn = findReadModelQueuedTurnForPrompt(lastRead, prompt);
    const queuedTurnId = lastQueuedTurn
      ? readModelQueuedTurnId(lastQueuedTurn)
      : null;
    if (queuedTurnId) {
      const resume = await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_SESSION_THREAD_RESUME,
        {
          sessionId,
        },
        requestLog,
      );
      const resumed = resume.result?.resumed === true;
      if (resumed) {
        return sanitizeJson({
          queuedTurnId,
          queuedTurnText: readModelQueuedTurnText(lastQueuedTurn),
          resumed,
          turnCount: Array.isArray(resume.result?.turns)
            ? resume.result.turns.length
            : null,
        });
      }
      lastQueuedTurn = {
        queuedTurnId,
        queuedTurnText: readModelQueuedTurnText(lastQueuedTurn),
        resumed,
        turnCount: Array.isArray(resume.result?.turns)
          ? resume.result.turns.length
          : null,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未出现可恢复 queued turn: ${JSON.stringify(
      sanitizeJson({
        prompt,
        queuedTurn: lastQueuedTurn,
        readModelSummary: summarizeReadModelQueueState(lastRead),
      }),
    )}`,
  );
}

export async function waitForBackendTurnStartWithCurrentQueueResume(
  page,
  options,
  requestLog,
  ledgerPath,
  sessionId,
  prompt,
) {
  const immediate = await waitForBackendLedgerTurnStartOrNull(
    ledgerPath,
    prompt,
    options,
  );
  if (immediate) {
    return {
      backendTurn: immediate,
      queueResume: null,
    };
  }
  const queueResume = await resumeQueuedTurnForPromptIfNeeded(
    page,
    options,
    requestLog,
    sessionId,
    prompt,
  );
  const backendTurn = await waitForBackendLedgerTurnStart(
    ledgerPath,
    prompt,
    options,
  );
  return {
    backendTurn,
    queueResume,
  };
}

export async function waitForSessionReadMcpStructuredContentCompleted(
  page,
  options,
  requestLog,
) {
  const readModel = await waitForSessionReadCompleted(
    page,
    options,
    requestLog,
    {
      sessionId: SESSION_ID,
      prompt: MCP_STRUCTURED_CONTENT_PROMPT,
      doneText: MCP_STRUCTURED_CONTENT_DONE_TEXT,
      summaryText: "MCP structuredContent 展示验证完成",
    },
  );
  const serialized = JSON.stringify(readModel || {});
  const toolCall = findReadModelToolCall(
    readModel,
    MCP_STRUCTURED_CONTENT_TOOL_CALL_ID,
    MCP_STRUCTURED_CONTENT_TOOL_NAME,
  );
  const structuredContent =
    toolCall?.structured_content ??
    toolCall?.structuredContent ??
    toolCall?.result?.structuredContent ??
    toolCall?.result?.structured_content ??
    null;
  const structuredSerialized = JSON.stringify(structuredContent || {});
  const outputText = String(
    toolCall?.output_preview ??
      toolCall?.outputPreview ??
      toolCall?.output ??
      "",
  );

  return {
    readModel,
    summary: sanitizeJson({
      detailItemCount: Array.isArray(readModel?.detail?.items)
        ? readModel.detail.items.length
        : null,
      toolCallCount: collectReadModelToolCalls(readModel).length,
      latestTurnStatus:
        readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
        readModel?.detail?.thread_read?.status ??
        readModel?.detail?.status ??
        null,
      includesPrompt: serialized.includes(MCP_STRUCTURED_CONTENT_PROMPT),
      includesAssistantDone: serialized.includes(
        MCP_STRUCTURED_CONTENT_DONE_TEXT,
      ),
      includesAssistantSummary: serialized.includes(
        "MCP structuredContent 展示验证完成",
      ),
      includesMcpTool: Boolean(toolCall),
      toolName: toolCall?.tool_name ?? toolCall?.toolName ?? null,
      toolStatus: toolCall?.status ?? null,
      includesStructuredContent: Boolean(structuredContent),
      structuredContentAnswerVisible: structuredSerialized.includes(
        MCP_STRUCTURED_CONTENT_ANSWER,
      ),
      structuredContentReferenceVisible: structuredSerialized.includes(
        MCP_STRUCTURED_CONTENT_REFERENCE_ID,
      ),
      outputContainsEnvelope:
        outputText.includes("request_metadata") &&
        outputText.includes("mcp_tool_result_projection") &&
        outputText.includes("diagnostics"),
    }),
  };
}

export async function waitForSessionReadPlanCompleted(
  page,
  options,
  requestLog,
) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (
      serialized.includes(PLAN_PROMPT) &&
      serialized.includes("<proposed_plan>") &&
      serialized.includes("</proposed_plan>") &&
      PLAN_STEPS.every((step) => serialized.includes(step.step))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未读回 proposed_plan 计划块: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

export async function waitForSessionReadContainsTurn(
  page,
  options,
  requestLog,
  turnId,
  expectedText,
) {
  const startedAt = Date.now();
  let lastRead = null;
  const timeoutMs = Math.min(options.timeoutMs, 30_000);
  while (Date.now() - startedAt < timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (serialized.includes(turnId) && serialized.includes(expectedText)) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未读回 event/read probe turn: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}

export async function exportSkillsRuntimeEvidencePack(
  page,
  requestLog,
  scenario = SKILLS_RUNTIME_SCENARIO,
  sessionId = SESSION_ID,
) {
  const exportResult = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_EVIDENCE_EXPORT,
    {
      sessionId,
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    },
    requestLog,
  );
  return {
    result: exportResult.result,
    summary: sanitizeJson(
      summarizeSkillsRuntimeEvidenceExport(exportResult.result, scenario),
    ),
  };
}

export async function exportMultiAgentTeamEvidencePack(
  page,
  requestLog,
  { sessionId = SESSION_ID, threadId = THREAD_ID, turnId = null } = {},
) {
  const exportResult = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_EVIDENCE_EXPORT,
    {
      sessionId,
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    },
    requestLog,
  );
  return {
    result: exportResult.result,
    summary: sanitizeJson(
      summarizeMultiAgentTeamEvidenceExport(exportResult.result, {
        sessionId,
        threadId,
        turnId,
      }),
    ),
  };
}

export async function waitForAgentSessionEventsForTurn(
  page,
  options,
  turnId,
  initialMessages,
) {
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs, 30_000);
  let events = collectAgentSessionEvents(initialMessages);
  let drainAttempts = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const summary = summarizeAgentSessionEvents(events, turnId);
    if (
      summary.scopedEventCount > 0 &&
      summary.hasTextDelta &&
      summary.hasToolStarted &&
      summary.hasToolResult &&
      summary.hasTerminal
    ) {
      return {
        events,
        summary: {
          ...summary,
          drainAttempts,
        },
      };
    }

    const drained = await drainAppServerEventsFromPage(page, 50);
    drainAttempts += 1;
    events = mergeAgentSessionEvents(
      events,
      collectAgentSessionEvents(drained.messages),
    );
    await sleep(options.intervalMs);
  }

  throw new Error(
    `未观察到 agentSession/event 同 turn 终态: ${JSON.stringify(
      summarizeAgentSessionEvents(events, turnId),
    )}`,
  );
}

export async function runEventReadProbe(page, options, requestLog) {
  const eventName = `agentSession/event/${SESSION_ID}`;
  const turnStart = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: SESSION_ID,
      turnId: EVENT_READ_PROBE_TURN_ID,
      input: {
        text: EVENT_READ_PROBE_PROMPT,
      },
      runtimeOptions: {
        stream: true,
        eventName,
        runtimeRequest: {
          providerPreference: FIXTURE_PROVIDER,
          modelPreference: FIXTURE_MODEL,
          metadata: {
            harness: {
              source: "smoke:claw-chat-current-fixture:event-read-probe",
            },
          },
        },
      },
      queueIfBusy: false,
      skipPreSubmitResume: true,
    },
    requestLog,
  );

  const eventObservation = await waitForAgentSessionEventsForTurn(
    page,
    options,
    EVENT_READ_PROBE_TURN_ID,
    turnStart.messages,
  );
  const readModel = await waitForSessionReadContainsTurn(
    page,
    options,
    requestLog,
    EVENT_READ_PROBE_TURN_ID,
    EVENT_READ_PROBE_READ_TEXT,
  );
  const toolCall = findReadModelToolCall(
    readModel,
    EVENT_READ_PROBE_TOOL_CALL_ID,
    EVENT_READ_PROBE_TOOL_NAME,
  );
  const toolOutput = String(
    toolCall?.output_preview ??
      toolCall?.outputPreview ??
      toolCall?.output ??
      "",
  );

  return sanitizeJson({
    turnId: EVENT_READ_PROBE_TURN_ID,
    eventName,
    turnStartResult: {
      turnId:
        turnStart.result?.turn?.turnId ??
        turnStart.result?.turn?.turn_id ??
        null,
      status: turnStart.result?.turn?.status ?? null,
      messageCount: turnStart.messages.length,
      notificationCount: collectAgentSessionEvents(turnStart.messages).length,
    },
    events: eventObservation.summary,
    readModel: {
      containsTurnId: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_TURN_ID,
      ),
      containsDoneText: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_DONE_TEXT,
      ),
      containsReadText: JSON.stringify(readModel || {}).includes(
        EVENT_READ_PROBE_READ_TEXT,
      ),
      toolCallCount: collectReadModelToolCalls(readModel).length,
      containsToolCall: Boolean(toolCall),
      toolName: toolCall?.tool_name ?? toolCall?.toolName ?? null,
      toolStatus: toolCall?.status ?? null,
      containsToolOutput: toolOutput.includes(EVENT_READ_PROBE_TOOL_OUTPUT),
      toolTurnId: toolCall?.turn_id ?? toolCall?.turnId ?? null,
      latestTurnStatus:
        readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
        readModel?.detail?.thread_read?.status ??
        readModel?.detail?.status ??
        null,
    },
  });
}

export async function waitForSessionReadCanceled(
  page,
  options,
  requestLog,
  {
    sessionId = SESSION_ID,
    prompt = NEWS_PROMPT,
    partialText = "",
    requireContent = true,
  } = {},
) {
  const startedAt = Date.now();
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    const serialized = JSON.stringify(read.result || {});
    if (
      serialized.includes("canceled") &&
      (!requireContent ||
        (serialized.includes(prompt) &&
          (!partialText || serialized.includes(partialText))))
    ) {
      return read.result;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server read model 未完成取消闭环: ${JSON.stringify(
      sanitizeJson(lastRead),
    )}`,
  );
}
