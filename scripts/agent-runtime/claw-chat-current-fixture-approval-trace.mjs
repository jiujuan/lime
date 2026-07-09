import {
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  decodeJsonRpcLines,
  readTraceMessages,
} from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

function collectActionRespondRequestsFromTrace(traceMessages) {
  return traceMessages
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines).map(
        (message) => ({
          transport: entry.transport ?? null,
          status: entry.status ?? null,
          method: message.method,
          params: message.params ?? null,
        }),
      ),
    )
    .filter(
      (message) =>
        message.method === APP_SERVER_METHOD_AGENT_SESSION_ACTION_RESPOND,
    );
}

export async function waitForActionRespondTrace(
  page,
  options,
  { requestId = APPROVAL_REQUEST_RESUME_REQUEST_ID, decision = null } = {},
) {
  const startedAt = Date.now();
  let lastRequests = [];
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 30_000)) {
    const traceRaw = await page.evaluate(() =>
      window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
    );
    const requests = collectActionRespondRequestsFromTrace(
      readTraceMessages(traceRaw),
    );
    lastRequests = requests;
    const matched = requests.find(
      (request) =>
        request.params?.requestId === requestId &&
        request.params?.actionType === "tool_confirmation" &&
        (!decision || request.params?.decision === decision),
    );
    if (matched) {
      return sanitizeJson(matched);
    }
    await sleep(options.intervalMs);
  }
  return sanitizeJson(lastRequests.at(-1) ?? null);
}
