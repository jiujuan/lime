import path from "node:path";

export type WindowsSquirrelStartupPlan =
  | {
      action: "run-update";
      args: ["--createShortcut" | "--removeShortcut", string];
      updateExecutable: string;
    }
  | { action: "quit" };

export function resolveWindowsSquirrelStartupPlan({
  argv,
  execPath,
  platform,
}: {
  argv: string[];
  execPath: string;
  platform: string;
}): WindowsSquirrelStartupPlan | null {
  if (platform !== "win32") {
    return null;
  }

  const command = argv[1];
  const executableName = path.win32.basename(execPath);
  const updateExecutable = path.win32.resolve(
    path.win32.dirname(execPath),
    "..",
    "Update.exe",
  );

  if (command === "--squirrel-install" || command === "--squirrel-updated") {
    return {
      action: "run-update",
      args: ["--createShortcut", executableName],
      updateExecutable,
    };
  }
  if (command === "--squirrel-uninstall") {
    return {
      action: "run-update",
      args: ["--removeShortcut", executableName],
      updateExecutable,
    };
  }
  if (command === "--squirrel-obsolete") {
    return { action: "quit" };
  }

  return null;
}
