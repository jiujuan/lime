import {
  getPublicAuthCatalog,
  type OemCloudAuthCatalogProvider,
} from "@/lib/api/oemCloudControlPlane";
import {
  resolveOemCloudRuntimeContext,
  type OemCloudRuntimeContext,
} from "@/lib/api/oemCloudRuntime";
import { getStoredOemCloudSessionState } from "@/lib/oemCloudSession";

export type OemCloudStartupLoginStatus =
  | "not_configured"
  | "has_session"
  | "manual_required"
  | "not_required"
  | "no_google_provider"
  | "unsupported_policy"
  | "failed";

export interface OemCloudStartupLoginResult {
  status: OemCloudStartupLoginStatus;
  reason?: string;
}

function normalizeProvider(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function hasGoogleAuthProvider(
  providers: OemCloudAuthCatalogProvider[],
): boolean {
  return providers.some(
    (provider) =>
      provider.enabled !== false &&
      normalizeProvider(provider.provider) === "google",
  );
}

function resolveStartupLoginPolicy(
  catalog: Awaited<ReturnType<typeof getPublicAuthCatalog>>,
): OemCloudStartupLoginResult {
  if (!catalog.authPolicy.required) {
    return { status: "not_required" };
  }

  if (
    catalog.authPolicy.startupTrigger !== "oauth" ||
    normalizeProvider(catalog.authPolicy.primaryProvider) !== "google"
  ) {
    return { status: "unsupported_policy" };
  }

  if (!hasGoogleAuthProvider(catalog.providers)) {
    return { status: "no_google_provider" };
  }

  return { status: "manual_required" };
}

function hasCurrentTenantSession(runtime: OemCloudRuntimeContext): boolean {
  const storedSession = getStoredOemCloudSessionState();
  const runtimeTenantId = runtime.tenantId.trim();
  const sessionTenantId = storedSession?.session.tenant.id?.trim();
  const sessionTenantSlug = storedSession?.session.tenant.slug?.trim();
  return Boolean(
    storedSession?.token &&
    (sessionTenantId === runtimeTenantId ||
      sessionTenantSlug === runtimeTenantId),
  );
}

export async function startOemCloudStartupLoginIfRequired(
  runtime = resolveOemCloudRuntimeContext(),
): Promise<OemCloudStartupLoginResult> {
  if (!runtime) {
    return { status: "not_configured" };
  }

  if (hasCurrentTenantSession(runtime)) {
    return { status: "has_session" };
  }

  try {
    return resolveStartupLoginPolicy(
      await getPublicAuthCatalog(runtime.tenantId),
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "读取云端登录配置失败";
    console.warn("读取启动期云端登录配置失败:", error);
    return { status: "failed", reason };
  }
}
