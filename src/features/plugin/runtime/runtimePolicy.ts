export const pluginWorkflowStepKinds = [
  "storage.set",
  "knowledge.search",
  "agent.startTask",
  "artifacts.create",
  "evidence.record",
] as const;

export type PluginWorkflowStepKind = (typeof pluginWorkflowStepKinds)[number];

export interface PluginWorkflowRuntimePolicy {
  maxSteps: number;
  maxTraceEvents: number;
  allowedStepKinds: PluginWorkflowStepKind[];
  allowRawWorker: false;
  allowExternalCode: false;
  allowNetworkAccess: false;
  allowFileSystemAccess: false;
}

export const defaultPluginWorkflowRuntimePolicy: PluginWorkflowRuntimePolicy = {
  maxSteps: 24,
  maxTraceEvents: 96,
  allowedStepKinds: [...pluginWorkflowStepKinds],
  allowRawWorker: false,
  allowExternalCode: false,
  allowNetworkAccess: false,
  allowFileSystemAccess: false,
};

export function resolvePluginWorkflowRuntimePolicy(
  overrides: Partial<PluginWorkflowRuntimePolicy> = {},
): PluginWorkflowRuntimePolicy {
  return {
    ...defaultPluginWorkflowRuntimePolicy,
    ...overrides,
    allowedStepKinds:
      overrides.allowedStepKinds ?? defaultPluginWorkflowRuntimePolicy.allowedStepKinds,
    allowRawWorker: false,
    allowExternalCode: false,
    allowNetworkAccess: false,
    allowFileSystemAccess: false,
  };
}

export function isPluginWorkflowStepKind(
  value: string,
): value is PluginWorkflowStepKind {
  return pluginWorkflowStepKinds.includes(value as PluginWorkflowStepKind);
}
