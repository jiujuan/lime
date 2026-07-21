export const FILE_CHANGE_BATCH_SCENARIO = "file-change-batch";

export const FILE_CHANGE_BATCH_PROMPT_MARKER =
  "[file-change-batch] Review one Add/Delete/Update/Move batch.";

export const FILE_CHANGE_BATCH_PATHS = Object.freeze({
  added: "src/file-change-added.ts",
  deleted: "src/file-change-deleted.ts",
  updated: "src/file-change-updated.ts",
  moveSource: "src/file-change-move-source.ts",
  moveDestination: "src/file-change-move-destination.ts",
});

export const FILE_CHANGE_BATCH_FACTS = Object.freeze([
  Object.freeze({
    operation: "add",
    path: FILE_CHANGE_BATCH_PATHS.added,
    kind: Object.freeze({ type: "add" }),
    diff: "+export const addedByGateB = true;",
  }),
  Object.freeze({
    operation: "delete",
    path: FILE_CHANGE_BATCH_PATHS.deleted,
    kind: Object.freeze({ type: "delete" }),
    diff: "-export const deletedByGateB = true;",
  }),
  Object.freeze({
    operation: "update",
    path: FILE_CHANGE_BATCH_PATHS.updated,
    kind: Object.freeze({ type: "update" }),
    diff: "-export const updatedByGateB = false;\n+export const updatedByGateB = true;",
  }),
  Object.freeze({
    operation: "move",
    path: FILE_CHANGE_BATCH_PATHS.moveSource,
    kind: Object.freeze({
      type: "update",
      move_path: FILE_CHANGE_BATCH_PATHS.moveDestination,
    }),
    diff: "-export const movedFromGateB = true;\n+export const movedToGateB = true;",
  }),
]);

const TERMINAL_STATUS_BY_DECISION = Object.freeze({
  accept: "completed",
  acceptForSession: "completed",
  allow_once: "completed",
  allow_for_session: "completed",
  cancel: "inProgress",
  decline: "declined",
});

function cloneBatchFacts() {
  return FILE_CHANGE_BATCH_FACTS.map(({ path, kind, diff }) => ({
    path,
    kind: { ...kind },
    diff,
  }));
}

function readThread(readResult) {
  const result = readResult?.result ?? readResult;
  return result?.thread ?? result?.detail?.thread_read?.thread ?? null;
}

function readTurns(readResult) {
  const thread = readThread(readResult);
  return Array.isArray(thread?.turns) ? thread.turns : [];
}

function normalizeDecision(decision) {
  if (decision === "accept") return "allow_once";
  if (decision === "acceptForSession") return "allow_for_session";
  return decision;
}

function terminalStatusForDecision(decision) {
  return TERMINAL_STATUS_BY_DECISION[decision] ?? null;
}

function sanitizeSnapshot(value, depth = 0) {
  if (depth > 7) return "[truncated-depth]";
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  if (typeof value === "string") {
    return value.length <= 2_000
      ? value
      : `${value.slice(0, 2_000)}... [truncated]`;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((entry) => sanitizeSnapshot(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 150)
        .map(([key, entry]) => [key, sanitizeSnapshot(entry, depth + 1)]),
    );
  }
  return String(value);
}

function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

async function evaluatePageSnapshot(page, pageFunction, arg) {
  try {
    return await page.evaluate(pageFunction, arg);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) return null;
    throw error;
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function pollingOptions(options) {
  return {
    timeoutMs: Math.max(1, Number(options?.timeoutMs) || 60_000),
    intervalMs: Math.max(0, Number(options?.intervalMs) || 100),
  };
}

/**
 * Source inserted before the fixture backend's generic actionRespond/turnStart
 * handlers. It deliberately uses only bindings already present in that backend.
 */
export function renderFileChangeGateBBackendScript() {
  const scenario = JSON.stringify(FILE_CHANGE_BATCH_SCENARIO);
  const promptMarker = JSON.stringify(FILE_CHANGE_BATCH_PROMPT_MARKER);
  const changes = JSON.stringify(
    FILE_CHANGE_BATCH_FACTS.map(({ operation, path, kind, diff }) => ({
      path,
      kind: operation === "move" ? "update" : operation,
      ...(kind.move_path ? { movePath: kind.move_path } : {}),
      diff,
    })),
  );
  return `
const fileChangeGateBScenario = ${scenario};
const fileChangeGateBPromptMarker = ${promptMarker};
const fileChangeGateBChanges = ${changes};
const fileChangeGateBItemPrefix = "code-artifact-file-change-batch:";
const fileChangeGateBToolItemPrefix = "code-artifact-file-change-tool:";
const fileChangeGateBApprovalPrefix = "code-artifact-file-change-approval:";

function fileChangeGateBDecision(value) {
  if (value === "accept") return "allow_once";
  if (value === "acceptForSession") return "allow_for_session";
  return value || "decline";
}

function fileChangeGateBToolItem(itemId, callId, status, sequence) {
  const now = Date.now();
  const terminal = status !== "inProgress";
  return {
    sessionId,
    threadId,
    turnId,
    itemId,
    sequence,
    ordinal: sequence,
    createdAtMs: now,
    updatedAtMs: now,
    completedAtMs: terminal ? now : undefined,
    kind: "tool",
    status,
    payload: {
      type: "tool",
      call_id: callId,
      name: "apply_patch",
      arguments: [{ name: "changes", value: JSON.stringify(fileChangeGateBChanges) }]
    },
    metadata: {
      source: "code-artifact-file-change-gate-b",
      scenario: fileChangeGateBScenario
    }
  };
}

function fileChangeGateBFileItem(itemId, fileStatus, sequence) {
  const now = Date.now();
  const terminal = fileStatus !== "proposed";
  return {
    sessionId,
    threadId,
    turnId,
    itemId,
    sequence,
    ordinal: sequence,
    createdAtMs: now,
    updatedAtMs: now,
    completedAtMs: terminal ? now : undefined,
    kind: "file",
    status: terminal ? "completed" : "inProgress",
    payload: {
      type: "file",
      changes: fileChangeGateBChanges.map((change) => ({
        path: change.path,
        kind: change.kind === "update"
          ? {
              type: "update",
              ...(change.movePath ? { move_path: change.movePath } : {})
            }
          : { type: change.kind },
        diff: change.diff
      })),
      status: fileStatus
    },
    metadata: {
      source: "code-artifact-file-change-gate-b",
      scenario: fileChangeGateBScenario
    }
  };
}

function fileChangeGateBEmit(events, phase, extra = {}) {
  if (ledgerPath) {
    appendFileSync(ledgerPath, JSON.stringify({
      kind: "fileChangeGateBEvents",
      phase,
      sessionId,
      threadId,
      turnId,
      eventTypes: events.map((event) => event.type),
      ...extra,
      recordedAt: new Date().toISOString()
    }) + "\\n");
  }
  console.log(JSON.stringify({ events }));
}

if (input.kind === "actionRespond") {
  const rawRequestId =
    input.request?.requestId ||
    input.request?.request_id ||
    input.request?.actionId ||
    input.request?.action_id ||
    "";
  if (String(rawRequestId).startsWith(fileChangeGateBApprovalPrefix)) {
    const decision = fileChangeGateBDecision(input.request?.decision);
    const itemId = fileChangeGateBItemPrefix + turnId;
    const toolItemId = fileChangeGateBToolItemPrefix + turnId;
    const allowed = decision === "allow_once" || decision === "allow_for_session";
    const canceled = decision === "cancel";
    const events = [
      {
        type: canceled ? "action.canceled" : "action.resolved",
        payload: {
          requestId: rawRequestId,
          actionType: "tool_confirmation",
          decision,
          response: canceled ? "canceled" : allowed ? "approved" : "declined",
          toolCallId: itemId,
          toolName: "apply_patch"
        }
      },
      ...(canceled
        ? []
        : [allowed
          ? {
              type: "patch.applied",
              payload: { patchId: itemId, status: "applied" }
            }
          : {
              type: "patch.declined",
              payload: { patchId: itemId, status: "declined" }
            }]),
      ...(canceled
        ? []
        : [
            {
              type: "item.completed",
              payload: {
                item: fileChangeGateBFileItem(
                  itemId,
                  allowed ? "applied" : "rejected",
                  4
                )
              }
            }
          ]),
      {
        type: "item.completed",
        payload: {
          item: fileChangeGateBToolItem(
            toolItemId,
            itemId,
            canceled ? "cancelled" : allowed ? "completed" : "failed",
            5
          )
        }
      },
      ...(canceled
        ? []
        : [
            {
              type: "message.delta",
              payload: {
                itemId: "code-artifact-file-change-message:" + turnId,
                role: "assistant",
                text: allowed
                  ? "The file change batch was applied."
                  : "The file change batch was declined.",
                phase: "final_answer"
              }
            }
          ]),
      canceled
        ? {
            type: "turn.canceled",
            payload: {
              status: "canceled",
              reason: "file_change_approval_cancelled"
            }
          }
        : {
            type: "turn.completed",
            payload: {
              status: "completed",
              reason: allowed
                ? "file_change_approval_accepted"
                : "file_change_approval_declined"
            }
          }
    ];
    fileChangeGateBEmit(events, canceled ? "cancel" : allowed ? "applied" : "decline", {
      requestId: rawRequestId,
      itemId,
      decision
    });
    process.exit(0);
  }
}

if (input.kind === "turnStart") {
  const gateBMetadata = requestMetadata?.harness || {};
  const isFileChangeGateBTurn =
    process.env.CODE_ARTIFACT_WORKBENCH_FIXTURE_SCENARIO === fileChangeGateBScenario ||
    gateBMetadata.scenario === fileChangeGateBScenario ||
    gateBMetadata.file_change_gate_b?.scenario === fileChangeGateBScenario ||
    inputText.includes(fileChangeGateBPromptMarker);
  if (isFileChangeGateBTurn) {
    const itemId = fileChangeGateBItemPrefix + turnId;
    const toolItemId = fileChangeGateBToolItemPrefix + turnId;
    const requestId = fileChangeGateBApprovalPrefix + turnId;
    const now = Date.now();
    const events = [
      {
        type: "item.started",
        payload: {
          item: fileChangeGateBToolItem(toolItemId, itemId, "inProgress", 1)
        }
      },
      {
        type: "item.started",
        payload: {
          item: fileChangeGateBFileItem(itemId, "proposed", 2)
        }
      },
      {
        type: "patch.started",
        payload: {
          patchId: itemId,
          status: "proposed",
          changes: fileChangeGateBChanges
        }
      },
      {
        type: "action.required",
        payload: {
          requestId,
          actionType: "tool_confirmation",
          toolCallId: itemId,
          toolName: "apply_patch",
          createdAtMs: now,
          prompt: "Apply the exact Add/Delete/Update/Move file batch?",
          availableDecisions: [
            "allow_once",
            "allow_for_session",
            "decline",
            "cancel"
          ]
        }
      }
    ];
    fileChangeGateBEmit(events, "pending", { requestId, itemId });
    process.exit(0);
  }
}
`;
}

export function summarizeFileChangeBatches(readResult) {
  return readTurns(readResult).flatMap((turn) => {
    const items = Array.isArray(turn?.items) ? turn.items : [];
    return items
      .filter((item) => item?.type === "fileChange")
      .map((item) => ({
        threadId: readThread(readResult)?.id ?? null,
        turnId: turn?.id ?? null,
        turnStatus: turn?.status ?? null,
        itemId: item?.id ?? null,
        status: item?.status ?? null,
        changes: Array.isArray(item?.changes) ? item.changes : [],
      }));
  });
}

export function validateExactFileChangeBatch(
  readResult,
  { threadId, turnId, itemId, status } = {},
) {
  const expectedThreadId = threadId ?? readThread(readResult)?.id ?? null;
  const candidates = summarizeFileChangeBatches(readResult).filter(
    (batch) =>
      (!turnId || batch.turnId === turnId) &&
      (!itemId || batch.itemId === itemId),
  );
  const batch = candidates.length === 1 ? candidates[0] : null;
  const errors = [];
  if (readThread(readResult)?.id !== expectedThreadId) {
    errors.push("threadId mismatch");
  }
  if (candidates.length !== 1) {
    errors.push(`expected one fileChange batch, found ${candidates.length}`);
  }
  if (batch && status && batch.status !== status) {
    errors.push(`expected status ${status}, found ${batch.status}`);
  }
  if (batch && batch.changes.length !== FILE_CHANGE_BATCH_FACTS.length) {
    errors.push(
      `expected ${FILE_CHANGE_BATCH_FACTS.length} changes, found ${batch.changes.length}`,
    );
  }
  if (batch) {
    FILE_CHANGE_BATCH_FACTS.forEach((expected, index) => {
      const actual = batch.changes[index];
      if (actual?.path !== expected.path) {
        errors.push(`change[${index}].path mismatch`);
      }
      if (actual?.kind?.type !== expected.kind.type) {
        errors.push(`change[${index}].kind.type mismatch`);
      }
      const expectedMovePath = expected.kind.move_path ?? null;
      const actualMovePath = actual?.kind?.move_path ?? null;
      if (actualMovePath !== expectedMovePath) {
        errors.push(`change[${index}].kind.move_path mismatch`);
      }
      if (actual?.diff !== expected.diff) {
        errors.push(`change[${index}].diff mismatch`);
      }
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    expectedThreadId,
    batch,
    candidateCount: candidates.length,
  };
}

export async function waitForFileChangeApprovalPending(
  page,
  options,
  identity,
) {
  const poll = pollingOptions(options);
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < poll.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ requestIds, promptText }) => {
        const prompt = document.querySelector(
          '[data-testid="inputbar-approval-prompt"]',
        );
        const summary = prompt?.querySelector(
          '[data-testid="inputbar-approval-summary"]',
        );
        const requestId = prompt?.getAttribute("data-request-id") || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const textareaRect = textarea?.getBoundingClientRect();
        const textareaStyle = textarea
          ? window.getComputedStyle(textarea)
          : null;
        const textareaVisible = Boolean(
          textarea &&
          textareaRect &&
          textareaRect.width > 16 &&
          textareaRect.height > 16 &&
          textareaStyle?.visibility !== "hidden" &&
          textareaStyle?.display !== "none",
        );
        const buttonState = Object.fromEntries(
          ["allow_once", "allow_for_session", "decline", "cancel"].map(
            (decision) => {
              const button = prompt?.querySelector(
                `button[data-decision="${decision}"]`,
              );
              return [
                decision,
                {
                  visible: Boolean(button),
                  disabled:
                    button instanceof HTMLButtonElement
                      ? button.disabled
                      : null,
                },
              ];
            },
          ),
        );
        const summaryText = summary?.textContent || "";
        return {
          visible: Boolean(prompt),
          requestId,
          identityMatched: requestIds.includes(requestId),
          summaryText,
          promptMatched: promptText ? summaryText.includes(promptText) : true,
          textareaVisible,
          buttons: buttonState,
        };
      },
      {
        requestIds: [identity?.itemId, identity?.requestId].filter(Boolean),
        promptText: identity?.prompt ?? "",
      },
    );
    if (snapshot) {
      lastSnapshot = snapshot;
      if (
        snapshot.visible === true &&
        snapshot.identityMatched === true &&
        snapshot.promptMatched === true &&
        snapshot.textareaVisible === false &&
        snapshot.buttons?.decline?.visible === true &&
        snapshot.buttons.decline.disabled === false &&
        snapshot.buttons?.cancel?.visible === true &&
        snapshot.buttons.cancel.disabled === false
      ) {
        return sanitizeSnapshot(snapshot);
      }
    }
    await sleep(poll.intervalMs);
  }
  throw new Error(
    `FileChange approval pending UI not found: ${JSON.stringify(
      sanitizeSnapshot(lastSnapshot),
    )}`,
  );
}

export async function clickFileChangeApprovalDecision(
  page,
  options,
  decision,
  identity,
) {
  const normalizedDecision = normalizeDecision(decision);
  if (
    !["allow_once", "allow_for_session", "decline", "cancel"].includes(
      normalizedDecision,
    )
  ) {
    throw new Error(`Unsupported FileChange approval decision: ${decision}`);
  }
  const poll = pollingOptions(options);
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(poll.timeoutMs, 30_000)) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ decision: targetDecision, requestIds }) => {
        const prompt = document.querySelector(
          '[data-testid="inputbar-approval-prompt"]',
        );
        const requestId = prompt?.getAttribute("data-request-id") || "";
        if (!prompt || !requestIds.includes(requestId)) {
          return { clicked: false, requestId, identityMatched: false };
        }
        const button = prompt.querySelector(
          `button[data-decision="${targetDecision}"]`,
        );
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return {
            clicked: false,
            requestId,
            identityMatched: true,
            buttonVisible: Boolean(button),
            buttonDisabled:
              button instanceof HTMLButtonElement ? button.disabled : null,
          };
        }
        button.click();
        return {
          clicked: true,
          requestId,
          identityMatched: true,
          decision: targetDecision,
        };
      },
      {
        decision: normalizedDecision,
        requestIds: [identity?.itemId, identity?.requestId].filter(Boolean),
      },
    );
    if (snapshot) {
      lastSnapshot = snapshot;
      if (snapshot.clicked === true) return sanitizeSnapshot(snapshot);
    }
    await sleep(poll.intervalMs);
  }
  throw new Error(
    `FileChange approval button was not clicked: ${JSON.stringify(
      sanitizeSnapshot(lastSnapshot),
    )}`,
  );
}

export async function waitForFileChangeTerminalGui(page, options, { status }) {
  const poll = pollingOptions(options);
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < poll.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ expectedPaths, expectedStatus }) => {
        const cards = Array.from(
          document.querySelectorAll(
            '[data-testid="file-changes-summary-card"]',
          ),
        );
        const card = cards
          .filter(
            (candidate) =>
              candidate.getAttribute("data-file-status") === expectedStatus,
          )
          .at(-1);
        if (!(card instanceof HTMLElement)) {
          return {
            found: false,
            status: expectedStatus,
            cardCount: cards.length,
            cardStatuses: cards.map((candidate) =>
              candidate.getAttribute("data-file-status"),
            ),
            rowStatuses: cards.map((candidate) =>
              Array.from(
                candidate.querySelectorAll(
                  '[data-testid="file-changes-summary-file-row"]',
                ),
              ).map((row) => row.getAttribute("data-file-status")),
            ),
          };
        }
        const toggle = card.querySelector(
          '[data-testid="file-changes-summary-toggle"]',
        );
        if (
          toggle instanceof HTMLButtonElement &&
          toggle.getAttribute("aria-expanded") !== "true"
        ) {
          toggle.click();
        }
        const rows = Array.from(
          card.querySelectorAll(
            '[data-testid="file-changes-summary-file-row"]',
          ),
        );
        const rowTexts = rows.map((row) => row.textContent || "");
        return {
          found: true,
          status: card.getAttribute("data-file-status"),
          rowCount: rows.length,
          rowStatuses: rows.map((row) => row.getAttribute("data-file-status")),
          rowTexts,
          expectedPathsPresent: expectedPaths.every((expectedPath) =>
            rowTexts.some((text) => text.includes(expectedPath)),
          ),
        };
      },
      {
        expectedPaths: [
          FILE_CHANGE_BATCH_PATHS.added,
          FILE_CHANGE_BATCH_PATHS.deleted,
          FILE_CHANGE_BATCH_PATHS.updated,
          `${FILE_CHANGE_BATCH_PATHS.moveSource} -> ${FILE_CHANGE_BATCH_PATHS.moveDestination}`,
        ],
        expectedStatus: status,
      },
    );
    if (snapshot) {
      lastSnapshot = snapshot;
      if (
        snapshot.found === true &&
        snapshot.rowCount === FILE_CHANGE_BATCH_FACTS.length &&
        snapshot.expectedPathsPresent === true &&
        snapshot.rowStatuses.every((entry) => entry === status)
      ) {
        return sanitizeSnapshot(snapshot);
      }
    }
    await sleep(poll.intervalMs);
  }
  throw new Error(
    `FileChange terminal GUI not reached: ${JSON.stringify(
      sanitizeSnapshot(lastSnapshot),
    )}`,
  );
}

export async function waitForFileChangeTerminalReadModel(
  page,
  options,
  { threadId, turnId, itemId, decision, invokeThreadRead },
) {
  if (typeof invokeThreadRead !== "function") {
    throw new TypeError("invokeThreadRead must be a function");
  }
  const expectedStatus = terminalStatusForDecision(decision);
  if (!expectedStatus) {
    throw new Error(`Unsupported FileChange terminal decision: ${decision}`);
  }
  const expectedTurnStatus =
    decision === "cancel" ? "interrupted" : "completed";
  const poll = pollingOptions(options);
  const startedAt = Date.now();
  let lastSummary = null;
  let lastError = null;
  while (Date.now() - startedAt < poll.timeoutMs) {
    try {
      const invocation = await invokeThreadRead(page, {
        threadId,
        includeTurns: true,
      });
      const readResult = invocation?.result ?? invocation;
      const turns = readTurns(readResult);
      const turn = turns.find((candidate) => candidate?.id === turnId) ?? null;
      const items = Array.isArray(turn?.items) ? turn.items : [];
      const pendingItemIds = items
        .filter(
          (item) =>
            item?.status === "inProgress" ||
            item?.status === "pending" ||
            (item?.type === "approvalRequest" && item?.status !== "completed"),
        )
        .map((item) => item?.id)
        .filter(Boolean);
      const unexpectedPendingItemIds = pendingItemIds.filter(
        (pendingItemId) => !(decision === "cancel" && pendingItemId === itemId),
      );
      const validation = validateExactFileChangeBatch(readResult, {
        threadId,
        turnId,
        itemId,
        status: expectedStatus,
      });
      lastSummary = {
        threadId: readThread(readResult)?.id ?? null,
        turnId: turn?.id ?? null,
        turnStatus: turn?.status ?? null,
        itemId,
        decision,
        expectedStatus,
        pendingItemIds,
        unexpectedPendingItemIds,
        validation,
        read: readResult,
      };
      if (
        turn?.status === expectedTurnStatus &&
        unexpectedPendingItemIds.length === 0 &&
        validation.valid
      ) {
        return sanitizeSnapshot(lastSummary);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(poll.intervalMs);
  }
  throw new Error(
    `FileChange terminal read model not reached: ${JSON.stringify(
      sanitizeSnapshot({ lastSummary, lastError }),
    )}`,
  );
}
