import { describe, expect, it } from "vitest";

import { resolveWindowsSquirrelStartupPlan } from "./windowsSquirrelStartup";

const EXECUTABLE =
  "C:\\Users\\runner\\AppData\\Local\\lime\\app-1.2.3\\Lime.exe";

describe("Windows Squirrel startup", () => {
  it.each(["--squirrel-install", "--squirrel-updated"])(
    "%s 使用 Squirrel 要求的独立 shortcut 参数",
    (command) => {
      expect(
        resolveWindowsSquirrelStartupPlan({
          argv: [EXECUTABLE, command],
          execPath: EXECUTABLE,
          platform: "win32",
        }),
      ).toEqual({
        action: "run-update",
        args: ["--createShortcut", "Lime.exe"],
        updateExecutable: "C:\\Users\\runner\\AppData\\Local\\lime\\Update.exe",
      });
    },
  );

  it("卸载事件移除 shortcut", () => {
    expect(
      resolveWindowsSquirrelStartupPlan({
        argv: [EXECUTABLE, "--squirrel-uninstall"],
        execPath: EXECUTABLE,
        platform: "win32",
      }),
    ).toMatchObject({
      action: "run-update",
      args: ["--removeShortcut", "Lime.exe"],
    });
  });

  it("obsolete 事件只退出，不启动 Update.exe", () => {
    expect(
      resolveWindowsSquirrelStartupPlan({
        argv: [EXECUTABLE, "--squirrel-obsolete"],
        execPath: EXECUTABLE,
        platform: "win32",
      }),
    ).toEqual({ action: "quit" });
  });

  it("非 Squirrel 启动和非 Windows 平台不接管正常启动", () => {
    expect(
      resolveWindowsSquirrelStartupPlan({
        argv: [EXECUTABLE],
        execPath: EXECUTABLE,
        platform: "win32",
      }),
    ).toBeNull();
    expect(
      resolveWindowsSquirrelStartupPlan({
        argv: [EXECUTABLE, "--squirrel-install"],
        execPath: EXECUTABLE,
        platform: "darwin",
      }),
    ).toBeNull();
  });
});
