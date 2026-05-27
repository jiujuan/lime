import { describe, expect, it, vi } from "vitest";

import { printGithubFormat } from "./quality-task-selector.mjs";

describe("quality-task-selector", () => {
  it("应在 github 输出中暴露 i18n_unused 任务位", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    printGithubFormat({
      changedFiles: ["src/components/AppSidebar.tsx"],
      tasks: {
        bridge: false,
        bridgeReasons: [],
        docs: false,
        docsOnly: false,
        fallback: false,
        frontend: true,
        guiSmoke: true,
        i18n: true,
        i18nHardcoded: true,
        i18nUnused: true,
        integrity: true,
        recommendedCommands: ["npm run i18n:unused -- --check"],
        rust: false,
        workflow: false,
      },
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(String(writeSpy.mock.calls[0]?.[0] ?? "")).toContain("i18n_unused=true");
    expect(String(writeSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "recommended_commands=npm run i18n:unused -- --check",
    );
  });
});
