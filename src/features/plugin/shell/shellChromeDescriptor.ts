import type { ShellDescriptor } from "./ShellLaunchPort";

export interface ShellChromeMenuItem {
  id: "about" | "open" | "check_updates" | "quit";
  labelKey: string;
  action: "about_app" | "open_primary_entry" | "check_updates" | "quit_app";
}

export interface ShellChromeDescriptor {
  descriptorVersion: 1;
  appId: string;
  shellKind: "single_app";
  window: {
    title: string;
    icon?: string;
    entryKey: string;
  };
  menu: {
    appName: string;
    items: ShellChromeMenuItem[];
  };
  deepLink: {
    scheme: string;
    openEntryKey: string;
    allowedRoutes: string[];
  };
  tray: {
    enabled: boolean;
    statusSource: "runtime_profile";
    itemIds: Array<ShellChromeMenuItem["id"]>;
  };
  closePolicy: {
    mode: "hide_to_tray" | "quit";
    confirmationRequired: boolean;
  };
  constraints: {
    multiAppManagement: boolean;
    runtimeBypass: boolean;
  };
}

export interface ShellChromeValidationIssue {
  code:
    | "SHELL_CHROME_CLOSE_POLICY_WITHOUT_TRAY"
    | "SHELL_CHROME_DEEP_LINK_MISSING"
    | "SHELL_CHROME_MULTI_APP_MANAGEMENT_FORBIDDEN"
    | "SHELL_CHROME_RUNTIME_BYPASS_FORBIDDEN";
  message: string;
}

function toDeepLinkScheme(appId: string): string {
  const slug = appId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `lime-agent-${slug || "app"}`;
}

export function buildShellChromeDescriptor(
  descriptor: ShellDescriptor,
): ShellChromeDescriptor {
  const route = descriptor.entry.route || "/";
  return {
    descriptorVersion: 1,
    appId: descriptor.appId,
    shellKind: "single_app",
    window: {
      title: descriptor.branding.windowTitle || descriptor.branding.name,
      icon: descriptor.branding.icon,
      entryKey: descriptor.entry.entryKey,
    },
    menu: {
      appName: descriptor.branding.name,
      items: [
        {
          id: "about",
          labelKey: "plugin.shell.menu.about",
          action: "about_app",
        },
        {
          id: "open",
          labelKey: "plugin.shell.menu.open",
          action: "open_primary_entry",
        },
        {
          id: "check_updates",
          labelKey: "plugin.shell.menu.checkUpdates",
          action: "check_updates",
        },
        {
          id: "quit",
          labelKey: "plugin.shell.menu.quit",
          action: "quit_app",
        },
      ],
    },
    deepLink: {
      scheme: toDeepLinkScheme(descriptor.appId),
      openEntryKey: descriptor.entry.entryKey,
      allowedRoutes: [route],
    },
    tray: {
      enabled: true,
      statusSource: "runtime_profile",
      itemIds: ["open", "check_updates", "quit"],
    },
    closePolicy: {
      mode: "hide_to_tray",
      confirmationRequired: false,
    },
    constraints: {
      multiAppManagement: false,
      runtimeBypass: false,
    },
  };
}

export function validateShellChromeDescriptor(
  descriptor: ShellChromeDescriptor,
): ShellChromeValidationIssue[] {
  const issues: ShellChromeValidationIssue[] = [];
  if (descriptor.constraints.multiAppManagement) {
    issues.push({
      code: "SHELL_CHROME_MULTI_APP_MANAGEMENT_FORBIDDEN",
      message: "Standalone shell chrome must not expose Desktop multi-app management.",
    });
  }
  if (descriptor.constraints.runtimeBypass) {
    issues.push({
      code: "SHELL_CHROME_RUNTIME_BYPASS_FORBIDDEN",
      message: "Standalone shell chrome must not bypass Lime Runtime governance.",
    });
  }
  if (!descriptor.deepLink.scheme || !descriptor.deepLink.openEntryKey) {
    issues.push({
      code: "SHELL_CHROME_DEEP_LINK_MISSING",
      message: "Standalone shell chrome must define a single-app deep link target.",
    });
  }
  if (descriptor.closePolicy.mode === "hide_to_tray" && !descriptor.tray.enabled) {
    issues.push({
      code: "SHELL_CHROME_CLOSE_POLICY_WITHOUT_TRAY",
      message: "hide_to_tray close policy requires tray support.",
    });
  }
  return issues;
}
