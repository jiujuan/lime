export type ImageWorkbenchProvidersLoader = () => void | Promise<void>;
export type ImageWorkbenchProviderSelectionReader = () => boolean;

export async function ensureImageWorkbenchProviderSelectionCommitted(
  loader?: ImageWorkbenchProvidersLoader,
  isSelectionReady?: ImageWorkbenchProviderSelectionReader,
): Promise<void> {
  void loader?.();
  for (let index = 0; index < 5; index += 1) {
    if (isSelectionReady?.()) {
      return;
    }
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
