import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";
import { hasOwn, isRecord } from "./hostBridgeCommon";
import { readTaskEventsFromValue } from "./hostBridgeTaskReplay";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";

export function enrichAgentCapabilityResult(
  request: PluginHostBridgeCapabilityRequest,
  result: unknown,
): unknown {
  if (request.capability !== "lime.agent" || !isRecord(result)) {
    return result;
  }
  if (isRecord(result.process) && isRecord(result.runtimeProcess)) {
    return result;
  }
  if (
    request.method !== "startTask" &&
    request.method !== "getTask" &&
    request.method !== "cancelTask" &&
    request.method !== "retryTask"
  ) {
    return result;
  }
  const process = buildAgentRuntimeProcessView({
    events: readTaskEventsFromValue(result),
    task: result,
    snapshot: result,
    expectedOutput:
      isRecord(request.input) && hasOwn(request.input, "expectedOutput")
        ? request.input.expectedOutput
        : undefined,
    lastInput: request.input,
  });
  return {
    ...result,
    runtimeProcess: isRecord(result.runtimeProcess)
      ? result.runtimeProcess
      : process,
    process: isRecord(result.process) ? result.process : process,
  };
}
