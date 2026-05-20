import { safeInvoke } from "@/lib/dev-bridge";

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

export async function openExternalUrlWithSystemBrowser(
  url: string,
): Promise<void> {
  await safeInvoke("open_external_url", { url });
}

export async function startOemCloudOAuthCallbackBridge(): Promise<OemCloudOAuthCallbackBridgeStartResponse> {
  return safeInvoke<OemCloudOAuthCallbackBridgeStartResponse>(
    "start_oem_cloud_oauth_callback_bridge",
  );
}
