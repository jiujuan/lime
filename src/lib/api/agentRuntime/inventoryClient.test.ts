import { describe, expect, it, vi } from "vitest";
import { createInventoryClient } from "./inventoryClient";

describe("agentRuntime inventoryClient", () => {
  it("workspace skill bindings 应通过 App Server JSON-RPC 获取 readiness", async () => {
    const appServerClient = {
      request: vi.fn().mockResolvedValueOnce({
        result: {
          bindings: {
            request: {
              workspace_root: "/tmp/work",
              caller: "assistant",
              surface: {
                workbench: true,
                browser_assist: false,
              },
            },
            warnings: [],
            counts: {
              registered_total: 1,
              ready_for_manual_enable_total: 1,
              blocked_total: 0,
              query_loop_visible_total: 0,
              tool_runtime_visible_total: 0,
              launch_enabled_total: 0,
            },
            bindings: [],
          },
        },
      }),
    };
    const invokeCommand = vi.fn();
    const client = createInventoryClient({ appServerClient, invokeCommand });

    await expect(
      client.listWorkspaceSkillBindings({
        workspaceRoot: "  /tmp/work  ",
        caller: "assistant",
        workbench: true,
      }),
    ).resolves.toMatchObject({
      counts: {
        registered_total: 1,
        ready_for_manual_enable_total: 1,
      },
    });

    expect(appServerClient.request).toHaveBeenCalledWith(
      "workspaceSkillBindings/list",
      {
        workspaceRoot: "/tmp/work",
        caller: "assistant",
        workbench: true,
      },
    );
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("workspace skill bindings 缺少 workspaceRoot 时应 fail closed", async () => {
    const appServerClient = {
      request: vi.fn(),
    };
    const invokeCommand = vi.fn();
    const client = createInventoryClient({ appServerClient, invokeCommand });

    await expect(
      client.listWorkspaceSkillBindings({ workspaceRoot: "   " }),
    ).rejects.toThrow(
      "workspaceRoot is required to list App Server workspace skill bindings",
    );

    expect(appServerClient.request).not.toHaveBeenCalled();
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("tool inventory 暂保 compat command，避免用 capability/list 伪装完整库存", async () => {
    const invokeCommand = vi.fn().mockResolvedValueOnce({
      request: {
        caller: "assistant",
        surface: {
          workbench: true,
          browser_assist: false,
        },
      },
      agent_initialized: true,
      warnings: [],
      mcp_servers: [],
      default_allowed_tools: [],
      counts: {
        catalog_total: 0,
        catalog_current_total: 0,
        catalog_compat_total: 0,
        catalog_deprecated_total: 0,
        default_allowed_total: 0,
        registry_total: 0,
        registry_visible_total: 0,
        registry_catalog_unmapped_total: 0,
        extension_surface_total: 0,
        extension_mcp_bridge_total: 0,
        extension_runtime_total: 0,
        extension_tool_total: 0,
        extension_tool_visible_total: 0,
        mcp_server_total: 0,
        mcp_tool_total: 0,
        mcp_tool_visible_total: 0,
      },
      catalog_tools: [],
      registry_tools: [],
      extension_surfaces: [],
      extension_tools: [],
      mcp_tools: [],
    });
    const client = createInventoryClient({ invokeCommand });

    await expect(
      client.getAgentRuntimeToolInventory({
        caller: "assistant",
        workbench: true,
      }),
    ).resolves.toMatchObject({
      counts: {
        catalog_total: 0,
        registry_total: 0,
      },
    });

    expect(invokeCommand).toHaveBeenCalledWith(
      "agent_runtime_get_tool_inventory",
      {
        request: {
          caller: "assistant",
          workbench: true,
        },
      },
    );
  });
});
