import contentFactoryFixture from "@/features/agent-app/fixtures/content-factory-app.json";
import {
  buildInstalledAgentAppState,
  InMemoryAgentAppPersistenceDriver,
  LocalInstalledAgentAppStateRepository,
} from "@/features/agent-app/install/installedAppState";
import { buildInstalledAppPreview } from "@/features/agent-app/install/installedAppPreview";
import { buildPackageIdentity } from "@/features/agent-app/install/packageIdentity";
import { buildAgentAppLabResolvedSetupState } from "@/features/agent-app/install/labInstallFlow";
import { buildWorkflowRuntimeCapabilityProfile } from "@/features/agent-app/runtime/workflowRuntimeCapabilityProfile";
import type { AppManifest, InstalledAgentAppState } from "@/features/agent-app/types";

const driver = new InMemoryAgentAppPersistenceDriver();
const repository = new LocalInstalledAgentAppStateRepository({ driver });

function now() {
  return "2026-05-15T00:00:00.000Z";
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
  agent_app_list_installed: async () => {
    await ensureSeeded();
    return repository.list();
  },
  agent_app_uninstall: async (args: any) => {
    await ensureSeeded();
    const request = args?.request ?? {};
    const appId = String(request.appId ?? "content-factory-app");
    const mode = request.mode === "delete-data" ? "delete-data" : "keep-data";
    const list = await repository.list();
    const state = list.states.find((item) => item.appId === appId) ?? list.states[0];
    const packageHash = state?.identity.packageHash ?? "package-fnv1a-mock";
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
    const rehearsal = {
      appId,
      packageHash,
      mode,
      generatedAt: now(),
      deletedTargetCount: targets.filter((target) => target.action === "delete")
        .length,
      retainedTargetCount: targets.filter((target) => target.action === "retain")
        .length,
      targets,
      warnings: ["DRY_RUN_ONLY"],
    };

    const expectedConfirmation = `DELETE_AGENT_APP_DATA ${appId} ${packageHash}`;
    if (
      mode === "delete-data" &&
      request.confirmationPhrase === expectedConfirmation
    ) {
      const removed = await repository.remove(appId);
      const removedTargetCount = removed ? rehearsal.deletedTargetCount : 0;
      const missingTargetCount = removed ? 0 : rehearsal.deletedTargetCount;
      const removedTargets = rehearsal.targets
        .filter((target) => target.action === "delete")
        .map((target) => ({
          ...target,
          status: removed ? "removed" : "missing",
          blockerCodes: [],
          error: null,
        }));
      return {
        status: "deleted",
        rehearsal,
        list: await repository.list(),
        removedTargetCount,
        missingTargetCount,
        blockerCodes: [],
        deleteEvidence: {
          status: "deleted",
          generatedAt: now(),
          dataRoot: "<LimeAppData>/agent-apps",
          removedTargets: removed ? removedTargets : [],
          missingTargets: removed ? [] : removedTargets,
          retainedTargets: rehearsal.targets
            .filter((target) => target.action !== "delete")
            .map((target) => ({
              ...target,
              status: "retained",
              blockerCodes: [],
              error: null,
            })),
          blockedTargets: [],
          failedTarget: null,
          blockerCodes: [],
          postDeleteResidualAudit: {
            status: "clear",
            checkedAt: now(),
            checkedTargetCount: removedTargets.length,
            remainingTargetCount: 0,
            remainingTargets: [],
            failedTarget: null,
          },
        },
      };
    }

    return {
      status: rehearsal.mode === "delete-data" ? "blocked" : "rehearsal_only",
      rehearsal,
      list: await repository.list(),
      removedTargetCount: 0,
      missingTargetCount: 0,
      blockerCodes:
        rehearsal.mode === "delete-data" ? ["CONFIRMATION_MISMATCH"] : [],
      deleteEvidence: null,
    };
  },
  agent_app_launch_shell: async (args: any) => {
    const descriptor = args?.request?.descriptor ?? {};
    const appId = String(descriptor.appId ?? "content-factory-app");
    const installMode = String(descriptor.installMode ?? "standalone");
    const shellKind = String(descriptor.runtimeProfile?.shellKind ?? "app_shell");
    const packageHash = String(descriptor.packageHash ?? "");
    const manifestHash = String(descriptor.manifestHash ?? "");
    const blockerCodes: string[] = [];

    if (!["standalone", "runtime_backed"].includes(installMode)) {
      blockerCodes.push("SHELL_INSTALL_MODE_UNSUPPORTED");
    }
    if (
      (installMode === "standalone" && shellKind !== "app_shell") ||
      (installMode === "runtime_backed" && shellKind !== "runtime_backed")
    ) {
      blockerCodes.push("SHELL_KIND_MISMATCH");
    }
    if (!packageHash || !manifestHash) {
      blockerCodes.push("PACKAGE_IDENTITY_MISSING");
    }

    if (blockerCodes.length > 0) {
      return {
        appId,
        status: "blocked",
        installMode,
        shellKind,
        descriptorVersion: descriptor.descriptorVersion,
        devShell: true,
        blockerCodes,
        message: "Agent App shell descriptor 未通过 mock 启动前校验。",
        launchedAt: now(),
      };
    }

    const runtimeStatus = await resolveMockRuntimeStatus({
      request: {
        appId,
        entryKey: descriptor.entry?.entryKey,
      },
    });
    const shellWindow = {
      label: `agent-app-shell-${appId}-${installMode}`,
      title: String(
        descriptor.branding?.windowTitle ?? descriptor.branding?.name ?? appId,
      ),
      url: runtimeStatus.entryUrl,
      reused: false,
      chrome: {
        deepLinkScheme: `lime-agent-${appId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        openEntryKey: String(descriptor.entry?.entryKey ?? "dashboard"),
        trayEnabled: true,
        closePolicy: "hide_to_tray",
        menuItemIds: ["open", "check_updates", "quit"],
        multiAppManagement: false,
        runtimeBypass: false,
      },
    };
    return {
      appId,
      status: "launched",
      installMode,
      shellKind,
      descriptorVersion: descriptor.descriptorVersion ?? 1,
      devShell: true,
      blockerCodes: [],
      message: "Agent App dev shell mock 已复用 current UI runtime 启动。",
      packageMount: {
        kind: "mock",
        path: `/mock/agent-apps/${appId}`,
        readOnly: true,
        packageHash,
        manifestHash,
      },
      runtimeStatus,
      shellWindow,
      launchedAt: now(),
    };
  },
};
