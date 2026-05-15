import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import {
  buildInstalledAgentAppState,
  InMemoryAgentAppPersistenceDriver,
  LocalInstalledAgentAppStateRepository,
} from "@/features/agent-app/install/installedAppState";
import { buildInstalledAppPreview } from "@/features/agent-app/install/installedAppPreview";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { buildAgentAppPackageCacheEntry } from "@/features/agent-app/install/packageCache";
import { buildAgentAppLabResolvedSetupState } from "@/features/agent-app/install/labInstallFlow";
import { buildWorkflowRuntimeCapabilityProfile } from "@/features/agent-app/runtime/workflowRuntimeCapabilityProfile";
import type { AppManifest, InstalledAgentAppState } from "@/features/agent-app/types";

const driver = new InMemoryAgentAppPersistenceDriver();
const repository = new LocalInstalledAgentAppStateRepository({ driver });

function now() {
  return "2026-05-15T00:00:00.000Z";
}

function mockTaskIds(args: any) {
  const request = args?.request ?? {};
  const appId = String(request.appId ?? "content-factory-app");
  const taskKind = String(request.taskKind ?? "agent_app.task");
  const taskId = String(request.taskId ?? "agent-app-task-mock");
  const sessionId = String(request.sessionId ?? "agent-app-session-mock");
  const turnId = String(request.turnId ?? "agent-app-turn-mock");
  return { appId, taskKind, taskId, sessionId, turnId };
}

function buildFixtureState(): InstalledAgentAppState {
  const manifest = contentFactoryFixture as AppManifest;
    const identity = buildPackageIdentity({
      manifest,
      sourceKind: "local_folder",
      sourceUri: "/mock/agent-apps/content-factory-app",
      loadedAt: now(),
    });
  const profile = buildWorkflowRuntimeCapabilityProfile({
    realAdapterEnabled: true,
    uiRuntimeEnabled: true,
    workerRuntimeEnabled: true,
  });
  const setupPreview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    profile,
    loadedAt: now(),
    checkedAt: now(),
    generatedAt: now(),
  });
  const setup = buildAgentAppLabResolvedSetupState(setupPreview.projection);
  const preview = buildInstalledAppPreview({
    fixture: manifest,
    identity,
    setup,
    profile,
    loadedAt: now(),
    checkedAt: now(),
    generatedAt: now(),
  });
  return buildInstalledAgentAppState({
    preview,
    setup,
    installedAt: now(),
    updatedAt: now(),
  });
}

async function ensureSeeded() {
  const list = await repository.list();
  if (list.states.length === 0) {
    await repository.save(buildFixtureState(), now());
  }
}

async function resolveMockRuntimeStatus(args: any) {
  await ensureSeeded();
  const request = args?.request ?? {};
  const appId = String(request.appId ?? "content-factory-app");
  const list = await repository.list();
  const state = list.states.find((item) => item.appId === appId) ?? list.states[0];
  const requestedEntryKey = String(request.entryKey ?? "");
  const entry =
    state?.projection.entries.find((item) => item.key === requestedEntryKey) ??
    state?.projection.entries.find((item) => item.key === "dashboard") ??
    state?.projection.entries.find((item) =>
      ["page", "panel", "settings"].includes(item.kind),
    ) ??
    state?.projection.entries[0];
  const route = entry?.route ?? "/dashboard";
  const baseUrl = "http://127.0.0.1:4199";
  return {
    appId,
    status: "running",
    baseUrl,
    entryUrl: `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`,
    port: 4199,
    pid: 41990,
    entryKey: entry?.key ?? "dashboard",
    route,
  };
}

export const agentAppMocks = {
  agent_app_inspect_local_package: async (args: any) => {
    const appDir = String(args?.appDir ?? args?.app_dir ?? "").trim();
    const manifest = contentFactoryFixture as AppManifest;
    const identity = buildPackageIdentity({
      manifest,
      sourceKind: "local_folder",
      sourceUri: appDir || "/mock/agent-apps/content-factory-app",
      loadedAt: now(),
    });
    return {
      sourceKind: "local_folder",
      sourceUri: identity.sourceUri,
      appDir: identity.sourceUri,
      appMarkdown: "",
      manifest,
      manifestHash: identity.manifestHash,
      packageHash: identity.packageHash,
      inspectedAt: now(),
    };
  },
  agent_app_fetch_cloud_package: async (args: any) => {
    const descriptor = args?.request?.descriptor;
    if (!descriptor?.identity) {
      throw new Error("缺少 Agent App cloud release descriptor。");
    }
    return buildAgentAppPackageCacheEntry({
      identity: descriptor.identity,
      manifestSnapshot: contentFactoryFixture,
      actualPackageHash: descriptor.packageHash,
      actualManifestHash: descriptor.manifestHash,
      cachedAt: descriptor.loadedAt ?? now(),
    });
  },
  agent_app_save_installed_state: async (args: any) => {
    const state = args?.request?.state;
    if (!state) {
      throw new Error("缺少 Agent App installed state。");
    }
    return repository.save(state, now());
  },
  agent_app_list_installed: async () => {
    await ensureSeeded();
    return repository.list();
  },
  agent_app_set_disabled: async (args: any) => {
    const request = args?.request ?? {};
    await repository.setDisabled(
      String(request.appId ?? ""),
      Boolean(request.disabled),
      String(request.updatedAt ?? now()),
    );
    return repository.list();
  },
  agent_app_uninstall_rehearsal: async (args: any) => {
    const request = args?.request ?? {};
    const appId = String(request.appId ?? "content-factory-app");
    const mode = request.mode === "delete-data" ? "delete-data" : "keep-data";
    const dataAction = mode === "delete-data" ? "delete" : "retain";
    const targets = [
      {
        kind: "path",
        value: `<LimeAppData>/agent-apps/installed/${appId}.json`,
        safeToDelete: true,
        action: "delete",
        reason: "Installed Agent App state snapshot.",
      },
      {
        kind: "namespace",
        value: `<LimeAppData>/agent-apps/storage/${appId}`,
        safeToDelete: true,
        action: dataAction,
        reason: "App storage namespace declared by manifest.",
      },
    ];
    return {
      appId,
      mode,
      generatedAt: now(),
      deletedTargetCount: targets.filter((target) => target.action === "delete")
        .length,
      retainedTargetCount: targets.filter((target) => target.action === "retain")
        .length,
      targets,
      warnings: ["DRY_RUN_ONLY"],
    };
  },
  agent_app_uninstall: async (args: any) => {
    const rehearsal = await agentAppMocks.agent_app_uninstall_rehearsal(args);
    // P17.3 mock mirrors native behavior: return rehearsal without deleting state.
    return {
      rehearsal,
      list: await repository.list(),
      removedTargetCount: 0,
      missingTargetCount: 0,
    };
  },
  agent_app_start_ui_runtime: async (args: any) => resolveMockRuntimeStatus(args),
  agent_app_get_ui_runtime_status: async (args: any) =>
    resolveMockRuntimeStatus(args),
  agent_app_stop_ui_runtime: async (args: any) => {
    const appId = String(args?.request?.appId ?? "content-factory-app");
    return {
      appId,
      status: "stopped",
      message: "Agent App UI runtime 已停止。",
    };
  },
  agent_app_runtime_start_task: async (args: any) => {
    const { appId, taskKind, taskId, sessionId, turnId } = mockTaskIds(args);
    const request = args?.request ?? {};
    return {
      appId,
      entryKey: request.entryKey,
      taskId,
      traceId: "agent-app-trace-mock",
      taskKind,
      sessionId,
      turnId,
      eventName: String(
        request.eventName ?? `agent_app_runtime:${appId}:${taskId}`,
      ),
      status: "accepted",
      submittedAt: now(),
    };
  },
  agent_app_runtime_cancel_task: async (args: any) => {
    const { appId, taskId, sessionId } = mockTaskIds(args);
    return {
      appId,
      taskId,
      sessionId,
      cancelled: true,
      status: "cancelled",
    };
  },
  agent_app_runtime_get_task: async (args: any) => {
    const { appId, taskId, sessionId } = mockTaskIds(args);
    return {
      appId,
      taskId,
      sessionId,
      status: "thread_read_available",
      taskStatus: "running",
      taskEvents: [
        {
          id: "task:progress:1",
          eventType: "task:progress",
          status: "running",
          message: "任务正在执行",
          occurredAt: now(),
          payload: {
            source: "agent_app_runtime_mock",
          },
        },
      ],
      threadRead: {
        session_id: sessionId,
        status: "running",
        source: "agent_app_runtime_mock",
      },
    };
  },
  agent_app_runtime_submit_host_response: async (args: any) => {
    const { appId, taskId } = mockTaskIds(args);
    return {
      appId,
      taskId,
      status: "submitted",
    };
  },
};
