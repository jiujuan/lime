import type { Config, DeveloperConfig } from "@/lib/api/appConfig";

const DEFAULT_DEVELOPER_CONFIG: DeveloperConfig = {
  workspace_harness_enabled: false,
  claw_trace: {
    alert_enabled: false,
    alert_notification_enabled: false,
    enabled: false,
    level: "summary",
    sample_rate: 1,
  },
};
const WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY =
  "lime:debug:workspace-harness-enabled:v1";
const CLAW_TRACE_DEBUG_OVERRIDE_KEY = "lime:debug:claw-trace-enabled:v1";

function normalizeBooleanDebugOverride(
  rawValue: string | null,
): boolean | null {
  const raw = rawValue?.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (["1", "true", "enabled", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "disabled", "off"].includes(raw)) {
    return false;
  }

  return null;
}

function readBooleanLocalStorageOverride(key: string): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeBooleanDebugOverride(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function normalizeSampleRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeDeveloperConfig(
  config?: DeveloperConfig | null,
): DeveloperConfig {
  return {
    ...DEFAULT_DEVELOPER_CONFIG,
    ...(config ?? {}),
    claw_trace: normalizeClawTraceConfig(config?.claw_trace),
  };
}

export function normalizeClawTraceConfig(
  config?: DeveloperConfig["claw_trace"] | null,
): NonNullable<DeveloperConfig["claw_trace"]> {
  return {
    alert_enabled: config?.alert_enabled === true,
    alert_notification_enabled: config?.alert_notification_enabled === true,
    enabled: config?.enabled === true,
    level: config?.level === "debug" ? "debug" : "summary",
    sample_rate: normalizeSampleRate(config?.sample_rate),
  };
}

export function isWorkspaceHarnessEnabled(
  config?: Pick<Config, "developer"> | null,
): boolean {
  return (
    normalizeDeveloperConfig(config?.developer).workspace_harness_enabled ===
    true
  );
}

export function readWorkspaceHarnessDebugOverride(): boolean | null {
  return readBooleanLocalStorageOverride(WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY);
}

export function resolveWorkspaceHarnessEnabled(
  config?: Pick<Config, "developer"> | null,
): boolean {
  const debugOverride = readWorkspaceHarnessDebugOverride();
  if (debugOverride !== null) {
    return debugOverride;
  }

  return isWorkspaceHarnessEnabled(config);
}

export function isClawTraceEnabled(
  config?: Pick<Config, "developer"> | null,
): boolean {
  const traceConfig = normalizeClawTraceConfig(config?.developer?.claw_trace);
  return traceConfig.enabled === true && (traceConfig.sample_rate ?? 0) > 0;
}

export function readClawTraceDebugOverride(): boolean | null {
  return readBooleanLocalStorageOverride(CLAW_TRACE_DEBUG_OVERRIDE_KEY);
}

export function resolveClawTraceEnabled(
  config?: Pick<Config, "developer"> | null,
): boolean {
  const debugOverride = readClawTraceDebugOverride();
  if (debugOverride !== null) {
    return debugOverride;
  }

  return isClawTraceEnabled(config);
}

export { CLAW_TRACE_DEBUG_OVERRIDE_KEY, WORKSPACE_HARNESS_DEBUG_OVERRIDE_KEY };
