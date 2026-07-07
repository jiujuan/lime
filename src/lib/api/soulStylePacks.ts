import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_SOUL_STYLE_PACK_INSTALL,
  METHOD_SOUL_STYLE_PACK_LIST,
  METHOD_SOUL_STYLE_PACK_STATUS_SET,
  METHOD_SOUL_STYLE_PACK_UNINSTALL,
  type SoulStylePackInstallParams,
  type SoulStylePackInstallResponse,
  type SoulStylePackListParams,
  type SoulStylePackListResponse,
  type SoulStylePackStatusSetParams,
  type SoulStylePackStatusSetResponse,
  type SoulStylePackUninstallParams,
  type SoulStylePackUninstallResponse,
} from "../../../packages/app-server-client/src/protocol";

type SoulStylePackAppServerClient = Pick<AppServerClient, "request">;

export type {
  SoulStylePackInstallParams,
  SoulStylePackInstallResponse,
  SoulStylePackInstallStatus,
  SoulStylePackListEntry,
  SoulStylePackListParams,
  SoulStylePackListResponse,
  SoulStylePackMutableStatus,
  SoulStylePackStatusSetParams,
  SoulStylePackStatusSetResponse,
  SoulStylePackUninstallParams,
  SoulStylePackUninstallResponse,
} from "../../../packages/app-server-client/src/protocol";

export async function installSoulStylePack(
  params: SoulStylePackInstallParams,
  appServerClient: SoulStylePackAppServerClient = new AppServerClient(),
): Promise<SoulStylePackInstallResponse> {
  const response = await appServerClient.request<SoulStylePackInstallResponse>(
    METHOD_SOUL_STYLE_PACK_INSTALL,
    params,
  );
  return response.result;
}

export async function listSoulStylePacks(
  params: SoulStylePackListParams = {},
  appServerClient: SoulStylePackAppServerClient = new AppServerClient(),
): Promise<SoulStylePackListResponse> {
  const response = await appServerClient.request<SoulStylePackListResponse>(
    METHOD_SOUL_STYLE_PACK_LIST,
    params,
  );
  return response.result;
}

export async function setSoulStylePackStatus(
  params: SoulStylePackStatusSetParams,
  appServerClient: SoulStylePackAppServerClient = new AppServerClient(),
): Promise<SoulStylePackStatusSetResponse> {
  const response =
    await appServerClient.request<SoulStylePackStatusSetResponse>(
      METHOD_SOUL_STYLE_PACK_STATUS_SET,
      params,
    );
  return response.result;
}

export async function uninstallSoulStylePack(
  params: SoulStylePackUninstallParams,
  appServerClient: SoulStylePackAppServerClient = new AppServerClient(),
): Promise<SoulStylePackUninstallResponse> {
  const response =
    await appServerClient.request<SoulStylePackUninstallResponse>(
      METHOD_SOUL_STYLE_PACK_UNINSTALL,
      params,
    );
  return response.result;
}
