import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LOCK_OWNER_FILE = "owner.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function defaultIsProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readGuiSmokeRunLockOwner(lockDir) {
  try {
    const ownerPath = path.join(lockDir, LOCK_OWNER_FILE);
    return JSON.parse(fs.readFileSync(ownerPath, "utf8"));
  } catch {
    return null;
  }
}

function formatOwner(owner) {
  const parts = [];
  if (owner?.pid) {
    parts.push(`pid=${owner.pid}`);
  }
  if (owner?.startedAt) {
    parts.push(`startedAt=${owner.startedAt}`);
  }
  if (owner?.command) {
    parts.push(`command=${String(owner.command).slice(0, 180)}`);
  }
  return parts.join("; ") || "unknown owner";
}

function createOwnerMetadata(owner) {
  return {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.join(" "),
    ...owner,
  };
}

function writeOwner(lockDir, owner) {
  const ownerPath = path.join(lockDir, LOCK_OWNER_FILE);
  fs.writeFileSync(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
}

export async function acquireGuiSmokeRunLock({
  lockDir,
  waitTimeoutMs,
  pollMs = 1_000,
  owner = {},
  now = () => Date.now(),
  isProcessAlive = defaultIsProcessAlive,
  log = () => undefined,
}) {
  if (!lockDir) {
    throw new Error("GUI smoke run lock path is required");
  }
  if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs < 1) {
    throw new Error("GUI smoke run lock wait timeout must be positive");
  }
  if (!Number.isFinite(pollMs) || pollMs < 1) {
    throw new Error("GUI smoke run lock poll interval must be positive");
  }

  const token = `${process.pid}-${now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = createOwnerMetadata({ ...owner, token });
  const startedAt = now();
  let lastLogAt = 0;

  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      writeOwner(lockDir, metadata);
      return {
        lockDir,
        owner: metadata,
        release() {
          const currentOwner = readGuiSmokeRunLockOwner(lockDir);
          if (currentOwner?.token === token) {
            fs.rmSync(lockDir, { recursive: true, force: true });
          }
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const currentOwner = readGuiSmokeRunLockOwner(lockDir);
      const ownerPid = Number(currentOwner?.pid);
      if (!Number.isInteger(ownerPid) || !isProcessAlive(ownerPid)) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }

      const elapsedMs = now() - startedAt;
      if (elapsedMs >= waitTimeoutMs) {
        throw new Error(
          `[verify:gui-smoke] 已有 GUI smoke 正在运行，等待 ${waitTimeoutMs}ms 后仍未释放锁：${formatOwner(currentOwner)}`,
        );
      }

      if (elapsedMs - lastLogAt >= Math.min(30_000, waitTimeoutMs)) {
        lastLogAt = elapsedMs;
        log(
          `[verify:gui-smoke] 已有 GUI smoke 正在运行，等待锁释放：${formatOwner(currentOwner)}`,
        );
      }

      await sleep(Math.min(pollMs, Math.max(1, waitTimeoutMs - elapsedMs)));
    }
  }
}
