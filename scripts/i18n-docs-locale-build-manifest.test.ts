import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDocsLocaleBuildManifest,
  formatDocsLocaleBuildManifest,
  runCli,
} from "./i18n-docs-locale-build-manifest";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-docs-locale-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeScope(root: string, items: unknown[]): void {
  writeFile(
    root,
    "internal/roadmap/i18n/release-docs-translation-scope.json",
    JSON.stringify(
      {
        items,
        schemaVersion: "lime.i18n.releaseDocsTranslationScope.v1",
        sourceLocale: "zh-CN",
        targetLocales: ["en-US"],
      },
      null,
      2,
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n docs locale build manifest", () => {
  it("应基于 release docs translation scope 生成构建前 locale manifest", () => {
    const root = createTempDir();
    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n");
    writeFile(root, "docs/content/index.md", "# Docs\n");
    writeFile(
      root,
      "internal/roadmap/i18n/companions/docs-content-index.en.md",
      "# Docs\n",
    );
    writeFile(root, "docs/content/02.user-guide/a.md", "# Guide\n");
    writeScope(root, [
      {
        enUSPath: "README.en.md",
        kind: "readme",
        path: "README.md",
        priority: "required",
      },
      {
        enUSPath: "internal/roadmap/i18n/companions/docs-content-index.en.md",
        kind: "docs-home",
        path: "docs/content/index.md",
        priority: "pilot",
      },
      {
        enUSPath: null,
        kind: "help-doc",
        path: "docs/content/02.user-guide/a.md",
        priority: "source-only",
      },
    ]);

    const manifest = buildDocsLocaleBuildManifest({ repoRoot: root });

    expect(manifest.schemaVersion).toBe(
      "lime.i18n.docsLocaleBuildManifest.v1",
    );
    expect(manifest.summary).toEqual({
      blockedEntryCount: 0,
      companionEntryCount: 2,
      entryCount: 3,
      missingSourceCount: 0,
      pilotCompanionMissingCount: 0,
      requiredCompanionMissingCount: 0,
      routeEmissionAllowed: false,
      sourceOnlyCandidateCount: 1,
      targetLocaleCount: 1,
      workflowStatus: "ready",
    });
    expect(manifest.docsContent).toEqual({
      englishCompanionFileCount: 0,
      routeEmissionAllowed: false,
    });
    expect(manifest.entries.map((entry) => entry.targets[0]?.action)).toEqual([
      "include-companion",
      "include-companion",
      "queue-source-only",
    ]);
    expect(formatDocsLocaleBuildManifest(manifest, "text")).toContain(
      "workflow status: ready",
    );
  });

  it("应把 required companion 缺失暴露为阻断项", () => {
    const root = createTempDir();
    writeFile(root, "README.md", "# Lime\n");
    writeScope(root, [
      {
        enUSPath: "README.en.md",
        kind: "readme",
        path: "README.md",
        priority: "required",
      },
    ]);

    const manifest = buildDocsLocaleBuildManifest({ repoRoot: root });

    expect(manifest.summary.workflowStatus).toBe("blocked");
    expect(manifest.summary.blockedEntryCount).toBe(1);
    expect(manifest.summary.requiredCompanionMissingCount).toBe(1);
    expect(manifest.entries[0]?.targets[0]?.action).toBe(
      "block-required-companion",
    );
  });

  it("应支持 CLI 写出 JSON manifest 并在 --check ready 时返回 0", () => {
    const root = createTempDir();
    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n");
    writeScope(root, [
      {
        enUSPath: "README.en.md",
        kind: "readme",
        path: "README.md",
        priority: "required",
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
        schemaVersion: "lime.i18n.docsLocaleBuildManifest.v1",
        summary: expect.objectContaining({
          workflowStatus: "ready",
        }),
      }),
    );
  });
});
