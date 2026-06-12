/* global Buffer, process */
import { spawn } from "node:child_process";
import path from "node:path";

export type ProjectPathOpenTool = "vscode" | "cursor" | "terminal" | "finder";

export interface ProjectShellCommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function openProjectPathWithLocalTool(
  targetPath: string,
  tool: Exclude<ProjectPathOpenTool, "finder">,
): Promise<void> {
  const command = resolveProjectPathOpenCommand(targetPath, tool);
  await runProjectPathOpenCommand(command.executable, command.args, {
    cwd: command.cwd,
  });
}

export function normalizeProjectShellTimeout(value: number | null): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 30_000;
  }
  return Math.min(Math.max(Math.trunc(value ?? 30_000), 1_000), 120_000);
}

export async function runProjectShellCommand({
  cwd,
  command,
  timeoutMs,
}: {
  cwd: string;
  command: string;
  timeoutMs: number;
}): Promise<ProjectShellCommandResult> {
  const resolved = resolveProjectShellCommand(command);
  const startedAt = Date.now();
  return await new Promise<ProjectShellCommandResult>((resolve, reject) => {
    const child = spawn(resolved.executable, resolved.args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const settle = (result: ProjectShellCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Shell 命令启动失败: ${error.message}`));
    });
    child.on("close", (code) => {
      settle({
        command,
        cwd,
        exitCode: timedOut ? null : code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

function resolveProjectPathOpenCommand(
  targetPath: string,
  tool: Exclude<ProjectPathOpenTool, "finder">,
): { executable: string; args: string[]; cwd?: string } {
  if (process.platform === "darwin") {
    if (tool === "terminal") {
      return {
        executable: "open",
        args: ["-a", "Terminal", targetPath],
      };
    }
    return {
      executable: "open",
      args: [
        "-a",
        tool === "vscode" ? "Visual Studio Code" : "Cursor",
        targetPath,
      ],
    };
  }

  if (process.platform === "win32") {
    if (tool === "terminal") {
      return {
        executable: "cmd.exe",
        args: ["/c", "start", "", "cmd.exe", "/K", "cd", "/d", targetPath],
      };
    }
    return {
      executable: "cmd.exe",
      args: ["/c", tool === "vscode" ? "code" : "cursor", targetPath],
    };
  }

  if (tool === "terminal") {
    return {
      executable: "x-terminal-emulator",
      args: [],
      cwd: targetPath,
    };
  }

  return {
    executable: tool === "vscode" ? "code" : "cursor",
    args: [targetPath],
  };
}

function resolveProjectShellCommand(command: string): {
  executable: string;
  args: string[];
} {
  if (process.platform === "win32") {
    return {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }
  return {
    executable: process.env.SHELL?.trim() || "/bin/sh",
    args: ["-lc", command],
  };
}

async function runProjectPathOpenCommand(
  executable: string,
  args: string[],
  options: { cwd?: string },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      detached: process.platform === "win32",
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`打开项目工具失败: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`打开项目工具失败: ${stderr.trim() || `exit ${code}`}`));
    });
    child.unref();
  });
}
