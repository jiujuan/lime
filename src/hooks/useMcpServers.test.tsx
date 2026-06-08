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
import type { McpServer } from "@/lib/api/mcp";
import { useMcpServers } from "./useMcpServers";

const mcpApiMocks = vi.hoisted(() => ({
  getServers: vi.fn(),
  addServer: vi.fn(),
  updateServer: vi.fn(),
  deleteServer: vi.fn(),
  toggleServer: vi.fn(),
  importFromApp: vi.fn(),
  syncAllToLive: vi.fn(),
}));

vi.mock("@/lib/api/mcp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/mcp")>(
    "@/lib/api/mcp",
  );

  return {
    ...actual,
    mcpApi: {
      ...actual.mcpApi,
      getServers: (...args: unknown[]) => mcpApiMocks.getServers(...args),
      addServer: (...args: unknown[]) => mcpApiMocks.addServer(...args),
      updateServer: (...args: unknown[]) => mcpApiMocks.updateServer(...args),
      deleteServer: (...args: unknown[]) => mcpApiMocks.deleteServer(...args),
      toggleServer: (...args: unknown[]) => mcpApiMocks.toggleServer(...args),
      importFromApp: (...args: unknown[]) => mcpApiMocks.importFromApp(...args),
      syncAllToLive: (...args: unknown[]) =>
        mcpApiMocks.syncAllToLive(...args),
    },
  };
});

type HookValue = ReturnType<typeof useMcpServers>;

interface HarnessProps {
  onReady: (value: HookValue) => void;
}

function HookHarness({ onReady }: HarnessProps) {
  const value = useMcpServers();

  useEffect(() => {
    onReady(value);
  }, [onReady, value]);

  return null;
}

const mountedRoots: MountedRoot[] = [];

function createServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "server-demo",
    name: "docs",
    server_config: {
      command: "node",
      args: ["mcp-server.js"],
    },
    enabled_lime: true,
    enabled_claude: false,
    enabled_codex: true,
    enabled_gemini: false,
    ...overrides,
  };
}

async function renderHook(onReady: (value: HookValue) => void) {
  mountHarness(HookHarness, { onReady }, mountedRoots);
  await flushEffects(6);
}

describe("useMcpServers", () => {
  let latestValue: HookValue | null = null;

  beforeEach(() => {
    setupReactActEnvironment();
    latestValue = null;
    vi.clearAllMocks();
    mcpApiMocks.getServers.mockResolvedValue([]);
    mcpApiMocks.addServer.mockResolvedValue(undefined);
    mcpApiMocks.updateServer.mockResolvedValue(undefined);
    mcpApiMocks.deleteServer.mockResolvedValue(undefined);
    mcpApiMocks.toggleServer.mockResolvedValue(undefined);
    mcpApiMocks.importFromApp.mockResolvedValue(0);
    mcpApiMocks.syncAllToLive.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
  });

  function getLatestValue(): HookValue {
    expect(latestValue).not.toBeNull();
    return latestValue as HookValue;
  }

  it("首次加载空 MCP 列表时不应自动触发未迁移的外部导入命令", async () => {
    await renderHook((value) => {
      latestValue = value;
    });

    expect(mcpApiMocks.getServers).toHaveBeenCalledTimes(1);
    expect(mcpApiMocks.importFromApp).not.toHaveBeenCalled();
    expect(getLatestValue().servers).toEqual([]);
    expect(getLatestValue().loading).toBe(false);
    expect(getLatestValue().error).toBeNull();
  });

  it("手动全部导入时仍按用户操作逐个请求外部应用", async () => {
    mcpApiMocks.importFromApp.mockResolvedValueOnce(1);
    mcpApiMocks.importFromApp.mockResolvedValueOnce(0);
    mcpApiMocks.importFromApp.mockResolvedValueOnce(2);
    mcpApiMocks.getServers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createServer()]);

    await renderHook((value) => {
      latestValue = value;
    });

    await act(async () => {
      await getLatestValue().importFromAllApps();
    });
    await flushEffects(4);

    expect(mcpApiMocks.importFromApp).toHaveBeenCalledTimes(3);
    expect(mcpApiMocks.importFromApp).toHaveBeenNthCalledWith(1, "claude");
    expect(mcpApiMocks.importFromApp).toHaveBeenNthCalledWith(2, "codex");
    expect(mcpApiMocks.importFromApp).toHaveBeenNthCalledWith(3, "gemini");
    expect(getLatestValue().servers).toHaveLength(1);
  });
});
