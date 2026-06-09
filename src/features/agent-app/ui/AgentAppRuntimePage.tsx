import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { resolveOemCloudRuntimeContext } from "@/lib/api/oemCloudRuntime";
import {
  AGENT_APPS_CHANGED_EVENT,
  getAgentAppCloudCatalog,
  listInstalledAgentApps,
  startAgentAppUiRuntime,
  type AgentAppUiRuntimeStatus,
} from "@/lib/api/agentApps";
import type { AgentAppPageParams } from "@/types/page";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { buildCleanupPlan } from "../install/cleanupPlan";
import { checkReadiness } from "../readiness/checkReadiness";
import { buildLimeRuntimeProfileForInstalledState } from "../runtime-profile";
import { createAgentAppCapabilityDispatcher } from "../runtime/capabilityDispatcher";
import { evaluateAgentAppEntryRuntimeGuard } from "../runtime/entryRuntimeGuard";
import {
  createAgentAppHostBridge,
  type AgentAppHostAgentRunUiRequest,
  type AgentAppHostBridge,
  type AgentAppHostBridgeCapabilities,
  type AgentAppHostBridgeNotifyPayload,
} from "../runtime/hostBridge";
import { AgentRuntimeCapabilityHost } from "../runtime/agentRuntimeCapabilityHost";
import type {
  AgentAppRunProjectionAction,
  AgentAppRunProjectionActionControl,
} from "../runtime/agentUiProjectionViewModel";
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import { buildLimeCapabilityInvokeRequest } from "../sdk/capabilityContract";
import type {
  AgentAppTaskHostResponseActionType,
  CloudBootstrapApp,
  InstalledAgentAppState,
  ProjectedEntry,
} from "../types";
import { buildRuntimePackageLoadForPreview } from "./agentAppsRuntime";
import { resolveInstalledAgentAppDisplayName } from "./agentAppDisplay";
import {
  AgentRunHostDrawer,
  type AgentRunTranslator,
  type AgentRunUiState,
} from "./AgentRunHostDrawer";

const HOST_BRIDGE_DISPATCH_CAPABILITIES = new Set([
  "lime.capabilities",
  "lime.storage",
  "lime.artifacts",
  "lime.evidence",
  "lime.knowledge",
  "lime.agent",
  "lime.models",
  "lime.usage",
  "lime.skills",
  "lime.memory",
  "lime.context",
  "lime.search",
  "lime.browser",
  "lime.documents",
  "lime.media",
  "lime.mcp",
  "lime.terminal",
  "lime.connectors",
  "lime.cloudSession",
]);
const HOST_BRIDGE_KNOWN_CAPABILITIES = new Set([
  ...HOST_BRIDGE_DISPATCH_CAPABILITIES,
  "lime.workflow",
]);
const RUNTIME_PAGE_PROFILE = buildUiRuntimeCapabilityProfile({
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
});
const RUNTIME_PAGE_FLAGS = RUNTIME_PAGE_PROFILE.featureFlags;
const NEGATIVE_AGENT_RUN_ACTION_CONTROLS =
  new Set<AgentAppRunProjectionActionControl>(["reject", "interrupt", "stop"]);
const AGENT_RUN_UI_STORAGE_PREFIX = "lime.agentApp.hostAgentRunUi.v1";

function isUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
}

function resolveDefaultEntry(
  state: InstalledAgentAppState,
): ProjectedEntry | undefined {
  return (
    state.projection.entries.find(
      (entry) => entry.key === "dashboard" && isUiEntry(entry),
    ) ?? state.projection.entries.find((entry) => isUiEntry(entry))
  );
}

function resolveActiveEntry(
  state: InstalledAgentAppState,
  entryKey?: string,
): ProjectedEntry | undefined {
  const requested = state.projection.entries.find(
    (entry) => entry.key === entryKey && isUiEntry(entry),
  );
  return requested ?? resolveDefaultEntry(state);
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseAppVersion(
  value: string | undefined,
): [number, number, number] | null {
  const match = value?.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) {
    return null;
  }
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareAppVersion(
  left: string | undefined,
  right: string | undefined,
): number {
  const leftParts = parseAppVersion(left);
  const rightParts = parseAppVersion(right);
  if (!leftParts || !rightParts) {
    return 0;
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    const diff = leftParts[index] - rightParts[index];
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function hasNewerCloudVersion(
  state: InstalledAgentAppState | null,
  cloudApp: CloudBootstrapApp | undefined,
): boolean {
  if (!state || !cloudApp) {
    return false;
  }
  return compareAppVersion(cloudApp.version, state.identity.appVersion) > 0;
}

function sourceLabelKey(
  state: InstalledAgentAppState,
):
  | "agentApp.apps.runtime.appInfo.source.cloud"
  | "agentApp.apps.runtime.appInfo.source.local" {
  return state.identity.sourceKind === "cloud_release"
    ? "agentApp.apps.runtime.appInfo.source.cloud"
    : "agentApp.apps.runtime.appInfo.source.local";
}

function buildPreviewFromInstalledState(state: InstalledAgentAppState) {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: buildRuntimeReadinessFromInstalledState(state),
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

function buildRuntimeReadinessFromInstalledState(
  state: InstalledAgentAppState,
) {
  return checkReadiness({
    manifest: state.manifest,
    projection: state.projection,
    profile: RUNTIME_PAGE_PROFILE,
    setup: state.setup,
    checkedAt: state.readiness.checkedAt,
  });
}

function resolveHostBridgeCapabilities(
  state: InstalledAgentAppState,
): AgentAppHostBridgeCapabilities {
  const readiness = buildRuntimeReadinessFromInstalledState(state);
  const available = readiness.supportedCapabilities
    .filter(
      (item) =>
        item.enabled && HOST_BRIDGE_DISPATCH_CAPABILITIES.has(item.capability),
    )
    .map((item) => item.capability);
  available.push("lime.capabilities");
  const declared = state.projection.requiredCapabilities.map(
    (item) => item.capability,
  );
  const blocked = [
    ...HOST_BRIDGE_KNOWN_CAPABILITIES,
    ...readiness.missingCapabilities.map((item) => item.capability),
    ...declared,
  ].filter((capability) => !available.includes(capability));

  return {
    available,
    blocked,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAgentRunTaskId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return (
    readString(value.taskId) ??
    (isRecord(value.task) ? readString(value.task.taskId) : null) ??
    (isRecord(value.snapshot) ? readString(value.snapshot.taskId) : null)
  );
}

function shouldExposeCloudSession(state: InstalledAgentAppState): boolean {
  return state.projection.requiredCapabilities.some(
    (item) => item.capability === "lime.cloudSession",
  );
}

function normalizeAgentRunActionType(
  value: string | undefined,
): AgentAppTaskHostResponseActionType {
  if (
    value === "tool_confirmation" ||
    value === "ask_user" ||
    value === "elicitation"
  ) {
    return value;
  }
  return "ask_user";
}

function buildAgentRunActionResponse(
  control: AgentAppRunProjectionActionControl,
) {
  return {
    confirmed: !NEGATIVE_AGENT_RUN_ACTION_CONTROLS.has(control),
    response: control,
  };
}

function buildAgentRunUiStorageKey(
  appId: string | undefined,
  entryKey: string | undefined,
): string | null {
  if (!appId || !entryKey) {
    return null;
  }
  return `${AGENT_RUN_UI_STORAGE_PREFIX}:${appId}:${entryKey}`;
}

function readStoredAgentRunUi(
  storageKey: string | null,
): AgentRunUiState | null {
  if (!storageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    return {
      ...parsed,
      mode:
        parsed.mode === "modal" || parsed.mode === "page"
          ? parsed.mode
          : "drawer",
    } as AgentRunUiState;
  } catch {
    return null;
  }
}

function persistAgentRunUi(
  storageKey: string | null,
  run: AgentRunUiState | null,
) {
  if (!storageKey || typeof window === "undefined") {
    return;
  }
  try {
    if (!run) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(run));
  } catch {
    // sessionStorage can be unavailable in hardened WebViews; UI state remains in memory.
  }
}

function readAgentRunItemKey(item: unknown, index: number): string {
  if (!isRecord(item)) {
    return `${index}:${String(item).slice(0, 80)}`;
  }
  return [
    readString(item.eventId) ?? readString(item.id),
    readString(item.eventType) ??
      readString(item.type) ??
      readString(item.kind),
    readString(item.status) ?? readString(item.statusText),
    readString(item.message) ?? readString(item.title),
    readString(item.occurredAt) ??
      readString(item.at) ??
      readString(item.createdAt),
  ]
    .filter(Boolean)
    .join("|");
}

function mergeAgentRunItems(
  previous: unknown,
  next: unknown,
  limit = 40,
): unknown[] | undefined {
  const previousItems = Array.isArray(previous) ? previous : [];
  const nextItems = Array.isArray(next) ? next : [];
  if (!previousItems.length && !nextItems.length) {
    return undefined;
  }
  const merged: unknown[] = [];
  const indexByKey = new Map<string, number>();
  [...previousItems, ...nextItems].forEach((item, index) => {
    const key = readAgentRunItemKey(item, index);
    const stableKey = key || `${index}`;
    const existingIndex = indexByKey.get(stableKey);
    if (existingIndex === undefined) {
      indexByKey.set(stableKey, merged.length);
      merged.push(item);
      return;
    }
    merged[existingIndex] = item;
  });
  return merged.slice(-limit);
}

function mergeStringArray(
  previous: unknown,
  next: unknown,
): unknown[] | undefined {
  const merged = mergeAgentRunItems(previous, next);
  return merged?.length ? merged : undefined;
}

function mergeAgentRunProcess(previous: unknown, next: unknown): unknown {
  if (!isRecord(previous)) {
    return next ?? previous;
  }
  if (!isRecord(next)) {
    return previous;
  }
  const merged: Record<string, unknown> = {
    ...previous,
    ...next,
  };
  const timeline = mergeAgentRunItems(previous.timeline, next.timeline, 60);
  if (timeline) {
    merged.timeline = timeline;
  }
  const skillNames = mergeStringArray(previous.skillNames, next.skillNames);
  if (skillNames) {
    merged.skillNames = skillNames;
  }
  const invokedSkillNames = mergeStringArray(
    previous.invokedSkillNames,
    next.invokedSkillNames,
  );
  if (invokedSkillNames) {
    merged.invokedSkillNames = invokedSkillNames;
  }
  for (const key of ["streamText", "thinkingText", "executionText"]) {
    if (!readString(merged[key]) && readString(previous[key])) {
      merged[key] = previous[key];
    }
  }
  return merged;
}

function mergeAgentRunPayload(previous: unknown, next: unknown): unknown {
  if (next === null || next === undefined) {
    return previous;
  }
  if (!isRecord(previous) || !isRecord(next)) {
    return next;
  }
  return {
    ...previous,
    ...next,
    events: mergeAgentRunItems(previous.events, next.events, 80),
    taskEvents: mergeAgentRunItems(previous.taskEvents, next.taskEvents, 80),
    runtimeProcess: mergeAgentRunProcess(
      previous.runtimeProcess,
      next.runtimeProcess,
    ),
    process: mergeAgentRunProcess(previous.process, next.process),
  };
}

function shouldMergeAgentRunUi(
  previous: AgentRunUiState | null,
  request: AgentAppHostAgentRunUiRequest,
): previous is AgentRunUiState {
  if (!previous) {
    return false;
  }
  const previousTaskId = readAgentRunTaskId(previous);
  const nextTaskId = readAgentRunTaskId(request);
  if (previousTaskId && nextTaskId && previousTaskId !== nextTaskId) {
    return false;
  }
  if (
    previous.bridgeAction &&
    request.bridgeAction &&
    previous.bridgeAction !== request.bridgeAction
  ) {
    return false;
  }
  return true;
}

interface AgentRunDismissalKey {
  taskId: string | null;
  bridgeAction: string | null;
}

function buildAgentRunDismissalKey(value: unknown): AgentRunDismissalKey {
  return {
    taskId: readAgentRunTaskId(value),
    bridgeAction: isRecord(value) ? readString(value.bridgeAction) : null,
  };
}

function hasAgentRunDismissalKey(key: AgentRunDismissalKey): boolean {
  return Boolean(key.taskId || key.bridgeAction);
}

function mergeAgentRunDismissalKey(
  requestKey: AgentRunDismissalKey,
  previousKey: AgentRunDismissalKey,
): AgentRunDismissalKey {
  return {
    taskId: requestKey.taskId ?? previousKey.taskId,
    bridgeAction: requestKey.bridgeAction ?? previousKey.bridgeAction,
  };
}

function matchesDismissedAgentRun(
  dismissed: AgentRunDismissalKey | null,
  request: AgentAppHostAgentRunUiRequest,
): boolean {
  if (!dismissed) {
    return false;
  }
  const next = buildAgentRunDismissalKey(request);
  let compared = false;
  if (dismissed.taskId && next.taskId) {
    compared = true;
    if (dismissed.taskId === next.taskId) {
      return true;
    }
  }
  if (dismissed.bridgeAction && next.bridgeAction) {
    compared = true;
    if (dismissed.bridgeAction === next.bridgeAction) {
      return true;
    }
  }
  return (
    !compared &&
    !hasAgentRunDismissalKey(dismissed) &&
    !hasAgentRunDismissalKey(next)
  );
}

function shouldCloseAgentRunUi(
  previous: AgentRunUiState,
  request: Pick<AgentAppHostAgentRunUiRequest, "taskId" | "bridgeAction">,
): boolean {
  const previousKey = buildAgentRunDismissalKey(previous);
  const requestKey = buildAgentRunDismissalKey(request);
  const sameTask =
    !requestKey.taskId ||
    !previousKey.taskId ||
    previousKey.taskId === requestKey.taskId;
  const sameBridgeAction =
    !requestKey.bridgeAction ||
    !previousKey.bridgeAction ||
    previousKey.bridgeAction === requestKey.bridgeAction;
  return sameTask && sameBridgeAction;
}

function mergeAgentRunUiState(
  previous: AgentRunUiState | null,
  request: AgentAppHostAgentRunUiRequest,
  now: string,
  fallbackMode: AgentRunUiState["mode"],
): AgentRunUiState {
  const base = shouldMergeAgentRunUi(previous, request) ? previous : null;
  return {
    ...base,
    ...request,
    taskId: request.taskId ?? base?.taskId,
    bridgeAction: request.bridgeAction ?? base?.bridgeAction,
    title: request.title ?? base?.title,
    mode: request.mode ?? base?.mode ?? fallbackMode,
    expectedOutput: request.expectedOutput ?? base?.expectedOutput,
    runtimeFacts: request.runtimeFacts ?? base?.runtimeFacts,
    task: mergeAgentRunPayload(base?.task, request.task),
    snapshot: mergeAgentRunPayload(base?.snapshot, request.snapshot),
    runtimeProcess: mergeAgentRunProcess(
      base?.runtimeProcess,
      request.runtimeProcess,
    ),
    events: mergeAgentRunItems(base?.events, request.events, 100),
    openedAt: base?.openedAt ?? now,
    updatedAt: now,
  };
}

export function AgentAppRuntimePage({
  pageParams,
}: {
  pageParams?: AgentAppPageParams;
}) {
  const { t } = useTranslation("agent");
  const [installed, setInstalled] = useState<InstalledAgentAppState[]>([]);
  const [loading, setLoading] = useState(true);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtime, setRuntime] = useState<AgentAppUiRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [agentRunUi, setAgentRunUi] = useState<AgentRunUiState | null>(null);
  const [agentRunExpanded, setAgentRunExpanded] = useState(false);
  const [cloudApps, setCloudApps] = useState<CloudBootstrapApp[]>([]);
  const [appInfoOpen, setAppInfoOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const hostBridgeRef = useRef<AgentAppHostBridge | null>(null);
  const dismissedAgentRunRef = useRef<AgentRunDismissalKey | null>(null);

  const selected = useMemo(
    () =>
      installed.find((state) => state.appId === pageParams?.appId) ??
      installed[0] ??
      null,
    [installed, pageParams?.appId],
  );
  const activeEntry = selected
    ? resolveActiveEntry(selected, pageParams?.entryKey)
    : undefined;
  const agentRunStorageKey = useMemo(
    () => buildAgentRunUiStorageKey(selected?.appId, activeEntry?.key),
    [activeEntry?.key, selected?.appId],
  );
  const agentRunStorageKeyRef = useRef<string | null>(agentRunStorageKey);
  const displayName = selected
    ? resolveInstalledAgentAppDisplayName(selected)
    : t("agentApp.apps.runtime.unavailable");
  const selectedCloudApp = useMemo(
    () => cloudApps.find((app) => app.appId === selected?.appId),
    [cloudApps, selected?.appId],
  );
  const upgradeAvailable = hasNewerCloudVersion(selected, selectedCloudApp);
  const capabilityHost = useMemo(() => {
    if (!selected) {
      return null;
    }
    const adapterHost = new AdapterCapabilityHost({
      preview: buildPreviewFromInstalledState(selected),
      store: new InMemoryAgentAppCapabilityStore(),
    });
    return new AgentRuntimeCapabilityHost({
      delegate: adapterHost,
      appId: selected.appId,
      appVersion: selected.identity.appVersion,
      packageHash: selected.identity.packageHash,
      manifestHash: selected.identity.manifestHash,
    });
  }, [selected]);
  const hostBridgeCapabilities = useMemo(
    () => (selected ? resolveHostBridgeCapabilities(selected) : undefined),
    [selected],
  );
  const hostBridgeCloud = useCallback(() => {
    if (!selected || !shouldExposeCloudSession(selected)) {
      return undefined;
    }
    const cloudRuntime = resolveOemCloudRuntimeContext();
    return cloudRuntime
      ? {
          controlPlaneBaseUrl: cloudRuntime.controlPlaneBaseUrl,
          tenantId: cloudRuntime.tenantId,
          hasSession: Boolean(cloudRuntime.sessionToken),
        }
      : undefined;
  }, [selected]);
  const runtimeProfile = useMemo(
    () =>
      selected
        ? buildLimeRuntimeProfileForInstalledState({
            state: selected,
            hostProfile: RUNTIME_PAGE_PROFILE,
          })
        : null,
    [selected],
  );
  const dispatchCapability = useMemo(() => {
    if (!selected || !capabilityHost || !activeEntry || !runtimeProfile) {
      return undefined;
    }
    return createAgentAppCapabilityDispatcher({
      host: capabilityHost,
      projection: selected.projection,
      entryKey: activeEntry.key,
      profile: RUNTIME_PAGE_PROFILE,
      runtimeProfile,
      manifestVersion: selected.manifest.manifestVersion,
      agentRuntime: selected.manifest.agentRuntime,
      requirements: selected.manifest.requirements,
      boundary: selected.manifest.boundary,
      integrations: selected.manifest.integrations,
      operations: selected.manifest.operations,
    });
  }, [activeEntry, capabilityHost, runtimeProfile, selected]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInstalledAgentApps();
      setInstalled(result.states.filter((state) => !state.disabled));
    } catch (error) {
      setInstalled([]);
      setRuntimeError(normalizeErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") {
      return;
    }

    const reload = () => {
      void refresh();
    };
    window.addEventListener(AGENT_APPS_CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(AGENT_APPS_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    getAgentAppCloudCatalog()
      .then((result) => {
        if (!disposed) {
          setCloudApps(result.payload.apps);
        }
      })
      .catch(() => {
        if (!disposed) {
          setCloudApps([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const openRuntime = useCallback(async () => {
    if (!selected || !activeEntry || !runtimeProfile) {
      setRuntime(null);
      setRuntimeError(t("agentApp.apps.runtime.unavailable"));
      return;
    }

    setRuntimeLoading(true);
    setRuntime(null);
    setRuntimeError(null);
    try {
      const preview = buildPreviewFromInstalledState(selected);
      const guard = evaluateAgentAppEntryRuntimeGuard({
        preview,
        entryKey: activeEntry.key,
        flags: RUNTIME_PAGE_FLAGS,
        operation: "mount-ui",
        runtimePackageLoad: buildRuntimePackageLoadForPreview(preview),
        permissionDecision: "accepted",
        installMode: selected.installMode,
        runtimeProfile,
        lifecycle: {
          disabled: selected.disabled,
        },
      });
      if (guard.status !== "allow") {
        throw new Error(t(`agentApp.lab.guard.summary.${guard.status}`));
      }
      const status = await startAgentAppUiRuntime({
        appId: selected.appId,
        entryKey: activeEntry.key,
      });
      if (status.status !== "running" || !status.entryUrl) {
        throw new Error(
          status.message ?? t("agentApp.apps.runtime.openFailed"),
        );
      }
      setRuntime(status);
    } catch (error) {
      setRuntimeError(normalizeErrorMessage(error));
    } finally {
      setRuntimeLoading(false);
    }
  }, [activeEntry, runtimeProfile, selected, t]);

  useEffect(() => {
    if (loading || !selected) {
      return;
    }
    void openRuntime();
  }, [loading, openRuntime, pageParams?.launchRequestKey, retryKey, selected]);

  const notifyFromApp = useCallback(
    ({ message, level }: AgentAppHostBridgeNotifyPayload) => {
      if (level === "error") {
        toast.error(message);
        return;
      }
      if (level === "success") {
        toast.success(message);
        return;
      }
      toast(message);
    },
    [],
  );
  const translateAgentRun = useCallback<AgentRunTranslator>(
    (key, params) => (t as unknown as AgentRunTranslator)(key, params),
    [t],
  );

  useEffect(() => {
    dismissedAgentRunRef.current = null;
    agentRunStorageKeyRef.current = agentRunStorageKey;
    setAgentRunUi(readStoredAgentRunUi(agentRunStorageKey));
    setAgentRunExpanded(false);
    setAppInfoOpen(false);
  }, [agentRunStorageKey]);

  const openAgentRunUi = useCallback(
    (request: AgentAppHostAgentRunUiRequest) => {
      const now = new Date().toISOString();
      const mode = request.mode ?? "drawer";
      setAgentRunUi((previous) => {
        if (
          !previous &&
          matchesDismissedAgentRun(dismissedAgentRunRef.current, request)
        ) {
          return null;
        }
        dismissedAgentRunRef.current = null;
        const next = mergeAgentRunUiState(previous, request, now, mode);
        persistAgentRunUi(agentRunStorageKeyRef.current, next);
        return next;
      });
      return {
        opened: true as const,
        surface: "host_agent_run" as const,
        mode,
        taskId: request.taskId,
      };
    },
    [],
  );

  const updateAgentRunUi = useCallback(
    (request: AgentAppHostAgentRunUiRequest) => {
      const now = new Date().toISOString();
      setAgentRunUi((previous) => {
        if (
          !previous &&
          matchesDismissedAgentRun(dismissedAgentRunRef.current, request)
        ) {
          return null;
        }
        const next = mergeAgentRunUiState(
          previous,
          request,
          now,
          previous?.mode ?? "drawer",
        );
        persistAgentRunUi(agentRunStorageKeyRef.current, next);
        return next;
      });
      return {
        updated: true as const,
        surface: "host_agent_run" as const,
        taskId: request.taskId,
      };
    },
    [],
  );

  const closeAgentRunUi = useCallback(
    (
      request: Pick<AgentAppHostAgentRunUiRequest, "taskId" | "bridgeAction">,
    ) => {
      const requestKey = buildAgentRunDismissalKey(request);
      setAgentRunUi((previous) => {
        if (!previous) {
          dismissedAgentRunRef.current = requestKey;
          persistAgentRunUi(agentRunStorageKeyRef.current, null);
          return null;
        }
        if (!shouldCloseAgentRunUi(previous, request)) {
          return previous;
        }
        dismissedAgentRunRef.current = mergeAgentRunDismissalKey(
          requestKey,
          buildAgentRunDismissalKey(previous),
        );
        persistAgentRunUi(agentRunStorageKeyRef.current, null);
        return null;
      });
      return {
        closed: true as const,
        surface: "host_agent_run" as const,
        taskId: request.taskId,
      };
    },
    [],
  );

  const submitAgentRunAction = useCallback(
    async (
      action: AgentAppRunProjectionAction,
      control: AgentAppRunProjectionActionControl,
    ) => {
      const taskId = action.taskId ?? readAgentRunTaskId(agentRunUi);
      if (!dispatchCapability || !selected || !taskId) {
        toast.error(t("agentApp.apps.toast.failed"));
        return;
      }
      const actionType = normalizeAgentRunActionType(action.actionType);
      const response = buildAgentRunActionResponse(control);
      const input = {
        taskId,
        requestId: action.actionId,
        actionType,
        confirmed: response.confirmed,
        response: response.response,
        metadata: {
          source: "host_agent_run_panel",
          control,
        },
        actionScope: {
          sessionId: action.sessionId,
          threadId: action.threadId,
          turnId: action.turnId,
        },
      };
      const requestId = `agent-run-action:${action.actionId}:${control}`;
      const invokeRequest = buildLimeCapabilityInvokeRequest({
        capability: "lime.agent",
        method: "submitHostResponse",
        args: input,
        requestId,
        provenance: {
          appId: selected.appId,
          entryKey: activeEntry?.key,
          packageHash: selected.identity.packageHash,
          manifestHash: selected.identity.manifestHash,
          taskId,
        },
      });

      try {
        await dispatchCapability({
          appId: selected.appId,
          entryKey: activeEntry?.key,
          requestId,
          capability: "lime.agent",
          method: "submitHostResponse",
          input,
          invokeRequest,
          rawPayload: invokeRequest as unknown as Record<string, unknown>,
        });
        const now = new Date().toISOString();
        setAgentRunUi((previous) => {
          const next = mergeAgentRunUiState(
            previous,
            {
              taskId,
              events: [
                {
                  id: requestId,
                  type: "action.resolved",
                  actionId: action.actionId,
                  taskId,
                  status: "resolved",
                  control: "none",
                  payload: {
                    actionType,
                    controls: [],
                    preview: action.preview,
                    response: response.response,
                  },
                },
              ],
            },
            now,
            previous?.mode ?? "drawer",
          );
          persistAgentRunUi(agentRunStorageKeyRef.current, next);
          return next;
        });
      } catch (error) {
        toast.error(normalizeErrorMessage(error));
      }
    },
    [activeEntry?.key, agentRunUi, dispatchCapability, selected, t],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !runtime?.entryUrl || !selected || !activeEntry) {
      hostBridgeRef.current?.dispose();
      hostBridgeRef.current = null;
      return;
    }

    try {
      const bridge = createAgentAppHostBridge({
        frame,
        appId: selected.appId,
        entryKey: activeEntry.key,
        displayName,
        entryRoute: activeEntry.route,
        entryUrl: runtime.entryUrl,
        notify: notifyFromApp,
        openAgentRunUi,
        updateAgentRunUi,
        closeAgentRunUi,
        cloud: hostBridgeCloud,
        capabilities: hostBridgeCapabilities,
        dispatchCapability,
      });
      hostBridgeRef.current = bridge;
      const cleanup = bridge.start();
      return () => {
        if (hostBridgeRef.current === bridge) {
          hostBridgeRef.current = null;
        }
        cleanup();
      };
    } catch (error) {
      setRuntimeError(normalizeErrorMessage(error));
      return;
    }
  }, [
    activeEntry,
    closeAgentRunUi,
    dispatchCapability,
    displayName,
    hostBridgeCloud,
    hostBridgeCapabilities,
    notifyFromApp,
    openAgentRunUi,
    runtime?.entryUrl,
    selected,
    updateAgentRunUi,
  ]);

  const handleFrameLoad = useCallback(() => {
    hostBridgeRef.current?.sendSnapshot();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t("agentApp.apps.runtime.loading")}
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-center text-sm text-slate-500">
        {t("agentApp.apps.runtime.empty")}
      </div>
    );
  }

  if (runtimeError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-6 shadow-sm shadow-slate-950/5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
            {t("agentApp.apps.runtime.openFailed")}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-950">
            {displayName}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {runtimeError}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={runtimeLoading}
            onClick={() => setRetryKey((value) => value + 1)}
          >
            <RefreshCw size={16} />
            {t("agentApp.apps.runtime.retry")}
          </button>
        </section>
      </div>
    );
  }

  if (runtimeLoading || !runtime?.entryUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        {t("agentApp.apps.runtime.opening", { name: displayName })}
      </div>
    );
  }

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-white"
      data-testid="agent-app-runtime-surface"
    >
      <iframe
        ref={frameRef}
        title={displayName}
        src={runtime.entryUrl}
        className="h-full w-full border-0 bg-white"
        data-testid="agent-app-runtime-frame"
        onLoad={handleFrameLoad}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads allow-modals"
      />
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
        {appInfoOpen ? (
          <section
            className="pointer-events-auto w-64 rounded-lg border border-border bg-background p-3 text-left shadow-md shadow-slate-950/10"
            data-testid="agent-app-host-app-info-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("agentApp.apps.runtime.appInfo.version", {
                    version: selected.identity.appVersion,
                  })}
                </p>
              </div>
              {upgradeAvailable ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {t("agentApp.apps.runtime.appInfo.upgradeBadge")}
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("agentApp.apps.runtime.appInfo.source")}
                </dt>
                <dd className="font-medium text-foreground">
                  {t(sourceLabelKey(selected))}
                </dd>
              </div>
              {selectedCloudApp?.version ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("agentApp.apps.runtime.appInfo.latestVersion")}
                  </dt>
                  <dd
                    className={
                      upgradeAvailable
                        ? "font-semibold text-rose-700 dark:text-rose-300"
                        : "font-medium text-foreground"
                    }
                  >
                    v{selectedCloudApp.version}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("agentApp.apps.runtime.appInfo.entry")}
                </dt>
                <dd className="max-w-32 truncate font-medium text-foreground">
                  {activeEntry?.title ?? activeEntry?.key ?? "-"}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
        <button
          type="button"
          className="pointer-events-auto relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm shadow-slate-950/10 transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          aria-label={t("agentApp.apps.runtime.appInfo.toggle")}
          aria-expanded={appInfoOpen}
          data-testid="agent-app-host-app-info-toggle"
          onClick={() => setAppInfoOpen((value) => !value)}
        >
          <Info size={14} aria-hidden="true" />
          {upgradeAvailable ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-rose-500"
              data-testid="agent-app-host-app-info-update-dot"
            />
          ) : null}
        </button>
      </div>
      {agentRunUi ? (
        <AgentRunHostDrawer
          run={agentRunUi}
          displayName={displayName}
          expanded={agentRunExpanded}
          onExpand={() => {
            setAgentRunExpanded(true);
          }}
          onCollapse={() => {
            setAgentRunExpanded(false);
          }}
          onClose={() => {
            setAgentRunExpanded(false);
            closeAgentRunUi({
              taskId: readAgentRunTaskId(agentRunUi) ?? agentRunUi.taskId,
              bridgeAction: agentRunUi.bridgeAction,
            });
          }}
          onAction={submitAgentRunAction}
          t={translateAgentRun}
        />
      ) : null}
    </div>
  );
}
