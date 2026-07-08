import { useCallback } from "react";
import { toast } from "sonner";
import { launchPluginShell } from "@/lib/api/plugins";
import { buildPluginLifecycleLaunchGate } from "../install/lifecycleAction";
import { buildLimeRuntimeProfileForInstalledState } from "../runtime-profile";
import { resolveShellLaunchDescriptorForInstalledEntry } from "../shell";
import {
  APP_CENTER_PLUGIN_FLAGS,
  buildAppCenterRuntimeCapabilityProfile,
} from "../runtime/appCenterRuntimeProfile";
import { evaluatePluginEntryRuntimeGuard } from "../runtime/entryRuntimeGuard";
import { UiExtensionHost } from "../runtime/uiExtensionHost";
import type {
  InstalledPluginState,
  PluginUiMountResult,
  ProjectedEntry,
} from "../types";
import type { PluginLifecycleUninstallRehearsalDescriptor } from "../install/lifecycleAction";
import type { PluginPageParams, Page, PageParams } from "@/types/page";
import {
  buildPluginActivationAgentParams,
  hasAgentActivationRoute,
  resolveActivationDeclarationForProjectedEntry,
  type DetailDeclaration,
} from "./pluginDetailDeclarations";
import type { PluginLaunchTargetPolicy } from "./pluginLaunchTargetPolicy";
import { requestPluginRightSurfaceLaunch } from "./pluginRightSurfaceLaunch";
import { resolveInstalledPluginDisplayName } from "./pluginDisplay";
import { buildPreviewFromInstalledState } from "./PluginsPageHelpers";
import { buildRuntimePackageLoadForPreview } from "./pluginsRuntime";
import type { PluginDynamicTranslation } from "./PluginsPagePresentation";
import { isUiEntry } from "./PluginsPageViewModel";

type RunBusy = <T>(
  key: string,
  action: () => Promise<T>,
) => Promise<T | null>;

export function usePluginAppLaunchActions({
  launchTargetPolicy,
  onLaunchSummaryChange,
  onMountedUiChange,
  onNavigate,
  projectId,
  runBusy,
  t,
  uninstallDescriptor,
}: {
  launchTargetPolicy: PluginLaunchTargetPolicy;
  onLaunchSummaryChange: (summary: string | null) => void;
  onMountedUiChange: (mountedUi: PluginUiMountResult | null) => void;
  onNavigate?: (page: Page, params?: PageParams) => void;
  projectId?: string;
  runBusy: RunBusy;
  t: PluginDynamicTranslation;
  uninstallDescriptor: PluginLifecycleUninstallRehearsalDescriptor | null;
}) {
  const handleLaunchActivationDeclaration = useCallback(
    (state: InstalledPluginState, declaration: DetailDeclaration) => {
      const launchGate = buildPluginLifecycleLaunchGate(state);
      if (!launchGate.allowed) {
        return;
      }
      const params = buildPluginActivationAgentParams({
        state,
        declaration,
        projectId,
      });
      if (!onNavigate) {
        const summary = t("plugin.apps.launch.agentRouteUnavailable", {
          title: declaration.title,
        });
        onMountedUiChange(null);
        onLaunchSummaryChange(summary);
        toast.error(t("plugin.apps.toast.failed"), {
          description: summary,
        });
        return;
      }
      onMountedUiChange(null);
      onLaunchSummaryChange(null);
      onNavigate("agent", params);
    },
    [onLaunchSummaryChange, onMountedUiChange, onNavigate, projectId, t],
  );

  const handleLaunchEntry = useCallback(
    async (state: InstalledPluginState, entry: ProjectedEntry) => {
      const launchGate = buildPluginLifecycleLaunchGate(state);
      if (!launchGate.allowed) {
        return;
      }
      await runBusy(`launch:${state.appId}:${entry.key}`, async () => {
        const preview = buildPreviewFromInstalledState(state);
        const hostProfile = buildAppCenterRuntimeCapabilityProfile();
        const runtimeProfile = buildLimeRuntimeProfileForInstalledState({
          state,
          hostProfile,
        });
        const guard = evaluatePluginEntryRuntimeGuard({
          preview,
          entryKey: entry.key,
          flags: APP_CENTER_PLUGIN_FLAGS,
          operation: isUiEntry(entry) ? "mount-ui" : "run-entry",
          runtimePackageLoad: buildRuntimePackageLoadForPreview(preview),
          permissionDecision: "accepted",
          installMode: state.installMode,
          runtimeProfile,
          lifecycle: {
            disabled: state.disabled,
            cleanupStatus:
              uninstallDescriptor?.appId === state.appId &&
              uninstallDescriptor.status === "blocked"
                ? "blocked"
                : "ready",
            cleanupBlockerCodes:
              uninstallDescriptor?.appId === state.appId
                ? uninstallDescriptor.blockerCodes
                : [],
          },
        });
        if (guard.status !== "allow") {
          onLaunchSummaryChange(t(`plugin.lab.guard.summary.${guard.status}`));
          return;
        }

        const shellLaunch = resolveShellLaunchDescriptorForInstalledEntry({
          state,
          preview,
          runtimeProfile,
          entry,
        });
        if (shellLaunch.status === "ready") {
          const result = await launchPluginShell({
            descriptor: shellLaunch.descriptor,
          });
          if (result.status === "blocked") {
            const summary = t("plugin.apps.launch.shellBlocked", {
              codes: result.blockerCodes.join(", "),
            });
            onLaunchSummaryChange(summary);
            toast.error(t("plugin.apps.toast.failed"), {
              description: result.message ?? summary,
            });
            return;
          }
          try {
            if (launchTargetPolicy.rightSurfaceTarget) {
              await requestPluginRightSurfaceLaunch({
                appId: state.appId,
                title: resolveInstalledPluginDisplayName(state),
                entry,
                shellLaunch: result,
                target: launchTargetPolicy.rightSurfaceTarget,
              });
            }
          } catch (error) {
            toast.error(t("plugin.apps.toast.failed"), {
              description:
                error instanceof Error ? error.message : String(error),
            });
          }
          const summary = t("plugin.apps.launch.shellLaunched", {
            title: entry.title,
            target:
              result.shellWindow?.url ??
              result.runtimeStatus?.entryUrl ??
              result.packageMount?.path ??
              entry.route ??
              entry.key,
          });
          onMountedUiChange(null);
          onLaunchSummaryChange(summary);
          toast.success(summary);
          return;
        }

        if (isUiEntry(entry)) {
          if (onNavigate) {
            const runtimeParams: PluginPageParams = {
              appId: state.appId,
              entryKey: entry.key,
              ...(projectId ? { projectId } : {}),
              launchRequestKey: Date.now(),
              rightSurfaceTarget: launchTargetPolicy.rightSurfaceTarget,
            };
            onNavigate("plugin", runtimeParams);
            return;
          }
          const mount = new UiExtensionHost({
            preview,
            flags: APP_CENTER_PLUGIN_FLAGS,
          }).mountEntry(entry.key);
          onMountedUiChange(mount);
          onLaunchSummaryChange(
            t("plugin.apps.launch.uiMounted", {
              title: mount.title,
              route: mount.route ?? entry.key,
            }),
          );
          return;
        }

        const activationDeclaration =
          resolveActivationDeclarationForProjectedEntry({ state, entry });
        if (
          entry.kind === "workflow" ||
          hasAgentActivationRoute(activationDeclaration)
        ) {
          handleLaunchActivationDeclaration(state, activationDeclaration);
          return;
        }
        onMountedUiChange(null);
        const summary = t("plugin.apps.launch.entryRouteUnavailable", {
          title: entry.title,
        });
        onLaunchSummaryChange(summary);
        toast.error(t("plugin.apps.toast.failed"), {
          description: summary,
        });
      });
    },
    [
      handleLaunchActivationDeclaration,
      launchTargetPolicy.rightSurfaceTarget,
      onLaunchSummaryChange,
      onMountedUiChange,
      onNavigate,
      projectId,
      runBusy,
      t,
      uninstallDescriptor,
    ],
  );

  return {
    handleLaunchActivationDeclaration,
    handleLaunchEntry,
  };
}
