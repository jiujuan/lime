import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppServerRequestError } from "app-server-client";
import { ElectronHostCommands } from "./hostCommands";
import type { ElectronAppServerHost } from "./appServerHost";

const {
  getFileIconMock,
  getPathMock,
  openExternalMock,
  openPathMock,
  showItemInFolderMock,
} = vi.hoisted(() => {
  return {
    getFileIconMock: vi.fn(),
    getPathMock: vi.fn((_name: string) => os.tmpdir()),
    openExternalMock: vi.fn(),
    openPathMock: vi.fn(),
    showItemInFolderMock: vi.fn(),
  };
});
const tempDirs: string[] = [];
type AppServerRequestMock = (
  method: string,
  params?: unknown,
) => Promise<unknown>;

vi.mock("./electronRuntime", () => ({
  app: {
    getFileIcon: getFileIconMock,
    getName: () => "Lime",
    getPath: getPathMock,
    getVersion: () => "0.0.0-test",
  },
  shell: {
    openExternal: openExternalMock,
    openPath: openPathMock,
    showItemInFolder: showItemInFolderMock,
  },
}));

function createHost(
  userDataDir: string,
  emit: (event: string, payload?: unknown) => void = () => undefined,
  request: AppServerRequestMock = async () => {
    throw new Error("App Server should not be called");
  },
) {
  const appServerHost = {
    request,
  } as unknown as ElectronAppServerHost;
  return new ElectronHostCommands(appServerHost, userDataDir, emit);
}

async function createTempUserDataDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lime-host-commands-"));
  tempDirs.push(dir);
  return dir;
}

function sessionAlreadyExistsError(sessionId: string) {
  return new AppServerRequestError(
    "agentSession/start",
    {
      id: "test-session-start",
      error: {
        code: -32013,
        message: `session already exists: ${sessionId}`,
      },
    },
    [],
    [],
  );
}

afterEach(async () => {
  vi.clearAllMocks();
  getPathMock.mockImplementation(() => os.tmpdir());
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("ElectronHostCommands retired file browser facade", () => {
  it.each(["list_dir", "read_file_preview_cmd"])(
    "%s 不再作为 Electron Host compat facade 暴露",
    async (command) => {
      const userDataDir = await createTempUserDataDir();
      const host = createHost(userDataDir);

      await expect(
        host.invoke(command, { path: "/workspace" }),
      ).rejects.toThrow(`Electron host command is not implemented: ${command}`);
    },
  );
});

describe("ElectronHostCommands retired automation facade", () => {
  it.each([
    "get_automation_scheduler_config",
    "get_automation_status",
    "get_automation_health",
    "get_automation_jobs",
  ])("%s 不再作为 Electron Host compat facade 暴露", async (command) => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke(command, {})).rejects.toThrow(
      `Electron host command is not implemented: ${command}`,
    );
  });
});

describe("ElectronHostCommands retired API Key Provider facade", () => {
  it.each([
    "get_api_key_providers",
    "get_system_provider_catalog",
    "get_provider_ui_state",
    "set_provider_ui_state",
    "fetch_provider_models_auto",
  ])("%s 不再作为 Electron Host provider facade 暴露", async (command) => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke(command, {})).rejects.toThrow(
      `Electron host command is not implemented: ${command}`,
    );
  });
});

describe("ElectronHostCommands local file shell facade", () => {
  it("reveal_in_finder 通过 Electron shell 定位本地路径", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("reveal_in_finder", { path: "/tmp/demo.txt" }),
    ).resolves.toEqual({});

    expect(showItemInFolderMock).toHaveBeenCalledWith("/tmp/demo.txt");
  });

  it("open_with_default_app 通过 Electron shell 打开本地路径", async () => {
    openPathMock.mockResolvedValueOnce("");
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_with_default_app", { path: "/tmp/demo.txt" }),
    ).resolves.toEqual({});

    expect(openPathMock).toHaveBeenCalledWith("/tmp/demo.txt");
  });

  it("open_with_default_app 应暴露 Electron openPath 失败", async () => {
    openPathMock.mockResolvedValueOnce("Cannot open file");
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_with_default_app", { path: "/tmp/missing.txt" }),
    ).rejects.toThrow("Cannot open file");
  });

  it("get_file_icon_data_url 应通过 Electron 读取系统文件图标", async () => {
    getFileIconMock.mockResolvedValueOnce({
      isEmpty: () => false,
      toDataURL: () => "data:image/png;base64,abc",
    });
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/Applications/Lime.app" }),
    ).resolves.toBe("data:image/png;base64,abc");

    expect(getFileIconMock).toHaveBeenCalledWith("/Applications/Lime.app", {
      size: "normal",
    });
  });

  it("get_file_icon_data_url 在系统图标不可用时返回 null", async () => {
    getFileIconMock.mockResolvedValueOnce({
      isEmpty: () => true,
      toDataURL: () => "data:image/png;base64,unused",
    });
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/tmp/missing.txt" }),
    ).resolves.toBeNull();
  });

  it("get_file_icon_data_url 应隔离 Electron 图标读取失败", async () => {
    getFileIconMock.mockRejectedValueOnce(new Error("icon unavailable"));
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("get_file_icon_data_url", { path: "/tmp/missing.txt" }),
    ).resolves.toBeNull();
  });

  it("get_home_dir 应返回 Electron 系统主目录", async () => {
    const userDataDir = await createTempUserDataDir();
    const homeDir = path.join(userDataDir, "home");
    getPathMock.mockImplementation((name: string) => {
      return name === "home" ? homeDir : os.tmpdir();
    });
    const host = createHost(userDataDir);

    await expect(host.invoke("get_home_dir")).resolves.toBe(homeDir);
  });

  it("get_home_dir 在系统主目录不可用时应 fail closed", async () => {
    const userDataDir = await createTempUserDataDir();
    getPathMock.mockImplementation((name: string) => {
      return name === "home" ? "" : os.tmpdir();
    });
    const host = createHost(userDataDir);

    await expect(host.invoke("get_home_dir")).rejects.toThrow("无法获取主目录");
  });

  it("get_file_manager_locations 应返回存在的系统快捷入口并去重", async () => {
    const userDataDir = await createTempUserDataDir();
    const homeDir = path.join(userDataDir, "home");
    const missingDesktopDir = path.join(userDataDir, "missing-desktop");
    const documentsDir = path.join(userDataDir, "Documents");
    const downloadsDir = path.join(userDataDir, "Downloads");
    await mkdir(homeDir, { recursive: true });
    await mkdir(documentsDir, { recursive: true });
    await mkdir(downloadsDir, { recursive: true });
    getPathMock.mockImplementation((name: string) => {
      if (name === "home") {
        return homeDir;
      }
      if (name === "desktop") {
        return missingDesktopDir;
      }
      if (name === "documents") {
        return documentsDir;
      }
      if (name === "downloads") {
        return downloadsDir;
      }
      return os.tmpdir();
    });
    const host = createHost(userDataDir);

    const locations = await host.invoke("get_file_manager_locations");

    expect(locations).toEqual(
      expect.arrayContaining([
        {
          id: "home",
          label: "个人",
          path: homeDir,
          kind: "home",
        },
        {
          id: "documents",
          label: "文档",
          path: documentsDir,
          kind: "documents",
        },
        {
          id: "downloads",
          label: "下载",
          path: downloadsDir,
          kind: "downloads",
        },
      ]),
    );
    const returnedPaths = (locations as Array<{ path: string }>).map(
      (location) => location.path,
    );
    expect(returnedPaths.filter((nextPath) => nextPath === homeDir)).toHaveLength(
      1,
    );
    expect(returnedPaths).not.toContain(missingDesktopDir);
  });
});

describe("ElectronHostCommands experimental config", () => {
  it("默认读取关闭的 WebMCP 预留配置", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(host.invoke("get_experimental_config")).resolves.toEqual({
      webmcp: { enabled: false },
    });
  });

  it("保存实验配置时合并完整配置并保留未知实验字段", async () => {
    const userDataDir = await createTempUserDataDir();
    await mkdir(userDataDir, { recursive: true });
    await createHost(userDataDir).invoke("save_config", {
      config: {
        default_provider: "anthropic",
        experimental: {
          webmcp: { enabled: false },
          update_check: { enabled: true },
        },
      },
    });

    const host = createHost(userDataDir);
    await expect(
      host.invoke("save_experimental_config", {
        experimentalConfig: {
          webmcp: { enabled: true },
          update_check: { enabled: true },
        },
      }),
    ).resolves.toEqual({ success: true });

    await expect(host.invoke("get_experimental_config")).resolves.toEqual({
      webmcp: { enabled: true },
      update_check: { enabled: true },
    });
    const savedConfig = JSON.parse(
      await readFile(path.join(userDataDir, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(savedConfig.default_provider).toBe("anthropic");
  });
});

describe("ElectronHostCommands MCP current source", () => {
  it.each([
    [
      "get_mcp_servers",
      "mcpServer/list",
      { servers: [{ id: "server-1", name: "docs" }] },
      [{ id: "server-1", name: "docs" }],
    ],
    [
      "mcp_list_servers_with_status",
      "mcpServerStatus/list",
      { servers: [{ id: "server-1", name: "docs", is_running: false }] },
      [{ id: "server-1", name: "docs", is_running: false }],
    ],
    [
      "mcp_list_tools",
      "mcpTool/list",
      { tools: [{ name: "mcp__docs__search_docs" }] },
      [{ name: "mcp__docs__search_docs" }],
    ],
    [
      "mcp_list_prompts",
      "mcpPrompt/list",
      { prompts: [{ name: "summarize", server_name: "docs" }] },
      [{ name: "summarize", server_name: "docs" }],
    ],
    [
      "mcp_list_resources",
      "mcpResource/list",
      { resources: [{ uri: "docs://readme", server_name: "docs" }] },
      [{ uri: "docs://readme", server_name: "docs" }],
    ],
  ] as const)(
    "%s 应经 App Server current method 返回 MCP 列表",
    async (command, expectedMethod, response, expectedResult) => {
      const userDataDir = await createTempUserDataDir();
      const request = vi.fn(async (method: string, params?: unknown) => {
        expect(params).toEqual({});
        if (method === expectedMethod) {
          return response;
        }
        throw new Error(`unexpected App Server method: ${method}`);
      });
      const host = createHost(userDataDir, () => undefined, request);

      await expect(host.invoke(command)).resolves.toEqual(expectedResult);
      expect(request).toHaveBeenCalledWith(expectedMethod, {});
    },
  );

  it("MCP current 空态不应带 Electron diagnostic facade 元数据", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir, () => undefined, async (method) => {
      if (method === "mcpTool/list") {
        return { tools: [] };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });

    const result = await host.invoke("mcp_list_tools");

    expect(result).toEqual([]);
    expect((result as { __diagnostic?: unknown }).__diagnostic).toBeUndefined();
  });
});

describe("ElectronHostCommands retired Knowledge legacy facade", () => {
  it.each([
    "knowledge_list_packs",
    "knowledge_get_pack",
    "knowledge_import_source",
    "knowledge_compile_pack",
    "knowledge_set_default_pack",
    "knowledge_update_pack_status",
    "knowledge_resolve_context",
    "knowledge_validate_context_run",
  ])("%s 已从 Electron Host 退场，生产只能走 App Server JSONL current", async (command) => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn();
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke(command, {
        request: {
          workingDir: "/workspace/project",
          name: "sample-product",
        },
      }),
    ).rejects.toThrow(`Electron host command is not implemented: ${command}`);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("ElectronHostCommands model provider current source", () => {
  it("get_default_provider 应忽略旧配置值并返回 App Server 当前已配置 Provider", async () => {
    const userDataDir = await createTempUserDataDir();
    await createHost(userDataDir).invoke("save_config", {
      config: { default_provider: "retired-provider" },
    });
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "modelProvider/list") {
        return {
          providers: [
            {
              id: "retired-provider",
              name: "Retired Provider",
              enabled: true,
              api_key_count: 0,
            },
            {
              id: "lime-hub",
              name: "Lime Hub",
              enabled: true,
              api_key_count: 1,
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(host.invoke("get_default_provider")).resolves.toBe("lime-hub");
    expect(request).toHaveBeenCalledWith("modelProvider/list", {});
  });

  it("aster_agent_init 不应把其他 Provider 的模型拼给当前 Provider", async () => {
    const userDataDir = await createTempUserDataDir();
    await createHost(userDataDir).invoke("save_config", {
      config: { default_provider: "retired-provider" },
    });
    const request = vi.fn(async (method: string) => {
      if (method === "modelProvider/list") {
        return {
          providers: [
            {
              id: "retired-provider",
              name: "Retired Provider",
              enabled: true,
              api_key_count: 0,
            },
            {
              id: "lime-hub",
              name: "Lime Hub",
              enabled: true,
              api_key_count: 1,
            },
          ],
        };
      }
      if (method === "model/list") {
        return {
          models: [
            {
              id: "deepseek-v4-pro",
              provider_id: "deepseek",
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(host.invoke("aster_agent_init")).resolves.toEqual({
      initialized: true,
      provider_configured: true,
      provider_name: "Lime Hub",
      provider_selector: "lime-hub",
      model_name: undefined,
    });
  });
});

describe("ElectronHostCommands Agent runtime legacy facade current bridge", () => {
  it("agent_runtime_get_tool_inventory 将 App Server tool capability 投影为运行时工具名", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "capability/list") {
        return {
          capabilities: [
            {
              id: "agent.session",
              title: "Agent Session",
              description: "Session control.",
              methods: [
                "agentSession/start",
                "agentSession/read",
                "agentSession/turn/start",
              ],
            },
            {
              id: "tool.WebFetch",
              title: "WebFetch",
              description: "Fetch a specific URL.",
              methods: ["agentSession/turn/start"],
            },
            {
              id: "tool.WebSearch",
              title: "WebSearch",
              description: "Search the web.",
              methods: ["agentSession/turn/start"],
            },
          ],
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    const inventory = (await host.invoke("agent_runtime_get_tool_inventory", {
      request: {
        caller: "assistant",
        workbench: true,
        browserAssist: true,
        workspaceId: "workspace-1",
        sessionId: "session-1",
      },
    })) as {
      default_allowed_tools: string[];
      runtime_tools: Array<{ name: string; source_label: string }>;
    };

    expect(request).toHaveBeenCalledWith("capability/list", {
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
    expect(inventory.default_allowed_tools).toContain("WebFetch");
    expect(inventory.default_allowed_tools).toContain("WebSearch");
    expect(inventory.runtime_tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "WebFetch",
          source_label: "tool.WebFetch",
        }),
        expect.objectContaining({
          name: "WebSearch",
          source_label: "tool.WebSearch",
        }),
      ]),
    );
    expect(
      inventory.runtime_tools.filter(
        (tool) => tool.name === "agentSession/turn/start",
      ),
    ).toHaveLength(1);
  });

  it("agent_runtime_submit_turn 将 Claw turnConfig 投影到 App Server asterChatRequest", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_submit_turn", {
        request: {
          message: "整理今天的国际新闻",
          sessionId: "session-1",
          workspaceId: "workspace-1",
          eventName: "agent-runtime-event-1",
          turnId: "turn-1",
          queuedTurnId: "queued-1",
          queueIfBusy: true,
          skipPreSubmitResume: true,
          turnConfig: {
            providerPreference: "fixture-openai",
            modelPreference: "fixture-model",
            providerConfig: {
              providerName: "fixture-openai",
              modelName: "fixture-model",
              apiKey: "fixture-key",
              baseUrl: "http://127.0.0.1:5555/v1",
              toolCallStrategy: "tool-shim",
              toolshimModel: "fixture-toolshim",
            },
            approvalPolicy: "never",
            sandboxPolicy: "danger-full-access",
            webSearch: true,
            searchMode: "allowed",
            metadata: { source: "host-submit-test" },
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(
      "agentSession/turn/start",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        input: {
          text: "整理今天的国际新闻",
          attachments: undefined,
        },
        queueIfBusy: true,
        skipPreSubmitResume: true,
        runtimeOptions: expect.objectContaining({
          stream: true,
          eventName: "agent-runtime-event-1",
          providerPreference: "fixture-openai",
          modelPreference: "fixture-model",
          metadata: { source: "host-submit-test" },
          queuedTurnId: "queued-1",
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              message: "整理今天的国际新闻",
              session_id: "session-1",
              event_name: "agent-runtime-event-1",
              provider_preference: "fixture-openai",
              model_preference: "fixture-model",
              workspace_id: "workspace-1",
              approval_policy: "never",
              sandbox_policy: "danger-full-access",
              web_search: true,
              search_mode: "allowed",
              turn_id: "turn-1",
              queue_if_busy: true,
              queued_turn_id: "queued-1",
              metadata: { source: "host-submit-test" },
              provider_config: {
                providerName: "fixture-openai",
                modelName: "fixture-model",
                apiKey: "fixture-key",
                baseUrl: "http://127.0.0.1:5555/v1",
                toolCallStrategy: "tool-shim",
                toolshimModel: "fixture-toolshim",
              },
              turn_config: expect.objectContaining({
                providerConfig: expect.objectContaining({
                  providerName: "fixture-openai",
                  baseUrl: "http://127.0.0.1:5555/v1",
                }),
              }),
            }),
            agentRuntimeSubmitTurnRequest: expect.objectContaining({
              sessionId: "session-1",
              turnConfig: expect.objectContaining({
                providerPreference: "fixture-openai",
              }),
            }),
          },
        }),
      }),
    );
  });

  it("agent_runtime_get_thread_read 透传 App Server read detail 的工具调用", async () => {
    const userDataDir = await createTempUserDataDir();
    const threadRead = {
      session_id: "session-1",
      thread_id: "thread-1",
      status: "completed",
      execution_strategy: "react",
      turns: [],
      pending_requests: [],
      queued_turns: [],
      tool_calls: [
        {
          id: "tool-call-webfetch",
          tool_name: "WebFetch",
          status: "completed",
          success: true,
          output_preview: "fetched example.com",
        },
        {
          id: "tool-call-websearch",
          toolName: "WebSearch",
          status: "completed",
          outputPreview: "search results",
        },
      ],
    };
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "desktop",
            workspaceId: "workspace-1",
            status: "completed",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:01.000Z",
          },
          turns: [],
          detail: {
            id: "session-1",
            execution_strategy: "react",
            thread_read: threadRead,
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_get_thread_read", {
        sessionId: "session-1",
      }),
    ).resolves.toEqual(threadRead);
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
  });

  it("agent_runtime_export_evidence_pack 从 App Server events 投影真实工具轨迹", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "evidence/export") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "desktop",
            workspaceId: "workspace-1",
            status: "completed",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:03.000Z",
          },
          turns: [
            {
              turnId: "turn-1",
              sessionId: "session-1",
              threadId: "thread-1",
              status: "completed",
            },
          ],
          events: [
            {
              eventId: "event-fetch-started",
              sequence: 1,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.started",
              timestamp: "2026-06-07T00:00:01.000Z",
              payload: {
                toolCallId: "tool-call-webfetch",
                toolName: "WebFetch",
              },
            },
            {
              eventId: "event-fetch-result",
              sequence: 2,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.result",
              timestamp: "2026-06-07T00:00:02.000Z",
              payload: {
                toolCallId: "tool-call-webfetch",
                toolName: "WebFetch",
                output: "Example Domain",
              },
            },
            {
              eventId: "event-nested-fetch-result",
              sequence: 3,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "tool.result",
              timestamp: "2026-06-07T00:00:02.500Z",
              payload: {
                runtimeEvent: {
                  tool_id: "tool-call-webfetch",
                  type: "tool_end",
                  result: {
                    success: true,
                    output: "Example Domain nested runtime output",
                  },
                },
                tool_id: "tool-call-webfetch",
                type: "tool_end",
                result: {
                  success: true,
                  output: "Example Domain nested runtime output",
                },
              },
            },
            {
              eventId: "event-search-result",
              sequence: 4,
              sessionId: "session-1",
              threadId: "thread-1",
              turnId: "turn-1",
              type: "item.completed",
              timestamp: "2026-06-07T00:00:03.000Z",
              payload: {
                runtimeEvent: {
                  type: "item_completed",
                  item: {
                    id: "tool-call-websearch",
                    type: "tool_call",
                    tool_name: "WebSearch",
                    status: "completed",
                    success: true,
                    output: "Lime runtime tool smoke example domain",
                  },
                },
                item: {
                  id: "tool-call-websearch",
                  type: "tool_call",
                  tool_name: "WebSearch",
                  status: "completed",
                  success: true,
                  output: "Lime runtime tool smoke example domain",
                },
              },
            },
          ],
          artifacts: [],
          exportedAt: "2026-06-07T00:00:04.000Z",
          evidencePack: {
            packRelativeRoot: "",
            exportedAt: "2026-06-07T00:00:04.000Z",
            threadStatus: "completed",
            latestTurnStatus: "completed",
            turnCount: 1,
            itemCount: 3,
            pendingRequestCount: 0,
            queuedTurnCount: 0,
            recentArtifactCount: 0,
            knownGaps: [],
            artifacts: [],
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_runtime_export_evidence_pack", {
        sessionId: "session-1",
      }),
    ).resolves.toMatchObject({
      sessionId: "session-1",
      threadId: "thread-1",
      observabilitySummary: {
        schemaVersion: "runtime-evidence-observability.v1",
        toolCalls: [
          expect.objectContaining({
            id: "tool-call-webfetch",
            toolName: "WebFetch",
            status: "completed",
            success: true,
            output: "Example Domain nested runtime output",
          }),
          expect.objectContaining({
            id: "tool-call-websearch",
            toolName: "WebSearch",
            status: "completed",
            success: true,
            output: "Lime runtime tool smoke example domain",
          }),
        ],
      },
    });
    expect(request).toHaveBeenCalledWith("evidence/export", {
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
  });
});

describe("ElectronHostCommands Agent App runtime current bridge", () => {
  it("agent_app_runtime_start_task 通过 App Server session start 与 turn start 投影", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/start") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "idle",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
        };
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_start_task", {
        request: {
          appId: "content-factory-app",
          entryKey: "writer",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          title: "写一组发布文案",
          prompt: "生成 3 条可发布文案",
          input: { topic: "Electron current" },
          expectedOutput: { contentFactoryWorkspacePatch: true },
          eventName: "agent_app_runtime:content-factory-app:task-1",
          turnId: "turn-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queueIfBusy: true,
          skipPreSubmitResume: false,
          metadata: { source: "host-test" },
          turnConfig: {
            provider_config: { provider_name: "anthropic" },
            reasoning_effort: "medium",
            sandbox_policy: "workspace-write",
            metadata: { turn_source: "agent-app" },
          },
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      entryKey: "writer",
      taskId: "task-1",
      taskKind: "content_factory.write",
      sessionId: "session-1",
      turnId: "turn-1",
      eventName: "agent_app_runtime:content-factory-app:task-1",
      status: "accepted",
    });

    expect(request).toHaveBeenNthCalledWith(1, "agentSession/start", {
      sessionId: "session-1",
      appId: "content-factory-app",
      workspaceId: "workspace-1",
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "agentSession/turn/start",
      expect.objectContaining({
        sessionId: "session-1",
        turnId: "turn-1",
        input: {
          text: expect.stringContaining("Business Prompt:"),
          attachments: [],
        },
        queueIfBusy: true,
        skipPreSubmitResume: false,
        runtimeOptions: expect.objectContaining({
          stream: true,
          eventName: "agent_app_runtime:content-factory-app:task-1",
          providerPreference: "anthropic",
          modelPreference: "claude-sonnet-4",
          queuedTurnId: "agent-app-queued-task-1",
          metadata: {
            source: "host-test",
            turn_source: "agent-app",
          },
          hostOptions: {
            asterChatRequest: expect.objectContaining({
              session_id: "session-1",
              turn_id: "turn-1",
              workspace_id: "workspace-1",
              provider_preference: "anthropic",
              model_preference: "claude-sonnet-4",
              provider_config: { provider_name: "anthropic" },
              queued_turn_id: "agent-app-queued-task-1",
              turn_config: expect.objectContaining({
                provider_config: { provider_name: "anthropic" },
              }),
            }),
          },
        }),
      }),
    );
  });

  it("agent_app_runtime_start_task 对已存在 session 做幂等投影并继续提交 turn", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/start") {
        throw sessionAlreadyExistsError("session-1");
      }
      if (method === "agentSession/turn/start") {
        return {
          turn: {
            turnId: "turn-1",
            sessionId: "session-1",
            threadId: "thread-1",
            status: "accepted",
          },
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_start_task", {
        request: {
          appId: "content-factory-app",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          taskId: "task-1",
          taskKind: "content_factory.write",
          prompt: "继续同一个 App task",
          turnId: "turn-1",
        },
      }),
    ).resolves.toMatchObject({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      turnId: "turn-1",
      status: "accepted",
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "agentSession/start",
      "agentSession/turn/start",
    ]);
  });

  it("agent_app_runtime_get_task 从 agentSession/read 投影 task snapshot 状态", async () => {
    const userDataDir = await createTempUserDataDir();
    const detail = { thread_id: "thread-1", pending_requests: [] };
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "waitingAction",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns: [],
          detail,
        };
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_get_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      status: "thread_read_available",
      taskStatus: "blocked",
      taskEvents: [],
      threadRead: detail,
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
  });

  it("agent_app_runtime_cancel_task 缺少 turnId 时先从 agentSession/read 查找活动 turn", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "agentSession/read") {
        return {
          session: {
            sessionId: "session-1",
            threadId: "thread-1",
            appId: "content-factory-app",
            workspaceId: "workspace-1",
            status: "running",
            createdAt: "2026-06-07T00:00:00.000Z",
            updatedAt: "2026-06-07T00:00:00.000Z",
          },
          turns:
            (params as { sessionId?: string }).sessionId ===
            "session-without-active-turn"
              ? [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-without-active-turn",
                    threadId: "thread-1",
                    status: "completed",
                  },
                ]
              : [
                  {
                    turnId: "turn-completed",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "completed",
                  },
                  {
                    turnId: "turn-running",
                    sessionId: "session-1",
                    threadId: "thread-1",
                    status: "running",
                  },
                ],
        };
      }
      if (method === "agentSession/turn/cancel") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_cancel_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-without-active-turn",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-without-active-turn",
      cancelled: false,
      status: "not_running",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-without-active-turn",
    });

    await expect(
      host.invoke("agent_app_runtime_cancel_task", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          sessionId: "session-1",
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      sessionId: "session-1",
      cancelled: true,
      status: "cancelled",
    });
    expect(request).toHaveBeenCalledWith("agentSession/read", {
      sessionId: "session-1",
    });
    expect(request).toHaveBeenCalledWith("agentSession/turn/cancel", {
      sessionId: "session-1",
      turnId: "turn-running",
    });
  });

  it("agent_app_runtime_submit_host_response 投影 snake_case runtime request 到 action/respond", async () => {
    const userDataDir = await createTempUserDataDir();
    const request = vi.fn(async (method: string) => {
      if (method === "agentSession/action/respond") {
        return {};
      }
      throw new Error(`unexpected App Server method: ${method}`);
    });
    const host = createHost(userDataDir, () => undefined, request);

    await expect(
      host.invoke("agent_app_runtime_submit_host_response", {
        request: {
          appId: "content-factory-app",
          taskId: "task-1",
          runtimeRequest: {
            session_id: "session-1",
            request_id: "request-1",
            action_type: "ask_user",
            confirmed: true,
            response: "继续",
            user_data: { note: "ok" },
            metadata: { source: "host-test" },
            event_name: "agent_app_runtime:host_response",
            action_scope: {
              session_id: "session-1",
              thread_id: "thread-1",
              turn_id: "turn-1",
            },
          },
        },
      }),
    ).resolves.toEqual({
      appId: "content-factory-app",
      taskId: "task-1",
      status: "submitted",
    });
    expect(request).toHaveBeenCalledWith("agentSession/action/respond", {
      sessionId: "session-1",
      requestId: "request-1",
      actionType: "ask_user",
      confirmed: true,
      response: "继续",
      userData: { note: "ok" },
      metadata: { source: "host-test" },
      eventName: "agent_app_runtime:host_response",
      actionScope: {
        sessionId: "session-1",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    });
  });
});

describe("ElectronHostCommands system utilities", () => {
  it("通过系统浏览器打开 http/https 外部链接", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);
    openExternalMock.mockResolvedValueOnce(undefined);

    await expect(
      host.invoke("open_external_url", {
        url: " https://user.limeai.run/login ",
      }),
    ).resolves.toEqual({});

    expect(openExternalMock).toHaveBeenCalledWith(
      "https://user.limeai.run/login",
    );
  });

  it("拒绝非 http/https 外部链接", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = createHost(userDataDir);

    await expect(
      host.invoke("open_external_url", { url: "file:///tmp/token" }),
    ).rejects.toThrow("外部链接只支持 http/https 地址");

    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it("启动真实 OAuth 本机回调桥并把回调事件广播到 renderer", async () => {
    const userDataDir = await createTempUserDataDir();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const host = createHost(userDataDir, (event, payload) => {
      emitted.push({ event, payload });
    });

    const response = (await host.invoke(
      "start_oem_cloud_oauth_callback_bridge",
    )) as { callbackUrl: string };
    expect(response.callbackUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/,
    );

    const callbackUrl = new URL(response.callbackUrl);
    callbackUrl.searchParams.set("tenant_id", "tenant-1");
    callbackUrl.searchParams.set("token", "token-1");
    callbackUrl.searchParams.set("next", "/dashboard");
    callbackUrl.searchParams.set("device_code", "device-1");
    callbackUrl.searchParams.set("status", "ok");

    const callbackResponse = await fetch(callbackUrl);
    expect(callbackResponse.status).toBe(200);
    await expect(callbackResponse.text()).resolves.toContain(
      "Lime 登录结果已返回",
    );

    expect(emitted).toEqual([
      {
        event: "oem-cloud-oauth-callback",
        payload: {
          sourcePath: "/oauth/callback",
          tenantId: "tenant-1",
          token: "token-1",
          next: "/dashboard",
          error: null,
          deviceCode: "device-1",
          status: "ok",
        },
      },
    ]);

    await expect(fetch(callbackUrl)).rejects.toThrow();
  });
});
