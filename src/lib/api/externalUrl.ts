import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import { assertEmptyElectronHostResult } from "./electronHostResult";

export const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT =
  "oem-cloud-oauth-callback";

export interface OemCloudOAuthCallbackBridgeStartResponse {
  callbackUrl: string;
}

export interface OemCloudOAuthCallbackBridgePayload {
  sourcePath: string;
  tenantId?: string | null;
  token?: string | null;
  next?: string | null;
  error?: string | null;
  deviceCode?: string | null;
  status?: string | null;
}

function assertOemCloudOAuthCallbackBridgeResponse(
  value: unknown,
): asserts value is OemCloudOAuthCallbackBridgeStartResponse {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as { callbackUrl?: unknown }).callbackUrl !== "string" ||
    (value as { callbackUrl: string }).callbackUrl.trim().length === 0
  ) {
    throw new Error(
      "start_oem_cloud_oauth_callback_bridge 未返回有效 OAuth 本机回调桥地址",
    );
  }
}

export async function openExternalUrlWithSystemBrowser(
  url: string,
): Promise<void> {
  const result = await safeInvoke("open_external_url", { url });
  assertNotDiagnosticFacade(
    "open_external_url",
    result,
    "真实外部链接 current 通道",
  );
  assertEmptyElectronHostResult("open_external_url", result);
}

export async function startOemCloudOAuthCallbackBridge(): Promise<OemCloudOAuthCallbackBridgeStartResponse> {
  const result = await safeInvoke<unknown>(
    "start_oem_cloud_oauth_callback_bridge",
  );
  assertNotDiagnosticFacade(
    "start_oem_cloud_oauth_callback_bridge",
    result,
    "真实 OAuth 本机回调桥 current 通道",
  );
  assertOemCloudOAuthCallbackBridgeResponse(result);
  return result;
}
