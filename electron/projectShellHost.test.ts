import { afterEach, describe, expect, it, vi } from "vitest";

import {
  METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
  METHOD_PROJECT_SHELL_SESSION_KILL,
  METHOD_PROJECT_SHELL_SESSION_RESIZE,
  METHOD_PROJECT_SHELL_SESSION_START,
  METHOD_PROJECT_SHELL_SESSION_WRITE,
} from "@limecloud/app-server-client";

const { runProjectShellCommandMock } = vi.hoisted(() => ({
  runProjectShellCommandMock: vi.fn(),
}));

vi.mock("./projectToolsHost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./projectToolsHost")>();
  return {
    ...actual,
    runProjectShellCommand: runProjectShellCommandMock,
  };
});

import { ProjectShellHost } from "./projectShellHost";

type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

function createProjectShellHost(
  request: AppServerRequestMock = async () => {
    throw new Error("App Server should not be called");
  },
  emit: (event: string, payload?: unknown) => void = () => undefined,
) {
  return new ProjectShellHost(
    <T>(method: string, params?: Record<string, unknown>) =>
      request(method, params) as Promise<T>,
    emit,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ProjectShellHost", () => {
  it("runCommand 应走项目 Shell current 封装并归一化 timeout", async () => {
    runProjectShellCommandMock.mockResolvedValueOnce({
      command: "pwd",
      cwd: "/tmp/project",
      exitCode: 0,
      stdout: "/tmp/project\n",
      stderr: "",
      durationMs: 10,
      timedOut: false,
    });
    const host = createProjectShellHost();

    await expect(
      host.runCommand({
        rootPath: "/tmp/project",
        command: " pwd ",
        timeoutMs: 10,
      }),
    ).resolves.toMatchObject({ command: "pwd", exitCode: 0 });

    expect(runProjectShellCommandMock).toHaveBeenCalledWith({
      cwd: "/tmp/project",
      command: "pwd",
      timeoutMs: 1000,
    });
  });

  it("session 方法应委托 App Server PTY current 通道", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (method: string) => {
      if (method === METHOD_PROJECT_SHELL_SESSION_START) {
        return {
          sessionId: "project-shell-1",
          cwd: "/tmp/project",
          shell: "/bin/zsh",
          title: "Shell: project",
          localEcho: false,
          tty: true,
          pid: 123,
        };
      }
      return {};
    });
    const host = createProjectShellHost(request);

    await expect(
      host.startSession({
        rootPath: "/tmp/project",
        cols: 120,
        rows: 14,
      }),
    ).resolves.toMatchObject({
      sessionId: "project-shell-1",
      tty: true,
    });
    await expect(
      host.writeSession({
        sessionId: "project-shell-1",
        data: "ls\r",
      }),
    ).resolves.toEqual({});
    await expect(
      host.resizeSession({
        sessionId: "project-shell-1",
        cols: 100,
        rows: 20,
      }),
    ).resolves.toEqual({});
    await expect(
      host.killSession({
        sessionId: "project-shell-1",
      }),
    ).resolves.toEqual({});

    expect(request).toHaveBeenCalledWith(METHOD_PROJECT_SHELL_SESSION_START, {
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
    expect(request).toHaveBeenCalledWith(METHOD_PROJECT_SHELL_SESSION_WRITE, {
      sessionId: "project-shell-1",
      data: "ls\r",
    });
    expect(request).toHaveBeenCalledWith(METHOD_PROJECT_SHELL_SESSION_RESIZE, {
      sessionId: "project-shell-1",
      cols: 100,
      rows: 20,
    });
    expect(request).toHaveBeenCalledWith(METHOD_PROJECT_SHELL_SESSION_KILL, {
      sessionId: "project-shell-1",
    });
  });

  it("event drain 应转发到前端事件通道", async () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === METHOD_PROJECT_SHELL_SESSION_START) {
        return {
          sessionId: "project-shell-1",
          cwd: "/tmp/project",
          shell: "/bin/zsh",
          title: "Shell: project",
          localEcho: false,
          tty: true,
          pid: 123,
        };
      }
      if (method === METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS) {
        return {
          events: [
            {
              type: "data",
              sessionId: "project-shell-1",
              stream: "stdout",
              data: "hello",
            },
            {
              type: "exit",
              sessionId: "project-shell-1",
              exitCode: 0,
              signal: null,
            },
          ],
        };
      }
      return {};
    });
    const host = createProjectShellHost(request, emit);

    await host.startSession({
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(request).toHaveBeenCalledWith(
      METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
      { sessionId: "project-shell-1", limit: 200 },
    );
    expect(emit).toHaveBeenCalledWith("project-shell-session-event", {
      type: "data",
      sessionId: "project-shell-1",
      stream: "stdout",
      data: "hello",
    });
  });

  it("写入后应主动 drain 并转发输出", async () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === METHOD_PROJECT_SHELL_SESSION_START) {
        return {
          sessionId: "project-shell-1",
          cwd: "/tmp/project",
          shell: "/bin/zsh",
          title: "coso@host: project",
          localEcho: false,
          tty: true,
          pid: 123,
        };
      }
      if (method === METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS) {
        return {
          events: [
            {
              type: "data",
              sessionId: "project-shell-1",
              stream: "stdout",
              data: "__lime_shell_e2e__\n",
            },
          ],
        };
      }
      return {};
    });
    const host = createProjectShellHost(request, emit);

    await host.startSession({
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
    await host.writeSession({
      sessionId: "project-shell-1",
      data: "printf '__lime_shell_e2e__\\n'\r",
    });

    expect(request).toHaveBeenCalledWith(
      METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS,
      { sessionId: "project-shell-1", limit: 200 },
    );
    expect(emit).toHaveBeenCalledWith("project-shell-session-event", {
      type: "data",
      sessionId: "project-shell-1",
      stream: "stdout",
      data: "__lime_shell_e2e__\n",
    });
  });

  it("disposeForShutdown 应结束 App Server PTY 会话", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (method: string) => {
      if (method === METHOD_PROJECT_SHELL_SESSION_START) {
        return {
          sessionId: "project-shell-1",
          cwd: "/tmp/project",
          shell: "/bin/zsh",
          title: "Shell: project",
          localEcho: false,
          tty: true,
          pid: 123,
        };
      }
      return {};
    });
    const host = createProjectShellHost(request);

    await host.startSession({
      rootPath: "/tmp/project",
      cols: 120,
      rows: 14,
    });
    host.disposeForShutdown();

    expect(request).toHaveBeenCalledWith(METHOD_PROJECT_SHELL_SESSION_KILL, {
      sessionId: "project-shell-1",
    });
  });
});
