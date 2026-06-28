import type { ProjectedEntry } from "../types";
import type { AgentAppRightSurfaceLaunchTarget } from "../ui/agentAppRightSurfaceLaunch";
import type { AgentAppHostBridgeCapabilityRequest } from "./hostBridge";
import {
  requestAgentAppBrowserRightSurfaceIntent,
  type AgentAppBrowserIntentLaunchResult,
} from "../ui/agentAppBrowserIntentLaunch";

export type AgentAppCapabilityDispatch = (
  request: AgentAppHostBridgeCapabilityRequest,
) => Promise<unknown>;

export interface AgentAppBrowserIntentLaunchContext {
  appId: string;
  title: string;
  entry: Pick<ProjectedEntry, "key" | "kind" | "title" | "route">;
  target?: AgentAppRightSurfaceLaunchTarget | null;
}

export interface WrapAgentAppBrowserIntentLaunchOptions {
  onError?: (error: unknown) => void;
  requestBrowserIntent?: (
    input: Parameters<typeof requestAgentAppBrowserRightSurfaceIntent>[0],
    deps?: Parameters<typeof requestAgentAppBrowserRightSurfaceIntent>[1],
  ) => Promise<AgentAppBrowserIntentLaunchResult>;
}

export function wrapAgentAppCapabilityDispatchWithBrowserIntentLaunch(
  dispatchCapability: AgentAppCapabilityDispatch,
  context: AgentAppBrowserIntentLaunchContext,
  options: WrapAgentAppBrowserIntentLaunchOptions = {},
): AgentAppCapabilityDispatch {
  const requestBrowserIntent =
    options.requestBrowserIntent ?? requestAgentAppBrowserRightSurfaceIntent;

  return async (request) => {
    const result = await dispatchCapability(request);
    if (
      request.capability !== "lime.browser" ||
      request.method !== "open" ||
      !context.target
    ) {
      return result;
    }

    try {
      await requestBrowserIntent({
        appId: context.appId,
        title: context.title,
        entry: context.entry,
        intentResponse: result,
        target: context.target,
      });
    } catch (error) {
      options.onError?.(error);
    }

    return result;
  };
}
