import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeAppMetadataWorkflowReport,
  formatAppMetadataWorkflowReport,
  runCli,
} from "./i18n-app-metadata-workflow-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-app-metadata-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n app metadata workflow report", () => {
  it("应识别 app / installer 元数据仍是单语事实源", () => {
    const root = createTempDir();

    writeFile(
      root,
      "package.json",
      JSON.stringify(
        {
          name: "lime",
          version: "1.47.0",
          description: "AI content workspace for Chinese creators.",
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/Cargo.toml",
      [
        '[workspace.package]',
        'version = "1.47.0"',
        '',
        '[package]',
        'name = "lime"',
        'version = "1.47.0"',
        'description = "AI API Proxy Desktop App"',
        'homepage = "https://github.com/aiclientproxy/lime"',
      ].join("\n"),
    );
    writeFile(
      root,
      "src-tauri/tauri.conf.json",
      JSON.stringify(
        {
          productName: "Lime",
          identifier: "com.limecloud.lime",
          app: { windows: [{ title: "Lime" }] },
          bundle: {
            fileAssociations: [
              {
                description: "Lime Skill Package",
                name: "Lime Skill Package",
              },
            ],
            targets: "all",
          },
          plugins: { updater: { pubkey: "lime-dev-placeholder" }, "deep-link": { desktop: { schemes: ["lime"] } } },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/tauri.conf.headless.json",
      JSON.stringify(
        {
          productName: "Lime",
          identifier: "com.limecloud.lime.headless",
          app: { windows: [{ title: "Lime" }] },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/capabilities/agent-app-shell.json",
      JSON.stringify(
        {
          identifier: "agent-app-shell",
          description: "Agent App 独立 Shell 只允许使用 Tauri IPC 调用 Lime 宿主封装能力。",
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "internal/roadmap/i18n/evidence/app-metadata-locale-build-manifest.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.appMetadataLocaleBuildManifest.v1",
          scope: {
            generatedConfigEmissionAllowed: false,
            manifestGenerationAllowed: true,
          },
          summary: {
            generatedConfigEmissionAllowed: false,
            manifestGenerationAllowed: true,
            workflowStatus: "ready",
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "internal/roadmap/i18n/app-metadata-translation-scope.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.appMetadataTranslationScope.v1",
          sourceLocale: "zh-CN",
          targetLocales: ["en-US"],
          workflowStatus: "ready",
          owner: "release",
          manifestGenerationAllowed: true,
          generatedMetadataAllowed: false,
          items: [
            {
              path: "package.json",
              field: "description",
              localization: "translatable",
              priority: "required-before-multilingual-release",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "productName",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "identifier",
              localization: "stable-identifier",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "app.windows[0].title",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "bundle.fileAssociations[0].name",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "bundle.fileAssociations[0].description",
              localization: "translatable",
              priority: "required-before-multilingual-release",
            },
            {
              path: "src-tauri/tauri.conf.headless.json",
              field: "productName",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.headless.json",
              field: "identifier",
              localization: "stable-identifier",
              priority: "stable",
            },
            {
              path: "src-tauri/tauri.conf.headless.json",
              field: "app.windows[0].title",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "src-tauri/capabilities/agent-app-shell.json",
              field: "description",
              localization: "internal-source-only",
              priority: "source-only",
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = analyzeAppMetadataWorkflowReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.appMetadataWorkflowReport.v1");
    expect(report.summary.hasInstallerLocalizationWorkflow).toBe(true);
    expect(report.summary.hasAppMetadataLocaleBuildManifest).toBe(true);
    expect(report.summary.appMetadataLocaleBuildManifestReady).toBe(true);
    expect(report.summary.hasMetadataTranslationScope).toBe(true);
    expect(report.summary.hasLocalizedAppMetadataArtifacts).toBe(true);
    expect(report.summary.hasLocaleAwareMetadataSources).toBe(true);
    expect(report.summary.metadataMissingScopedFieldCount).toBe(0);
    expect(report.summary.metadataReviewedFieldCount).toBe(10);
    expect(report.summary.metadataScopeItemCount).toBe(10);
    expect(report.summary.metadataTranslatableFieldCount).toBe(2);
    expect(report.summary.metadataUnscopedFieldCount).toBe(0);
    expect(report.appMetadataTranslationScope).toEqual(
      expect.objectContaining({
        generatedMetadataAllowed: false,
        manifestGenerationAllowed: true,
        itemCount: 10,
        owner: "release",
        requiredBeforeMultilingualReleaseCount: 2,
        schemaVersion: "lime.i18n.appMetadataTranslationScope.v1",
        sourceLocale: "zh-CN",
        sourceOnlyFieldCount: 1,
        stableFieldCount: 7,
        targetLocales: ["en-US"],
        translatableFieldCount: 2,
        workflowStatus: "ready",
      }),
    );
    expect(report.appMetadataLocaleBuildManifest).toEqual(
      expect.objectContaining({
        exists: true,
        generatedConfigEmissionAllowed: false,
        manifestGenerationAllowed: true,
        schemaVersion: "lime.i18n.appMetadataLocaleBuildManifest.v1",
        workflowStatus: "ready",
      }),
    );
    expect(report.metadataFieldCoverage).toEqual(
      expect.objectContaining({
        missingScopedFields: [],
        unscopedMetadataFields: [],
      }),
    );
    expect(report.tauriConfig.productName).toBe("Lime");
    expect(report.tauriConfig.deepLinkSchemes).toEqual(["lime"]);
    expect(formatAppMetadataWorkflowReport(report, "text")).toContain(
      "[i18n:app-metadata] workflow inventory",
    );
    expect(JSON.parse(formatAppMetadataWorkflowReport(report, "json"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
      }),
    );
  });

  it("应识别 metadata scope 漏管和引用失效字段", () => {
    const root = createTempDir();

    writeFile(
      root,
      "package.json",
      JSON.stringify(
        {
          name: "lime",
          version: "1.47.0",
          description: "AI content workspace for Chinese creators.",
        },
        null,
        2,
      ),
    );
    writeFile(root, "src-tauri/Cargo.toml", '[package]\nname = "lime"\nversion = "1.47.0"\n');
    writeFile(
      root,
      "src-tauri/tauri.conf.json",
      JSON.stringify(
        {
          productName: "Lime",
          identifier: "com.limecloud.lime",
          app: { windows: [{ title: "Lime" }] },
          bundle: {
            fileAssociations: [
              {
                description: "Lime Skill Package",
                name: "Lime Skill Package",
              },
            ],
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/tauri.conf.headless.json",
      JSON.stringify({ productName: "Lime" }, null, 2),
    );
    writeFile(
      root,
      "src-tauri/capabilities/agent-app-shell.json",
      JSON.stringify({ identifier: "agent-app-shell" }, null, 2),
    );
    writeFile(
      root,
      "internal/roadmap/i18n/app-metadata-translation-scope.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.appMetadataTranslationScope.v1",
          sourceLocale: "zh-CN",
          targetLocales: ["en-US"],
          workflowStatus: "not-started",
          owner: "release",
          generatedMetadataAllowed: false,
          items: [
            {
              path: "package.json",
              field: "description",
              localization: "translatable",
              priority: "required-before-multilingual-release",
            },
            {
              path: "src-tauri/tauri.conf.json",
              field: "bundle.fileAssociations[1].description",
              localization: "translatable",
              priority: "required-before-multilingual-release",
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = analyzeAppMetadataWorkflowReport({ repoRoot: root });

    expect(report.summary.hasInstallerLocalizationWorkflow).toBe(false);
    expect(report.summary.hasAppMetadataLocaleBuildManifest).toBe(false);
    expect(report.summary.appMetadataLocaleBuildManifestReady).toBe(false);
    expect(report.summary.metadataMissingScopedFieldCount).toBe(1);
    expect(report.summary.metadataUnscopedFieldCount).toBe(6);
    expect(report.metadataFieldCoverage.missingScopedFields).toEqual([
      "src-tauri/tauri.conf.json#bundle.fileAssociations[1].description",
    ]);
    expect(report.metadataFieldCoverage.unscopedMetadataFields).toEqual([
      "src-tauri/tauri.conf.headless.json#productName",
      "src-tauri/tauri.conf.json#app.windows[0].title",
      "src-tauri/tauri.conf.json#bundle.fileAssociations[0].description",
      "src-tauri/tauri.conf.json#bundle.fileAssociations[0].name",
      "src-tauri/tauri.conf.json#identifier",
      "src-tauri/tauri.conf.json#productName",
    ]);
  });

  it("应支持 CLI 写出 JSON", () => {
    const root = createTempDir();
    writeFile(root, "package.json", JSON.stringify({ name: "lime", version: "1.47.0" }, null, 2));
    writeFile(root, "src-tauri/Cargo.toml", '[package]\nname = "lime"\nversion = "1.47.0"\n');
    writeFile(root, "src-tauri/tauri.conf.json", JSON.stringify({ productName: "Lime" }, null, 2));
    writeFile(root, "src-tauri/tauri.conf.headless.json", JSON.stringify({ productName: "Lime" }, null, 2));
    writeFile(root, "src-tauri/capabilities/agent-app-shell.json", JSON.stringify({ identifier: "agent-app-shell" }, null, 2));

    const outFile = path.join(root, "report.json");
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = runCli(["--format", "json", "--repo-root", root, "--output", outFile]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outFile, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
      }),
    );
  });
});
