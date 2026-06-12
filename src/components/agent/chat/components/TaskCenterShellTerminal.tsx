import React from "react";
import { agentText } from "./harnessPanelText";
import {
  killProjectShellSession,
  listenProjectShellSessionEvents,
  type ProjectShellSessionEvent,
  resizeProjectShellSession,
  startProjectShellSession,
  writeProjectShellSession,
} from "@/lib/api/projectShell";
import "@xterm/xterm/css/xterm.css";

type XTermTerminal = import("@xterm/xterm").Terminal;
type XTermDisposable = ReturnType<XTermTerminal["onData"]>;
type XTermFitAddon = import("@xterm/addon-fit").FitAddon;
type XTermTheme = NonNullable<
  ConstructorParameters<typeof import("@xterm/xterm").Terminal>[0]
>["theme"];

export interface TaskCenterShellTabState {
  errorText: string | null;
  ready: boolean;
  shell: string | null;
  statusText: string;
  title: string;
}

export interface TaskCenterShellTerminalHandle {
  fit: () => void;
  focus: () => void;
  runCommand: (command: string) => void;
}

interface TaskCenterShellTerminalProps {
  active: boolean;
  projectRootPath?: string | null;
  tabId: string;
  onStateChange: (
    tabId: string,
    state: Partial<TaskCenterShellTabState>,
  ) => void;
}

const FALLBACK_COLS = 120;
const FALLBACK_ROWS = 14;
const INPUT_FLUSH_DELAY_MS = 8;
const TASK_CENTER_SHELL_THEME: XTermTheme = {
  background: "#ffffff",
  foreground: "#1f2937",
  cursor: "#111827",
  cursorAccent: "#ffffff",
  selectionBackground: "#dbeafe",
  selectionForeground: "#111827",
  selectionInactiveBackground: "#e5e7eb",
  black: "#24292f",
  red: "#d1242f",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#0969da",
  magenta: "#c026d3",
  cyan: "#0891b2",
  white: "#f8fafc",
  brightBlack: "#6b7280",
  brightRed: "#dc2626",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#1d4ed8",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#ffffff",
  overviewRulerBorder: "#e2e8f0",
  scrollbarSliderBackground: "#cbd5e1",
  scrollbarSliderHoverBackground: "#94a3b8",
  scrollbarSliderActiveBackground: "#64748b",
};

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProjectShellSessionMissingError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    message.includes("会话不存在") ||
    normalizedMessage.includes("session not found")
  );
}

export const TaskCenterShellTerminal = React.forwardRef<
  TaskCenterShellTerminalHandle,
  TaskCenterShellTerminalProps
>(function TaskCenterShellTerminal(
  { active, projectRootPath, tabId, onStateChange },
  ref,
) {
  const normalizedProjectRootPath = projectRootPath?.trim() || null;
  const terminalContainerRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitAddonRef = React.useRef<XTermFitAddon | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const bootGenerationRef = React.useRef(0);
  const pendingWriteAfterReconnectRef = React.useRef<{
    data: string;
    retried: boolean;
  } | null>(null);
  const writeQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const terminalSizeRef = React.useRef({
    cols: FALLBACK_COLS,
    rows: FALLBACK_ROWS,
  });
  const [restartNonce, setRestartNonce] = React.useState(0);

  const patchState = React.useCallback(
    (state: Partial<TaskCenterShellTabState>) => {
      onStateChange(tabId, state);
    },
    [onStateChange, tabId],
  );

  const fitTerminal = React.useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    fitTerminalToContainer({
      terminal,
      fitAddon,
      sessionIdRef,
      terminalSizeRef,
    });
  }, []);

  const reconnectShell = React.useCallback(
    (data?: string) => {
      if (data) {
        pendingWriteAfterReconnectRef.current = {
          data,
          retried: false,
        };
      }
      sessionIdRef.current = null;
      patchState({
        ready: false,
        statusText: agentText(
          "agentChat.navbar.shell.reconnecting",
          "正在重连 Shell",
        ),
      });
      setRestartNonce((value) => value + 1);
    },
    [patchState],
  );

  const writeShellData = React.useCallback(
    (data: string) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (sessionIdRef.current !== sessionId) {
            return;
          }
          await writeProjectShellSession({ sessionId, data });
          const pendingReconnectWrite = pendingWriteAfterReconnectRef.current;
          if (
            pendingReconnectWrite?.retried &&
            pendingReconnectWrite.data === data
          ) {
            pendingWriteAfterReconnectRef.current = null;
          }
        })
        .catch((error) => {
          const message = extractErrorMessage(error);
          if (isProjectShellSessionMissingError(message)) {
            const pendingReconnectWrite = pendingWriteAfterReconnectRef.current;
            if (pendingReconnectWrite?.retried) {
              pendingWriteAfterReconnectRef.current = null;
              terminalRef.current?.writeln(
                `\r\n${agentText(
                  "agentChat.navbar.shell.sessionLostRetryFailed",
                  "Shell 会话已失效，请重新输入命令",
                )}`,
              );
              return;
            }
            terminalRef.current?.writeln(
              `\r\n${agentText(
                "agentChat.navbar.shell.sessionLost",
                "Shell 会话已失效，正在重连…",
              )}`,
            );
            reconnectShell(data);
            return;
          }
          terminalRef.current?.writeln(
            `\r\n${agentText(
              "agentChat.navbar.shell.writeFailed",
              "写入 Shell 失败：{{message}}",
              { message },
            )}`,
          );
        });
    },
    [reconnectShell],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      fit: fitTerminal,
      focus: () => {
        terminalRef.current?.focus();
      },
      runCommand: (command: string) => {
        if (!sessionIdRef.current) {
          return;
        }
        writeShellData(`${command}\r`);
        terminalRef.current?.focus();
      },
    }),
    [fitTerminal, writeShellData],
  );

  React.useEffect(() => {
    let disposed = false;
    const bootGeneration = bootGenerationRef.current + 1;
    bootGenerationRef.current = bootGeneration;
    let terminal: XTermTerminal | null = null;
    let fitAddon: XTermFitAddon | null = null;
    let inputDisposable: XTermDisposable | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unlisten: (() => void) | null = null;
    let sessionIdForBoot: string | null = null;
    let pendingInput = "";
    let inputFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingEvents: ProjectShellSessionEvent[] = [];

    function isCurrentBoot() {
      return !disposed && bootGenerationRef.current === bootGeneration;
    }

    function flushPendingInput() {
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer);
        inputFlushTimer = null;
      }
      const data = pendingInput;
      pendingInput = "";
      if (!data || !isCurrentBoot()) {
        return;
      }
      writeShellData(data);
    }

    function scheduleInputFlush() {
      if (inputFlushTimer) {
        return;
      }
      inputFlushTimer = setTimeout(flushPendingInput, INPUT_FLUSH_DELAY_MS);
    }

    function applySessionEvent(event: ProjectShellSessionEvent) {
      if (!terminal) {
        return;
      }
      if (event.type === "data") {
        terminal.write(event.data);
        return;
      }
      if (event.type === "error") {
        terminal.writeln(
          `\r\n${agentText(
            "agentChat.navbar.shell.sessionError",
            "Shell 错误：{{message}}",
            { message: event.message },
          )}`,
        );
        patchState({
          ready: false,
          statusText: agentText("agentChat.navbar.shell.failed", "已断开"),
        });
        return;
      }
      terminal.writeln(
        `\r\n${agentText(
          "agentChat.navbar.shell.exited",
          "Shell 已退出：{{code}}",
          { code: event.exitCode ?? event.signal ?? "-" },
        )}`,
      );
      patchState({
        ready: false,
        statusText: agentText("agentChat.navbar.shell.exitedStatus", "已退出"),
      });
    }

    async function bootShell() {
      const container = terminalContainerRef.current;
      if (!container) {
        return;
      }
      patchState({
        errorText: null,
        ready: false,
        shell: null,
        statusText: agentText("agentChat.navbar.shell.connecting", "连接中"),
      });

      if (!normalizedProjectRootPath) {
        patchState({
          errorText: agentText(
            "agentChat.navbar.shell.noProjectRoot",
            "当前项目缺少本地目录",
          ),
          statusText: agentText("agentChat.navbar.shell.unavailable", "不可用"),
        });
        return;
      }

      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (!isCurrentBoot()) {
          return;
        }
        terminal = new Terminal({
          cols: FALLBACK_COLS,
          rows: FALLBACK_ROWS,
          cursorBlink: true,
          convertEol: true,
          disableStdin: false,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.35,
          scrollback: 2000,
          theme: TASK_CENTER_SHELL_THEME,
        });
        fitAddon = new FitAddon();
        const activeTerminal = terminal;
        const activeFitAddon = fitAddon;
        activeTerminal.loadAddon(activeFitAddon);
        terminalRef.current = activeTerminal;
        fitAddonRef.current = activeFitAddon;
        activeTerminal.open(container);
        fitTerminalToContainer({
          terminal: activeTerminal,
          fitAddon: activeFitAddon,
          sessionIdRef,
          terminalSizeRef,
        });
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            fitTerminalToContainer({
              terminal: activeTerminal,
              fitAddon: activeFitAddon,
              sessionIdRef,
              terminalSizeRef,
            });
          });
          resizeObserver.observe(container);
        }

        unlisten = await listenProjectShellSessionEvents((event) => {
          const activeSessionId = sessionIdRef.current;
          if (!activeSessionId) {
            pendingEvents.push(event);
            return;
          }
          if (event.sessionId !== activeSessionId) {
            return;
          }
          applySessionEvent(event);
        });

        patchState({
          statusText: agentText(
            "agentChat.navbar.shell.starting",
            "正在启动 Shell",
          ),
        });
        const size = terminalSizeRef.current;
        const session = await startProjectShellSession({
          rootPath: normalizedProjectRootPath,
          cols: size.cols,
          rows: size.rows,
        });
        if (!isCurrentBoot()) {
          await killProjectShellSession({ sessionId: session.sessionId }).catch(
            () => undefined,
          );
          return;
        }
        sessionIdForBoot = session.sessionId;
        sessionIdRef.current = session.sessionId;
        patchState({
          ready: true,
          shell: session.shell,
          statusText: agentText("agentChat.navbar.shell.connected", "已连接"),
          title: session.title,
        });
        for (const pendingEvent of pendingEvents.splice(0)) {
          if (pendingEvent.sessionId === session.sessionId) {
            applySessionEvent(pendingEvent);
          }
        }

        inputDisposable = terminal.onData((data) => {
          pendingInput += data;
          if (data.includes("\r") || data.includes("\n")) {
            flushPendingInput();
            return;
          }
          scheduleInputFlush();
        });
        const pendingReconnectWrite = pendingWriteAfterReconnectRef.current;
        if (pendingReconnectWrite && !pendingReconnectWrite.retried) {
          pendingWriteAfterReconnectRef.current = {
            ...pendingReconnectWrite,
            retried: true,
          };
          writeShellData(pendingReconnectWrite.data);
        } else if (pendingReconnectWrite?.retried) {
          pendingWriteAfterReconnectRef.current = null;
        }
      } catch (error) {
        if (!isCurrentBoot()) {
          return;
        }
        const message = extractErrorMessage(error);
        patchState({
          errorText: message,
          ready: false,
          statusText: agentText("agentChat.navbar.shell.failed", "已断开"),
        });
        terminalRef.current?.writeln(
          `\r\n${agentText(
            "agentChat.navbar.shell.startFailed",
            "Shell 启动失败：{{message}}",
            { message },
          )}`,
        );
      }
    }

    void bootShell();

    return () => {
      disposed = true;
      unlisten?.();
      inputDisposable?.dispose();
      if (inputFlushTimer) {
        clearTimeout(inputFlushTimer);
        inputFlushTimer = null;
      }
      pendingInput = "";
      resizeObserver?.disconnect();
      const sessionId = sessionIdForBoot;
      if (sessionId && sessionIdRef.current === sessionId) {
        sessionIdRef.current = null;
      }
      if (sessionId) {
        void killProjectShellSession({ sessionId }).catch(() => undefined);
      }
      terminal?.dispose();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null;
      }
    };
  }, [normalizedProjectRootPath, patchState, restartNonce, writeShellData]);

  React.useEffect(() => {
    if (!active) {
      return;
    }
    const animationFrame = requestAnimationFrame(fitTerminal);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [active, fitTerminal]);

  return (
    <div
      className={active ? "h-full w-full" : "hidden"}
      data-active={active ? "true" : "false"}
      data-testid={
        active
          ? "task-center-shell-terminal-pane"
          : "task-center-shell-terminal-pane-inactive"
      }
      onClick={() => {
        terminalRef.current?.focus();
      }}
    >
      <div
        ref={terminalContainerRef}
        className="h-full w-full bg-white [&_.xterm-rows]:!bg-white [&_.xterm-screen]:!bg-white [&_.xterm-screen]:outline-none [&_.xterm-scrollable-element]:!bg-white [&_.xterm-viewport]:!bg-white [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm]:!bg-white"
        title={agentText(
          "agentChat.navbar.shell.ready",
          "Shell 已就绪，可以输入命令",
        )}
        data-testid={
          active
            ? "task-center-shell-terminal"
            : "task-center-shell-terminal-hidden"
        }
      />
    </div>
  );
});

function fitTerminalToContainer({
  terminal,
  fitAddon,
  sessionIdRef,
  terminalSizeRef,
}: {
  terminal: XTermTerminal;
  fitAddon: XTermFitAddon;
  sessionIdRef: React.MutableRefObject<string | null>;
  terminalSizeRef: React.MutableRefObject<{ cols: number; rows: number }>;
}) {
  try {
    fitAddon.fit();
  } catch {
    return;
  }
  const cols = terminal.cols || FALLBACK_COLS;
  const rows = terminal.rows || FALLBACK_ROWS;
  const previous = terminalSizeRef.current;
  if (previous.cols === cols && previous.rows === rows) {
    return;
  }
  terminalSizeRef.current = { cols, rows };
  const sessionId = sessionIdRef.current;
  if (!sessionId) {
    return;
  }
  void resizeProjectShellSession({ sessionId, cols, rows }).catch(
    () => undefined,
  );
}
