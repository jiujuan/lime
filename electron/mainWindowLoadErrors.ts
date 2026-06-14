export interface MainWindowLoadState {
  appQuitting?: boolean;
  windowDestroyed?: boolean;
  webContentsDestroyed?: boolean;
}

export function isNavigationAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("ERR_ABORTED") ||
      error.message.includes("ERR_FAILED (-3)"))
  );
}

export function isWindowLifecycleLoadAbort(
  error: unknown,
  state: MainWindowLoadState,
): boolean {
  if (!(error instanceof Error) || !error.message.includes("ERR_FAILED (-2)")) {
    return false;
  }
  return Boolean(
    state.appQuitting || state.windowDestroyed || state.webContentsDestroyed,
  );
}

export function isMainWindowRendererLoadInterruption(
  error: unknown,
  state: MainWindowLoadState,
): boolean {
  return isNavigationAbortError(error) || isWindowLifecycleLoadAbort(error, state);
}
