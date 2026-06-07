import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 45_000;

export function runNodeScriptJson(scriptRelativePath, args, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, scriptRelativePath), ...args],
      {
        cwd: repoRoot,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child.pid);
    }, timeoutMs);

    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code, signal) => {
      settle(() => {
        if (timedOut) {
          reject(
            buildScriptError(scriptRelativePath, `超时 ${timeoutMs}ms`, {
              signal,
              stdout,
              stderr,
            }),
          );
          return;
        }
        if (code !== 0) {
          reject(
            buildScriptError(
              scriptRelativePath,
              `退出码 ${code ?? "unknown"}`,
              {
                signal,
                stdout,
                stderr,
              },
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(
            buildScriptError(scriptRelativePath, "无法解析 JSON 输出", {
              signal,
              stdout,
              stderr,
              error,
            }),
          );
        }
      });
    });
  });
}

function terminateChild(pid) {
  if (!pid) {
    return;
  }
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
        stdio: "ignore",
      });
      return;
    }
    process.kill(-pid, "SIGKILL");
  } catch {
    // 超时清理只用于避免 Vitest 批次悬挂，进程可能已自然退出。
  }
}

function buildScriptError(scriptRelativePath, reason, details) {
  return new Error(
    [
      `${scriptRelativePath} ${reason}。`,
      `signal: ${details.signal ?? "none"}`,
      `stdout: ${details.stdout.slice(0, 500)}`,
      `stderr: ${details.stderr.slice(0, 500)}`,
      details.error ? `error: ${String(details.error)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
