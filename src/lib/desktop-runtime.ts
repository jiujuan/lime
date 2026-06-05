type LegacyDesktopHostInternals = {
  invoke?: unknown;
  transformCallback?: unknown;
};

const LEGACY_HOST_GLOBAL_KEY = ["__TA", "URI__"].join("");
const LEGACY_HOST_INTERNALS_KEY = ["__TA", "URI_INTERNALS__"].join("");

function getWindowObject(): (Window & typeof globalThis) | null {
  return typeof window === "undefined" ? null : window;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getLegacyDesktopHostGlobal(): Record<string, unknown> | null {
  const currentWindow = getWindowObject() as
    | ((Window & typeof globalThis) & Record<string, unknown>)
    | null;
  const value = currentWindow?.[LEGACY_HOST_GLOBAL_KEY];
  return isRecord(value) ? value : null;
}

function getLegacyDesktopHostInternals(): LegacyDesktopHostInternals | null {
  const currentWindow = getWindowObject() as
    | ((Window & typeof globalThis) & Record<string, unknown>)
    | null;
  const value = currentWindow?.[LEGACY_HOST_INTERNALS_KEY];
  return isRecord(value) ? value : null;
}

export function hasDesktopHostRuntimeMarkers(): boolean {
  const currentWindow = getWindowObject();
  if (!currentWindow) {
    return false;
  }

  return (
    Boolean(getLegacyDesktopHostGlobal()) ||
    LEGACY_HOST_INTERNALS_KEY in currentWindow
  );
}

export function hasDesktopHostInvokeCapability(): boolean {
  const legacyHostGlobal = getLegacyDesktopHostGlobal() as {
    core?: { invoke?: unknown };
    invoke?: unknown;
  } | null;
  const internals = getLegacyDesktopHostInternals();

  return (
    typeof legacyHostGlobal?.core?.invoke === "function" ||
    typeof legacyHostGlobal?.invoke === "function" ||
    typeof internals?.invoke === "function"
  );
}

export function hasDesktopHostEventCapability(): boolean {
  const legacyHostGlobal = getLegacyDesktopHostGlobal() as {
    event?: {
      listen?: unknown;
      emit?: unknown;
    };
  } | null;
  const internals = getLegacyDesktopHostInternals();

  return (
    typeof legacyHostGlobal?.event?.listen === "function" ||
    (typeof internals?.invoke === "function" &&
      typeof internals?.transformCallback === "function")
  );
}

export function hasDesktopHostEventListenerCapability(): boolean {
  const internals = getLegacyDesktopHostInternals();

  return (
    typeof internals?.invoke === "function" &&
    typeof internals?.transformCallback === "function"
  );
}
