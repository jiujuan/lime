import type { ProviderType } from "@/lib/types/provider";
import { isFalImageProviderLike } from "@/lib/imageGen/providerMatchers";

const LOCAL_OPENAI_LIKE_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "gpustack",
  "ovms",
]);

const LIME_MANAGED_HOST_SUFFIXES = ["limeai.run", "lime.ai"];
const LIME_TENANT_PARAM = "lime_tenant_id";

function normalize(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function parseApiHostUrl(apiHost?: string | null): URL | null {
  const host = (apiHost || "").trim();
  if (!host) {
    return null;
  }

  try {
    return new URL(host);
  } catch {
    try {
      return new URL(`https://${host}`);
    } catch {
      return null;
    }
  }
}

function isLimeManagedHost(hostname: string): boolean {
  const host = hostname.trim().replace(/\.+$/, "").toLowerCase();
  return LIME_MANAGED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function normalizeLimeTenantId(value: string | null): string | null {
  const tenantId = (value || "").trim();
  if (!tenantId) {
    return null;
  }
  return /^[A-Za-z0-9_-]+$/.test(tenantId) ? tenantId : null;
}

function getLimeTenantId(url: URL): string | null {
  return (
    normalizeLimeTenantId(url.searchParams.get(LIME_TENANT_PARAM)) ??
    normalizeLimeTenantId(
      new URLSearchParams(url.hash.replace(/^#/, "")).get(LIME_TENANT_PARAM),
    )
  );
}

function isLikelyLocalHost(apiHost?: string | null): boolean {
  const host = normalize(apiHost);
  if (!host) {
    return false;
  }

  return (
    host.includes("://localhost") ||
    host.includes("://127.0.0.1") ||
    host.includes("://0.0.0.0") ||
    host.includes("://host.docker.internal")
  );
}

export function isManagedLimeHubTenantModelEndpoint(input: {
  apiHost?: string | null;
}): boolean {
  const url = parseApiHostUrl(input.apiHost);
  if (!url) {
    return false;
  }

  return isLimeManagedHost(url.hostname) && Boolean(getLimeTenantId(url));
}

interface ProviderModelAutoFetchCapability {
  supported: boolean;
  requiresApiKey: boolean;
  requiresLiveModelTruth: boolean;
  unsupportedReason?: string;
}

export function getProviderModelAutoFetchCapability(input: {
  providerId?: string | null;
  providerType?: string | null;
  apiHost?: string | null;
}): ProviderModelAutoFetchCapability {
  const providerId = normalize(input.providerId);
  const providerType = normalize(input.providerType) as ProviderType | "";
  const localHost = isLikelyLocalHost(input.apiHost);
  const managedLimeHubTenant = isManagedLimeHubTenantModelEndpoint(input);

  if (isFalImageProviderLike(input)) {
    return {
      supported: true,
      requiresApiKey: false,
      requiresLiveModelTruth: false,
    };
  }

  switch (providerType) {
    case "openai":
    case "openai-response":
    case "codex":
    case "new-api":
    case "gateway":
      return {
        supported: true,
        requiresApiKey:
          !LOCAL_OPENAI_LIKE_PROVIDER_IDS.has(providerId) &&
          !localHost &&
          !managedLimeHubTenant,
        requiresLiveModelTruth: true,
      };
    case "anthropic":
      return {
        supported: true,
        requiresApiKey: true,
        requiresLiveModelTruth: true,
      };
    case "anthropic-compatible":
      return {
        supported: true,
        requiresApiKey: true,
        requiresLiveModelTruth: false,
      };
    case "gemini":
      return {
        supported: true,
        requiresApiKey: true,
        requiresLiveModelTruth: true,
      };
    case "ollama":
      return {
        supported: true,
        requiresApiKey: false,
        requiresLiveModelTruth: true,
      };
    case "azure-openai":
      return {
        supported: false,
        requiresApiKey: true,
        requiresLiveModelTruth: false,
        unsupportedReason:
          "Azure OpenAI 的模型枚举仍需单独适配资源端点与 API Version，当前不展示自动获取入口。",
      };
    case "vertexai":
      return {
        supported: false,
        requiresApiKey: false,
        requiresLiveModelTruth: false,
        unsupportedReason:
          "Vertex AI 需要单独的云端认证与项目上下文，当前不展示自动获取入口。",
      };
    case "aws-bedrock":
      return {
        supported: false,
        requiresApiKey: false,
        requiresLiveModelTruth: false,
        unsupportedReason:
          "AWS Bedrock 需要专门的云凭证签名流程，当前不展示自动获取入口。",
      };
    default:
      return {
        supported: false,
        requiresApiKey: true,
        requiresLiveModelTruth: false,
        unsupportedReason: "当前协议暂不支持自动获取最新模型。",
      };
  }
}
