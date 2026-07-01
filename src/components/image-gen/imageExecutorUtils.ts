export interface EndpointAttemptResult {
  imageUrl: string | null;
  error: string | null;
  assistantText?: string | null;
  status?: number;
}

export interface EndpointRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export const IMAGE_REQUEST_TIMEOUT_MS = 180_000;
export const IMAGE_GENERATION_CANCELED_MESSAGE = "已停止当前图片任务";

export function buildProviderEndpoint(
  apiHost: string,
  endpointPath: string,
): string {
  const trimmedHost = (apiHost || "").trim().replace(/\/+$/, "");
  const normalizedPath = endpointPath.startsWith("/")
    ? endpointPath
    : `/${endpointPath}`;

  if (/\/v\d+$/i.test(trimmedHost) && /^\/v\d+\//i.test(normalizedPath)) {
    return `${trimmedHost}${normalizedPath.replace(/^\/v\d+/i, "")}`;
  }

  return `${trimmedHost}${normalizedPath}`;
}

export function ensureHttpProtocol(host: string): string {
  if (/^https?:\/\//i.test(host)) {
    return host;
  }
  return `https://${host}`;
}

export function createAbortError(message: string): Error {
  try {
    return new DOMException(message, "AbortError");
  } catch {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
  }
}

export function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      /abort|aborted|cancelled|canceled/i.test(error.message)
    );
  }

  return false;
}

export function isGenerationCanceledError(error: unknown): boolean {
  if (isAbortLikeError(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes(IMAGE_GENERATION_CANCELED_MESSAGE);
}

function bindAbortSignal(
  controller: AbortController,
  signal?: AbortSignal,
): () => void {
  if (!signal) {
    return () => undefined;
  }

  if (signal.aborted) {
    controller.abort(
      signal.reason ?? createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE),
    );
    return () => undefined;
  }

  const handleAbort = () => {
    controller.abort(
      signal.reason ?? createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE),
    );
  };

  signal.addEventListener("abort", handleAbort, { once: true });
  return () => signal.removeEventListener("abort", handleAbort);
}

export async function fetchWithManagedAbort(
  input: string,
  init: globalThis.RequestInit,
  options?: EndpointRequestOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 0;
  const abortController = new AbortController();
  const cleanupExternalAbort = bindAbortSignal(
    abortController,
    options?.signal,
  );
  const timeoutHandle =
    timeoutMs > 0
      ? setTimeout(() => {
          abortController.abort(createAbortError("请求超时"));
        }, timeoutMs)
      : null;

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } finally {
    cleanupExternalAbort();
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function normalizeReferenceImages(referenceImages: string[]): string[] {
  return referenceImages
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE));
      return;
    }

    const timeoutHandle = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", handleAbort);
      reject(createAbortError(IMAGE_GENERATION_CANCELED_MESSAGE));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function computeGreatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    const temp = right;
    right = left % right;
    left = temp;
  }

  return left || 1;
}

export function sizeToAspectRatio(size: string): string | null {
  const matched = size.match(/^(\d+)x(\d+)$/i);
  if (!matched) {
    return null;
  }

  const width = Number.parseInt(matched[1], 10);
  const height = Number.parseInt(matched[2], 10);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const gcd = computeGreatestCommonDivisor(width, height);
  const exactRatio = `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
  const supportedAspectRatios = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["5:4", 5 / 4],
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ] as const;

  if (supportedAspectRatios.some(([label]) => label === exactRatio)) {
    return exactRatio;
  }

  const numericRatio = width / height;
  const nearest = supportedAspectRatios.reduce<
    readonly [string, number] | null
  >((best, current) => {
    if (!best) {
      return current;
    }

    const bestDiff = Math.abs(numericRatio - best[1]);
    const currentDiff = Math.abs(numericRatio - current[1]);
    return currentDiff < bestDiff ? current : best;
  }, null);

  if (!nearest) {
    return null;
  }

  return Math.abs(numericRatio - nearest[1]) <= 0.08 ? nearest[0] : "auto";
}
