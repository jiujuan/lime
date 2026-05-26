function normalizeText(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

const XIAOMI_HOST_KEYWORDS = ["xiaomimimo.com"];

export function isXiaomiLikeProvider(options: {
  providerId?: string | null;
  providerType?: string | null;
  apiHost?: string | null;
}): boolean {
  const providerId = normalizeText(options.providerId);
  const providerType = normalizeText(options.providerType);
  const apiHost = normalizeText(options.apiHost);

  return (
    providerId === "xiaomi" ||
    providerId === "mimo" ||
    providerId === "xiaomimimo" ||
    providerType === "xiaomi" ||
    providerType === "mimo" ||
    providerType === "xiaomimimo" ||
    XIAOMI_HOST_KEYWORDS.some((keyword) => apiHost.includes(keyword))
  );
}

export function canonicalizeXiaomiModelId(modelId?: string | null): string {
  const trimmed = (modelId || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed;
}

export function canonicalizeKnownProviderModelId(options: {
  providerId?: string | null;
  providerType?: string | null;
  apiHost?: string | null;
  modelId?: string | null;
}): string {
  const trimmed = (options.modelId || "").trim();
  if (!trimmed) {
    return "";
  }

  return canonicalizeXiaomiModelId(trimmed);
}
