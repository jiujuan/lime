import {
  APPROVAL_REQUEST_CANCEL_DONE_TEXT,
  APPROVAL_REQUEST_DECLINE_DONE_TEXT,
  APPROVAL_REQUEST_DECLINE_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT,
  APPROVAL_REQUEST_RESUME_COMMAND,
  APPROVAL_REQUEST_RESUME_DONE_TEXT,
  APPROVAL_REQUEST_RESUME_REQUEST_ID,
  APPROVAL_REQUEST_RESUME_RESULT_TEXT,
  APPROVAL_REQUEST_RESUME_TOOL_CALL_ID,
  APPROVAL_REQUEST_RESUME_TOOL_NAME,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
} from "./claw-chat-current-fixture-constants.mjs";

const BROWSER_CONTROL_CONTRACT = {
  contract_key: "browser_control",
  routing_slot: "browser_reasoning_model",
  modality: "browser",
};

function js(value) {
  return JSON.stringify(value);
}

export function renderApprovalRequestResumeHelpersScript() {
  return `
function normalizeApprovalScopeString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hashApprovalScopeValue(value) {
  const normalized = normalizeApprovalScopeString(value);
  if (!normalized) {
    return undefined;
  }
  return "sha256:" + createHash("sha256").update(normalized).digest("hex");
}

function normalizeApprovalNetworkHost(value) {
  const normalized = normalizeApprovalScopeString(value);
  if (!normalized) {
    return undefined;
  }
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    try {
      parsed = new URL("https://" + normalized);
    } catch {
      return undefined;
    }
  }
  const scheme = parsed.protocol.replace(/:$/u, "").toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port;
  if (!host) {
    return undefined;
  }
  if (!port || (scheme === "http" && port === "80") || (scheme === "https" && port === "443")) {
    return scheme + "://" + host;
  }
  return scheme + "://" + host + ":" + port;
}

function approvalRequestResumeHostMetadata() {
  return runtimeRequest?.metadata ?? {};
}

function approvalRequestResumeScope() {
  const metadata = approvalRequestResumeHostMetadata();
  const harness = metadata?.harness ?? {};
  const browserAssist =
    harness?.browser_assist ??
    harness?.browserAssist ??
    metadata?.browser_assist ??
    metadata?.browserAssist ??
    {};
  const commandMatch = ${js(APPROVAL_REQUEST_RESUME_COMMAND)}.match(/https?:\\/\\/\\S+/u);
  const launchUrl =
    harness?.browser_launch_url ??
    harness?.browserLaunchUrl ??
    browserAssist?.launch_url ??
    browserAssist?.launchUrl ??
    browserAssist?.target_url ??
    browserAssist?.targetUrl ??
    commandMatch?.[0];
  const workspaceId = normalizeApprovalScopeString(
    runtimeRequest?.workspace_id ??
      runtimeRequest?.workspaceId ??
      metadata?.workspace_id ??
      metadata?.workspaceId ??
      harness?.workspace_id ??
      harness?.workspaceId ??
      input.request?.session?.workspaceId ??
      input.request?.session?.workspace_id,
  );
  const workingDirHash = hashApprovalScopeValue(
    runtimeRequest?.workingDir ??
      runtimeRequest?.working_dir ??
      runtimeRequest?.workingDirectory ??
      runtimeRequest?.working_directory ??
      metadata?.workingDir ??
      metadata?.working_dir ??
      harness?.workingDir ??
      harness?.working_dir ??
      harness?.cwd,
  );
  const projectRootHash = hashApprovalScopeValue(
    runtimeRequest?.projectRoot ??
      runtimeRequest?.project_root ??
      runtimeRequest?.workspaceRoot ??
      runtimeRequest?.workspace_root ??
      metadata?.projectRoot ??
      metadata?.project_root ??
      metadata?.workspaceRoot ??
      metadata?.workspace_root ??
      harness?.projectRoot ??
      harness?.project_root ??
      harness?.workspaceRoot ??
      harness?.workspace_root,
  );
  const networkHost = normalizeApprovalNetworkHost(launchUrl);
  return {
    riskClass: "browser_control",
    ...(workspaceId ? { workspaceId } : {}),
    ...(workingDirHash ? { workingDirHash } : {}),
    ...(projectRootHash ? { projectRootHash } : {}),
    ...(networkHost ? { networkHost } : {}),
  };
}
`;
}

export function renderApprovalRequestResumeActionRespondScript() {
  return `
if (input.kind === "actionRespond") {
  const requestId =
    input.request?.requestId ||
    input.request?.request_id ||
    input.request?.actionId ||
    input.request?.action_id;
  const actionType =
    input.request?.actionType ||
    input.request?.action_type ||
    "tool_confirmation";
  const actionScope = input.request?.actionScope || input.request?.action_scope || {};
  const rawApprovalDecision = input.request?.decision;
  const rawApprovalDecisionScope =
    input.request?.decisionScope || input.request?.decision_scope;
  const approvalDecision =
    rawApprovalDecision ||
    (rawApprovalDecisionScope === "session"
      ? "allow_for_session"
      : "decline");
  const approvalDecisionScope =
    rawApprovalDecisionScope ||
    (approvalDecision === "allow_for_session" ? "session" : "once");
  const actionScopeSessionId = actionScope.sessionId || actionScope.session_id;
  const actionScopeThreadId = actionScope.threadId || actionScope.thread_id;
  const actionScopeTurnId = actionScope.turnId || actionScope.turn_id;
  const turnId = currentTurnId();
  const threadId = currentThreadId();
  const approvalScope = approvalRequestResumeScope();
  const isApprovalRequestResumeAction =
    requestId === ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)} &&
    actionType === "tool_confirmation";
  if (!isApprovalRequestResumeAction) {
    appendLedgerEntry({
      kind: "approvalRequestResumeActionRespondIgnored",
      sessionId: input.request?.session?.sessionId,
      threadId,
      turnId,
      requestId,
      actionType,
      decision: input.request?.decision,
      decisionScope: input.request?.decisionScope || input.request?.decision_scope,
      requestKeys: Object.keys(input.request || {}).sort(),
      actionScope: {
        sessionId: actionScopeSessionId,
        session_id: actionScopeSessionId,
        threadId: actionScopeThreadId,
        thread_id: actionScopeThreadId,
        turnId: actionScopeTurnId,
        turn_id: actionScopeTurnId
      }
    });
    emitEvents([]);
    process.exit(0);
  }
  const approvalAllowed =
    approvalDecision === "allow_once" ||
    approvalDecision === "allow_for_session";
  const approvalCanceled = approvalDecision === "cancel";
  const resolvedResponse =
    input.request?.response ||
    (approvalCanceled ? "canceled" : approvalAllowed ? "approved" : "declined");
  appendLedgerEntry({
    kind: "approvalRequestResumeActionRespond",
    sessionId: input.request?.session?.sessionId,
    threadId,
    turnId,
    requestId,
    actionType,
    decision: approvalDecision,
    decisionScope: approvalDecisionScope,
    confirmed: input.request?.confirmed,
    response: input.request?.response,
    actionScope: {
      sessionId: actionScopeSessionId,
      session_id: actionScopeSessionId,
      threadId: actionScopeThreadId,
      thread_id: actionScopeThreadId,
      turnId: actionScopeTurnId,
      turn_id: actionScopeTurnId
    }
  });
  const actionResolvedEvent = {
      type: "action.resolved",
      payload: {
        requestId: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
        request_id: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
        actionId: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
        action_id: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
        actionType: "tool_confirmation",
        action_type: "tool_confirmation",
        actionKind: "permission_preflight",
        action_kind: "permission_preflight",
        confirmed: approvalAllowed,
        decision: approvalDecision,
        decisionScope: approvalDecisionScope,
        decision_scope: approvalDecisionScope,
        response: resolvedResponse,
        toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
        tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
        toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
        tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
        approvalPolicy: "on-request",
        approval_policy: "on-request",
        sandboxPolicy: "workspace-write",
        sandbox_policy: "workspace-write",
        runtime_contract: ${js(BROWSER_CONTROL_CONTRACT)},
        approvalScope,
        approval_scope: approvalScope,
        scope: {
          sessionId: actionScopeSessionId || input.request?.session?.sessionId,
          session_id: actionScopeSessionId || input.request?.session?.sessionId,
          threadId: actionScopeThreadId || threadId,
          thread_id: actionScopeThreadId || threadId,
          turnId: actionScopeTurnId || turnId,
          turn_id: actionScopeTurnId || turnId
        }
      }
    };
  const completionEvents = approvalCanceled
    ? [
        {
          type: "tool.failed",
          payload: {
            toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
            tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
            toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
            tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
            error: ${js(APPROVAL_REQUEST_CANCEL_DONE_TEXT)},
            status: "failed"
          }
        },
        {
          type: "turn.canceled",
          payload: {
            status: "canceled",
            reason: "approval_request_cancelled",
            text: ${js(APPROVAL_REQUEST_CANCEL_DONE_TEXT)}
          }
        }
      ]
    : approvalAllowed
      ? [
          {
            type: "tool.result",
            payload: {
              toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
              tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
              toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
              tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
              output: ${js(APPROVAL_REQUEST_RESUME_RESULT_TEXT)},
              status: "completed"
            }
          },
          {
            type: "provider.first_text_delta.received",
            payload: {
              stage: "first_text_delta_received",
              provider: ${js(FIXTURE_PROVIDER)},
              model: ${js(FIXTURE_MODEL)},
              attempt: 1,
              elapsed_ms: 90,
              elapsedMs: 90,
              status: "running",
              text_chars: ${js(APPROVAL_REQUEST_RESUME_RESULT_TEXT)}.length,
              textChars: ${js(APPROVAL_REQUEST_RESUME_RESULT_TEXT)}.length
            }
          },
          {
            type: "message.delta",
            payload: {
              text: ${js(`${APPROVAL_REQUEST_RESUME_RESULT_TEXT}\n${APPROVAL_REQUEST_RESUME_DONE_TEXT}\n`)},
              item_id: "agent-message-final-" + (turnId || "turn"),
              itemId: "agent-message-final-" + (turnId || "turn"),
              phase: "final_answer",
              thread_id: threadId,
              threadId,
              turn_id: turnId,
              turnId
            }
          },
          {
            type: "turn.completed",
            payload: {
              status: "completed",
              text: ${js(APPROVAL_REQUEST_RESUME_DONE_TEXT)}
            }
          }
        ]
      : [
          {
            type: "tool.failed",
            payload: {
              toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
              tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
              toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
              tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
              error: ${js(APPROVAL_REQUEST_DECLINE_RESULT_TEXT)},
              status: "failed"
            }
          },
          {
            type: "provider.first_text_delta.received",
            payload: {
              stage: "first_text_delta_received",
              provider: ${js(FIXTURE_PROVIDER)},
              model: ${js(FIXTURE_MODEL)},
              attempt: 1,
              elapsed_ms: 90,
              elapsedMs: 90,
              status: "running",
              text_chars: ${js(APPROVAL_REQUEST_DECLINE_RESULT_TEXT)}.length,
              textChars: ${js(APPROVAL_REQUEST_DECLINE_RESULT_TEXT)}.length
            }
          },
          {
            type: "message.delta",
            payload: {
              text: ${js(`${APPROVAL_REQUEST_DECLINE_RESULT_TEXT}\n${APPROVAL_REQUEST_DECLINE_DONE_TEXT}\n`)},
              item_id: "agent-message-final-" + (turnId || "turn"),
              itemId: "agent-message-final-" + (turnId || "turn"),
              phase: "final_answer",
              thread_id: threadId,
              threadId,
              turn_id: turnId,
              turnId
            }
          },
          {
            type: "turn.completed",
            payload: {
              status: "completed",
              text: ${js(APPROVAL_REQUEST_DECLINE_DONE_TEXT)}
            }
          }
        ];
  emitEvents([actionResolvedEvent, ...completionEvents]);
  process.exit(0);
}
`;
}

export function renderApprovalRequestResumeTurnStartScript() {
  return `
  if (isApprovalRequestResumePrompt) {
    const turnId = currentTurnId();
    const threadId = currentThreadId();
    const approvalScope = approvalRequestResumeScope();
    emitEvents([
      {
        type: "provider.request.started",
        payload: providerTracePayload("request_started", 0, "running")
      },
      {
        type: "provider.first_event.received",
        payload: providerTracePayload("first_event_received", 40, "running")
      },
      {
        type: "tool.started",
        payload: {
          toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
          tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
          toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
          tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
          arguments: {
            command: ${js(APPROVAL_REQUEST_RESUME_COMMAND)}
          },
          thread_id: threadId,
          threadId,
          turn_id: turnId,
          turnId
        }
      },
      {
        type: "action.required",
        payload: {
          requestId: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
          request_id: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
          actionId: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
          action_id: ${js(APPROVAL_REQUEST_RESUME_REQUEST_ID)},
          actionType: "tool_confirmation",
          action_type: "tool_confirmation",
          actionKind: "permission_preflight",
          action_kind: "permission_preflight",
          availableDecisions: ["allow_once", "allow_for_session", "decline", "cancel"],
          available_decisions: ["allow_once", "allow_for_session", "decline", "cancel"],
          toolCallId: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
          tool_call_id: ${js(APPROVAL_REQUEST_RESUME_TOOL_CALL_ID)},
          toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
          tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
          prompt: ${js(APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT)},
          message: ${js(APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT)},
          approvalPolicy: "on-request",
          approval_policy: "on-request",
          sandboxPolicy: "workspace-write",
          sandbox_policy: "workspace-write",
          runtime_contract: ${js(BROWSER_CONTROL_CONTRACT)},
          approvalScope,
          approval_scope: approvalScope,
          arguments: {
            command: ${js(APPROVAL_REQUEST_RESUME_COMMAND)}
          },
          data: {
            prompt: ${js(APPROVAL_REQUEST_RESUME_APPROVAL_PROMPT)},
            availableDecisions: ["allow_once", "allow_for_session", "decline", "cancel"],
            available_decisions: ["allow_once", "allow_for_session", "decline", "cancel"],
            toolName: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
            tool_name: ${js(APPROVAL_REQUEST_RESUME_TOOL_NAME)},
            approvalPolicy: "on-request",
            approval_policy: "on-request",
            sandboxPolicy: "workspace-write",
            sandbox_policy: "workspace-write",
            runtime_contract: ${js(BROWSER_CONTROL_CONTRACT)},
            approvalScope,
            approval_scope: approvalScope,
            arguments: {
              command: ${js(APPROVAL_REQUEST_RESUME_COMMAND)}
            }
          },
          scope: {
            sessionId: input.request?.session?.sessionId,
            session_id: input.request?.session?.sessionId,
            threadId,
            thread_id: threadId,
            turnId,
            turn_id: turnId,
            ...(approvalScope.workspaceId ? { workspaceId: approvalScope.workspaceId } : {})
          }
        }
      }
    ]);
    process.exit(0);
  }
`;
}
