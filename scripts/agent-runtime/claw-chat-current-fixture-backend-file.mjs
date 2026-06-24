import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  ASSISTANT_DONE_TEXT,
  CONTINUE_DONE_TEXT,
  CONTINUE_PROMPT,
  EVENT_READ_PROBE_DONE_TEXT,
  EVENT_READ_PROBE_READ_TEXT,
  EVENT_READ_PROBE_TOOL_CALL_ID,
  EVENT_READ_PROBE_TOOL_NAME,
  EVENT_READ_PROBE_TOOL_OUTPUT,
  EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_ID,
  EXPERT_SKILLS_RUNTIME_PANEL_DONE_TEXT,
  EXPERT_SKILLS_RUNTIME_PANEL_PROMPT,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_TITLE,
  GOAL_DONE_TEXT,
  GOAL_PROMPT,
  MCP_STRUCTURED_CONTENT_DONE_TEXT,
  MCP_STRUCTURED_CONTENT_PROMPT,
  MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT,
  MCP_STRUCTURED_CONTENT_RESULT,
  MCP_STRUCTURED_CONTENT_TOOL_CALL_ID,
  MCP_STRUCTURED_CONTENT_TOOL_NAME,
  NEWS_PROMPT,
  PLAN_DONE_TEXT,
  PLAN_PROMPT,
  PLAN_STEPS,
  PROPOSED_PLAN_BLOCK,
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
  SKILLS_RUNTIME_SKILL_NAME,
  THREAD_ID,
  WEB_TOOLS_BROKEN_MARKDOWN_TEXT,
  WEB_TOOLS_FETCH_MARKDOWN,
  WEB_TOOLS_FETCH_TOOL_CALL_ID,
  WEB_TOOLS_MID_THINKING_TEXT,
  WEB_TOOLS_REASONING_FINAL_ID,
  WEB_TOOLS_REASONING_FINAL_SIGNATURE,
  WEB_TOOLS_REASONING_ITEM_ID,
  WEB_TOOLS_REASONING_ITEM_SIGNATURE,
  WEB_TOOLS_REASONING_NATIVE_ITEM_ID,
  WEB_TOOLS_REASONING_PROVIDER_BACKEND,
  WEB_TOOLS_RENDERING_DONE_TEXT,
  WEB_TOOLS_RENDERING_PROMPT,
  WEB_TOOLS_SEARCH_SNIPPET,
  WEB_TOOLS_SEARCH_TITLE,
  WEB_TOOLS_SEARCH_TOOL_CALL_ID,
  WEB_TOOLS_SEARCH_URL,
} from "./claw-chat-current-fixture-constants.mjs";
import { writeJsonFile } from "./claw-chat-current-fixture-utils.mjs";

export function createTempRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "claw-chat-current-fixture-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const asterRoot = path.join(tempRoot, "aster");
  const backendPath = path.join(tempRoot, "claw-chat-backend.mjs");
  const backendLedgerPath = path.join(tempRoot, "claw-chat-backend.jsonl");
  const cancelSignalPath = path.join(tempRoot, "claw-chat-cancel.signal");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    asterRoot,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(backendLedgerPath, "");
  writeFixtureBackend(backendPath);

  return {
    tempRoot,
    electronUserDataDir,
    backendPath,
    backendLedgerPath,
    cancelSignalPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      LIME_ASTER_ROOT: asterRoot,
    },
  };
}

export function writeFixtureBackend(backendPath) {
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
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const cancelSignalPath = process.argv[3];
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

appendLedgerEntry({
    kind: input.kind,
    sessionId: input.request?.session?.sessionId,
    turnId: input.request?.turn?.turnId,
    inputText: input.request?.input?.text,
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
  const isEventReadProbe = inputText.includes("agentSession/event");
  const isContinuePrompt = inputText.includes("${CONTINUE_PROMPT}");
  const isPlanPrompt = inputText.includes("${PLAN_PROMPT}");
  const isGoalPrompt = inputText.includes("${GOAL_PROMPT}");
  const isWebToolsRenderingPrompt = inputText.includes("${WEB_TOOLS_RENDERING_PROMPT}");
  const isMcpStructuredContentPrompt = inputText.includes("${MCP_STRUCTURED_CONTENT_PROMPT}");
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
          : isWebToolsRenderingPrompt
            ? "${WEB_TOOLS_RENDERING_DONE_TEXT}"
            : isMcpStructuredContentPrompt
              ? "${MCP_STRUCTURED_CONTENT_DONE_TEXT}"
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
    isWebToolsRenderingPrompt ||
    isMcpStructuredContentPrompt ||
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
  const initialMessageText = isEventReadProbe
    ? "事件流 probe 已进入 RuntimeCore：\\n"
    : isContinuePrompt
      ? "继续输出已恢复：\\n"
      : isPlanPrompt
        ? "我先给出计划，不会直接改代码：\\n"
        : isGoalPrompt
          ? "追求目标已进入当前回合：\\n"
          : isWebToolsRenderingPrompt
            ? "我先联网核实目标页面来源。\\n"
            : isMcpStructuredContentPrompt
              ? "我先调用 MCP docs 诊断工具，并只把用户答案放在 structuredContent。\\n"
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
        : isWebToolsRenderingPrompt
          ? ${JSON.stringify(webToolsRenderingFixtureText)}
          : isMcpStructuredContentPrompt
            ? "MCP structuredContent 展示验证完成。\\n"
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
    (process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel" ||
      process.env.CLAW_CHAT_FIXTURE_SCENARIO === "cancel-then-continue") &&
    !isEventReadProbe &&
    !isContinuePrompt;
  if (shouldWaitForCancel) {
    emitEvents(initialEvents);
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

  emitEvents(initialEvents);
  await sleep(120);
  if (isWebToolsRenderingPrompt) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          name: "WebSearch",
          arguments: {
            query: "Lime WebSearch rendering"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          outputPreview: ${JSON.stringify(JSON.stringify({
            results: [
              {
                title: "Help",
                url: "https://help.yahoo.com/kb/search-for-desktop",
                snippet: "Yahoo search help navigation",
              },
              {
                title: "Sign In",
                url: "https://login.yahoo.com/?src=search",
                snippet: "Yahoo sign in navigation",
              },
              {
                title: "Yahoo Scout",
                url: "https://scout.yahoo.com/chat",
                snippet: "Yahoo search assistant navigation",
              },
              {
                title: WEB_TOOLS_SEARCH_TITLE,
                url: WEB_TOOLS_SEARCH_URL,
                snippet: WEB_TOOLS_SEARCH_SNIPPET,
              },
            ],
          }))},
          output: ${JSON.stringify(JSON.stringify({
            results: [
              {
                title: "Help",
                url: "https://help.yahoo.com/kb/search-for-desktop",
                snippet: "Yahoo search help navigation",
              },
              {
                title: "Sign In",
                url: "https://login.yahoo.com/?src=search",
                snippet: "Yahoo sign in navigation",
              },
              {
                title: "Yahoo Scout",
                url: "https://scout.yahoo.com/chat",
                snippet: "Yahoo search assistant navigation",
              },
              {
                title: WEB_TOOLS_SEARCH_TITLE,
                url: WEB_TOOLS_SEARCH_URL,
                snippet: WEB_TOOLS_SEARCH_SNIPPET,
              },
            ],
          }))},
          success: true
        }
      }
    ]);
    await sleep(80);
    const webToolsReasoningStartedAt = new Date().toISOString();
    emitEvents([
      {
        type: "reasoning.final",
        payload: {
          reasoningId: "${WEB_TOOLS_REASONING_FINAL_ID}",
          reasoning_id: "${WEB_TOOLS_REASONING_FINAL_ID}",
          text: "${WEB_TOOLS_MID_THINKING_TEXT}",
          providerMetadata: {
            backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
            signature: "${WEB_TOOLS_REASONING_FINAL_SIGNATURE}"
          },
          provider_metadata: {
            backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
            signature: "${WEB_TOOLS_REASONING_FINAL_SIGNATURE}"
          }
        }
      }
    ]);
    await sleep(40);
    emitEvents([
      {
        type: "item.updated",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "in_progress",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            updated_at: webToolsReasoningStartedAt,
            updatedAt: webToolsReasoningStartedAt,
            metadata: {
              native_reasoning_item_id: "${WEB_TOOLS_REASONING_NATIVE_ITEM_ID}",
              provider_metadata: {
                backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
                signature: "${WEB_TOOLS_REASONING_ITEM_SIGNATURE}"
              }
            }
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          name: "WebFetch",
          arguments: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          outputPreview: ${JSON.stringify(JSON.stringify({
            bytes: 2048,
            code: 200,
            codeText: "OK",
            result: WEB_TOOLS_FETCH_MARKDOWN,
          }))},
          output: ${JSON.stringify(JSON.stringify({
            bytes: 2048,
            code: 200,
            codeText: "OK",
            result: WEB_TOOLS_FETCH_MARKDOWN,
          }))},
          success: true,
          metadata: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "item.completed",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "completed",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            completed_at: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
              native_reasoning_item_id: "${WEB_TOOLS_REASONING_NATIVE_ITEM_ID}",
              provider_metadata: {
                backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
                signature: "${WEB_TOOLS_REASONING_ITEM_SIGNATURE}"
              }
            }
          }
        }
      }
    ]);
    await sleep(1800);
  }
  if (isMcpStructuredContentPrompt) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_call_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolName: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          tool_name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          arguments: {
            question: "structured content display",
            server: "docs"
          },
          metadata: {
            tool_family: "mcp",
            mcp_server: "docs",
            mcp_tool: "diagnostic_probe"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_call_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolName: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          tool_name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          outputPreview: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)},
          output: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)},
          success: true,
          structuredContent: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
          structured_content: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
          result: {
            structuredContent: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
            structured_content: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)}
          },
          metadata: {
            tool_family: "mcp",
            mcp_server: "docs",
            mcp_tool: "diagnostic_probe"
          }
        }
      }
    ]);
    await sleep(120);
  }
${skillsRuntimeBackendEvents}
${explicitSkillsRuntimeBackendEvents}
${manualEnableSkillsRuntimeBackendEvents}
  if (isExpertSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "declared",
          text: "专家已声明 skillRefs，但声明不等于执行授权。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_declared_skill_refs",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              expertTitle: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skillRefs: ["${EXPERT_SKILLS_RUNTIME_SKILL_REF}"]
            },
            expert_skills_runtime: {
              event: "expert_declared_skill_refs",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              expert_title: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skill_refs: ["${EXPERT_SKILLS_RUNTIME_SKILL_REF}"]
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isExpertPanelSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "declared",
          text: "专家面板更新后的 skillRefs 已进入当前回合，但声明仍不等于执行授权。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_declared_skill_refs",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              expertTitle: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skillRefs: [
                "${EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF}",
                "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
              ]
            },
            expert_skills_runtime: {
              event: "expert_declared_skill_refs",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              expert_title: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skill_refs: [
                "${EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF}",
                "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
              ]
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
${expertSkillsRuntimeBackendEvents}
${expertPanelSkillsRuntimeBackendEvents}
  if (isExpertSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "selected",
          text: "专家本轮通过 selector 选择 capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_selected_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              declaredSkillRef: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            },
            expert_skills_runtime: {
              event: "expert_selected_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              declared_skill_ref: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            }
          }
        }
      },
      {
        type: "runtime.status",
        payload: {
          status: "invoked",
          text: "专家本轮真实调用 Skill tool: capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_invoked_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              toolCallId: "${EXPERT_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            },
            expert_skills_runtime: {
              event: "expert_invoked_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              tool_call_id: "${EXPERT_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isExpertPanelSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "selected",
          text: "专家面板新增技能后的下一轮通过 selector 选择 capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_selected_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              declaredSkillRef: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            },
            expert_skills_runtime: {
              event: "expert_selected_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              declared_skill_ref: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            }
          }
        }
      },
      {
        type: "runtime.status",
        payload: {
          status: "invoked",
          text: "专家面板新增技能后的下一轮真实调用 Skill tool: capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_invoked_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              toolCallId: "${EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            },
            expert_skills_runtime: {
              event: "expert_invoked_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              tool_call_id: "${EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isEventReadProbe) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          arguments: {
            url: "https://example.com/claw-event-read",
            purpose: "claw-chat-current-fixture-event-read"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          outputPreview: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          output: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          success: true
        }
      }
    ]);
    await sleep(80);
  }
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
