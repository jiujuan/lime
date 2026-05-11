export interface AgentStreamUnknownEventPlan {
  eventType: string;
  shouldWarn: boolean;
  warningMessage: string | null;
}

const LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION = "lime-profile-0.4.0";

export function buildAgentStreamUnknownEventWarningMessage(params: {
  eventName: string;
  eventType: string;
}): string {
  return `[AsterChat] 收到未识别的运行时事件，已保留流活跃态: ${params.eventName} · ${params.eventType}`;
}

export function resolveAgentStreamUnknownEventPlan(params: {
  eventName: string;
  eventType: string | null;
  schemaVersion?: string | null;
  warnedEventTypes: ReadonlySet<string>;
}): AgentStreamUnknownEventPlan | null {
  if (!params.eventType) {
    return null;
  }

  const isLimeAgentRuntimeProfileEvent =
    params.schemaVersion === LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION;
  const shouldWarn =
    !isLimeAgentRuntimeProfileEvent &&
    !params.warnedEventTypes.has(params.eventType);
  return {
    eventType: params.eventType,
    shouldWarn,
    warningMessage: shouldWarn
      ? buildAgentStreamUnknownEventWarningMessage({
          eventName: params.eventName,
          eventType: params.eventType,
        })
      : null,
  };
}

export function rememberAgentStreamUnknownEventWarning(params: {
  eventType: string;
  warnedEventTypes: Set<string>;
}): boolean {
  if (params.warnedEventTypes.has(params.eventType)) {
    return false;
  }

  params.warnedEventTypes.add(params.eventType);
  return true;
}
