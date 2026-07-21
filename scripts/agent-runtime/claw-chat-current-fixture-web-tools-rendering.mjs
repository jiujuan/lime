import {
  APP_SERVER_METHOD_SESSION_READ,
  SESSION_ID,
  WEB_TOOLS_FETCH_TOOL_CALL_ID,
  WEB_TOOLS_MID_THINKING_TEXT,
  WEB_TOOLS_REASONING_ITEM_ID,
  WEB_TOOLS_REASONING_ITEM_SIGNATURE,
  WEB_TOOLS_REASONING_NATIVE_ITEM_ID,
  WEB_TOOLS_REASONING_PROVIDER_BACKEND,
  WEB_TOOLS_RENDERING_DONE_TEXT,
  WEB_TOOLS_RENDERING_PROMPT,
  WEB_TOOLS_SEARCH_TOOL_CALL_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  inspectGuiWebToolsRenderingDebug,
  waitForGuiWebToolsRenderingCompleted,
  waitForGuiWebToolsRenderingInProgress,
} from "./claw-chat-current-fixture-gui-web-tools-waits.mjs";
import { collectReadModelToolCalls } from "./claw-chat-current-fixture-read-model-core.mjs";
import { waitForSessionReadCompleted } from "./claw-chat-current-fixture-read-model-waits.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

function summarizeThreadItemsForProbe(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    id: typeof item?.id === "string" ? item.id : null,
    type: typeof item?.type === "string" ? item.type : null,
    phase: typeof item?.phase === "string" ? item.phase : null,
    sequence: typeof item?.sequence === "number" ? item.sequence : null,
    text:
      typeof item?.text === "string"
        ? item.text.slice(0, 120)
        : typeof item?.message === "string"
          ? item.message.slice(0, 120)
          : typeof item?.content === "string"
            ? item.content.slice(0, 120)
            : null,
    turnId:
      typeof item?.turn_id === "string"
        ? item.turn_id
        : typeof item?.turnId === "string"
          ? item.turnId
          : null,
  }));
}

function summarizeWebToolsReadModel(readModel) {
  const serialized = JSON.stringify(readModel || {});
  return {
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    toolCallCount: collectReadModelToolCalls(readModel).length,
    latestTurnStatus:
      readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
      readModel?.detail?.thread_read?.status ??
      readModel?.detail?.status ??
      null,
    includesPrompt: serialized.includes(WEB_TOOLS_RENDERING_PROMPT),
    includesAssistantDone: serialized.includes(WEB_TOOLS_RENDERING_DONE_TEXT),
    includesAssistantSummary: serialized.includes("网页搜索渲染结论"),
    includesWebSearchTool: serialized.includes(WEB_TOOLS_SEARCH_TOOL_CALL_ID),
    includesWebFetchTool: serialized.includes(WEB_TOOLS_FETCH_TOOL_CALL_ID),
    includesReasoningItem: serialized.includes(WEB_TOOLS_REASONING_ITEM_ID),
    includesReasoningItemProviderMetadata:
      serialized.includes(WEB_TOOLS_REASONING_ITEM_SIGNATURE) &&
      serialized.includes(WEB_TOOLS_REASONING_PROVIDER_BACKEND) &&
      serialized.includes(WEB_TOOLS_REASONING_NATIVE_ITEM_ID),
  };
}

async function probeWebToolsFailureReadModel(page, options, appServerRequests) {
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
  const detailItems = probe.result?.detail?.items;
  const threadReadItems = probe.result?.detail?.thread_read?.thread_items;

  return sanitizeJson({
    detailItemCount: Array.isArray(detailItems) ? detailItems.length : null,
    detailItems: summarizeThreadItemsForProbe(detailItems),
    includesMidThinking: serializedProbe.includes(WEB_TOOLS_MID_THINKING_TEXT),
    includesIntroText: serializedProbe.includes("我先联网核实目标页面来源。"),
    includesWebSearchTool: serializedProbe.includes(
      WEB_TOOLS_SEARCH_TOOL_CALL_ID,
    ),
    includesWebFetchTool: serializedProbe.includes(
      WEB_TOOLS_FETCH_TOOL_CALL_ID,
    ),
    threadReadItemCount: Array.isArray(threadReadItems)
      ? threadReadItems.length
      : null,
    threadReadItems: summarizeThreadItemsForProbe(threadReadItems),
  });
}

export async function runWebToolsRenderingScenario({
  page,
  options,
  appServerRequests,
  logStage,
}) {
  const result = {};

  logStage("send-web-tools-rendering-prompt-from-gui");
  result.webToolsRenderingInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, WEB_TOOLS_RENDERING_PROMPT),
  );

  logStage("wait-gui-web-tools-rendering-in-progress");
  result.guiWebToolsRenderingInProgress = sanitizeJson(
    await waitForGuiWebToolsRenderingInProgress(page, options),
  );

  logStage("wait-gui-web-tools-rendering-completed");
  try {
    result.guiWebToolsRenderingCompleted = sanitizeJson(
      await waitForGuiWebToolsRenderingCompleted(page, options),
    );
  } catch (error) {
    try {
      result.guiWebToolsRenderingDebug = sanitizeJson(
        await inspectGuiWebToolsRenderingDebug(page),
      );
    } catch (debugError) {
      result.guiWebToolsRenderingDebug = sanitizeJson({
        error: String(debugError?.message || debugError),
      });
    }
    try {
      result.readModelWebToolsRenderingFailureProbe =
        await probeWebToolsFailureReadModel(page, options, appServerRequests);
    } catch (probeError) {
      result.readModelWebToolsRenderingFailureProbe = sanitizeJson({
        error: String(probeError?.message || probeError),
      });
    }
    throw error;
  }

  logStage("wait-read-model-web-tools-rendering-completed");
  const readModelWebToolsRenderingCompleted = await waitForSessionReadCompleted(
    page,
    options,
    appServerRequests,
    {
      prompt: WEB_TOOLS_RENDERING_PROMPT,
      doneText: WEB_TOOLS_RENDERING_DONE_TEXT,
      summaryText: "网页搜索渲染结论",
    },
  );
  result.readModelWebToolsRenderingCompleted = sanitizeJson(
    summarizeWebToolsReadModel(readModelWebToolsRenderingCompleted),
  );

  return result;
}
