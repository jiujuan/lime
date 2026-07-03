import type { ProjectedEntry } from "../types";
import type { PluginRightSurfaceLaunchTarget } from "../ui/pluginRightSurfaceLaunch";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  requestPluginBrowserRightSurfaceIntent,
  type PluginBrowserIntentLaunchResult,
} from "../ui/pluginBrowserIntentLaunch";

export type PluginCapabilityDispatch = (
  request: PluginHostBridgeCapabilityRequest,
) => Promise<unknown>;

export interface PluginBrowserIntentLaunchContext {
  appId: string;
  title: string;
  entry: Pick<ProjectedEntry, "key" | "kind" | "title" | "route">;
  target?: PluginRightSurfaceLaunchTarget | null;
}

export interface WrapPluginBrowserIntentLaunchOptions {
  onError?: (error: unknown) => void;
  requestBrowserIntent?: (
    input: Parameters<typeof requestPluginBrowserRightSurfaceIntent>[0],
    deps?: Parameters<typeof requestPluginBrowserRightSurfaceIntent>[1],
  ) => Promise<PluginBrowserIntentLaunchResult>;
}

export function wrapPluginCapabilityDispatchWithBrowserIntentLaunch(
  dispatchCapability: PluginCapabilityDispatch,
  context: PluginBrowserIntentLaunchContext,
  options: WrapPluginBrowserIntentLaunchOptions = {},
): PluginCapabilityDispatch {
  const requestBrowserIntent =
    options.requestBrowserIntent ?? requestPluginBrowserRightSurfaceIntent;

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
