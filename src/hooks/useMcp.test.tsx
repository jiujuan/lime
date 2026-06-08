import { useEffect } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import type { McpServerInfo } from "@/lib/api/mcp";
import { useMcp, type UseMcpReturn } from "./useMcp";

const mcpApiMocks = vi.hoisted(() => ({
  listServersWithStatus: vi.fn(),
  listTools: vi.fn(),
  listPrompts: vi.fn(),
  listResources: vi.fn(),
  startServer: vi.fn(),
  stopServer: vi.fn(),
  callTool: vi.fn(),
  getPrompt: vi.fn(),
  readResource: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  safeListen: vi.fn(),
}));

vi.mock("@/lib/api/mcp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/mcp")>(
    "@/lib/api/mcp",
  );

  return {
    ...actual,
    mcpApi: {
      ...actual.mcpApi,
      listServersWithStatus: (...args: unknown[]) =>
        mcpApiMocks.listServersWithStatus(...args),
      listTools: (...args: unknown[]) => mcpApiMocks.listTools(...args),
      listPrompts: (...args: unknown[]) => mcpApiMocks.listPrompts(...args),
      listResources: (...args: unknown[]) =>
        mcpApiMocks.listResources(...args),
      startServer: (...args: unknown[]) => mcpApiMocks.startServer(...args),
      stopServer: (...args: unknown[]) => mcpApiMocks.stopServer(...args),
      callTool: (...args: unknown[]) => mcpApiMocks.callTool(...args),
      getPrompt: (...args: unknown[]) => mcpApiMocks.getPrompt(...args),
      readResource: (...args: unknown[]) => mcpApiMocks.readResource(...args),
    },
  };
});

vi.mock("@/lib/dev-bridge", () => ({
  safeListen: (...args: unknown[]) => bridgeMocks.safeListen(...args),
}));

interface HarnessProps {
  onReady: (value: UseMcpReturn) => void;
}

function HookHarness({ onReady }: HarnessProps) {
  const value = useMcp();

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

const mountedRoots: MountedRoot[] = [];

function createServer(
  overrides: Partial<McpServerInfo> = {},
): McpServerInfo {
  return {
    id: "server-demo",
    name: "docs",
    config: {
      command: "node",
      args: ["mcp-server.js"],
    },
    is_running: false,
    server_info: undefined,
    enabled_lime: true,
    enabled_claude: false,
    enabled_codex: true,
    enabled_gemini: false,
    ...overrides,
  };
}

async function renderHook(onReady: (value: UseMcpReturn) => void) {
  mountHarness(HookHarness, { onReady }, mountedRoots);
  await flushEffects(8);
}

describe("useMcp", () => {
  let latestValue: UseMcpReturn | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setupReactActEnvironment();
    latestValue = null;
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mcpApiMocks.listServersWithStatus.mockResolvedValue([]);
    mcpApiMocks.listTools.mockResolvedValue([]);
    mcpApiMocks.listPrompts.mockResolvedValue([]);
    mcpApiMocks.listResources.mockResolvedValue([]);
    mcpApiMocks.startServer.mockResolvedValue(undefined);
    mcpApiMocks.stopServer.mockResolvedValue(undefined);
    mcpApiMocks.callTool.mockResolvedValue({ content: [], is_error: false });
    mcpApiMocks.getPrompt.mockResolvedValue({ messages: [] });
    mcpApiMocks.readResource.mockResolvedValue({ uri: "docs://readme" });
    bridgeMocks.safeListen.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    consoleErrorSpy.mockRestore();
  });

  function getLatestValue(): UseMcpReturn {
    expect(latestValue).not.toBeNull();
    return latestValue as UseMcpReturn;
  }

  it("服务器状态刷新成功后应清除上一次 MCP 获取错误", async () => {
    mcpApiMocks.listServersWithStatus
      .mockRejectedValueOnce(new Error("bridge warming up"))
      .mockResolvedValueOnce([createServer()]);

    await renderHook((value) => {
      latestValue = value;
    });

    expect(getLatestValue().error).toBe("bridge warming up");

    await act(async () => {
      await getLatestValue().refreshServers();
    });
    await flushEffects(4);

    expect(getLatestValue().servers).toHaveLength(1);
    expect(getLatestValue().error).toBeNull();
  });

  it("运行态工具列表尚未 current 化时不应阻断 MCP 服务器配置读取", async () => {
    mcpApiMocks.listServersWithStatus.mockResolvedValueOnce([
      createServer({ is_running: true }),
    ]);
    mcpApiMocks.listTools.mockRejectedValueOnce(
      new Error("mcpTool/list runtime not available"),
    );

    await renderHook((value) => {
      latestValue = value;
    });

    expect(getLatestValue().servers).toHaveLength(1);
    expect(getLatestValue().tools).toEqual([]);
    expect(getLatestValue().loading).toBe(false);
    expect(getLatestValue().error).toBeNull();
  });
});
