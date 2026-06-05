import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireGuiSmokeRunLock,
  readGuiSmokeRunLockOwner,
} from "./gui-smoke-run-lock.mjs";

const tempRoots = [];

function makeTempLockDir() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lime-gui-smoke-lock-"));
  tempRoots.push(tempRoot);
  return path.join(tempRoot, ".lime", "locks", "gui-smoke.lock");
}

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("gui smoke run lock", () => {
  it("应创建并释放单 runner 锁", async () => {
    const lockDir = makeTempLockDir();

    const lock = await acquireGuiSmokeRunLock({
      lockDir,
      waitTimeoutMs: 50,
      pollMs: 1,
      owner: { pid: 12345, command: "npm run verify:gui-smoke" },
      isProcessAlive: () => false,
    });

    expect(readGuiSmokeRunLockOwner(lockDir)).toEqual(
      expect.objectContaining({
        pid: 12345,
        command: "npm run verify:gui-smoke",
      }),
    );

    lock.release();
    expect(fs.existsSync(lockDir)).toBe(false);
  });

  it("应等待存活 owner，超时后保留原锁", async () => {
    const lockDir = makeTempLockDir();
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: 4321,
        token: "existing-token",
        startedAt: "2026-05-24T00:00:00.000Z",
        command: "npm run verify:gui-smoke -- --timeout-ms 900000",
      }),
      "utf8",
    );

    await expect(
      acquireGuiSmokeRunLock({
        lockDir,
        waitTimeoutMs: 5,
        pollMs: 1,
        isProcessAlive: (pid) => pid === 4321,
      }),
    ).rejects.toThrow("已有 GUI smoke 正在运行");

    expect(readGuiSmokeRunLockOwner(lockDir)).toEqual(
      expect.objectContaining({ pid: 4321, token: "existing-token" }),
    );
  });

  it("应清理无存活进程的过期锁并重新获取", async () => {
    const lockDir = makeTempLockDir();
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({
        pid: 9876,
        token: "stale-token",
        startedAt: "2026-05-23T00:00:00.000Z",
      }),
      "utf8",
    );

    const lock = await acquireGuiSmokeRunLock({
      lockDir,
      waitTimeoutMs: 50,
      pollMs: 1,
      owner: { pid: 2468, command: "npm run smoke:electron" },
      isProcessAlive: () => false,
    });

    expect(readGuiSmokeRunLockOwner(lockDir)).toEqual(
      expect.objectContaining({
        pid: 2468,
        command: "npm run smoke:electron",
      }),
    );

    lock.release();
  });
});
