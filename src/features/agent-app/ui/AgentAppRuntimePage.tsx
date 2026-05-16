import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listInstalledAgentApps,
  startAgentAppUiRuntime,
  type AgentAppUiRuntimeStatus,
} from "@/lib/api/agentApps";
import type { AgentAppPageParams } from "@/types/page";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { buildCleanupPlan } from "../install/cleanupPlan";
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
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import type { InstalledAgentAppState, ProjectedEntry } from "../types";
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

function buildPreviewFromInstalledState(state: InstalledAgentAppState) {
  return {
    identity: state.identity,
    manifest: state.manifest,
    projection: state.projection,
    readiness: state.readiness,
    cleanupPlan: buildCleanupPlan({
      projection: state.projection,
      generatedAt: state.updatedAt,
    }),
  };
}

function resolveHostBridgeCapabilities(
  state: InstalledAgentAppState,
): AgentAppHostBridgeCapabilities {
  const available = state.readiness.supportedCapabilities
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
    ...state.readiness.missingCapabilities.map((item) => item.capability),
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

function readAgentRunItemKey(item: unknown, index: number): string {
  if (!isRecord(item)) {
    return `${index}:${String(item).slice(0, 80)}`;
  }
  return [
    readString(item.eventId) ?? readString(item.id),
    readString(item.eventType) ?? readString(item.type) ?? readString(item.kind),
    readString(item.status) ?? readString(item.statusText),
    readString(item.message) ?? readString(item.title),
    readString(item.occurredAt) ?? readString(item.at) ?? readString(item.createdAt),
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

function mergeStringArray(previous: unknown, next: unknown): unknown[] | undefined {
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const hostBridgeRef = useRef<AgentAppHostBridge | null>(null);

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
  const displayName = selected
    ? resolveInstalledAgentAppDisplayName(selected)
    : t("agentApp.apps.runtime.unavailable");
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
  const dispatchCapability = useMemo(() => {
    if (!selected || !capabilityHost || !activeEntry) {
      return undefined;
    }
    return createAgentAppCapabilityDispatcher({
      host: capabilityHost,
      projection: selected.projection,
      entryKey: activeEntry.key,
      profile: RUNTIME_PAGE_PROFILE,
      manifestVersion: selected.manifest.manifestVersion,
      agentRuntime: selected.manifest.agentRuntime,
      requirements: selected.manifest.requirements,
      boundary: selected.manifest.boundary,
      integrations: selected.manifest.integrations,
      operations: selected.manifest.operations,
    });
  }, [activeEntry, capabilityHost, selected]);

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
  }, [refresh]);

  const openRuntime = useCallback(async () => {
    if (!selected || !activeEntry) {
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
  }, [activeEntry, selected, t]);

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
    setAgentRunUi(null);
    setAgentRunExpanded(false);
  }, [selected?.appId, activeEntry?.key]);

  const openAgentRunUi = useCallback((request: AgentAppHostAgentRunUiRequest) => {
    const now = new Date().toISOString();
    const mode = request.mode ?? "drawer";
    setAgentRunUi((previous) =>
      mergeAgentRunUiState(previous, request, now, mode),
    );
    return {
      opened: true as const,
      surface: "host_agent_run" as const,
      mode,
      taskId: request.taskId,
    };
  }, []);

  const updateAgentRunUi = useCallback((request: AgentAppHostAgentRunUiRequest) => {
    const now = new Date().toISOString();
    setAgentRunUi((previous) =>
      mergeAgentRunUiState(previous, request, now, previous?.mode ?? "drawer"),
    );
    return {
      updated: true as const,
      surface: "host_agent_run" as const,
      taskId: request.taskId,
    };
  }, []);

  const closeAgentRunUi = useCallback(
    (request: Pick<AgentAppHostAgentRunUiRequest, "taskId" | "bridgeAction">) => {
      setAgentRunUi((previous) => {
        if (!previous) {
          return null;
        }
        const sameTask =
          !request.taskId || !previous.taskId || previous.taskId === request.taskId;
        const sameBridgeAction =
          !request.bridgeAction ||
          !previous.bridgeAction ||
          previous.bridgeAction === request.bridgeAction;
        return sameTask && sameBridgeAction ? null : previous;
      });
      return {
        closed: true as const,
        surface: "host_agent_run" as const,
        taskId: request.taskId,
      };
    },
    [],
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
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
      />
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
              taskId: agentRunUi.taskId,
              bridgeAction: agentRunUi.bridgeAction,
            });
          }}
          t={translateAgentRun}
        />
      ) : null}
    </div>
  );
}
