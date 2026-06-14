import type { AgentRuntimeExecutionEvent } from "./runtime";
import { isRuntimeTurnTerminalEventClass } from "./runtimeTerminal.js";

/**
 * Runtime event sequence verifier.
 *
 * 这是 Lime 自己的「流式协议状态机」，对标 AG-UI `verifyEvents`，但校验 Lime
 * 自有的 RuntimeEvent 配对规则，而不是 AG-UI 的 RUN_STARTED/TEXT_MESSAGE_* 事件名。
 *
 * 设计原则：
 * 1. 只检查「违反规则」，不检查「不完整」。一个还在进行中、或只截取了片段的事件流必须合法；
 *    只有当出现明确违反配对/收口/终态约束的事件时，才产出 violation。
 * 2. 双模式：既支持一次性批量验证（fixture / conformance runner），也支持增量
 *    push/finalize（未来 runtime client 在分发 listener 前逐事件流式拦截）。
 * 3. 按 turn 维度维护状态机。turn 终态（turn.completed / turn.failed / turn.canceled）出现时，
 *    校验同 turn 的 tool / action / model 流是否已收口；终态后不得继续出现同 turn 执行流事件。
 *
 * verifier 不负责 schema 字段校验（那是 collectRuntimeEventValidationIssues 的职责），
 * 只负责跨事件的「序列合法性」。
 */

export type RuntimeSequenceViolationCode =
  | "duplicate_event_id"
  | "tool_result_without_start"
  | "tool_failed_without_start"
  | "tool_started_already_active"
  | "tool_unclosed_at_turn_end"
  | "patch_terminal_without_start"
  | "patch_started_already_active"
  | "patch_unclosed_at_turn_end"
  | "command_output_without_start"
  | "command_exited_without_start"
  | "command_started_already_active"
  | "command_unclosed_at_turn_end"
  | "test_completed_without_start"
  | "test_started_already_active"
  | "test_unclosed_at_turn_end"
  | "action_resolved_without_request"
  | "action_required_already_active"
  | "action_unresolved_at_turn_end"
  | "model_unclosed_at_turn_end"
  | "execution_after_turn_terminal"
  | "turn_terminal_repeated";

export interface RuntimeSequenceViolation {
  code: RuntimeSequenceViolationCode;
  /** 触发 violation 的事件 id。 */
  eventId: string;
  /** 相关 scope id（toolCallId / actionId / turnId 等），用于定位。 */
  scopeId?: string;
  /** 所属 turn（若事件带 turnId）。 */
  turnId?: string;
  message: string;
}

const ACTION_TERMINAL_CLASSES = new Set([
  "action.resolved",
  "action.cancelled",
  "action.canceled",
  "action.expired",
]);

/** turn 维度内仍然「活跃 / 未收口」的执行流。 */
interface TurnState {
  /** 仍处于活跃状态的 toolCallId -> 起始事件 id。 */
  activeTools: Map<string, string>;
  /** 仍处于活跃状态的 patchId -> 起始事件 id。 */
  activePatches: Map<string, string>;
  /** 仍处于活跃状态的 commandId -> 起始事件 id。 */
  activeCommands: Map<string, string>;
  /** 仍处于活跃状态的 testRunId -> 起始事件 id。 */
  activeTests: Map<string, string>;
  /** 仍处于活跃状态的 actionId -> 起始事件 id。 */
  activeActions: Map<string, string>;
  /** 是否有未收口的 model 流（model.delta 后未见 model.completed/model.failed）。 */
  modelStreaming: boolean;
  /** 最近一个 model 流事件 id（用于 violation 定位）。 */
  modelEventId?: string;
  /** turn 是否已进入终态。 */
  terminal: boolean;
  /** 终态事件 id。 */
  terminalEventId?: string;
}

function createTurnState(): TurnState {
  return {
    activeTools: new Map(),
    activePatches: new Map(),
    activeCommands: new Map(),
    activeTests: new Map(),
    activeActions: new Map(),
    modelStreaming: false,
    terminal: false,
  };
}

/**
 * 流式 sequence verifier。
 *
 * 用法（增量）：
 *   const verifier = createRuntimeSequenceVerifier();
 *   for (const event of stream) verifier.push(event);
 *   const violations = verifier.finalize();
 *
 * 用法（批量）：
 *   const violations = verifyRuntimeEventSequence(events);
 */
export interface RuntimeSequenceVerifier {
  /** 推入一个事件，返回该事件「单独」触发的 violation（不含 finalize 阶段才能判定的项）。 */
  push(event: AgentRuntimeExecutionEvent): RuntimeSequenceViolation[];
  /** 结束流，返回截至目前累积的全部 violation。幂等。 */
  finalize(): RuntimeSequenceViolation[];
  /** 截至目前累积的全部 violation（不结束流）。 */
  getViolations(): RuntimeSequenceViolation[];
}

export function createRuntimeSequenceVerifier(): RuntimeSequenceVerifier {
  const violations: RuntimeSequenceViolation[] = [];
  const seenIds = new Set<string>();
  const turns = new Map<string, TurnState>();
  const DEFAULT_TURN = "__default_turn__";

  function turnKey(event: AgentRuntimeExecutionEvent): string {
    return event.turnId ?? DEFAULT_TURN;
  }

  function turnFor(event: AgentRuntimeExecutionEvent): TurnState {
    const key = turnKey(event);
    let state = turns.get(key);
    if (!state) {
      state = createTurnState();
      turns.set(key, state);
    }
    return state;
  }

  function record(violation: RuntimeSequenceViolation): void {
    violations.push(violation);
  }

  function push(event: AgentRuntimeExecutionEvent): RuntimeSequenceViolation[] {
    const before = violations.length;

    if (typeof event.id === "string" && event.id.length > 0) {
      if (seenIds.has(event.id)) {
        record({
          code: "duplicate_event_id",
          eventId: event.id,
          turnId: event.turnId,
          message: `Runtime event id '${event.id}' appears more than once in the stream.`,
        });
      } else {
        seenIds.add(event.id);
      }
    }

    const eventClass =
      typeof event.eventClass === "string" ? event.eventClass : "";
    const turn = turnFor(event);

    // turn 终态后，不得继续出现同 turn 的执行流事件。
    if (turn.terminal && isExecutionStreamClass(eventClass)) {
      record({
        code: "execution_after_turn_terminal",
        eventId: event.id,
        scopeId: event.toolCallId ?? event.actionId,
        turnId: event.turnId,
        message: `Event '${eventClass}' arrived after turn '${turnKey(event)}' reached a terminal state.`,
      });
      return violations.slice(before);
    }

    switch (eventClass) {
      case "patch.started": {
        const patchId = eventScopeId(event, "patchId");
        if (patchId) {
          if (turn.activePatches.has(patchId)) {
            record({
              code: "patch_started_already_active",
              eventId: event.id,
              scopeId: patchId,
              turnId: event.turnId,
              message: `patch.started for '${patchId}' while a patch with the same id is still active.`,
            });
          } else {
            turn.activePatches.set(patchId, event.id);
          }
        }
        break;
      }
      case "patch.applied":
      case "patch.failed": {
        const patchId = eventScopeId(event, "patchId");
        if (patchId) {
          if (turn.activePatches.has(patchId)) {
            turn.activePatches.delete(patchId);
          } else {
            record({
              code: "patch_terminal_without_start",
              eventId: event.id,
              scopeId: patchId,
              turnId: event.turnId,
              message: `${eventClass} for '${patchId}' has no matching patch.started.`,
            });
          }
        }
        break;
      }
      case "command.started": {
        const commandId = eventScopeId(event, "commandId");
        if (commandId) {
          if (turn.activeCommands.has(commandId)) {
            record({
              code: "command_started_already_active",
              eventId: event.id,
              scopeId: commandId,
              turnId: event.turnId,
              message: `command.started for '${commandId}' while a command with the same id is still active.`,
            });
          } else {
            turn.activeCommands.set(commandId, event.id);
          }
        }
        break;
      }
      case "command.output": {
        const commandId = eventScopeId(event, "commandId");
        if (commandId && !turn.activeCommands.has(commandId)) {
          record({
            code: "command_output_without_start",
            eventId: event.id,
            scopeId: commandId,
            turnId: event.turnId,
            message: `command.output for '${commandId}' has no matching command.started.`,
          });
        }
        break;
      }
      case "command.exited": {
        const commandId = eventScopeId(event, "commandId");
        if (commandId) {
          if (turn.activeCommands.has(commandId)) {
            turn.activeCommands.delete(commandId);
          } else {
            record({
              code: "command_exited_without_start",
              eventId: event.id,
              scopeId: commandId,
              turnId: event.turnId,
              message: `command.exited for '${commandId}' has no matching command.started.`,
            });
          }
        }
        break;
      }
      case "test.started": {
        const testRunId = eventScopeId(event, "testRunId");
        if (testRunId) {
          if (turn.activeTests.has(testRunId)) {
            record({
              code: "test_started_already_active",
              eventId: event.id,
              scopeId: testRunId,
              turnId: event.turnId,
              message: `test.started for '${testRunId}' while a test run with the same id is still active.`,
            });
          } else {
            turn.activeTests.set(testRunId, event.id);
          }
        }
        break;
      }
      case "test.completed": {
        const testRunId = eventScopeId(event, "testRunId");
        if (testRunId) {
          if (turn.activeTests.has(testRunId)) {
            turn.activeTests.delete(testRunId);
          } else {
            record({
              code: "test_completed_without_start",
              eventId: event.id,
              scopeId: testRunId,
              turnId: event.turnId,
              message: `test.completed for '${testRunId}' has no matching test.started.`,
            });
          }
        }
        break;
      }
      case "tool.started": {
        if (typeof event.toolCallId === "string") {
          if (turn.activeTools.has(event.toolCallId)) {
            record({
              code: "tool_started_already_active",
              eventId: event.id,
              scopeId: event.toolCallId,
              turnId: event.turnId,
              message: `tool.started for '${event.toolCallId}' while a tool call with the same id is still active.`,
            });
          } else {
            turn.activeTools.set(event.toolCallId, event.id);
          }
        }
        break;
      }
      case "tool.result":
      case "tool.failed": {
        if (typeof event.toolCallId === "string") {
          if (turn.activeTools.has(event.toolCallId)) {
            turn.activeTools.delete(event.toolCallId);
          } else {
            record({
              code:
                eventClass === "tool.result"
                  ? "tool_result_without_start"
                  : "tool_failed_without_start",
              eventId: event.id,
              scopeId: event.toolCallId,
              turnId: event.turnId,
              message: `${eventClass} for '${event.toolCallId}' has no matching tool.started.`,
            });
          }
        }
        break;
      }
      case "action.required": {
        if (typeof event.actionId === "string") {
          if (turn.activeActions.has(event.actionId)) {
            record({
              code: "action_required_already_active",
              eventId: event.id,
              scopeId: event.actionId,
              turnId: event.turnId,
              message: `action.required for '${event.actionId}' while an action with the same id is still pending.`,
            });
          } else {
            turn.activeActions.set(event.actionId, event.id);
          }
        }
        break;
      }
      case "action.resolved":
      case "action.cancelled":
      case "action.canceled":
      case "action.expired": {
        if (typeof event.actionId === "string") {
          if (turn.activeActions.has(event.actionId)) {
            turn.activeActions.delete(event.actionId);
          } else {
            record({
              code: "action_resolved_without_request",
              eventId: event.id,
              scopeId: event.actionId,
              turnId: event.turnId,
              message: `action.resolved for '${event.actionId}' has no matching action.required.`,
            });
          }
        }
        break;
      }
      case "model.delta": {
        turn.modelStreaming = true;
        turn.modelEventId = event.id;
        break;
      }
      case "model.completed":
      case "model.failed": {
        turn.modelStreaming = false;
        turn.modelEventId = undefined;
        break;
      }
      default: {
        if (!isRuntimeTurnTerminalEventClass(eventClass)) {
          break;
        }
        if (turn.terminal) {
          record({
            code: "turn_terminal_repeated",
            eventId: event.id,
            turnId: event.turnId,
            message: `Turn '${turnKey(event)}' reached a terminal state more than once.`,
          });
          break;
        }
        // 终态时校验同 turn 执行流是否已收口。
        for (const [toolCallId, startedId] of turn.activeTools) {
          record({
            code: "tool_unclosed_at_turn_end",
            eventId: event.id,
            scopeId: toolCallId,
            turnId: event.turnId,
            message: `tool.started '${toolCallId}' (event '${startedId}') was not closed before ${eventClass}.`,
          });
        }
        for (const [patchId, startedId] of turn.activePatches) {
          record({
            code: "patch_unclosed_at_turn_end",
            eventId: event.id,
            scopeId: patchId,
            turnId: event.turnId,
            message: `patch.started '${patchId}' (event '${startedId}') was not closed before ${eventClass}.`,
          });
        }
        for (const [commandId, startedId] of turn.activeCommands) {
          record({
            code: "command_unclosed_at_turn_end",
            eventId: event.id,
            scopeId: commandId,
            turnId: event.turnId,
            message: `command.started '${commandId}' (event '${startedId}') was not closed before ${eventClass}.`,
          });
        }
        for (const [testRunId, startedId] of turn.activeTests) {
          record({
            code: "test_unclosed_at_turn_end",
            eventId: event.id,
            scopeId: testRunId,
            turnId: event.turnId,
            message: `test.started '${testRunId}' (event '${startedId}') was not closed before ${eventClass}.`,
          });
        }
        for (const [actionId, requiredId] of turn.activeActions) {
          record({
            code: "action_unresolved_at_turn_end",
            eventId: event.id,
            scopeId: actionId,
            turnId: event.turnId,
            message: `action.required '${actionId}' (event '${requiredId}') was not resolved before ${eventClass}.`,
          });
        }
        turn.terminal = true;
        turn.terminalEventId = event.id;
        turn.activeTools.clear();
        turn.activePatches.clear();
        turn.activeCommands.clear();
        turn.activeTests.clear();
        turn.activeActions.clear();
        turn.modelStreaming = false;
        break;
      }
    }

    return violations.slice(before);
  }

  function finalize(): RuntimeSequenceViolation[] {
    // 不强制要求未达终态的 turn 收口：未闭合的 tool/action 可能是「流仍在进行」
    // 或「fixture 只截取片段」，按设计原则二，这不是 violation。
    return violations.slice();
  }

  function getViolations(): RuntimeSequenceViolation[] {
    return violations.slice();
  }

  return { push, finalize, getViolations };
}

function eventPayloadString(
  event: AgentRuntimeExecutionEvent,
  key: string,
): string | undefined {
  const value = event.payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function eventScopeId(
  event: AgentRuntimeExecutionEvent,
  payloadKey: string,
): string | undefined {
  return eventPayloadString(event, payloadKey) ?? event.toolCallId;
}

/**
 * 批量验证一段事件序列，返回全部 sequence violation。
 *
 * 给 fixture / conformance runner 使用。空数组表示流的序列合法。
 */
export function verifyRuntimeEventSequence(
  events: readonly AgentRuntimeExecutionEvent[],
): RuntimeSequenceViolation[] {
  const verifier = createRuntimeSequenceVerifier();
  for (const event of events) {
    verifier.push(event);
  }
  return verifier.finalize();
}

/**
 * 判断某个 eventClass 是否属于「turn 执行流」——即 turn 终态后不应再出现的事件。
 *
 * session.* / snapshot.updated / state.* 等帧外维护事件不算执行流，可在终态后出现。
 */
function isExecutionStreamClass(eventClass: string): boolean {
  return (
    eventClass.startsWith("tool.") ||
    eventClass.startsWith("file.") ||
    eventClass.startsWith("patch.") ||
    eventClass.startsWith("command.") ||
    eventClass.startsWith("test.") ||
    eventClass.startsWith("action.") ||
    eventClass.startsWith("model.") ||
    eventClass.startsWith("reasoning.") ||
    eventClass === "context.resolved" ||
    eventClass.startsWith("permission.") ||
    eventClass.startsWith("sandbox.")
  );
}
