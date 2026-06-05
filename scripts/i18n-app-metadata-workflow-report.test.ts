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
          keywords: ["ai", "lime"],
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "lime-rs/Cargo.toml",
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
      "electron-builder.yml",
      [
        "appId: com.limecloud.lime",
        "productName: Lime",
        "directories:",
        "  output: release-electron",
        "artifactName: ${productName}_${version}_${arch}.${ext}",
        "protocols:",
        "  - name: Lime URL",
        "    schemes:",
        "      - lime",
        "mac:",
        "  icon: lime-rs/icons/icon.icns",
        "  target:",
        "    - target: dmg",
        "    - target: zip",
        "win:",
        "  icon: lime-rs/icons/icon.ico",
        "  target:",
        "    - target: nsis",
      ].join("\n"),
    );
    writeFile(
      root,
      "lime-rs/capabilities/agent-app-shell.json",
      JSON.stringify(
        {
          identifier: "agent-app-shell",
          description: "Agent App 独立 Shell 只允许使用 Desktop Host IPC 调用宿主封装能力。",
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
              path: "package.json",
              field: "keywords",
              localization: "source-only",
              priority: "source-only",
            },
            {
              path: "electron-builder.yml",
              field: "productName",
              localization: "stable-brand",
              priority: "stable",
            },
            {
              path: "electron-builder.yml",
              field: "appId",
              localization: "stable-identifier",
              priority: "stable",
            },
            {
              path: "electron-builder.yml",
              field: "artifactName",
              localization: "source-only",
              priority: "source-only",
            },
            {
              path: "electron-builder.yml",
              field: "protocols[0].schemes",
              localization: "stable-identifier",
              priority: "stable",
            },
            {
              path: "electron-builder.yml",
              field: "mac.icon",
              localization: "source-only",
              priority: "source-only",
            },
            {
              path: "electron-builder.yml",
              field: "win.icon",
              localization: "source-only",
              priority: "source-only",
            },
            {
              path: "lime-rs/capabilities/agent-app-shell.json",
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
    expect(report.summary.metadataReviewedFieldCount).toBe(9);
    expect(report.summary.metadataScopeItemCount).toBe(9);
    expect(report.summary.metadataTranslatableFieldCount).toBe(1);
    expect(report.summary.metadataUnscopedFieldCount).toBe(0);
    expect(report.appMetadataTranslationScope).toEqual(
      expect.objectContaining({
        generatedMetadataAllowed: false,
        manifestGenerationAllowed: true,
        itemCount: 9,
        owner: "release",
        requiredBeforeMultilingualReleaseCount: 1,
        schemaVersion: "lime.i18n.appMetadataTranslationScope.v1",
        sourceLocale: "zh-CN",
        sourceOnlyFieldCount: 5,
        stableFieldCount: 3,
        targetLocales: ["en-US"],
        translatableFieldCount: 1,
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
    expect(report.electronBuilderConfig.productName).toBe("Lime");
    expect(report.electronBuilderConfig.appId).toBe("com.limecloud.lime");
    expect(report.electronBuilderConfig.deepLinkSchemes).toEqual(["lime"]);
    expect(report.electronBuilderConfig.macTargets).toEqual(["dmg", "zip"]);
    expect(report.electronBuilderConfig.winTargets).toEqual(["nsis"]);
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
    writeFile(root, "lime-rs/Cargo.toml", '[package]\nname = "lime"\nversion = "1.47.0"\n');
    writeFile(
      root,
      "electron-builder.yml",
      [
        "appId: com.limecloud.lime",
        "productName: Lime",
        "artifactName: ${productName}_${version}_${arch}.${ext}",
      ].join("\n"),
    );
    writeFile(
      root,
      "lime-rs/capabilities/agent-app-shell.json",
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
              path: "electron-builder.yml",
              field: "protocols[1].schemes",
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
    expect(report.summary.metadataUnscopedFieldCount).toBe(3);
    expect(report.metadataFieldCoverage.missingScopedFields).toEqual([
      "electron-builder.yml#protocols[1].schemes",
    ]);
    expect(report.metadataFieldCoverage.unscopedMetadataFields).toEqual([
      "electron-builder.yml#appId",
      "electron-builder.yml#artifactName",
      "electron-builder.yml#productName",
    ]);
  });

  it("应支持 CLI 写出 JSON", () => {
    const root = createTempDir();
    writeFile(root, "package.json", JSON.stringify({ name: "lime", version: "1.47.0" }, null, 2));
    writeFile(root, "lime-rs/Cargo.toml", '[package]\nname = "lime"\nversion = "1.47.0"\n');
    writeFile(root, "electron-builder.yml", "productName: Lime\n");
    writeFile(root, "lime-rs/capabilities/agent-app-shell.json", JSON.stringify({ identifier: "agent-app-shell" }, null, 2));

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
