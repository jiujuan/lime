import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  killProjectShellSession,
  listenProjectShellSessionEvents,
  resizeProjectShellSession,
  runProjectShellCommand,
  startProjectShellSession,
  writeProjectShellSession,
} from "./projectShell";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

describe("projectShell API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 Electron Host current 通道执行项目 Shell 命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      command: "pwd",
      cwd: "/tmp/project",
      exitCode: 0,
      stdout: "/tmp/project\n",
      stderr: "",
      durationMs: 12,
      timedOut: false,
    });

    await expect(
      runProjectShellCommand({
        rootPath: "/tmp/project",
        command: "pwd",
        timeoutMs: 1000,
      }),
    ).resolves.toMatchObject({
      command: "pwd",
      cwd: "/tmp/project",
      exitCode: 0,
    });

    expect(safeInvoke).toHaveBeenCalledWith("run_project_shell_command", {
      rootPath: "/tmp/project",
      command: "pwd",
      timeoutMs: 1000,
    });
  });

  it("遇到诊断 facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "run_project_shell_command",
      },
    });

    await expect(
      runProjectShellCommand({
        rootPath: "/tmp/project",
        command: "pwd",
      }),
    ).rejects.toThrow("run_project_shell_command 尚未接入真实项目 Shell current 通道");
  });

  it("应通过 Electron Host current 通道启动项目 Shell 会话", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      sessionId: "project-shell-1",
      cwd: "/tmp/project",
      shell: "/bin/zsh",
      title: "coso@host: project",
      localEcho: true,
      tty: false,
      pid: 123,
    });

    await expect(
      startProjectShellSession({
        rootPath: "/tmp/project",
        cols: 120,
        rows: 14,
      }),
    ).resolves.toMatchObject({
      sessionId: "project-shell-1",
      title: "coso@host: project",
    });

    expect(safeInvoke).toHaveBeenCalledWith("project_shell_session_start", {
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
  });

  it("应通过会话命令写入、调整和关闭项目 Shell", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({});

    await writeProjectShellSession({
      sessionId: "project-shell-1",
      data: "ls\r",
    });
    await resizeProjectShellSession({
      sessionId: "project-shell-1",
      cols: 100,
      rows: 20,
    });
    await killProjectShellSession({ sessionId: "project-shell-1" });

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "project_shell_session_write",
      {
        sessionId: "project-shell-1",
        data: "ls\r",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "project_shell_session_resize",
      {
        sessionId: "project-shell-1",
        cols: 100,
        rows: 20,
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "project_shell_session_kill",
      {
        sessionId: "project-shell-1",
      },
    );
  });

  it("应只向调用方透传合法项目 Shell 会话事件", async () => {
    const unlisten = vi.fn();
    const handler = vi.fn();
    vi.mocked(safeListen).mockImplementationOnce(async (_event, listener) => {
      listener({
        payload: {
          type: "data",
          sessionId: "project-shell-1",
          stream: "stdout",
          data: "hello",
        },
      });
      listener({
        payload: {
          type: "data",
          session_id: "project-shell-2",
          stream: "stdout",
          data: "snake",
        },
      });
      listener({
        payload: {
          type: "exit",
          session_id: "project-shell-2",
          exit_code: 0,
          signal: null,
        },
      });
      listener({ payload: { type: "data", sessionId: 1, data: "bad" } });
      return unlisten;
    });

    await expect(listenProjectShellSessionEvents(handler)).resolves.toBe(
      unlisten,
    );

    expect(safeListen).toHaveBeenCalledWith(
      "project-shell-session-event",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, {
      type: "data",
      sessionId: "project-shell-1",
      stream: "stdout",
      data: "hello",
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      type: "data",
      sessionId: "project-shell-2",
      stream: "stdout",
      data: "snake",
    });
    expect(handler).toHaveBeenNthCalledWith(3, {
      type: "exit",
      sessionId: "project-shell-2",
      exitCode: 0,
      signal: null,
    });
  });
});
