import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { normalizeManifest } from "./normalizeManifest";
import {
  AgentAppManifestError,
  mergeLayeredManifest,
  parseManifest,
} from "./parseManifest";

describe("Agent App manifest P0", () => {
  it("应解析并归一化 内容工厂 v3 fixture", () => {
    const manifest = parseManifest(contentFactoryFixture);
    const normalized = normalizeManifest(manifest);

    expect(normalized).toMatchObject({
      manifestVersion: "0.11",
      appId: "content-factory-app",
      displayName: "内容工厂",
      version: "2.0.0",
      runtimeTargets: ["local"],
      storage: {
        namespace: "content-factory-app",
      },
    });
    expect(normalized.entries.map((entry) => entry.kind)).toEqual([
      "workflow",
    ]);
    expect(normalized.entries.map((entry) => entry.key)).toEqual([
      "content_factory",
    ]);
    expect(normalized.runtimePackage.worker).toMatchObject({
      entrypoint: "./src/runtime/content-factory-worker.mjs",
      contract: "./app.runtime.yaml",
      sampleRequest: "./examples/runtime-request.sample.json",
      outputArtifactKind: "content_factory.workspace_patch",
    });
    expect(normalized.profiles).toEqual(["workbench"]);
    expect(normalized.workbench?.productionObjects?.map((object) => object.kind)).toEqual([
      "contentBrief",
      "articleDraft",
      "imageGenerationSet",
      "videoScript",
      "videoStoryboard",
      "deliveryChecklist",
    ]);
  });

  it("缺少 entries 时应拒绝 manifest", () => {
    expect(() =>
      parseManifest({
        manifestVersion: "0.3.0",
        name: "empty-app",
        version: "0.3.0",
        entries: [],
      }),
    ).toThrow(AgentAppManifestError);
  });

  it("应为可选字段填充 P0 默认值", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.3.0",
        name: "Simple App",
        version: "0.3.0",
        entries: [{ key: "home", kind: "page" }],
      }),
    );

    expect(normalized).toMatchObject({
      appId: "simple-app",
      status: "draft",
      appType: "domain-app",
      runtimeTargets: ["local"],
    });
    expect(normalized.entries[0]).toMatchObject({
      key: "home",
      title: "home",
      enabledByDefault: true,
    });
  });

  it("应把 v0.6 capability list 归一化为稳定 capability range", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.6.0",
        name: "Content Factory App",
        version: "0.6.0",
        requires: {
          sdk: "@lime/app-sdk@^0.6.0",
          capabilities: ["lime.agent", "lime.skills", "lime.usage"],
        },
        entries: [{ key: "home", kind: "page" }],
      }),
    );

    expect(normalized.manifestVersion).toBe("0.6");
    expect(normalized.requires.sdk).toBe("@lime/app-sdk@^0.6.0");
    expect(normalized.requires.capabilities).toMatchObject({
      "lime.agent": "*",
      "lime.skills": "*",
      "lime.usage": "*",
    });
  });

  it("应消费 v0.8 install contract 并投影 install modes", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.8.0",
        name: "Content Factory App",
        displayName: "内容工厂",
        version: "0.8.0",
        requires: {
          sdk: "@lime/app-sdk@^0.8.0",
          capabilities: ["lime.agent", "lime.storage"],
        },
        entries: [{ key: "dashboard", kind: "page" }],
        install: {
          modes: ["in_lime", "standalone", "runtime_backed"],
          runtime: {
            minVersion: "0.8.0",
            distribution: {
              standalone: {
                embedRuntime: true,
                shell: "lime-app-shell",
              },
              runtimeBacked: {
                requires: "lime-runtime",
                minVersion: "0.8.0",
              },
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
        },
      }),
    );

    expect(normalized.manifestVersion).toBe("0.8");
    expect(normalized.install).toMatchObject({
      supportedModes: ["in_lime", "standalone", "runtime_backed"],
      preferredMode: "in_lime",
      runtime: {
        minVersion: "0.8.0",
      },
      standalone: {
        shell: "lime-app-shell",
        bundleId: "ai.limecloud.contentfactory",
        platforms: ["macos", "windows"],
        autoUpdate: true,
      },
    });
  });

  it("应接受 v0.10 manifest 并保留当前安装契约", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.10.0",
        name: "Content Factory App",
        displayName: "内容工厂",
        version: "0.10.0",
        requires: {
          sdk: "@lime/app-sdk@^0.10.0",
          capabilities: [
            "lime.agent",
            "lime.connectors",
            "lime.terminal",
          ],
        },
        entries: [{ key: "dashboard", kind: "page" }],
        install: {
          modes: ["in_lime", "standalone", "runtime_backed"],
          runtime: {
            minVersion: "0.10.0",
            distribution: {
              standalone: {
                embedRuntime: true,
                shell: "lime-app-shell",
              },
              runtimeBacked: {
                requires: "lime-runtime",
                minVersion: "0.10.0",
              },
            },
          },
          standalone: {
            shell: "lime-app-shell",
            bundleId: "ai.limecloud.contentfactory",
            platforms: ["macos", "windows"],
          },
          runtimeBacked: {
            requires: "lime-runtime",
            minVersion: "0.10.0",
          },
        },
      }),
    );

    expect(normalized.manifestVersion).toBe("0.10");
    expect(normalized.requires.sdk).toBe("@lime/app-sdk@^0.10.0");
    expect(normalized.requires.capabilities).toMatchObject({
      "lime.agent": "*",
      "lime.connectors": "*",
      "lime.terminal": "*",
    });
    expect(normalized.install.runtime.minVersion).toBe("0.10.0");
    expect(normalized.install.supportedModes).toEqual([
      "in_lime",
      "standalone",
      "runtime_backed",
    ]);
  });

  it("应接受 v0.11 manifest 并保留当前安装契约", () => {
    const normalized = normalizeManifest(
      parseManifest({
        manifestVersion: "0.11.0",
        name: "Content Factory App",
        displayName: "内容工厂",
        version: "0.11.0",
        requires: {
          sdk: "@lime/app-sdk@^0.11.0",
          capabilities: [
            "lime.agent",
            "lime.connectors",
            "lime.terminal",
          ],
        },
        entries: [{ key: "dashboard", kind: "page" }],
        install: {
          modes: ["in_lime", "standalone", "runtime_backed"],
          runtime: {
            minVersion: "0.11.0",
            distribution: {
              standalone: {
                embedRuntime: true,
                shell: "lime-app-shell",
              },
              runtimeBacked: {
                requires: "lime-runtime",
                minVersion: "0.11.0",
              },
            },
          },
          standalone: {
            shell: "lime-app-shell",
            bundleId: "ai.limecloud.contentfactory",
            platforms: ["macos", "windows"],
          },
          runtimeBacked: {
            requires: "lime-runtime",
            minVersion: "0.11.0",
          },
        },
      }),
    );

    expect(normalized.manifestVersion).toBe("0.11");
    expect(normalized.requires.sdk).toBe("@lime/app-sdk@^0.11.0");
    expect(normalized.requires.capabilities).toMatchObject({
      "lime.agent": "*",
      "lime.connectors": "*",
      "lime.terminal": "*",
    });
    expect(normalized.install.runtime.minVersion).toBe("0.11.0");
    expect(normalized.install.supportedModes).toEqual([
      "in_lime",
      "standalone",
      "runtime_backed",
    ]);
  });

  it("应按 v0.5 分层 manifest 文件合并发现面和治理配置", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.5.0",
        name: "content-factory-app",
        version: "0.5.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
        permissions: [{ key: "read_selected_files", reason: "读取文件" }],
      },
      [
        {
          entries: [
            {
              key: "dashboard",
              kind: "page",
              title: "内容工厂首页",
              route: "/dashboard",
            },
            { key: "settings", kind: "settings", title: "设置" },
          ],
        },
        {
          permissions: [
            {
              key: "read_selected_files",
              scope: "filesystem",
              required: true,
            },
            { key: "invoke_agent_tasks", scope: "agent", required: true },
          ],
        },
        {
          capabilities: {
            "lime.ui": {
              routes: [{ path: "/dashboard" }],
            },
          },
          errors: {
            model_setup_required: {
              severity: "setup",
            },
          },
          i18n: {
            defaultLocale: "zh-CN",
          },
          signature: {
            mode: "development",
          },
          readiness: {
            checks: [{ key: "manifest_layers", required: true }],
          },
          health: {
            probes: [{ key: "ui_entry", path: "/dashboard" }],
          },
          install: {
            modes: ["in_lime", "standalone"],
          },
        },
      ],
    );
    const normalized = normalizeManifest(manifest);

    expect(normalized.manifestVersion).toBe("0.5");
    expect(manifest.entries).toEqual([
      {
        key: "dashboard",
        kind: "page",
        title: "内容工厂首页",
        route: "/dashboard",
      },
      { key: "settings", kind: "settings", title: "设置" },
    ]);
    expect(manifest.permissions).toEqual([
      {
        key: "read_selected_files",
        reason: "读取文件",
        scope: "filesystem",
        required: true,
      },
      { key: "invoke_agent_tasks", scope: "agent", required: true },
    ]);
    expect(
      (manifest as unknown as Record<string, unknown>).capabilityConfig,
    ).toEqual({
      "lime.ui": {
        routes: [{ path: "/dashboard" }],
      },
    });
    expect((manifest as unknown as Record<string, unknown>).errors).toEqual({
      model_setup_required: {
        severity: "setup",
      },
    });
    expect((manifest as unknown as Record<string, unknown>).i18n).toEqual({
      defaultLocale: "zh-CN",
    });
    expect((manifest as unknown as Record<string, unknown>).signature).toEqual({
      mode: "development",
    });
    expect((manifest as unknown as Record<string, unknown>).readiness).toEqual({
      checks: [{ key: "manifest_layers", required: true }],
    });
    expect((manifest as unknown as Record<string, unknown>).health).toEqual({
      probes: [{ key: "ui_entry", path: "/dashboard" }],
    });
    expect((manifest as unknown as Record<string, unknown>).install).toEqual({
      modes: ["in_lime", "standalone"],
    });
    expect(
      (manifest as unknown as Record<string, unknown>).agentRuntime,
    ).toBeUndefined();
  });

  it("应按 v0.6 分层 manifest 文件合并入口、权限和运行合同", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.6.0",
        name: "content-factory-app",
        version: "0.6.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
        permissions: [{ key: "read_selected_files", reason: "读取文件" }],
      },
      [
        {
          entries: [
            {
              key: "dashboard",
              kind: "page",
              title: "内容工厂首页",
              route: "/dashboard",
            },
            { key: "settings", kind: "settings", title: "设置" },
          ],
        },
        {
          permissions: [
            {
              key: "read_selected_files",
              scope: "filesystem",
              required: true,
            },
            { key: "invoke_agent_tasks", scope: "agent", required: true },
          ],
        },
        {
          capabilities: {
            "lime.ui": {
              routes: [{ path: "/dashboard" }],
            },
          },
          i18n: {
            defaultLocale: "zh-CN",
          },
          agentRuntime: {
            agentTask: {
              eventSchema: "lime.agent-task-event.v1",
            },
          },
        },
      ],
    );

    expect(manifest.entries).toEqual([
      {
        key: "dashboard",
        kind: "page",
        title: "内容工厂首页",
        route: "/dashboard",
      },
      { key: "settings", kind: "settings", title: "设置" },
    ]);
    expect(manifest.permissions).toEqual([
      {
        key: "read_selected_files",
        reason: "读取文件",
        scope: "filesystem",
        required: true,
      },
      { key: "invoke_agent_tasks", scope: "agent", required: true },
    ]);
    expect(
      (manifest as unknown as Record<string, unknown>).capabilityConfig,
    ).toEqual({
      "lime.ui": {
        routes: [{ path: "/dashboard" }],
      },
    });
    expect((manifest as unknown as Record<string, unknown>).i18n).toEqual({
      defaultLocale: "zh-CN",
    });
    expect(
      (manifest as unknown as Record<string, unknown>).agentRuntime,
    ).toEqual({
      agentTask: {
        eventSchema: "lime.agent-task-event.v1",
      },
    });
  });

  it("应按 v0.7 分层 manifest 文件合并需求边界和能力交接", () => {
    const manifest = mergeLayeredManifest(
      {
        manifestVersion: "0.7.0",
        name: "content-factory-app",
        version: "0.7.0",
        entries: [{ key: "dashboard", kind: "page", title: "首页" }],
      },
      [
        {
          requirements: {
            requirements: [
              {
                id: "CF-R001",
                text: "生成可审核内容草稿",
                priority: "mvp",
              },
            ],
            nonGoals: ["直接保存外部系统明文凭证"],
          },
        },
        {
          boundaries: [
            {
              requirementId: "CF-R001",
              planes: {
                app: { owns: ["workflow_state"] },
                host: { requires: ["lime.agent", "lime.evidence"] },
                human: { owns: ["publish_decision"] },
              },
            },
          ],
        },
        {
          integrations: [
            {
              key: "planning_table",
              provider: "cloud.table",
              executionPlane: "hybrid",
              hostCapability: "lime.connectors",
            },
          ],
        },
        {
          operations: [
            {
              key: "write_external_draft",
              type: "external_write",
              sideEffect: "external_write",
              approvalRequired: true,
              dryRunRequired: true,
              evidenceRequired: true,
              autoExecute: false,
            },
          ],
        },
      ],
    );
    const normalized = normalizeManifest(manifest);

    expect(normalized.manifestVersion).toBe("0.7");
    expect(normalized.requirements).toEqual({
      requirements: [
        {
          id: "CF-R001",
          text: "生成可审核内容草稿",
          priority: "mvp",
        },
      ],
      nonGoals: ["直接保存外部系统明文凭证"],
    });
    expect(normalized.boundary).toEqual([
      {
        requirementId: "CF-R001",
        planes: {
          app: { owns: ["workflow_state"] },
          host: { requires: ["lime.agent", "lime.evidence"] },
          human: { owns: ["publish_decision"] },
        },
      },
    ]);
    expect(normalized.integrations).toEqual([
      {
        key: "planning_table",
        provider: "cloud.table",
        executionPlane: "hybrid",
        hostCapability: "lime.connectors",
      },
    ]);
    expect(normalized.operations).toEqual([
      {
        key: "write_external_draft",
        type: "external_write",
        sideEffect: "external_write",
        approvalRequired: true,
        dryRunRequired: true,
        evidenceRequired: true,
        autoExecute: false,
      },
    ]);
  });
});
