import { describe, expect, it } from "vitest";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import {
  checkInstallModesReadiness,
  defaultInstallModeRegistry,
  normalizeInstallContract,
  parseInstallContract,
} from "./index";

const installYaml = `install:
  modes:
    - in_lime
    - standalone
    - runtime_backed
  runtime:
    minVersion: 0.8.0
    distribution:
      standalone:
        embedRuntime: true
        shell: lime-app-shell
      runtimeBacked:
        requires: lime-runtime
        minVersion: 0.8.0
  standalone:
    shell: lime-app-shell
    bundleId: ai.limecloud.contentfactory
    platforms:
      - macos
      - windows
    autoUpdate: true
  runtimeBacked:
    requires: lime-runtime
    minVersion: 0.8.0
  branding:
    name: Content Factory
    icon: ./assets/icon.svg
    windowTitle: Content Factory
`;

describe("Agent App v2 install mode contract", () => {
  it("应解析 app.install.yaml 并归一化为 current install contract", () => {
    const parsed = parseInstallContract(installYaml);
    const normalized = normalizeInstallContract({
      input: installYaml,
      fallbackName: "内容工厂",
    });

    expect(parsed.modes).toEqual(["in_lime", "standalone", "runtime_backed"]);
    expect(normalized).toMatchObject({
      schemaVersion: 1,
      supportedModes: ["in_lime", "standalone", "runtime_backed"],
      preferredMode: "in_lime",
      runtime: {
        minVersion: "0.8.0",
        standalone: {
          embedRuntime: true,
          shell: "lime-app-shell",
        },
        runtimeBacked: {
          requires: "lime-runtime",
          minVersion: "0.8.0",
        },
      },
      standalone: {
        shell: "lime-app-shell",
        bundleId: "ai.limecloud.contentfactory",
        platforms: ["macos", "windows"],
        autoUpdate: true,
      },
      branding: {
        name: "Content Factory",
        windowTitle: "Content Factory",
      },
    });
  });

  it("默认缺省 install contract 时只允许 in_lime，避免假 standalone", () => {
    expect(
      normalizeInstallContract({ input: undefined, fallbackName: "Simple App" }),
    ).toMatchObject({
      supportedModes: ["in_lime"],
      preferredMode: "in_lime",
      branding: {
        name: "Simple App",
        windowTitle: "Simple App",
      },
    });
  });

  it("registry 必须覆盖所有 install mode，web_host 在 v2 返回 blocked", () => {
    expect(defaultInstallModeRegistry.listSupported()).toEqual([
      "in_lime",
      "standalone",
      "runtime_backed",
      "web_host",
    ]);

    const install = normalizeInstallContract({
      input: { modes: ["web_host"] },
      fallbackName: "Web App",
    });
    const readiness = checkInstallModesReadiness({
      install,
      profile: p0HostCapabilityProfile,
    });

    expect(readiness).toEqual([
      expect.objectContaining({
        mode: "web_host",
        status: "blocked",
        blockers: [
          expect.objectContaining({ code: "INSTALL_MODE_UNSUPPORTED" }),
        ],
      }),
    ]);
  });

  it("standalone / runtime_backed 会检查 Lime Runtime 最低版本", () => {
    const install = normalizeInstallContract({
      input: {
        modes: ["standalone", "runtime_backed"],
        runtime: { minVersion: "0.9.0" },
      },
      fallbackName: "Future App",
    });
    const readiness = checkInstallModesReadiness({
      install,
      profile: p0HostCapabilityProfile,
    });

    expect(readiness.map((mode) => mode.status)).toEqual(["blocked", "blocked"]);
    expect(readiness[0].blockers[0]).toMatchObject({
      code: "RUNTIME_VERSION_UNSUPPORTED",
      key: "standalone",
    });
  });
});
