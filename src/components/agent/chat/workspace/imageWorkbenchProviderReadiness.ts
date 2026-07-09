export type ImageWorkbenchProvidersLoader = () => void | Promise<void>;
export type ImageWorkbenchProviderSelectionReader = () => boolean;

interface ImageWorkbenchProviderSelectionCommitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

const DEFAULT_IMAGE_WORKBENCH_PROVIDER_SELECTION_TIMEOUT_MS = 1_500;
const DEFAULT_IMAGE_WORKBENCH_PROVIDER_SELECTION_INTERVAL_MS = 16;

export async function ensureImageWorkbenchProviderSelectionCommitted(
  loader?: ImageWorkbenchProvidersLoader,
  isSelectionReady?: ImageWorkbenchProviderSelectionReader,
  options: ImageWorkbenchProviderSelectionCommitOptions = {},
): Promise<void> {
  let loaderSettled = false;
  const loaderPromise = Promise.resolve()
    .then(() => loader?.())
    .catch(() => undefined)
    .finally(() => {
      loaderSettled = true;
    });

  if (isSelectionReady?.()) {
    return;
  }

  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? DEFAULT_IMAGE_WORKBENCH_PROVIDER_SELECTION_TIMEOUT_MS,
  );
  const intervalMs = Math.max(
    0,
    options.intervalMs ?? DEFAULT_IMAGE_WORKBENCH_PROVIDER_SELECTION_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const delayMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    const delayPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
    if (loaderSettled) {
      await delayPromise;
    } else {
      await Promise.race([loaderPromise, delayPromise]);
    }
    if (isSelectionReady?.()) {
      return;
    }
  }
}
