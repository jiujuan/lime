import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAppMetadataLocaleBuildManifest,
  formatAppMetadataLocaleBuildManifest,
  runCli,
} from "./i18n-app-metadata-locale-build-manifest";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-i18n-app-metadata-locale-"),
  );
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeScope(root: string, items: unknown[]): void {
  writeFile(
    root,
    "internal/roadmap/i18n/app-metadata-translation-scope.json",
    JSON.stringify(
      {
        generatedMetadataAllowed: false,
        items,
        manifestGenerationAllowed: true,
        owner: "release",
        schemaVersion: "lime.i18n.appMetadataTranslationScope.v1",
        sourceLocale: "zh-CN",
        targetLocales: ["en-US"],
        workflowStatus: "ready",
      },
      null,
      2,
    ),
  );
}

function forgeConfigFixture(): string {
  return [
    'const PRODUCT_NAME = "Lime";',
    'const APP_ID = "com.limecloud.lime";',
    "",
    "function nsisConfig() {",
    "  return {",
    '    artifactName: "${productName}_${version}_${arch}-setup.${ext}",',
    "  };",
    "}",
    "",
    "export default {",
    "  packagerConfig: {",
    "    protocols: [",
    "      {",
    '        schemes: ["lime"],',
    "      },",
    "    ],",
    "  },",
    "};",
  ].join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n app metadata locale build manifest", () => {
  it("应基于 metadata scope 生成发布前 locale manifest", () => {
    const root = createTempDir();
    writeFile(
      root,
      "package.json",
      JSON.stringify(
        {
          description: "AI content workspace for Chinese creators.",
          keywords: ["ai", "lime"],
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "forge.config.mjs",
      forgeConfigFixture(),
    );
    writeScope(root, [
      {
        consumer: "package-registry",
        field: "description",
        kind: "package-description",
        localization: "translatable",
        localizedValues: {
          "en-US": "AI content workspace for Chinese creators.",
        },
        path: "package.json",
        priority: "required-before-multilingual-release",
      },
      {
        consumer: "electron-forge",
        field: "productName",
        kind: "app-product-name",
        localization: "stable-brand",
        path: "forge.config.mjs",
        priority: "stable",
      },
      {
        consumer: "package-registry",
        field: "keywords",
        kind: "package-keywords",
        localization: "source-only",
        path: "package.json",
        priority: "source-only",
      },
    ]);

    const manifest = buildAppMetadataLocaleBuildManifest({ repoRoot: root });

    expect(manifest.schemaVersion).toBe(
      "lime.i18n.appMetadataLocaleBuildManifest.v1",
    );
    expect(manifest.summary).toEqual({
      blockedEntryCount: 0,
      entryCount: 3,
      generatedConfigEmissionAllowed: false,
      localizedEntryCount: 1,
      manifestGenerationAllowed: true,
      missingFieldCount: 0,
      requiredLocalizedMissingCount: 0,
      sourceOnlyEntryCount: 1,
      stableEntryCount: 1,
      targetLocaleCount: 1,
      translatableEntryCount: 1,
      workflowStatus: "ready",
    });
    expect(manifest.entries.map((entry) => entry.targets[0]?.action)).toEqual([
      "include-localized-value",
      "copy-stable-field",
      "queue-source-only",
    ]);
    expect(formatAppMetadataLocaleBuildManifest(manifest, "text")).toContain(
      "workflow status: ready",
    );
    expect(formatAppMetadataLocaleBuildManifest(manifest, "text")).toContain(
      "generated config emission: disabled",
    );
  });

  it("应把缺失字段和 required localized value 缺失暴露为阻断项", () => {
    const root = createTempDir();
    writeFile(
      root,
      "package.json",
      JSON.stringify({ description: "AI workspace." }, null, 2),
    );
    writeScope(root, [
      {
        field: "description",
        localization: "translatable",
        path: "package.json",
        priority: "required-before-multilingual-release",
      },
      {
        field: "missing",
        localization: "stable-brand",
        path: "package.json",
        priority: "stable",
      },
    ]);

    const manifest = buildAppMetadataLocaleBuildManifest({ repoRoot: root });

    expect(manifest.summary.workflowStatus).toBe("blocked");
    expect(manifest.summary.blockedEntryCount).toBe(2);
    expect(manifest.summary.missingFieldCount).toBe(1);
    expect(manifest.summary.requiredLocalizedMissingCount).toBe(1);
    expect(manifest.entries.map((entry) => entry.targets[0]?.action)).toEqual([
      "block-required-localized-value",
      "block-missing-field",
    ]);
  });

  it("应支持 CLI 写出 JSON manifest 并在 --check ready 时返回 0", () => {
    const root = createTempDir();
    writeFile(
      root,
      "package.json",
      JSON.stringify({ description: "AI workspace." }, null, 2),
    );
    writeScope(root, [
      {
        field: "description",
        localization: "translatable",
        localizedValues: { "en-US": "AI workspace." },
        path: "package.json",
        priority: "required-before-multilingual-release",
      },
    ]);
    const outFile = path.join(root, "manifest.json");
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const exitCode = runCli([
      "--format",
      "json",
      "--repo-root",
      root,
      "--output",
      outFile,
      "--check",
    ]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outFile, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.appMetadataLocaleBuildManifest.v1",
        summary: expect.objectContaining({
          workflowStatus: "ready",
        }),
      }),
    );
  });
});
