import { describe, expect, it } from "vitest";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import { projectApp } from "../projection/projectApp";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildLimeRuntimeProfileFromHostProfile } from "../runtime-profile";
import type { InstalledAgentAppState, InstalledAppPreview } from "../types";
import {
  buildRuntimeBackedDescriptor,
  buildShellChromeDescriptor,
  buildShellIsolationPolicy,
  buildStandaloneShellDescriptor,
  InMemoryShellLaunchPort,
  resolveShellLaunchDescriptorForInstalledEntry,
  validateShellChromeDescriptor,
} from "./index";

function buildProjection() {
  const manifest = parseManifest({
    manifestVersion: "0.8.0",
    name: "content-factory-app",
    displayName: "内容工厂",
    version: "0.8.0",
    entries: [{ key: "dashboard", kind: "page", title: "首页", route: "/dashboard" }],
    storage: { namespace: "content-factory-app" },
    install: {
      modes: ["in_lime", "standalone", "runtime_backed"],
      runtime: { minVersion: "0.8.0" },
      standalone: { shell: "lime-app-shell", bundleId: "ai.limecloud.contentfactory" },
      runtimeBacked: { requires: "lime-runtime", minVersion: "0.8.0" },
      branding: { name: "Content Factory", windowTitle: "Content Factory" },
    },
  });
  const normalized = normalizeManifest(manifest);
  return projectApp({
    manifest: normalized,
    identity: buildPackageIdentity({ manifest }),
  });
}

describe("Agent App v2 shell descriptor", () => {
  it("应为 standalone 构造只读隔离 shell descriptor", () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    const descriptor = buildStandaloneShellDescriptor({ projection, runtimeProfile });

    expect(descriptor).toMatchObject({
      descriptorVersion: 1,
      appId: "content-factory-app",
      installMode: "standalone",
      runtimeProfile: {
        runtimeVersion: "0.8.0",
        shellKind: "app_shell",
      },
      entry: {
        entryKey: "dashboard",
        route: "/dashboard",
      },
      isolation: {
        packageMount: "read-only",
        secrets: "refs-only",
        sideEffects: "runtime-broker",
        evidence: "runtime-provenance",
        storageNamespace: "content-factory-app",
      },
      branding: {
        name: "Content Factory",
      },
    });
  });

  it("应为 runtime-backed 构造 descriptor，且拒绝 mode 不匹配的 runtime profile", () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "runtime_backed",
      hostProfile: p0HostCapabilityProfile,
    });

    expect(buildRuntimeBackedDescriptor({ projection, runtimeProfile })).toMatchObject({
      installMode: "runtime_backed",
      runtimeProfile: {
        shellKind: "runtime_backed",
      },
    });

    const standaloneProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    expect(() =>
      buildRuntimeBackedDescriptor({ projection, runtimeProfile: standaloneProfile }),
    ).toThrow(/does not match shell descriptor/);
  });

  it("隔离策略必须保持 package 只读、secret ref-only、side effect 经 Runtime broker", () => {
    expect(buildShellIsolationPolicy(buildProjection())).toEqual({
      packageMount: "read-only",
      secrets: "refs-only",
      sideEffects: "runtime-broker",
      evidence: "runtime-provenance",
      storageNamespace: "content-factory-app",
    });
  });

  it("ShellLaunchPort prototype 应只启动通过隔离与 RuntimeProfile 校验的 descriptor", async () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    const descriptor = buildStandaloneShellDescriptor({ projection, runtimeProfile });
    const port = new InMemoryShellLaunchPort();

    await expect(port.canLaunch(descriptor)).resolves.toEqual({
      status: "ready",
      blockers: [],
    });
    await expect(port.launch(descriptor)).resolves.toMatchObject({
      status: "launched",
      blockerCodes: [],
      descriptor: {
        appId: "content-factory-app",
        installMode: "standalone",
      },
    });
    expect(port.getLaunchedDescriptors()).toHaveLength(1);

    const invalidDescriptor = {
      ...descriptor,
      runtimeProfile: {
        ...descriptor.runtimeProfile,
        shellKind: "desktop" as const,
      },
    };
    await expect(port.launch(invalidDescriptor)).resolves.toMatchObject({
      status: "blocked",
      blockerCodes: ["SHELL_KIND_MISMATCH"],
    });
  });

  it("Shell launch descriptor service 应把 UI entry 与安装模式分发隔离在 shell 模块", () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    const preview = { projection } as InstalledAppPreview;
    const inLimeState = { installMode: "in_lime" } as InstalledAgentAppState;
    const standaloneState = {
      installMode: "standalone",
    } as InstalledAgentAppState;

    expect(
      resolveShellLaunchDescriptorForInstalledEntry({
        state: inLimeState,
        preview,
        runtimeProfile,
        entry: projection.entries[0],
      }),
    ).toEqual({ status: "not_required", reason: "in_lime" });

    expect(
      resolveShellLaunchDescriptorForInstalledEntry({
        state: standaloneState,
        preview,
        runtimeProfile,
        entry: projection.entries[0],
      }),
    ).toMatchObject({
      status: "ready",
      descriptor: {
        appId: "content-factory-app",
        installMode: "standalone",
        entry: {
          entryKey: "dashboard",
          route: "/dashboard",
        },
      },
    });
  });

  it("产品化 shell chrome descriptor 应固定单 App 菜单、deep link、托盘和关闭策略", () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    const descriptor = buildStandaloneShellDescriptor({ projection, runtimeProfile });
    const chrome = buildShellChromeDescriptor(descriptor);

    expect(chrome).toMatchObject({
      descriptorVersion: 1,
      appId: "content-factory-app",
      shellKind: "single_app",
      window: {
        title: "Content Factory",
        entryKey: "dashboard",
      },
      deepLink: {
        scheme: "lime-agent-content-factory-app",
        openEntryKey: "dashboard",
        allowedRoutes: ["/dashboard"],
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
    });
    expect(chrome.menu.items.map((item) => item.labelKey)).toEqual([
      "agentApp.shell.menu.about",
      "agentApp.shell.menu.open",
      "agentApp.shell.menu.checkUpdates",
      "agentApp.shell.menu.quit",
    ]);
    expect(validateShellChromeDescriptor(chrome)).toEqual([]);
  });

  it("产品化 shell chrome descriptor 不允许多 App 管理或绕过 Runtime", () => {
    const projection = buildProjection();
    const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
      appId: projection.app.appId,
      installMode: "standalone",
      hostProfile: p0HostCapabilityProfile,
    });
    const chrome = buildShellChromeDescriptor(
      buildStandaloneShellDescriptor({ projection, runtimeProfile }),
    );
    const invalidChrome = {
      ...chrome,
      tray: { ...chrome.tray, enabled: false },
      constraints: {
        multiAppManagement: true,
        runtimeBypass: true,
      },
    };

    expect(validateShellChromeDescriptor(invalidChrome)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SHELL_CHROME_MULTI_APP_MANAGEMENT_FORBIDDEN",
        }),
        expect.objectContaining({
          code: "SHELL_CHROME_RUNTIME_BYPASS_FORBIDDEN",
        }),
        expect.objectContaining({
          code: "SHELL_CHROME_CLOSE_POLICY_WITHOUT_TRAY",
        }),
      ]),
    );
  });
});
