import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/plugin/testing/fixtures/content-factory-app.json";
import { buildPackageIdentity } from "@/features/plugin/install/packageIdentity";
import { normalizeManifest } from "@/features/plugin/manifest/normalizeManifest";
import { parseManifest } from "@/features/plugin/manifest/parseManifest";
import type { InstalledPluginState } from "@/features/plugin/types";
import { normalizePluginManifest } from "@/features/plugin";
import { projectPluginRegistryFromInstalledPlugins } from "@/features/plugin";
import {
  buildWorkspacePluginRuntimeReadiness,
  extractWorkspacePluginRuntimeReadinessFromRequestMetadata,
} from "./workspacePluginRuntimeReadiness";

function installedContentFactory(
  overrides: Partial<InstalledPluginState> = {},
): InstalledPluginState {
  const parsedManifest = parseManifest(contentFactoryFixture);
  const manifest = normalizeManifest(parsedManifest);
  const base: InstalledPluginState = {
    appId: manifest.appId,
    identity: buildPackageIdentity({
      manifest: parsedManifest,
      loadedAt: "2026-07-02T00:00:00.000Z",
    }),
    manifest,
    projection: {} as InstalledPluginState["projection"],
    readiness: {
      appId: manifest.appId,
      status: "ready",
      checkedAt: "2026-07-02T00:00:00.000Z",
      blockers: [],
      warnings: [],
      supportedCapabilities: [],
      missingCapabilities: [],
      entryReadiness: [],
      installModes: [],
    },
    installMode: "in_lime",
    runtimeProfileSummary:
      {} as InstalledPluginState["runtimeProfileSummary"],
    setup: {} as InstalledPluginState["setup"],
    disabled: false,
    installedAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };
  return {
    ...base,
    ...overrides,
    readiness: {
      ...base.readiness,
      ...(overrides.readiness ?? {}),
    },
  };
}

describe("workspacePluginRuntimeReadiness", () => {
  it("应从内容工厂 workflow 投影 CLI / connectors / hooks readiness", () => {
    const installed = installedContentFactory();
    const projection = projectPluginRegistryFromInstalledPlugins([installed]);
    const contract = projection.contracts[0];

    const readiness = buildWorkspacePluginRuntimeReadiness({
      contract,
      installedPlugin: installed,
      activePluginUiId: "content-factory-app",
      workflowKey: "content_article_workflow",
      taskKind: "content.article.generate",
      intentKey: "content_article_generate",
    });

    expect(readiness).toMatchObject({
      pluginId: "content-factory-app",
      activePluginUiId: "content-factory-app",
      workflowKey: "content_article_workflow",
      status: "ready",
      connectorRefs: ["lime-knowledge", "web-research", "media-generation"],
      hookRefs: ["prompt-submit", "task-complete"],
      cliRefs: ["content-factory"],
      clis: [
        expect.objectContaining({
          id: "content-factory",
          status: "ready",
          entrypoint: "./cli/content-factory.mjs",
        }),
      ],
      hooks: expect.arrayContaining([
        expect.objectContaining({
          id: "prompt-submit",
          status: "ready",
          event: "prompt.submit",
        }),
        expect.objectContaining({
          id: "task-complete",
          status: "ready",
          event: "task.complete",
        }),
      ]),
    });
    expect(readiness.connectors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "web-research",
          status: "ready",
          source: "manifest_declaration",
          reasonCodes: [],
          kind: "api",
          taskKinds: ["content.article.generate"],
        }),
      ]),
    );
  });

  it("宿主 readiness blocked 时应把 runtime readiness fail closed", () => {
    const installed = installedContentFactory({
      readiness: {
        ...installedContentFactory().readiness,
        status: "blocked",
        blockers: [
          {
            code: "CLOUD_REGISTRATION_REQUIRED",
            severity: "blocker",
            message: "registration required",
          },
        ],
      },
    });
    const projection = projectPluginRegistryFromInstalledPlugins([installed]);

    const readiness = buildWorkspacePluginRuntimeReadiness({
      contract: projection.contracts[0],
      installedPlugin: installed,
      workflowKey: "content_article_workflow",
    });

    expect(readiness.status).toBe("blocked");
    expect(readiness.blockerCodes).toContain("CLOUD_REGISTRATION_REQUIRED");
    expect(readiness.connectors[0]).toMatchObject({
      status: "blocked",
      reasonCodes: ["CLOUD_REGISTRATION_REQUIRED"],
    });
  });

  it("workflow 引用缺失 hook 且没有 registry 时应阻断", () => {
    const contract = normalizePluginManifest({
      id: "broken-plugin",
      displayName: "Broken",
      version: "1.0.0",
      workflows: [
        {
          key: "broken-workflow",
          hookPolicy: {
            prompt: ["missing-hook"],
          },
        },
      ],
      hooks: [],
    });

    const readiness = buildWorkspacePluginRuntimeReadiness({
      contract,
      workflowKey: "broken-workflow",
    });

    expect(readiness).toMatchObject({
      status: "blocked",
      blockerCodes: ["PLUGIN_HOOK_DECLARATION_MISSING"],
      hooks: [
        expect.objectContaining({
          id: "missing-hook",
          status: "blocked",
          source: "workflow_ref",
        }),
      ],
    });
  });

  it("应从 request metadata 反投影 runtime readiness 以支持历史恢复", () => {
    const readiness = extractWorkspacePluginRuntimeReadinessFromRequestMetadata(
      {
        harness: {
          plugin_activation: {
            runtime_readiness: {
              plugin_id: "content-factory-app",
              workflow_key: "content_article_workflow",
              status: "declared",
              connector_refs: ["web-research"],
              connectors: [
                {
                  id: "web-research",
                  status: "declared",
                  source: "runtime_registry",
                  reasonCodes: ["PLUGIN_RUNTIME_REGISTRY_DECLARED"],
                },
              ],
            },
          },
        },
      },
    );

    expect(readiness).toMatchObject({
      pluginId: "content-factory-app",
      workflowKey: "content_article_workflow",
      status: "declared",
      connectors: [
        expect.objectContaining({
          id: "web-research",
          status: "declared",
          source: "runtime_registry",
        }),
      ],
    });
  });
});
