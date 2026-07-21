import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  APP_SERVER_METHOD_SESSION_READ,
  USER_SHELL_COMMAND,
  USER_SHELL_INPUT,
  USER_SHELL_OUTPUT,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  collectReadModelItems,
  readModelLatestTurnStatus,
} from "./claw-chat-current-fixture-read-model-core.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

function readString(value, ...keys) {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function readNumber(value, ...keys) {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readShellItem(readModel) {
  return (
    collectReadModelItems(readModel).find((item) => {
      const type = readString(item, "type", "itemType", "item_type");
      const command = readString(item, "command", "canonicalCommand");
      const source = readString(item, "source");
      const metadata = item?.metadata;
      const metadataSource = readString(
        metadata,
        "commandExecutionSource",
        "command_execution_source",
      );
      return (
        (type === "commandExecution" || type === "command_execution") &&
        command === USER_SHELL_COMMAND &&
        (source === "userShell" || metadataSource === "userShell")
      );
    }) ?? null
  );
}

function summarizeShellItem(item) {
  const metadata = item?.metadata;
  return {
    itemId: readString(item, "id", "itemId", "item_id"),
    threadId: readString(item, "threadId", "thread_id"),
    turnId: readString(item, "turnId", "turn_id"),
    type: readString(item, "type", "itemType", "item_type"),
    command: readString(item, "command", "canonicalCommand"),
    source:
      readString(item, "source") ??
      readString(
        metadata,
        "commandExecutionSource",
        "command_execution_source",
      ),
    status: readString(item, "status", "nativeStatus", "native_status"),
    output: readString(item, "aggregatedOutput", "aggregated_output", "output"),
    exitCode: readNumber(item, "exitCode", "exit_code"),
    processId: readString(item, "processId", "process_id"),
    durationMs: readNumber(item, "durationMs", "duration_ms"),
    startedAt: readString(item, "startedAt", "started_at"),
    completedAt: readString(item, "completedAt", "completed_at"),
  };
}

export async function runUserShellGateScenario({
  page,
  options,
  appServerRequests,
  logStage,
}) {
  const threadId = options.threadId?.trim();
  assert(threadId, "用户 shell Gate B 缺少 canonical threadId");
  logStage("send-user-shell-prompt-from-gui");
  const inputSend = await sendPromptFromGui(page, options, USER_SHELL_INPUT, {
    expectedSessionId: options.sessionId,
  });

  const startedAt = Date.now();
  let firstShellItem = null;
  let latestRead = null;
  let latestGui = null;
  let observedItems = [];
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      { threadId, includeTurns: true },
      appServerRequests,
    );
    latestRead = read.result;
    observedItems = collectReadModelItems(latestRead)
      .slice(-20)
      .map((item) => summarizeShellItem(item));
    const shellItem = readShellItem(latestRead);
    if (shellItem && !firstShellItem) {
      firstShellItem = summarizeShellItem(shellItem);
    }
    const shellSummary = shellItem ? summarizeShellItem(shellItem) : null;
    latestGui = await page.evaluate(
      ({ command, output }) => {
        const bodyText = document.body?.innerText || "";
        return {
          url: window.location.href,
          commandVisible: bodyText.includes(command),
          outputVisible: bodyText.includes(output),
          bodyContainsShellInput: bodyText.includes(`!${command}`),
          bodyTail: bodyText.slice(-1200),
        };
      },
      { command: USER_SHELL_COMMAND, output: USER_SHELL_OUTPUT },
    );
    const terminal =
      shellSummary?.status === "completed" ||
      shellSummary?.status === "failed" ||
      shellSummary?.status === "canceled" ||
      shellSummary?.completedAt != null;
    if (
      shellSummary &&
      terminal &&
      shellSummary.status === "completed" &&
      shellSummary.exitCode === 0 &&
      shellSummary.output === USER_SHELL_OUTPUT
    ) {
      break;
    }
    await sleep(options.intervalMs);
  }

  const finalItem = readShellItem(latestRead);
  const shellItem = summarizeShellItem(finalItem ?? firstShellItem);
  const readModelStatus = readModelLatestTurnStatus(latestRead);
  const inputReady = await page.evaluate(() => {
    const input = document.querySelector('textarea[name="agent-chat-message"]');
    return {
      visible: input instanceof HTMLTextAreaElement,
      disabled: input instanceof HTMLTextAreaElement ? input.disabled : null,
      sessionId:
        input instanceof HTMLTextAreaElement
          ? input.dataset.sessionId || null
          : null,
    };
  });

  const startedLifecycle = Boolean(
    shellItem?.startedAt || shellItem?.itemId || firstShellItem?.itemId,
  );
  const completedLifecycle = Boolean(
    shellItem?.completedAt && shellItem?.status === "completed",
  );
  const sameIdentity =
    shellItem?.threadId === threadId &&
    typeof shellItem?.turnId === "string" &&
    shellItem.turnId.length > 0;

  const evidence = {
    input: USER_SHELL_INPUT,
    command: USER_SHELL_COMMAND,
    expectedOutput: USER_SHELL_OUTPUT,
    eventName: `agentSession/event/${options.sessionId}`,
    inputSend: sanitizeJson(inputSend),
    readModelStatus,
    readModel: {
      item: shellItem,
      firstItem: firstShellItem,
      observedItems,
      latestTurnStatus: readModelStatus,
    },
    gui: latestGui,
    inputReady,
    assertions: {
      guiInputSubmitted: inputSend?.clicked === true,
      threadShellCommandCompleted:
        shellItem?.command === USER_SHELL_COMMAND &&
        shellItem?.status === "completed" &&
        shellItem?.exitCode === 0,
      commandItemStarted: startedLifecycle,
      commandItemCompleted: completedLifecycle,
      commandOutputVisible: latestGui?.outputVisible === true,
      commandOutputPersisted: shellItem?.output === USER_SHELL_OUTPUT,
      commandExitCodeZero: shellItem?.exitCode === 0,
      commandSourceUserShell: shellItem?.source === "userShell",
      identityConsistent: sameIdentity,
      inputReadyAfterCompletion:
        inputReady.visible === true &&
        inputReady.disabled === false &&
        inputReady.sessionId === options.sessionId,
    },
  };

  return sanitizeJson({ userShellGate: evidence });
}
