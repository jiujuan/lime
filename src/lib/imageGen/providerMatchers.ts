export interface ImageProviderMatcherProfile {
  id?: string | null;
  type?: string | null;
  api_host?: string | null;
  providerId?: string | null;
  providerType?: string | null;
  apiHost?: string | null;
}

const IMAGE_GENERATION_MODEL_PATTERN =
  /(gpt[-_ ]?images?|imagen|dall-e|dalle|nano[-_ ]?banana|banana|flux|seedream|kontext|recraft|ideogram|sdxl|sd3|stable[-_ ]?diffusion|cogview|glm[-_ ]?image|wanx|midjourney|(?:^|[^a-z0-9])mj(?:$|[^a-z0-9])|(?:^|[^a-z0-9])image[-_ ]?(?:\d|generation|gen|preview|model)(?:$|[^a-z0-9])|text[-_ ]?to[-_ ]?image|picture|drawing|绘图|图像生成|生图)/;

function normalizeText(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function readProviderId(profile: ImageProviderMatcherProfile): string {
  return normalizeText(profile.id ?? profile.providerId);
}

function readProviderType(profile: ImageProviderMatcherProfile): string {
  return normalizeText(profile.type ?? profile.providerType);
}

function readApiHost(profile: ImageProviderMatcherProfile): string {
  return normalizeText(profile.api_host ?? profile.apiHost);
}

export function isResponsesImageGenerationModelId(modelId: string): boolean {
  const normalized = normalizeText(modelId);
  if (!normalized) {
    return false;
  }

  return /(?:^|[^a-z0-9])gpt-images?-2(?:$|[^a-z0-9])/.test(normalized);
}

export function isLikelyImageGenerationModelId(modelId: string): boolean {
  const normalized = normalizeText(modelId);
  if (!normalized) {
    return false;
  }

  return (
    isResponsesImageGenerationModelId(normalized) ||
    IMAGE_GENERATION_MODEL_PATTERN.test(normalized)
  );
}

export function isLikelyImageGenerationSearchText(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return (
    isResponsesImageGenerationModelId(normalized) ||
    IMAGE_GENERATION_MODEL_PATTERN.test(normalized)
  );
}

export function isFalImageProviderLike(
  profile: ImageProviderMatcherProfile,
): boolean {
  const providerId = readProviderId(profile);
  const providerType = readProviderType(profile);
  const apiHost = readApiHost(profile);

  return (
    providerType === "fal" ||
    providerId === "fal" ||
    providerId.startsWith("fal-") ||
    providerId.includes("fal.ai") ||
    apiHost.includes("fal.run") ||
    apiHost.includes("queue.fal.run")
  );
}

export function isLikelyFalImageModelId(modelId: string): boolean {
  const normalized = normalizeText(modelId);
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("fal-ai/") ||
    isLikelyImageGenerationModelId(normalized)
  );
}
