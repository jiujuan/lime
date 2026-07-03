import type {
  InstalledPluginState,
  InstalledAppPreview,
  LimeRuntimeProfile,
  ProjectedEntry,
} from "../types";
import type { ShellDescriptor } from "./ShellLaunchPort";
import { buildRuntimeBackedDescriptor } from "./buildRuntimeBackedDescriptor";
import { buildStandaloneShellDescriptor } from "./buildStandaloneShellDescriptor";

export type ShellLaunchDescriptorResolution =
  | {
      status: "ready";
      descriptor: ShellDescriptor;
    }
  | {
      status: "not_required";
      reason: "in_lime" | "non_ui_entry" | "unsupported_install_mode";
    };

function isShellUiEntry(entry: ProjectedEntry): boolean {
  return ["page", "panel", "settings"].includes(entry.kind);
}

function withRequestedEntry(
  descriptor: ShellDescriptor,
  entry: ProjectedEntry,
): ShellDescriptor {
  return {
    ...descriptor,
    entry: {
      entryKey: entry.key,
      kind: entry.kind,
      title: entry.title,
      route: entry.route,
    },
  };
}

export function resolveShellLaunchDescriptorForInstalledEntry(params: {
  state: InstalledPluginState;
  preview: InstalledAppPreview;
  runtimeProfile: LimeRuntimeProfile;
  entry: ProjectedEntry;
}): ShellLaunchDescriptorResolution {
  if (!isShellUiEntry(params.entry)) {
    return { status: "not_required", reason: "non_ui_entry" };
  }
  if (params.state.installMode === "in_lime") {
    return { status: "not_required", reason: "in_lime" };
  }
  if (params.state.installMode === "standalone") {
    return {
      status: "ready",
      descriptor: withRequestedEntry(
        buildStandaloneShellDescriptor({
          projection: params.preview.projection,
          runtimeProfile: params.runtimeProfile,
        }),
        params.entry,
      ),
    };
  }
  if (params.state.installMode === "runtime_backed") {
    return {
      status: "ready",
      descriptor: withRequestedEntry(
        buildRuntimeBackedDescriptor({
          projection: params.preview.projection,
          runtimeProfile: params.runtimeProfile,
        }),
        params.entry,
      ),
    };
  }
  return { status: "not_required", reason: "unsupported_install_mode" };
}
