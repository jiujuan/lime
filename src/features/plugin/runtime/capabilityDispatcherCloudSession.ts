import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import { startOemCloudLogin } from "@/lib/oemCloudLoginLauncher";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import { isRecord } from "./capabilityDispatcherRecord";
import { readBooleanOption } from "./capabilityDispatcherRequestInput";
import { throwUnsupportedMethod } from "./capabilityDispatcherUnsupported";

function buildCloudSessionSnapshot() {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    return {
      hasSession: false,
    };
  }
  return {
    controlPlaneBaseUrl: runtime.controlPlaneBaseUrl,
    tenantId: runtime.tenantId,
    hasSession: Boolean(runtime.sessionToken),
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isExpiredJwt(token: string, nowMs = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number") {
    return false;
  }

  return exp * 1000 <= nowMs + 60_000;
}

export async function dispatchCloudSession(
  request: PluginHostBridgeCapabilityRequest,
): Promise<unknown> {
  if (request.method === "getSnapshot") {
    return buildCloudSessionSnapshot();
  }
  if (request.method === "getAccessToken") {
    const runtime = resolveOemCloudRuntimeContext();
    if (
      !runtime?.sessionToken ||
      !runtime.tenantId ||
      isExpiredJwt(runtime.sessionToken)
    ) {
      throw new PluginCapabilityDispatcherError(
        "SESSION_REQUIRED",
        "Host cloud session is not available.",
      );
    }
    return {
      accessToken: runtime.sessionToken,
      tenantId: runtime.tenantId,
      controlPlaneBaseUrl: runtime.controlPlaneBaseUrl,
    };
  }
  if (request.method === "requestLogin") {
    const runtime = resolveOemCloudRuntimeContext();
    if (!runtime) {
      throw new PluginCapabilityDispatcherError(
        "LOGIN_UNAVAILABLE",
        "Host cloud login is not configured.",
      );
    }
    const force = readBooleanOption(request, "force");
    if (force || !runtime.sessionToken || isExpiredJwt(runtime.sessionToken)) {
      await startOemCloudLogin(runtime, { waitForCompletion: true });
    }
    return buildCloudSessionSnapshot();
  }
  throwUnsupportedMethod(request);
}
