export const agentAppWorkflowStepKinds = [
  "storage.set",
  "knowledge.search",
  "agent.startTask",
  "artifacts.create",
  "evidence.record",
] as const;

export type AgentAppWorkflowStepKind = (typeof agentAppWorkflowStepKinds)[number];

export interface AgentAppWorkflowRuntimePolicy {
  maxSteps: number;
  maxTraceEvents: number;
  allowedStepKinds: AgentAppWorkflowStepKind[];
  allowRawWorker: false;
  allowExternalCode: false;
  allowNetworkAccess: false;
  allowFileSystemAccess: false;
}

export const defaultAgentAppWorkflowRuntimePolicy: AgentAppWorkflowRuntimePolicy = {
  maxSteps: 24,
  maxTraceEvents: 96,
  allowedStepKinds: [...agentAppWorkflowStepKinds],
  allowRawWorker: false,
  allowExternalCode: false,
  allowNetworkAccess: false,
  allowFileSystemAccess: false,
};

export function resolveAgentAppWorkflowRuntimePolicy(
  overrides: Partial<AgentAppWorkflowRuntimePolicy> = {},
): AgentAppWorkflowRuntimePolicy {
  return {
    ...defaultAgentAppWorkflowRuntimePolicy,
    ...overrides,
    allowedStepKinds:
      overrides.allowedStepKinds ?? defaultAgentAppWorkflowRuntimePolicy.allowedStepKinds,
    allowRawWorker: false,
    allowExternalCode: false,
    allowNetworkAccess: false,
    allowFileSystemAccess: false,
  };
}

export function isAgentAppWorkflowStepKind(
  value: string,
): value is AgentAppWorkflowStepKind {
  return agentAppWorkflowStepKinds.includes(value as AgentAppWorkflowStepKind);
}
