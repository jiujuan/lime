import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";

export function throwUnsupportedMethod(
  request: PluginHostBridgeCapabilityRequest,
): never {
  throw new PluginCapabilityDispatcherError(
    "UNSUPPORTED_CAPABILITY_METHOD",
    `${request.capability}.${request.method} is not supported by Plugin Host Bridge.`,
  );
}
