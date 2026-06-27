import { describe, expect, it } from "vitest";

import { analyzeScriptsGovernance } from "./scripts-governance-core.mjs";

function baseline(overrides = {}) {
  return {
    policy: "scripts root and first-level domains are frozen",
    allowedRootFiles: new Set(["scripts/README.md"]),
    allowedDirectories: new Set(["scripts/lib", "scripts/agent-runtime"]),
    ignoredLocalDirectories: new Set(["scripts/__pycache__"]),
    ...overrides,
  };
}

function analyze(overrides = {}) {
  return analyzeScriptsGovernance({
    baseline: baseline(overrides.baseline),
    currentRootFiles: ["scripts/README.md"],
    currentDirectories: ["scripts/lib", "scripts/agent-runtime"],
    currentFiles: [
      "scripts/README.md",
      "scripts/lib/helper.mjs",
      "scripts/agent-runtime/smoke.mjs",
    ],
    gitTrackedFiles: new Set([
      "scripts/README.md",
      "scripts/lib/helper.mjs",
      "scripts/agent-runtime/smoke.mjs",
    ]),
    ...overrides,
  });
}

describe("scripts-governance-core", () => {
  it("应拒绝新增已跟踪的 scripts 根目录脚本", () => {
    const report = analyze({
      currentRootFiles: ["scripts/README.md", "scripts/new-tool.mjs"],
      currentFiles: [
        "scripts/README.md",
        "scripts/new-tool.mjs",
        "scripts/lib/helper.mjs",
      ],
      gitTrackedFiles: new Set([
        "scripts/README.md",
        "scripts/new-tool.mjs",
        "scripts/lib/helper.mjs",
      ]),
    });

    expect(report.hasFailures).toBe(true);
    expect(report.trackedNewRootFiles).toEqual(["scripts/new-tool.mjs"]);
  });

  it("应拒绝新增已跟踪的 scripts 一级领域目录", () => {
    const report = analyze({
      currentDirectories: [
        "scripts/lib",
        "scripts/agent-runtime",
        "scripts/new-domain",
      ],
      currentFiles: [
        "scripts/README.md",
        "scripts/lib/helper.mjs",
        "scripts/new-domain/task.mjs",
      ],
      gitTrackedFiles: new Set([
        "scripts/README.md",
        "scripts/lib/helper.mjs",
        "scripts/new-domain/task.mjs",
      ]),
    });

    expect(report.hasFailures).toBe(true);
    expect(report.trackedNewDirectories).toEqual(["scripts/new-domain"]);
  });

  it("应把未跟踪根脚本作为警告而不是失败", () => {
    const report = analyze({
      currentRootFiles: ["scripts/README.md", "scripts/local-note.mjs"],
      currentFiles: [
        "scripts/README.md",
        "scripts/local-note.mjs",
        "scripts/lib/helper.mjs",
      ],
    });

    expect(report.hasFailures).toBe(false);
    expect(report.untrackedNewRootFiles).toEqual(["scripts/local-note.mjs"]);
  });

  it("应把本地缓存目录归类为 ignored local directory", () => {
    const report = analyze({
      currentDirectories: [
        "scripts/lib",
        "scripts/agent-runtime",
        "scripts/__pycache__",
      ],
      currentFiles: [
        "scripts/README.md",
        "scripts/lib/helper.mjs",
        "scripts/__pycache__/helper.cpython-313.pyc",
      ],
    });

    expect(report.hasFailures).toBe(false);
    expect(report.ignoredLocalDirectories).toEqual(["scripts/__pycache__"]);
    expect(report.untrackedNewDirectories).toEqual([]);
    expect(report.ignoredLocalFiles).toEqual([
      "scripts/__pycache__/helper.cpython-313.pyc",
    ]);
  });

  it("应拒绝已纳入 git 跟踪的 Python 缓存文件", () => {
    const report = analyze({
      currentFiles: [
        "scripts/README.md",
        "scripts/lib/helper.mjs",
        "scripts/i18n/__pycache__/translate_all.cpython-313.pyc",
      ],
      gitTrackedFiles: new Set([
        "scripts/README.md",
        "scripts/lib/helper.mjs",
        "scripts/i18n/__pycache__/translate_all.cpython-313.pyc",
      ]),
    });

    expect(report.hasFailures).toBe(true);
    expect(report.trackedPythonCacheFiles).toEqual([
      "scripts/i18n/__pycache__/translate_all.cpython-313.pyc",
    ]);
  });

  it("应输出一级目录文件数和扩展名分布", () => {
    const report = analyze();

    expect(report.directorySummaries).toEqual([
      {
        directory: "scripts/agent-runtime",
        fileCount: 1,
        extensions: [[".mjs", 1]],
      },
      {
        directory: "scripts/lib",
        fileCount: 1,
        extensions: [[".mjs", 1]],
      },
    ]);
  });
});
