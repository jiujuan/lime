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
  type AgentAppHostBridge,
  type AgentAppHostBridgeCapabilities,
  type AgentAppHostBridgeNotifyPayload,
} from "../runtime/hostBridge";
import { AgentRuntimeCapabilityHost } from "../runtime/agentRuntimeCapabilityHost";
import { buildUiRuntimeCapabilityProfile } from "../runtime/uiRuntimeCapabilityProfile";
import type { InstalledAgentAppState, ProjectedEntry } from "../types";
import { buildRuntimePackageLoadForPreview } from "./agentAppsRuntime";
import { resolveInstalledAgentAppDisplayName } from "./agentAppDisplay";

const HOST_BRIDGE_DISPATCH_CAPABILITIES = new Set([
  "lime.storage",
  "lime.artifacts",
  "lime.evidence",
  "lime.knowledge",
  "lime.agent",
]);
const HOST_BRIDGE_KNOWN_CAPABILITIES = new Set([
  ...HOST_BRIDGE_DISPATCH_CAPABILITIES,
  "lime.workflow",
]);
const RUNTIME_PAGE_FLAGS = buildUiRuntimeCapabilityProfile({
  realAdapterEnabled: true,
  uiRuntimeEnabled: true,
}).featureFlags;

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
    dispatchCapability,
    displayName,
    hostBridgeCapabilities,
    notifyFromApp,
    runtime?.entryUrl,
    selected,
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
      className="h-full min-h-0 overflow-hidden bg-white"
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
    </div>
  );
}
