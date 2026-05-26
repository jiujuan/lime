import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeI18nLanguageBoundaryReport,
  formatI18nLanguageBoundaryReport,
  runCli,
} from "./i18n-language-boundary-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-boundary-"));
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

describe("i18n language boundary report", () => {
  it("应把 language-like marker 分到不同产品语义边界", () => {
    const root = createTempDir();
    writeFile(root, "src/i18n/createI18n.ts", "i18n.language;\n");
    writeFile(
      root,
      "src-tauri/src/services/browser_environment_service.rs",
      "pub accept_language: Option<String>,\n",
    );
    writeFile(
      root,
      "src/features/agent/response.ts",
      "const response_language = request.response_language;\n",
    );
    writeFile(
      root,
      "src/lib/artifact/document.ts",
      'const language = document.language || "zh-CN";\n',
    );
    writeFile(
      root,
      "src-tauri/src/commands/voice_model_cmd.rs",
      'let preferredLanguage = "auto";\n',
    );
    writeFile(
      root,
      "src/lib/artifact/parser.ts",
      "const codeFence = /language-(\\w+)/.exec(className || \"\");\n",
    );
    writeFile(
      root,
      "src/components/agent/chat/components/MarkdownRenderer.tsx",
      "const language = match[1] || \"text\";\n",
    );
    writeFile(
      root,
      "src/components/settings-v2/general/appearance/index.tsx",
      "const language = normalizeLocalePreference(config.language);\n",
    );
    writeFile(
      root,
      "src-tauri/src/commands/media_task_cmd.rs",
      "pub language: Option<String>,\n",
    );

    const report = analyzeI18nLanguageBoundaryReport({
      rootDir: root,
      sourceDirs: ["src", "src-tauri"],
    });

    expect(report.schemaVersion).toBe("lime.i18n.languageBoundaryReport.v1");
    expect(report.summary.categorySummaries).toEqual(
      expect.arrayContaining([
        { category: "browserEnvironmentLanguage", count: 1 },
        { category: "agentResponseLanguage", count: 1 },
        { category: "contentTargetLanguage", count: 2 },
        { category: "asrLanguage", count: 1 },
        { category: "codeLanguage", count: 2 },
        { category: "uiLocale", count: 2 },
      ]),
    );
    expect(report.summary.fileSummaries).toEqual(
      expect.arrayContaining([
        {
          count: 1,
          file: "src-tauri/src/commands/media_task_cmd.rs",
        },
      ]),
    );
    expect(report.summary.markerSummaries).toEqual(
      expect.arrayContaining([
        { marker: "accept_language", count: 1 },
      ]),
    );
    expect(report.summary.unknownCount).toBe(0);
  });

  it("应输出 JSON、text，并支持 CLI 写入文件", () => {
    const root = createTempDir();
    const outputPath = path.join(root, "boundary.json");
    writeFile(root, "src/unknown.ts", "const language = item.language;\n");

    const report = analyzeI18nLanguageBoundaryReport({
      rootDir: root,
      sourceDirs: ["src"],
    });
    const json = JSON.parse(formatI18nLanguageBoundaryReport(report, "json")) as {
      summary: { unknownCount: number };
    };

    expect(json.summary.unknownCount).toBe(1);
    expect(formatI18nLanguageBoundaryReport(report, "text")).toContain(
      "[i18n:language-boundary] unknown language-like markers:",
    );

    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = runCli([
      "--format",
      "json",
      "--output",
      outputPath,
      "--root",
      root,
      "--source-dir",
      "src",
    ]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({
        filters: {},
        schemaVersion: "lime.i18n.languageBoundaryReport.v1",
      }),
    );
  });

  it("应支持按 language boundary category 输出聚焦 evidence", () => {
    const root = createTempDir();
    const outputPath = path.join(root, "content-target-language.json");
    writeFile(
      root,
      "src/features/artifact/document.ts",
      'const language = document.language || "zh-CN";\n',
    );
    writeFile(
      root,
      "src/features/browser/environment.ts",
      'const accept_language = "ja-JP";\n',
    );
    writeFile(
      root,
      "src/features/export/skill.ts",
      "const target_language = args.target_language;\n",
    );

    const report = analyzeI18nLanguageBoundaryReport({
      category: "contentTargetLanguage",
      rootDir: root,
      sourceDirs: ["src"],
    });

    expect(report.filters.category).toBe("contentTargetLanguage");
    expect(report.summary.entryCount).toBe(2);
    expect(report.entries.every((entry) => entry.category === "contentTargetLanguage")).toBe(
      true,
    );
    expect(report.summary.fileSummaries).toEqual([
      { count: 1, file: "src/features/artifact/document.ts" },
      { count: 1, file: "src/features/export/skill.ts" },
    ]);

    const exitCode = runCli([
      "--format",
      "json",
      "--category",
      "contentTargetLanguage",
      "--output",
      outputPath,
      "--root",
      root,
      "--source-dir",
      "src",
    ]);

    const focusedReport = JSON.parse(fs.readFileSync(outputPath, "utf8")) as {
      filters: { category: string };
      summary: { entryCount: number };
    };
    expect(exitCode).toBe(0);
    expect(focusedReport.filters.category).toBe("contentTargetLanguage");
    expect(focusedReport.summary.entryCount).toBe(2);
  });

  it("应识别常见语言字段的上下文语义，减少泛名 language 误报", () => {
    const root = createTempDir();
    writeFile(
      root,
      "src/components/agent/chat/workspace/useWorkspaceArtifactPreviewActions.ts",
      "handleCodeBlockClick: (language: string, code: string) => void;\n",
    );
    writeFile(
      root,
      "src/components/agent/chat/workspace/useWorkspaceTranscriptionTaskPreviewRuntime.ts",
      'const language = entry.transcript_language?.trim() || currentPreview.language;\n',
    );
    writeFile(
      root,
      "src/components/agent/chat/utils/harnessRequestMetadata.test.ts",
      'it("应以独立字段透传 Agent response language 且不复用 UI locale", () => {});\n',
    );
    writeFile(
      root,
      "src/components/settings-v2/system/chrome-relay/index.test.tsx",
      '"browser language and content preferences";\n',
    );
    writeFile(
      root,
      "src/components/workspace/document/editor/slashCommandItems.tsx",
      'const t = instance.getFixedT(instance.language, "workspace");\n',
    );

    const report = analyzeI18nLanguageBoundaryReport({
      rootDir: root,
      sourceDirs: ["src"],
    });

    expect(report.summary.unknownCount).toBe(0);
    expect(report.summary.categorySummaries).toEqual(
      expect.arrayContaining([
        { category: "codeLanguage", count: 1 },
        { category: "asrLanguage", count: 1 },
        { category: "agentResponseLanguage", count: 1 },
        { category: "browserEnvironmentLanguage", count: 1 },
        { category: "uiLocale", count: 1 },
      ]),
    );
  });
});
