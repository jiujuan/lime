const MODULE_IMPORT_FAILURE_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
] as const;
const REACT_FAST_REFRESH_HOOK_FAILURE_PATTERNS = [
  "Should have a queue. This is likely a bug in React.",
  "Rendered fewer hooks than expected.",
  "Rendered more hooks than during the previous render.",
  "React has detected a change in the order of Hooks called by",
] as const;
const RESOURCE_RELOAD_PARAM = "__lime_resource_reload";
const MODULE_IMPORT_AUTO_RELOAD_SESSION_KEY =
  "lime_module_import_auto_reload_v1";
const REACT_FAST_REFRESH_HOOK_AUTO_RELOAD_SESSION_KEY =
  "lime_react_fast_refresh_hook_auto_reload_v1";

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export function isModuleImportFailureErrorMessage(message: string): boolean {
  return MODULE_IMPORT_FAILURE_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

export function isReactFastRefreshHookFailureErrorMessage(
  message: string,
): boolean {
  return REACT_FAST_REFRESH_HOOK_FAILURE_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

function normalizeModuleImportRecoveryLocation(currentHref: string): string {
  const normalizedUrl = new URL(currentHref);
  normalizedUrl.searchParams.delete(RESOURCE_RELOAD_PARAM);
  return normalizedUrl.toString();
}

function resolveModuleImportRecoveryFingerprint(
  currentHref: string,
  appVersion: string,
): string {
  const version = appVersion.trim() || "unknown";
  return `${version}::${normalizeModuleImportRecoveryLocation(currentHref)}`;
}

function prepareAutoReloadOnce(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
  storageKey: string,
): string | null {
  const fingerprint = resolveModuleImportRecoveryFingerprint(
    currentHref,
    appVersion,
  );

  try {
    if (storage.getItem(storageKey) === fingerprint) {
      return null;
    }

    storage.setItem(storageKey, fingerprint);
  } catch {
    return null;
  }

  return buildCrashRecoveryReloadUrl(currentHref, `${Date.now()}`);
}

function finalizeAutoReload(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
  storageKey: string,
): void {
  const fingerprint = resolveModuleImportRecoveryFingerprint(
    currentHref,
    appVersion,
  );

  try {
    if (storage.getItem(storageKey) === fingerprint) {
      storage.removeItem(storageKey);
    }
  } catch {
    // 忽略 sessionStorage 访问失败，避免影响正常启动
  }
}

export function buildCrashRecoveryReloadUrl(
  currentHref: string,
  cacheBust: string,
): string {
  const nextUrl = new URL(currentHref);
  nextUrl.searchParams.set(RESOURCE_RELOAD_PARAM, cacheBust);
  return nextUrl.toString();
}

export function stripCrashRecoveryReloadUrl(currentHref: string): string {
  const nextUrl = new URL(currentHref);
  nextUrl.searchParams.delete(RESOURCE_RELOAD_PARAM);
  return nextUrl.toString();
}

export function prepareModuleImportAutoReload(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
): string | null {
  return prepareAutoReloadOnce(
    currentHref,
    appVersion,
    storage,
    MODULE_IMPORT_AUTO_RELOAD_SESSION_KEY,
  );
}

export function prepareReactFastRefreshHookAutoReload(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
): string | null {
  return prepareAutoReloadOnce(
    currentHref,
    appVersion,
    storage,
    REACT_FAST_REFRESH_HOOK_AUTO_RELOAD_SESSION_KEY,
  );
}

export function finalizeModuleImportAutoReload(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
  history: HistoryLike,
): void {
  finalizeAutoReload(
    currentHref,
    appVersion,
    storage,
    MODULE_IMPORT_AUTO_RELOAD_SESSION_KEY,
  );
  finalizeCrashRecoveryReloadUrl(currentHref, history);
}

export function finalizeCrashRecoveryAutoReload(
  currentHref: string,
  appVersion: string,
  storage: SessionStorageLike,
  history: HistoryLike,
): void {
  finalizeAutoReload(
    currentHref,
    appVersion,
    storage,
    MODULE_IMPORT_AUTO_RELOAD_SESSION_KEY,
  );
  finalizeAutoReload(
    currentHref,
    appVersion,
    storage,
    REACT_FAST_REFRESH_HOOK_AUTO_RELOAD_SESSION_KEY,
  );
  finalizeCrashRecoveryReloadUrl(currentHref, history);
}

function finalizeCrashRecoveryReloadUrl(
  currentHref: string,
  history: HistoryLike,
): void {
  const cleanUrl = stripCrashRecoveryReloadUrl(currentHref);
  if (cleanUrl === currentHref) {
    return;
  }

  try {
    history.replaceState(null, "", cleanUrl);
  } catch {
    // 忽略 history 写入失败，最多保留 query 参数，不阻断页面渲染
  }
}
