import fs from "node:fs";
import { renderBackendToolAndSkillEventScript } from "./claw-chat-current-fixture-backend-tool-skill-events.mjs";
import {
  ASSISTANT_DONE_TEXT,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EVENT_READ_PROBE_DONE_TEXT,
  EVENT_READ_PROBE_READ_TEXT,
  EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SCENARIO,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  IMAGE_COMMAND_PRESENTATION_CAPTION,
  IMAGE_COMMAND_PRESENTATION_INTRO,
  INPUTBAR_RICH_RESTORE_PROMPT,
  INPUTBAR_RICH_RESTORE_SCENARIO,
  INPUTBAR_PENDING_STEER_ACTIVE_PROMPT,
  INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT,
  INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO,
  INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO,
  INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  MULTI_AGENT_TEAM_DONE_TEXT,
  MULTI_AGENT_TEAM_PROMPT,
  MULTI_AGENT_TEAM_SUMMARY_TEXT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  PROPOSED_PLAN_BLOCK,
  REASONING_FIRST_VISIBLE_DONE_TEXT,
  REASONING_FIRST_VISIBLE_FINAL_TEXT,
  REASONING_FIRST_VISIBLE_PROMPT,
  REASONING_FIRST_VISIBLE_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_CANCELED_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_CANCELED_AFTER_ANSWER_PROMPT,
  TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO,
  TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT,
  TERMINAL_FAILED_AFTER_ANSWER_PROMPT,
  TERMINAL_STALE_GUARD_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_DONE_TEXT,
  TERMINAL_STALE_GUARD_FIRST_PROMPT,
  TERMINAL_STALE_GUARD_FIRST_TEXT,
  TERMINAL_STALE_GUARD_SECOND_PROMPT,
  TERMINAL_STALE_GUARD_SECOND_TEXT,
  TERMINAL_STALE_GUARD_STALE_DONE_TEXT,
  THREAD_ID,
  WEB_TOOLS_BROKEN_MARKDOWN_TEXT,
  WEB_TOOLS_RENDERING_DONE_TEXT,
  WEB_TOOLS_RENDERING_PROMPT,
  renderMultiAgentTeamBackendEvents,
  renderSkillsRuntimeBackendEvents,
  SKILLS_RUNTIME_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_DONE_TEXT,
  SKILLS_RUNTIME_EXPLICIT_PROMPT,
  SKILLS_RUNTIME_EXPLICIT_SCENARIO,
  SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT,
  SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT,
  SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
  SKILLS_RUNTIME_PROMPT,
  SKILLS_RUNTIME_SCENARIO,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  MEDIA_REFERENCE_BYTE_SIZE,
  MEDIA_REFERENCE_CAPTION,
  MEDIA_REFERENCE_DONE_TEXT,
  MEDIA_REFERENCE_MIME_TYPE,
  MEDIA_REFERENCE_PROMPT,
  MEDIA_REFERENCE_SHA256,
  MEDIA_REFERENCE_SUMMARY_TEXT,
  MEDIA_REFERENCE_TITLE,
  MEDIA_REFERENCE_URI,
} from "./claw-chat-current-fixture-media-reference.mjs";

export function writeFixtureBackend(backendPath, options = {}) {
  const mediaReferenceSourcePath = String(
    options.mediaReferenceSourcePath ?? "",
  ).trim();
  const proposedPlanFixtureText = `${PROPOSED_PLAN_BLOCK}\n计划已写入右侧计划轨，等待你确认后再执行。\n`;
  const proposedPlanThreadItemText = PLAN_STEPS.map(
    (step) => `- ${step.step}`,
  ).join("\n");
  const webToolsRenderingFixtureText = `网页搜索渲染结论：搜索来源已展开，读取页面已归入同一过程，最终正文继续输出。\n${WEB_TOOLS_BROKEN_MARKDOWN_TEXT}\n`;
  const skillsRuntimeBackendEvents = renderSkillsRuntimeBackendEvents(
    SKILLS_RUNTIME_SCENARIO,
  );
  const explicitSkillsRuntimeBackendEvents = renderSkillsRuntimeBackendEvents({
    ...SKILLS_RUNTIME_EXPLICIT_SCENARIO,
    promptFlagName: "isExplicitSkillsRuntimePrompt",
  });
  const manualEnableSkillsRuntimeBackendEvents =
    renderSkillsRuntimeBackendEvents({
      ...SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO,
      promptFlagName: "isManualEnableSkillsRuntimePrompt",
    });
  const expertSkillsRuntimeBackendEvents = renderSkillsRuntimeBackendEvents({
    ...EXPERT_SKILLS_RUNTIME_SCENARIO,
    promptFlagName: "isExpertSkillsRuntimePrompt",
  });
  const expertPanelSkillsRuntimeBackendEvents =
    renderSkillsRuntimeBackendEvents({
      ...EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
      promptFlagName: "isExpertPanelSkillsRuntimePrompt",
    });
  const multiAgentTeamBackendEvents = renderMultiAgentTeamBackendEvents();
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const cancelSignalPath = process.argv[3];
const mediaReferenceSourcePath = ${JSON.stringify(mediaReferenceSourcePath)};
const input = JSON.parse(readFileSync(0, "utf8"));
const asterChatRequest = input.request?.runtimeOptions?.hostOptions?.asterChatRequest;

export function appendLedgerEntry(entry) {
  if (!ledgerPath) {
    return;
  }
  appendFileSync(ledgerPath, JSON.stringify({
    ...entry,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

export function readLedgerEntries() {
  if (!ledgerPath) {
    return [];
  }
  try {
    return readFileSync(ledgerPath, "utf8")
      .split("\\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function emitEvents(events) {
  appendLedgerEntry({
    kind: "backendEmit",
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    eventCount: events.length,
    eventTypes: events.map((event) => event?.type).filter(Boolean)
  });
  console.log(JSON.stringify({ events }));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function currentThreadId() {
  return input.request?.session?.threadId ??
    input.request?.session?.thread_id ??
    "${THREAD_ID}";
}

export function currentTurnId() {
  return input.request?.turn?.turnId ??
    input.request?.turn?.turn_id ??
    asterChatRequest?.turn_id ??
    asterChatRequest?.turnId ??
    "";
}

export function summarizeRequestInput(request) {
  const attachments = Array.isArray(request?.input?.attachments)
    ? request.input.attachments
    : [];
  const asterImages = Array.isArray(
    request?.runtimeOptions?.hostOptions?.asterChatRequest?.images,
  )
    ? request.runtimeOptions.hostOptions.asterChatRequest.images
    : [];
  const runtimeMetadata = request?.runtimeOptions?.metadata ?? {};
  const harnessMetadata = runtimeMetadata?.harness ?? {};
  const pathReferences = Array.isArray(runtimeMetadata?.path_references)
    ? runtimeMetadata.path_references
    : Array.isArray(runtimeMetadata?.pathReferences)
      ? runtimeMetadata.pathReferences
      : [];
  const harnessFileReferences = Array.isArray(harnessMetadata?.file_references)
    ? harnessMetadata.file_references
    : Array.isArray(harnessMetadata?.fileReferences)
      ? harnessMetadata.fileReferences
      : [];
  const fileReferences = pathReferences.length > 0
    ? pathReferences
    : harnessFileReferences;
  return {
    textLength: typeof request?.input?.text === "string"
      ? request.input.text.length
      : 0,
    attachmentCount: attachments.length + asterImages.length,
    imageAttachmentCount:
      attachments.filter((attachment) =>
        String(attachment?.mediaType ?? attachment?.media_type ?? "").startsWith("image/")
      ).length + asterImages.length,
    fileReferenceCount: fileReferences.length,
    fileReferenceNames: fileReferences
      .map((reference) => reference?.name)
      .filter((value) => typeof value === "string"),
    fileReferencePaths: fileReferences
      .map((reference) => reference?.path)
      .filter((value) => typeof value === "string")
  };
}

appendLedgerEntry({
    kind: input.kind,
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    inputText: input.request?.input?.text,
    inputSummary: summarizeRequestInput(input.request),
    providerPreference: input.request?.providerPreference,
    modelPreference: input.request?.modelPreference,
    runtimeOptions: input.request?.runtimeOptions,
    asterChatRequest
});

if (input.kind === "turnCancel") {
  if (cancelSignalPath) {
    appendFileSync(cancelSignalPath, JSON.stringify({
      sessionId: input.request?.session?.sessionId,
      turnId: input.request?.turn?.turnId,
      recordedAt: new Date().toISOString()
    }) + "\\n");
  }
  if (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO}") {
    appendLedgerEntry({
      kind: "terminalCanceledAfterAnswerTurnCanceled",
      sessionId: input.request?.session?.sessionId,
      turnId: input.request?.turn?.turnId,
      eventType: "turn.canceled",
      partialText: "${TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT}",
      canceledText: "${TERMINAL_CANCELED_AFTER_ANSWER_CANCELED_TEXT}"
    });
  }
  emitEvents([
    {
      type: "turn.canceled",
      payload: {
        status: "canceled",
        reason: "user_cancelled"
      }
    }
  ]);
  process.exit(0);
}

if (input.kind === "turnStart") {
  const inputText = input.request?.input?.text || "";
  const serializedInput = JSON.stringify(input);
  const isImageTaskPresentationPrompt =
    inputText.includes("image_task_presentation.v1") ||
    inputText.includes("Generate user-visible copy for one image generation turn.") ||
    serializedInput.includes("image_task_presentation.v1") ||
    serializedInput.includes("Generate user-visible copy for one image generation turn.") ||
    serializedInput.includes("image_command_presentation");
  const isEventReadProbe = inputText.includes("agentSession/event");
  const isContinuePrompt = inputText.includes("${CONTINUE_PROMPT}");
  const isPlanPrompt = inputText.includes("${PLAN_PROMPT}");
  const isGoalPrompt = inputText.includes("${GOAL_PROMPT}");
  const isInputbarRichRestorePrompt = inputText.includes("${INPUTBAR_RICH_RESTORE_PROMPT}");
  const isInputbarPendingSteerActivePrompt = inputText.includes("${INPUTBAR_PENDING_STEER_ACTIVE_PROMPT}");
  const isReasoningFirstVisiblePrompt = inputText.includes("${REASONING_FIRST_VISIBLE_PROMPT}");
  const isTerminalCanceledAfterAnswerPrompt = inputText.includes("${TERMINAL_CANCELED_AFTER_ANSWER_PROMPT}");
  const isTerminalFailedAfterAnswerPrompt = inputText.includes("${TERMINAL_FAILED_AFTER_ANSWER_PROMPT}");
  const isTerminalStaleGuardFirstPrompt = inputText.includes("${TERMINAL_STALE_GUARD_FIRST_PROMPT}");
  const isTerminalStaleGuardSecondPrompt = inputText.includes("${TERMINAL_STALE_GUARD_SECOND_PROMPT}");
  const isWebToolsRenderingPrompt = inputText.includes("${WEB_TOOLS_RENDERING_PROMPT}");
  const isMcpStructuredContentPrompt = inputText.includes("${MCP_STRUCTURED_CONTENT_PROMPT}");
  const isMediaReferencePrompt = inputText.includes("${MEDIA_REFERENCE_PROMPT}");
  const isMultiAgentTeamPrompt = inputText.includes("${MULTI_AGENT_TEAM_PROMPT}");
  const isManualEnableSkillsRuntimePrompt = inputText.includes("${SKILLS_RUNTIME_MANUAL_ENABLE_PROMPT}");
  const isExpertPanelSkillsRuntimePrompt = inputText.includes("${EXPERT_SKILLS_RUNTIME_PANEL_PROMPT}");
  const isExpertSkillsRuntimePrompt =
    inputText.includes("${EXPERT_SKILLS_RUNTIME_PROMPT}") &&
    !isExpertPanelSkillsRuntimePrompt;
  const isExplicitSkillsRuntimePrompt = inputText.includes("${SKILLS_RUNTIME_EXPLICIT_PROMPT}");
  const isSkillsRuntimePrompt =
    inputText.includes("${SKILLS_RUNTIME_PROMPT}") &&
    !isExplicitSkillsRuntimePrompt &&
    !isManualEnableSkillsRuntimePrompt;
  const assistantDoneText = isEventReadProbe
    ? "${EVENT_READ_PROBE_DONE_TEXT}"
    : isContinuePrompt
      ? "${CONTINUE_DONE_TEXT}"
      : isPlanPrompt
        ? "${PLAN_DONE_TEXT}"
        : isGoalPrompt
          ? "${GOAL_DONE_TEXT}"
          : isReasoningFirstVisiblePrompt
            ? "${REASONING_FIRST_VISIBLE_DONE_TEXT}"
          : isTerminalStaleGuardFirstPrompt
            ? "${TERMINAL_STALE_GUARD_FIRST_DONE_TEXT}"
          : isTerminalStaleGuardSecondPrompt
            ? "${TERMINAL_STALE_GUARD_DONE_TEXT}"
          : isWebToolsRenderingPrompt
            ? "${WEB_TOOLS_RENDERING_DONE_TEXT}"
          : isMcpStructuredContentPrompt
            ? "${MCP_STRUCTURED_CONTENT_DONE_TEXT}"
              : isMediaReferencePrompt
                ? "${MEDIA_REFERENCE_DONE_TEXT}"
                : isMultiAgentTeamPrompt
                  ? "${MULTI_AGENT_TEAM_DONE_TEXT}"
                  : isSkillsRuntimePrompt
                    ? "${SKILLS_RUNTIME_DONE_TEXT}"
                    : isExplicitSkillsRuntimePrompt
                      ? "${SKILLS_RUNTIME_EXPLICIT_DONE_TEXT}"
                      : isManualEnableSkillsRuntimePrompt
                        ? "${SKILLS_RUNTIME_MANUAL_ENABLE_DONE_TEXT}"
                        : isExpertSkillsRuntimePrompt
                          ? "${EXPERT_SKILLS_RUNTIME_DONE_TEXT}"
                          : isExpertPanelSkillsRuntimePrompt
                            ? "${EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT}"
                            : "${ASSISTANT_DONE_TEXT}";
  const hasProcessPrelude =
    isEventReadProbe ||
    isPlanPrompt ||
    isReasoningFirstVisiblePrompt ||
    isWebToolsRenderingPrompt ||
    isMcpStructuredContentPrompt ||
    isMediaReferencePrompt ||
    isMultiAgentTeamPrompt ||
    isSkillsRuntimePrompt ||
    isExplicitSkillsRuntimePrompt ||
    isManualEnableSkillsRuntimePrompt ||
    isExpertSkillsRuntimePrompt ||
    isExpertPanelSkillsRuntimePrompt;
  const currentTurnIdForItem = currentTurnId() || "turn";
  const commentaryItemId = \`agent-message-commentary-\${currentTurnIdForItem}\`;
  const finalAnswerItemId = \`agent-message-final-\${currentTurnIdForItem}\`;
  function messageDeltaPayload(text, phase, itemId) {
    return {
      text,
      item_id: itemId,
      itemId,
      phase,
      thread_id: currentThreadId(),
      threadId: currentThreadId(),
      turn_id: currentTurnId(),
      turnId: currentTurnId()
    };
  }
  function providerTracePayload(stage, elapsedMs, status, extra = {}) {
    return {
      stage,
      provider: "${FIXTURE_PROVIDER}",
      model: "${FIXTURE_MODEL}",
      attempt: 1,
      elapsed_ms: elapsedMs,
      elapsedMs,
      status,
      ...extra
    };
  }
  if (isImageTaskPresentationPrompt) {
    const presentationText = JSON.stringify({
      assistant_intro: ${JSON.stringify(IMAGE_COMMAND_PRESENTATION_INTRO)},
      completion_caption: ${JSON.stringify(IMAGE_COMMAND_PRESENTATION_CAPTION)}
    });
    emitEvents([
      {
        type: "message.delta",
        payload: messageDeltaPayload(presentationText, "final_answer", finalAnswerItemId)
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: presentationText
        }
      }
    ]);
    process.exit(0);
  }
  const initialMessageText = isEventReadProbe
    ? "事件流 probe 已进入 RuntimeCore：\\n"
    : isContinuePrompt
      ? "继续输出已恢复：\\n"
      : isPlanPrompt
        ? "我先给出计划，不会直接改代码：\\n"
          : isGoalPrompt
            ? "追求目标已进入当前回合：\\n"
          : isInputbarPendingSteerActivePrompt
              ? "${INPUTBAR_PENDING_STEER_ACTIVE_OUTPUT_TEXT}\\n"
            : isReasoningFirstVisiblePrompt
              ? ""
            : isTerminalCanceledAfterAnswerPrompt
              ? "${TERMINAL_CANCELED_AFTER_ANSWER_PARTIAL_TEXT}\\n"
            : isTerminalFailedAfterAnswerPrompt
              ? "${TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT}\\n"
            : isTerminalStaleGuardFirstPrompt
              ? "${TERMINAL_STALE_GUARD_FIRST_TEXT}\\n"
            : isTerminalStaleGuardSecondPrompt
              ? "第二轮已经开始，旧 terminal 到达时不能打断当前输出。\\n"
          : isWebToolsRenderingPrompt
            ? "我先联网核实目标页面来源。\\n"
            : isMcpStructuredContentPrompt
              ? "我先调用 MCP docs 诊断工具，并只把用户答案放在 structuredContent。\\n"
              : isMediaReferencePrompt
                ? "${MEDIA_REFERENCE_SUMMARY_TEXT}：\\n"
                : isMultiAgentTeamPrompt
                  ? "我会在当前主线程内编排多 Agent 团队，不创建新的顶层历史分类。\\n"
                  : isSkillsRuntimePrompt
                    ? "我先搜索 Skills metadata，再按需加载单个 SKILL.md。\\n"
                    : isExplicitSkillsRuntimePrompt
                      ? "我识别到显式 Skill 提及，仍先检索 metadata，再按需加载单个 SKILL.md。\\n"
                      : isManualEnableSkillsRuntimePrompt
                        ? "我识别到本轮手动启用的 workspace Skill，仍先核对 metadata，再按需加载单个 SKILL.md。\\n"
                        : isExpertSkillsRuntimePrompt
                          ? "我识别到专家绑定的 skillRefs，但仍先通过 skill_search 选择，再按需加载单个 SKILL.md。\\n"
                          : isExpertPanelSkillsRuntimePrompt
                            ? "我识别到右侧专家面板更新后的 skillRefs，并继续通过 skill_search 选择单个 Skill。\\n"
                            : "以下是今日国际新闻简要整理：\\n";
  const initialEvents = [
    {
      type: "provider.request.started",
      payload: providerTracePayload("request_started", 0, "running")
    },
    {
      type: "provider.first_event.received",
      payload: providerTracePayload("first_event_received", 40, "running")
    },
    {
      type: "provider.first_text_delta.received",
      payload: providerTracePayload("first_text_delta_received", 90, "running", {
        text_chars: initialMessageText.length,
        textChars: initialMessageText.length
      })
    },
    {
      type: "message.delta",
      payload: messageDeltaPayload(
        initialMessageText,
        hasProcessPrelude ? "commentary" : "final_answer",
        hasProcessPrelude ? commentaryItemId : finalAnswerItemId
      )
    }
  ];
  const followupText = isContinuePrompt
    ? "停止后的同一会话已经可以继续输出，并由 App Server current 终态收口。\\n"
    : isPlanPrompt
        ? ${JSON.stringify(proposedPlanFixtureText)}
        : isGoalPrompt
          ? "目标已绑定到本轮请求，后续会围绕 ${GOAL_PROMPT} 收口。\\n"
        : isReasoningFirstVisiblePrompt
          ? "${REASONING_FIRST_VISIBLE_FINAL_TEXT}\\n"
        : isTerminalStaleGuardFirstPrompt
          ? "${TERMINAL_STALE_GUARD_FIRST_DONE_TEXT}\\n"
        : isTerminalStaleGuardSecondPrompt
          ? "${TERMINAL_STALE_GUARD_SECOND_TEXT}\\n${TERMINAL_STALE_GUARD_DONE_TEXT}\\n"
        : isWebToolsRenderingPrompt
          ? ${JSON.stringify(webToolsRenderingFixtureText)}
          : isMcpStructuredContentPrompt
          ? "MCP structuredContent 展示验证完成。\\n"
            : isMediaReferencePrompt
              ? ""
              : isMultiAgentTeamPrompt
                ? "${MULTI_AGENT_TEAM_SUMMARY_TEXT}：研究、撰写、复核都记录为 parent Thread 的团队事实，子代理只作为当前回合执行上下文。\\n"
                : isSkillsRuntimePrompt
                  ? ${JSON.stringify(SKILLS_RUNTIME_SCENARIO.fixtureText)}
                  : isExplicitSkillsRuntimePrompt
                    ? ${JSON.stringify(SKILLS_RUNTIME_EXPLICIT_SCENARIO.fixtureText)}
                    : isManualEnableSkillsRuntimePrompt
                      ? ${JSON.stringify(SKILLS_RUNTIME_MANUAL_ENABLE_SCENARIO.fixtureText)}
                      : isExpertSkillsRuntimePrompt
                        ? ${JSON.stringify(EXPERT_SKILLS_RUNTIME_SCENARIO.fixtureText)}
                        : isExpertPanelSkillsRuntimePrompt
                          ? ${JSON.stringify(EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO.fixtureText)}
        : "1. 多国外交议题持续升温，地区安全与经贸协商仍是焦点。\\n2. 全球市场继续关注能源、供应链和主要央行政策变化。\\n3. 国际组织呼吁在气候、粮食与人道援助议题上保持协调。\\n";
  const shouldWaitForCancel =
    ((process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel" ||
      process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel-then-continue") &&
      !isEventReadProbe &&
      !isContinuePrompt) ||
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${INPUTBAR_RICH_RESTORE_SCENARIO}" &&
      isInputbarRichRestorePrompt) ||
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${INPUTBAR_PENDING_STEER_RICH_RESTORE_SCENARIO}" &&
      isInputbarPendingSteerActivePrompt) ||
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${INPUTBAR_PENDING_STEER_MULTI_QUEUE_SCENARIO}" &&
      isInputbarPendingSteerActivePrompt) ||
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${INPUTBAR_PENDING_STEER_POP_FRONT_RESUME_SCENARIO}" &&
      isInputbarPendingSteerActivePrompt) ||
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "${TERMINAL_CANCELED_AFTER_ANSWER_SCENARIO}" &&
      isTerminalCanceledAfterAnswerPrompt);
  if (shouldWaitForCancel) {
    emitEvents(
      isInputbarRichRestorePrompt
        ? initialEvents.filter((event) => event.type !== "message.delta" && event.type !== "provider.first_text_delta.received")
        : initialEvents
    );
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120000) {
      try {
        const cancelled = cancelSignalPath ? readFileSync(cancelSignalPath, "utf8").trim() : "";
        if (cancelled) {
          process.exit(0);
        }
      } catch {
        // 等待 turnCancel 写入 signal。
      }
      await sleep(100);
    }
    console.error("cancel scenario timed out waiting for turnCancel");
    process.exit(2);
  }

  emitEvents(
    isReasoningFirstVisiblePrompt
      ? initialEvents.filter(
          (event) =>
            event.type !== "message.delta" &&
            event.type !== "provider.first_text_delta.received",
        )
      : initialEvents,
  );
  await sleep(120);
  if (isTerminalFailedAfterAnswerPrompt) {
    appendLedgerEntry({
      kind: "terminalFailedAfterAnswerTurnFailed",
      sessionId: input.request?.session?.sessionId,
      turnId: currentTurnId(),
      eventType: "turn.failed",
      partialText: "${TERMINAL_FAILED_AFTER_ANSWER_PARTIAL_TEXT}",
      failureText: "${TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT}"
    });
    emitEvents([
      {
        type: "turn.failed",
        payload: {
          status: "failed",
          message: "${TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT}",
          errorMessage: "${TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT}",
          error_message: "${TERMINAL_FAILED_AFTER_ANSWER_FAILURE_TEXT}",
          failureCategory: "fixture_failed_after_answer",
          retryable: false
        }
      }
    ]);
    process.exit(0);
  }
  if (isTerminalStaleGuardSecondPrompt) {
    const firstTurnEntry = readLedgerEntries().find(
      (entry) =>
        entry?.kind === "turnStart" &&
        entry?.inputText === "${TERMINAL_STALE_GUARD_FIRST_PROMPT}",
    );
    appendLedgerEntry({
      kind: "terminalStaleGuardStaleTerminal",
      sessionId: input.request?.session?.sessionId,
      currentTurnId: currentTurnId(),
      staleTurnId: firstTurnEntry?.turnId ?? "unknown",
      staleEventType: "turn.completed",
      staleDoneText: "${TERMINAL_STALE_GUARD_STALE_DONE_TEXT}"
    });
    await sleep(250);
  }
  if (isReasoningFirstVisiblePrompt) {
    const reasoningStartedAt = new Date().toISOString();
    const reasoningItemId = \`\${currentTurnId() || "turn"}:reasoning:first-visible\`;
    emitEvents([
      {
        type: "reasoning.final",
        payload: {
          reasoningId: reasoningItemId,
          reasoning_id: reasoningItemId,
          text: "${REASONING_FIRST_VISIBLE_TEXT}",
          providerMetadata: {
            backend: "reasoning_first_visible_fixture",
            signature: "reasoning-first-visible-final-signature"
          },
          provider_metadata: {
            backend: "reasoning_first_visible_fixture",
            signature: "reasoning-first-visible-final-signature"
          }
        }
      },
      {
        type: "item.updated",
        payload: {
          item: {
            id: reasoningItemId,
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${REASONING_FIRST_VISIBLE_TEXT}",
            summary: ["${REASONING_FIRST_VISIBLE_TEXT}"],
            sequence: 1,
            status: "in_progress",
            started_at: reasoningStartedAt,
            startedAt: reasoningStartedAt,
            updated_at: reasoningStartedAt,
            updatedAt: reasoningStartedAt,
            metadata: {
              provider_metadata: {
                backend: "reasoning_first_visible_fixture",
                signature: "reasoning-first-visible-item-signature"
              }
            }
          }
        }
      }
    ]);
    await sleep(5000);
    emitEvents([
      {
        type: "item.completed",
        payload: {
          item: {
            id: reasoningItemId,
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${REASONING_FIRST_VISIBLE_TEXT}",
            summary: ["${REASONING_FIRST_VISIBLE_TEXT}"],
            sequence: 1,
            status: "completed",
            started_at: reasoningStartedAt,
            startedAt: reasoningStartedAt,
            completed_at: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
              provider_metadata: {
                backend: "reasoning_first_visible_fixture",
                signature: "reasoning-first-visible-item-signature"
              }
            }
          }
        }
      },
      {
        type: "provider.first_text_delta.received",
        payload: providerTracePayload("first_text_delta_received", 5200, "running", {
          text_chars: followupText.length,
          textChars: followupText.length
        })
      },
      {
        type: "message.delta",
        payload: messageDeltaPayload(followupText, "final_answer", finalAnswerItemId)
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${REASONING_FIRST_VISIBLE_FINAL_TEXT}\\n${REASONING_FIRST_VISIBLE_DONE_TEXT}"
        }
      }
    ]);
    process.exit(0);
  }
  if (isMediaReferencePrompt) {
    emitEvents([
      {
        type: "item.completed",
        payload: {
          item: {
            id: "agent-media-reference-1",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "agent_message",
            role: "assistant",
            phase: "final_answer",
            status: "completed",
            text: "${MEDIA_REFERENCE_SUMMARY_TEXT}",
            contentParts: [
              {
                type: "text",
                text: "${MEDIA_REFERENCE_SUMMARY_TEXT}"
              },
              {
                type: "media",
                kind: "image",
                caption: "${MEDIA_REFERENCE_CAPTION}",
                reference: {
                  uri: "${MEDIA_REFERENCE_URI}",
                  mime_type: "${MEDIA_REFERENCE_MIME_TYPE}",
                  title: "${MEDIA_REFERENCE_TITLE}",
                  ...(mediaReferenceSourcePath
                    ? { source_path: mediaReferenceSourcePath }
                    : {}),
                  sha256: "${MEDIA_REFERENCE_SHA256}",
                  byte_size: ${MEDIA_REFERENCE_BYTE_SIZE}
                }
              }
            ]
          }
        }
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${MEDIA_REFERENCE_DONE_TEXT}"
        }
      }
    ]);
    process.exit(0);
  }
  ${renderBackendToolAndSkillEventScript({
    skillsRuntimeBackendEvents,
    explicitSkillsRuntimeBackendEvents,
    manualEnableSkillsRuntimeBackendEvents,
    multiAgentTeamBackendEvents,
    expertSkillsRuntimeBackendEvents,
    expertPanelSkillsRuntimeBackendEvents,
  })}
  emitEvents([
    {
      type: "message.delta",
      payload: messageDeltaPayload(followupText, "final_answer", finalAnswerItemId)
    }
  ]);
  await sleep(120);
  if (isPlanPrompt) {
    emitEvents([
      {
        type: "plan.final",
        payload: {
          text: ${JSON.stringify(proposedPlanThreadItemText)},
          revisionId: "proposed_plan:fixture-1",
          source: "proposed_plan",
          plan: ${JSON.stringify(PLAN_STEPS)}
        }
      }
    ]);
    await sleep(80);
  }
  emitEvents([
    {
      type: "turn.completed",
      payload: {
        status: "completed",
        text: assistantDoneText
      }
    }
  ]);
  process.exit(0);
}

emitEvents([]);
`,
    { mode: 0o755 },
  );
}
