import { describe, expect, it } from "vitest";
import { buildPackageIdentity } from "../install/packageIdentity";
import { normalizeManifest } from "../manifest/normalizeManifest";
import { parseManifest } from "../manifest/parseManifest";
import {
  buildMacOsStandaloneIdentity,
  buildNativeShellRegistrationPlan,
  buildPackageDescriptor,
  buildStandaloneArtifactBuildPlan,
  buildStandaloneTauriConfigWritePlan,
  buildStandaloneReleasePlan,
  buildStandaloneUpdaterManifestPlan,
  materializeStandaloneTauriConfig,
  UnavailableProductionArtifactBuilder,
} from "./index";
import { projectApp } from "../projection/projectApp";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import { buildLimeRuntimeProfileFromHostProfile } from "../runtime-profile";
import { buildStandaloneShellDescriptor } from "../shell";

function buildStandaloneShell() {
  const manifest = parseManifest({
    manifestVersion: "0.8.0",
    name: "content-factory-app",
    displayName: "内容工厂",
    version: "0.8.0",
    entries: [
      { key: "dashboard", kind: "page", title: "首页", route: "/dashboard" },
    ],
    install: {
      modes: ["standalone"],
      runtime: { minVersion: "0.8.0" },
      standalone: {
        shell: "lime-app-shell",
        bundleId: "ai.limecloud.contentfactory",
      },
      branding: { name: "Content Factory", windowTitle: "Content Factory" },
    },
  });
  const normalized = normalizeManifest(manifest);
  const projection = projectApp({
    manifest: normalized,
    identity: buildPackageIdentity({ manifest }),
  });
  const runtimeProfile = buildLimeRuntimeProfileFromHostProfile({
    appId: projection.app.appId,
    installMode: "standalone",
    hostProfile: p0HostCapabilityProfile,
  });
  return buildStandaloneShellDescriptor({ projection, runtimeProfile });
}

function buildMacOsStandaloneTarget() {
  return {
    kind: "standalone" as const,
    platform: "macos" as const,
    packageFormat: "pkg" as const,
    macosIdentity: buildMacOsStandaloneIdentity({
      teamId: "TEAMID1234",
      bundleId: "com.limecloud.agentapp.contentfactory",
      appGroups: ["group.com.limecloud.agentapps"],
      keychainAccessGroups: ["TEAMID1234.com.limecloud.agentapps"],
      installerCertificateKind: "developer_id_installer",
    }),
    productionReady: false as const,
  };
}

describe("Agent App v2 package descriptor", () => {
  it("应生成 deterministic descriptor hash，并明确不是生产签名安装器", () => {
    const shell = buildStandaloneShell();
    const target = {
      kind: "standalone" as const,
      platform: "macos" as const,
      packageFormat: "dmg" as const,
      macosIdentity: buildMacOsStandaloneIdentity({
        teamId: "TEAMID1234",
        bundleId: "com.limecloud.agentapp.contentfactory",
        appGroups: ["group.com.limecloud.agentapps"],
        keychainAccessGroups: ["TEAMID1234.com.limecloud.agentapps"],
      }),
      productionReady: false as const,
    };
    const first = buildPackageDescriptor({ target, shell });
    const second = buildPackageDescriptor({ target, shell });

    expect(first.descriptorHash).toBe(second.descriptorHash);
    expect(first).toMatchObject({
      descriptorVersion: 1,
      productionReady: false,
      target: {
        kind: "standalone",
        platform: "macos",
      },
      warnings: [
        expect.objectContaining({ code: "NON_PRODUCTION_DESCRIPTOR" }),
      ],
    });
    expect(first.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MACOS_IDENTITY_MISSING" }),
      ]),
    );
  });

  it("target 与 shell mode 不一致时应给出稳定 warning", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: { kind: "runtime_backed", productionReady: false },
      shell,
    });

    expect(descriptor.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TARGET_MODE_MISMATCH" }),
      ]),
    );
  });

  it("macOS standalone target 不能复用 Lime Desktop Bundle ID", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: {
        kind: "standalone",
        platform: "macos",
        macosIdentity: buildMacOsStandaloneIdentity({
          teamId: "TEAMID1234",
          bundleId: "com.limecloud.lime",
        }),
        productionReady: false,
      },
      shell,
    });

    expect(descriptor.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MACOS_BUNDLE_ID_REUSES_DESKTOP" }),
      ]),
    );
  });

  it("pkg 分发必须声明 Developer ID Installer 身份", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: {
        kind: "standalone",
        platform: "macos",
        packageFormat: "pkg",
        macosIdentity: buildMacOsStandaloneIdentity({
          teamId: "TEAMID1234",
          bundleId: "com.limecloud.agentapp.contentfactory",
        }),
        productionReady: false,
      },
      shell,
    });

    expect(descriptor.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MACOS_INSTALLER_CERTIFICATE_MISSING",
        }),
      ]),
    );
  });

  it("native shell registration plan 应输出独立 Bundle ID 与 per-app deep link 配置", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const plan = buildNativeShellRegistrationPlan({ descriptor });

    expect(plan.status).toBe("ready");
    expect(plan.bundleIdentifier).toBe("com.limecloud.agentapp.contentfactory");
    expect(plan.deepLinkSchemes).toEqual(["lime-agent-content-factory-app"]);
    expect(plan.tauriConfigPatch).toMatchObject({
      productName: "Content Factory",
      identifier: "com.limecloud.agentapp.contentfactory",
      plugins: {
        "deep-link": {
          desktop: {
            schemes: ["lime-agent-content-factory-app"],
          },
        },
      },
    });
    expect(plan.runtimeEnv).toEqual({
      LIME_AGENT_APP_STANDALONE_APP_ID: "content-factory-app",
      LIME_AGENT_APP_STANDALONE_ENTRY_KEY: "dashboard",
      LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME:
        "lime-agent-content-factory-app",
    });
    expect(plan.menu.items.map((item) => item.labelKey)).toEqual([
      "agentApp.shell.menu.about",
      "agentApp.shell.menu.open",
      "agentApp.shell.menu.checkUpdates",
      "agentApp.shell.menu.quit",
    ]);
    expect(plan.tray.itemIds).toEqual(["open", "check_updates", "quit"]);
  });

  it("native shell registration plan 缺失 macOS identity 时必须 blocked", () => {
    const shell = {
      ...buildStandaloneShell(),
      appId: "",
    };
    const descriptor = buildPackageDescriptor({
      target: {
        kind: "standalone",
        platform: "macos",
        packageFormat: "app",
        productionReady: false,
      },
      shell,
    });
    const plan = buildNativeShellRegistrationPlan({ descriptor });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MACOS_IDENTITY_MISSING" }),
      ]),
    );
    expect(plan.deepLinkSchemes).toEqual(["lime-agent-app"]);
  });

  it("standalone Tauri config materializer 应把 per-app identity / deep link 写入独立配置", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const result = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {
        productName: "Lime",
        identifier: "com.limecloud.lime",
        app: {
          windows: [{ title: "Lime", visible: true, width: 1200 }],
        },
        plugins: {
          "deep-link": {
            desktop: { schemes: ["lime"] },
          },
        },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error(
        "materializer should be ready for valid registration plan",
      );
    }
    expect(result.runtimeEnv).toEqual({
      LIME_AGENT_APP_STANDALONE_APP_ID: "content-factory-app",
      LIME_AGENT_APP_STANDALONE_ENTRY_KEY: "dashboard",
      LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME:
        "lime-agent-content-factory-app",
    });
    expect(result.config).toMatchObject({
      productName: "Content Factory",
      identifier: "com.limecloud.agentapp.contentfactory",
      app: {
        windows: [{ title: "Content Factory", visible: false, width: 1200 }],
      },
      plugins: {
        "deep-link": {
          desktop: { schemes: ["lime-agent-content-factory-app"] },
        },
      },
    });
  });

  it("standalone Tauri config materializer 应拒绝 blocked registration plan", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: {
        kind: "standalone",
        platform: "macos",
        packageFormat: "app",
        productionReady: false,
      },
      shell,
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const result = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {},
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockers: [
        expect.objectContaining({
          code: "NATIVE_SHELL_REGISTRATION_BLOCKED",
        }),
      ],
    });
  });

  it("standalone Tauri config write plan 应生成可落盘的 config/env 文件计划", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const materializedConfig = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {
        productName: "Lime",
        identifier: "com.limecloud.lime",
        app: { windows: [{ title: "Lime", visible: true }] },
        plugins: { "deep-link": { desktop: { schemes: ["lime"] } } },
      },
    });

    const first = buildStandaloneTauriConfigWritePlan({
      materializerResult: materializedConfig,
      configOutputPath:
        "<dist>/agent-apps/content-factory/src-tauri/tauri.conf.json",
      envOutputPath: "<dist>/agent-apps/content-factory/.env.standalone",
    });
    const second = buildStandaloneTauriConfigWritePlan({
      materializerResult: materializedConfig,
      configOutputPath:
        "<dist>/agent-apps/content-factory/src-tauri/tauri.conf.json",
      envOutputPath: "<dist>/agent-apps/content-factory/.env.standalone",
    });

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    if (first.status !== "ready" || second.status !== "ready") {
      throw new Error("write plan should be ready for materialized config");
    }
    expect(first.planHash).toBe(second.planHash);
    expect(first.files.map((file) => file.kind)).toEqual([
      "tauri_config",
      "runtime_env",
    ]);
    expect(first.files[0]).toMatchObject({
      path: "<dist>/agent-apps/content-factory/src-tauri/tauri.conf.json",
      encoding: "utf8",
      sensitive: false,
    });
    expect(first.files[0].content).toContain(
      '"identifier":"com.limecloud.agentapp.contentfactory"',
    );
    expect(first.files[0].content).toContain(
      '"schemes":["lime-agent-content-factory-app"]',
    );
    expect(first.files[1]).toMatchObject({
      path: "<dist>/agent-apps/content-factory/.env.standalone",
      encoding: "utf8",
      sensitive: false,
    });
    expect(first.files[1].content).toContain(
      "LIME_AGENT_APP_STANDALONE_APP_ID=content-factory-app",
    );
    expect(first.files[1].content).toContain(
      "LIME_AGENT_APP_STANDALONE_DEEP_LINK_SCHEME=lime-agent-content-factory-app",
    );
  });

  it("standalone Tauri config write plan 缺输出路径时必须 blocked", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const materializedConfig = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {},
    });

    const plan = buildStandaloneTauriConfigWritePlan({
      materializerResult: materializedConfig,
      configOutputPath: "",
      envOutputPath: "",
    });

    expect(plan).toMatchObject({
      status: "blocked",
      readyToWrite: false,
      files: [],
      blockers: [
        expect.objectContaining({ code: "CONFIG_OUTPUT_PATH_MISSING" }),
        expect.objectContaining({ code: "ENV_OUTPUT_PATH_MISSING" }),
      ],
    });
  });

  it("standalone release plan 应阻止 non-production descriptor 伪装发布", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const plan = buildStandaloneReleasePlan({
      descriptor,
      channel: "stable",
      signing: {
        applicationCertificateKind: "developer_id_application",
        installerCertificateKind: "developer_id_installer",
        notarizationConfigured: true,
        notarizationProfileRef: "notarytool:lime-prod",
      },
      updater: {
        enabled: true,
        pubkey: "lime-prod-updater-pubkey",
        endpoint: "https://updates.limecloud.example/content-factory",
      },
      rollback: {
        strategy: "restore_previous_package",
        previousPackageHash: "sha256:previous",
      },
      productionArtifactBuilderAvailable: false,
    });

    expect(plan.productionReady).toBe(false);
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PACKAGE_DESCRIPTOR_NON_PRODUCTION" }),
        expect.objectContaining({
          code: "PRODUCTION_ARTIFACT_BUILDER_MISSING",
        }),
      ]),
    );
    expect(plan.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MACOS_IDENTITY_INVALID" }),
        expect.objectContaining({ code: "UPDATER_CONFIG_MISSING" }),
        expect.objectContaining({ code: "ROLLBACK_PLAN_MISSING" }),
      ]),
    );
    expect(plan.signing).toMatchObject({
      applicationCertificateKind: "developer_id_application",
      installerCertificateKind: "developer_id_installer",
      notarizationConfigured: true,
      notarizationProfileRef: "notarytool:lime-prod",
    });
    expect(plan.updater).toEqual({
      enabled: true,
      pubkeyConfigured: true,
      endpoint: "https://updates.limecloud.example/content-factory",
    });
    expect(plan.rollback).toMatchObject({
      required: true,
      configured: true,
      strategy: "restore_previous_package",
      previousPackageHash: "sha256:previous",
    });
  });

  it("standalone release plan 应暴露 signing / updater / rollback 缺口", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const plan = buildStandaloneReleasePlan({
      descriptor,
      channel: "stable",
      updater: { enabled: false },
    });

    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "APPLICATION_SIGNING_MISSING" }),
        expect.objectContaining({ code: "INSTALLER_SIGNING_MISSING" }),
        expect.objectContaining({ code: "MACOS_NOTARIZATION_MISSING" }),
        expect.objectContaining({ code: "UPDATER_CONFIG_MISSING" }),
        expect.objectContaining({ code: "ROLLBACK_PLAN_MISSING" }),
      ]),
    );
    expect(plan.updater).toEqual({
      enabled: false,
      pubkeyConfigured: false,
      endpoint: undefined,
    });
    expect(plan.rollback).toMatchObject({
      required: true,
      configured: false,
    });
  });

  it("production artifact build plan 应暴露真实 builder / signer / updater adapter 需求", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const releasePlan = buildStandaloneReleasePlan({
      descriptor,
      channel: "stable",
      signing: {
        applicationCertificateKind: "developer_id_application",
        installerCertificateKind: "developer_id_installer",
        notarizationConfigured: true,
        notarizationProfileRef: "notarytool:lime-prod",
      },
      updater: {
        enabled: true,
        pubkey: "lime-prod-updater-pubkey",
        endpoint: "https://updates.limecloud.example/content-factory",
      },
      rollback: {
        strategy: "restore_previous_package",
        previousPackageHash: "sha256:previous",
      },
      productionArtifactBuilderAvailable: false,
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const materializedConfig = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {
        app: { windows: [{ title: "Lime" }] },
        plugins: { "deep-link": { desktop: { schemes: ["lime"] } } },
      },
    });

    const buildPlan = buildStandaloneArtifactBuildPlan({
      releasePlan,
      outputDirectory: "<dist>/agent-apps/content-factory",
      tauriConfig: {
        materializerResult: materializedConfig,
        configOutputPath:
          "<dist>/agent-apps/content-factory/src-tauri/tauri.conf.json",
        envOutputPath: "<dist>/agent-apps/content-factory/.env.standalone",
      },
    });

    expect(buildPlan).toMatchObject({
      appId: "content-factory-app",
      status: "blocked",
      readyToBuild: false,
      artifactRefs: [],
      requiredAdapters: [
        "tauri_config_writer",
        "tauri_build_runner",
        "app_bundle_builder",
        "macos_application_signer",
        "macos_pkg_builder",
        "macos_installer_signer",
        "macos_notarization_submitter",
        "updater_manifest_writer",
        "rollback_manifest_writer",
      ],
      tauriConfig: {
        status: "ready",
        configOutputPath:
          "<dist>/agent-apps/content-factory/src-tauri/tauri.conf.json",
        envOutputPath: "<dist>/agent-apps/content-factory/.env.standalone",
        runtimeEnv: {
          LIME_AGENT_APP_STANDALONE_APP_ID: "content-factory-app",
        },
        writePlan: {
          status: "ready",
          readyToWrite: true,
          appId: "content-factory-app",
          files: [
            expect.objectContaining({ kind: "tauri_config" }),
            expect.objectContaining({ kind: "runtime_env" }),
          ],
        },
      },
    });
    expect(buildPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PACKAGE_DESCRIPTOR_NON_PRODUCTION" }),
        expect.objectContaining({
          code: "PRODUCTION_ARTIFACT_BUILDER_MISSING",
        }),
      ]),
    );
    expect(buildPlan.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TAURI_CONFIG_MATERIALIZATION_BLOCKED",
        }),
      ]),
    );
  });

  it("production artifact build plan 应在 standalone config 未就绪时阻断真实构建", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const releasePlan = buildStandaloneReleasePlan({
      descriptor,
      channel: "internal",
      updater: { enabled: false },
    });

    const buildPlan = buildStandaloneArtifactBuildPlan({
      releasePlan,
      outputDirectory: "<dist>/agent-apps/content-factory",
    });

    expect(buildPlan.requiredAdapters).toEqual(
      expect.arrayContaining(["tauri_config_writer", "tauri_build_runner"]),
    );
    expect(buildPlan.tauriConfig).toEqual({
      status: "blocked",
      blockerCodes: ["TAURI_CONFIG_MATERIALIZER_MISSING"],
    });
    expect(buildPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TAURI_CONFIG_MATERIALIZATION_BLOCKED",
        }),
      ]),
    );
  });

  it("production artifact build plan 应在 config write plan 不可落盘时阻断真实构建", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const releasePlan = buildStandaloneReleasePlan({
      descriptor,
      channel: "internal",
      updater: { enabled: false },
    });
    const registrationPlan = buildNativeShellRegistrationPlan({ descriptor });
    const materializedConfig = materializeStandaloneTauriConfig({
      registrationPlan,
      baseConfig: {},
    });

    const buildPlan = buildStandaloneArtifactBuildPlan({
      releasePlan,
      outputDirectory: "<dist>/agent-apps/content-factory",
      tauriConfig: {
        materializerResult: materializedConfig,
        configOutputPath: "",
        envOutputPath: "",
      },
    });

    expect(buildPlan.tauriConfig).toEqual({
      status: "blocked",
      blockerCodes: ["CONFIG_OUTPUT_PATH_MISSING", "ENV_OUTPUT_PATH_MISSING"],
    });
    expect(buildPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TAURI_CONFIG_WRITE_PLAN_BLOCKED" }),
      ]),
    );
  });

  it("unavailable production artifact builder 不应产出伪发布 artifact", async () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const releasePlan = buildStandaloneReleasePlan({
      descriptor,
      channel: "stable",
      updater: { enabled: false },
    });
    const builder = new UnavailableProductionArtifactBuilder();

    await expect(
      builder.build({
        releasePlan,
        outputDirectory: "<dist>/agent-apps/content-factory",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      readyToBuild: false,
      artifactRefs: [],
      blockers: expect.arrayContaining([
        expect.objectContaining({ code: "APPLICATION_SIGNING_MISSING" }),
        expect.objectContaining({ code: "UPDATER_CONFIG_MISSING" }),
      ]),
    });
  });

  it("updater manifest plan 应在 artifact / release 未就绪时保持 blocked", () => {
    const shell = buildStandaloneShell();
    const descriptor = buildPackageDescriptor({
      target: buildMacOsStandaloneTarget(),
      shell,
    });
    const releasePlan = buildStandaloneReleasePlan({
      descriptor,
      channel: "stable",
      signing: {
        applicationCertificateKind: "developer_id_application",
        installerCertificateKind: "developer_id_installer",
        notarizationConfigured: true,
      },
      updater: {
        enabled: true,
        pubkey: "lime-prod-updater-pubkey",
        endpoint: "https://updates.limecloud.example/content-factory",
      },
      rollback: {
        strategy: "restore_previous_package",
        previousPackageHash: "sha256:previous",
      },
      productionArtifactBuilderAvailable: false,
    });
    const artifactBuildPlan = buildStandaloneArtifactBuildPlan({
      releasePlan,
      outputDirectory: "<dist>/agent-apps/content-factory",
    });

    const updaterManifestPlan = buildStandaloneUpdaterManifestPlan({
      releasePlan,
      artifactBuildPlan,
    });

    expect(updaterManifestPlan).toMatchObject({
      appId: "content-factory-app",
      channel: "stable",
      endpoint: "https://updates.limecloud.example/content-factory",
      pubkeyConfigured: true,
      rollbackRequired: true,
      rollbackConfigured: true,
      status: "blocked",
      readyToPublish: false,
    });
    expect(updaterManifestPlan).not.toHaveProperty("manifestRef");
    expect(updaterManifestPlan.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PACKAGE_DESCRIPTOR_NON_PRODUCTION" }),
        expect.objectContaining({
          code: "PRODUCTION_ARTIFACT_BUILDER_MISSING",
        }),
        expect.objectContaining({ code: "ARTIFACT_BUILD_BLOCKED" }),
      ]),
    );
  });
});
