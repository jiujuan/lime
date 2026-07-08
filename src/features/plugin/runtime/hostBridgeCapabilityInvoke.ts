import type { LimeCapabilityInvokeProvenance } from "../sdk/capabilityContract";
import { isRecord } from "./hostBridgeCommon";

export function readCapabilityInvokeProvenance(
  value: unknown,
): LimeCapabilityInvokeProvenance | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    typeof value.appId !== "string" ||
    typeof value.packageHash !== "string" ||
    typeof value.manifestHash !== "string"
  ) {
    return undefined;
  }
  return {
    appId: value.appId,
    packageHash: value.packageHash,
    manifestHash: value.manifestHash,
    entryKey: typeof value.entryKey === "string" ? value.entryKey : undefined,
    workflowRunId:
      typeof value.workflowRunId === "string" ? value.workflowRunId : undefined,
    workspaceId:
      typeof value.workspaceId === "string" ? value.workspaceId : undefined,
    taskId: typeof value.taskId === "string" ? value.taskId : undefined,
  };
}
