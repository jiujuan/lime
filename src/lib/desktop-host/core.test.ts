import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeViaHttp: vi.fn(),
  isDevBridgeAvailable: vi.fn(),
  normalizeDevBridgeError: vi.fn((cmd: string, error: unknown) => {
    if (error instanceof Error) {
      return new Error(`[${cmd}] ${error.message}`);
    }
    return new Error(`[${cmd}] ${String(error)}`);
  }),
}));

vi.mock("../dev-bridge/http-client", () => ({
  invokeViaHttp: mocks.invokeViaHttp,
  isDevBridgeAvailable: mocks.isDevBridgeAvailable,
  normalizeDevBridgeError: mocks.normalizeDevBridgeError,
}));

import {
  clearMocks,
  convertFileSrc,
  invoke,
  invokeMockOnly,
  mockCommand,
} from "./core";
import { createSkillForgeMockHandlers } from "./skillForgeMocks";

function clearElectronBridge(): void {
  delete (window as any).electronAPI;
}

function registerSkillForgeTestMocks(): void {
  for (const [command, handler] of Object.entries(
    createSkillForgeMockHandlers(),
  )) {
    mockCommand(command, handler);
  }
}

describe("desktop-host/core invoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMocks();
    mocks.isDevBridgeAvailable.mockReturnValue(true);
    clearElectronBridge();
  });

  it("Electron host 可用时 production invoke 走 Desktop Host IPC", async () => {
    const electronInvoke = vi.fn().mockResolvedValueOnce("/real/electron/root");
    (window as any).electronAPI = {
      invoke: electronInvoke,
      listen: vi.fn(),
      emit: vi.fn(),
    };

    const result = await invoke<string>("workspace_get_projects_root");

    expect(result).toBe("/real/electron/root");
    expect(electronInvoke).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      undefined,
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("无 Electron host 时 production invoke 走 HTTP bridge", async () => {
    mocks.invokeViaHttp.mockResolvedValueOnce("/real/backend/root");

    const result = await invoke<string>("workspace_get_projects_root");

    expect(result).toBe("/real/backend/root");
    expect(mocks.invokeViaHttp).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      undefined,
    );
  });

  it("HTTP bridge 失败时 production invoke 直接抛出规范化错误", async () => {
    mocks.invokeViaHttp.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(invoke("workspace_get_projects_root")).rejects.toThrow(
      "[workspace_get_projects_root] Failed to fetch",
    );

    expect(mocks.normalizeDevBridgeError).toHaveBeenCalledWith(
      "workspace_get_projects_root",
      expect.any(Error),
    );
  });

  it("无 Electron host 且无 HTTP bridge 时 production invoke fail-closed", async () => {
    mocks.isDevBridgeAvailable.mockReturnValue(false);

    await expect(invoke("workspace_get_projects_root")).rejects.toThrow(
      'Desktop Host IPC 不可用，命令 "workspace_get_projects_root" 无法进入 App Server JSON-RPC 主链',
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("convertFileSrc 只委托 Electron host", () => {
    (window as any).electronAPI = {
      invoke: vi.fn(),
      listen: vi.fn(),
      emit: vi.fn(),
      convertFileSrc: vi.fn(() => "app://asset/example.png"),
    };

    expect(convertFileSrc("/tmp/example.png")).toBe("app://asset/example.png");
    expect((window as any).electronAPI.convertFileSrc).toHaveBeenCalledWith(
      "/tmp/example.png",
      undefined,
    );
  });

  it("convertFileSrc 无 Electron host 时 fail-closed", () => {
    expect(() => convertFileSrc("/tmp/example.png")).toThrow(
      "Desktop Host IPC 不可用，本地文件路径无法转换",
    );
  });

  it("显式 mock 入口可返回测试注册的配置 mock，不访问 bridge", async () => {
    mockCommand("get_config", () => ({
      server: {
        port: 8787,
      },
      default_provider: "openai",
    }));

    await expect(invokeMockOnly("get_config")).resolves.toEqual(
      expect.objectContaining({
        server: expect.objectContaining({
          port: 8787,
        }),
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("显式 mock 入口不应再次探测 HTTP bridge", async () => {
    mockCommand("get_config", () => ({
      server: {
        port: 8787,
      },
      default_provider: "openai",
    }));

    await expect(invokeMockOnly("get_config")).resolves.toEqual(
      expect.objectContaining({
        server: expect.objectContaining({
          port: 8787,
        }),
      }),
    );

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("显式 mock API 在非测试环境必须 fail-closed", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITEST", "");

    try {
      await expect(invokeMockOnly("test_only_command")).rejects.toThrow(
        "invokeMockOnly 只能在测试环境使用",
      );
      expect(() => mockCommand("test_only_command", vi.fn())).toThrow(
        "mockCommand 只能在测试环境使用",
      );
      expect(() => clearMocks()).toThrow("clearMocks 只能在测试环境使用");
      expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("默认项目 mock 已退场并 fail closed", async () => {
    await expect(
      invokeMockOnly("get_or_create_default_project"),
    ).rejects.toThrow('未注册命令 "get_or_create_default_project"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Plugin uninstall / shell 默认 mock 已退场并 fail closed", async () => {
    for (const command of ["plugin_uninstall", "plugin_launch_shell"]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("通用工作台执行状态 mock 已退场并 fail closed", async () => {
    await expect(
      invokeMockOnly("execution_run_get_general_workbench_state", {
        sessionId: "session-mock",
      }),
    ).rejects.toThrow('未注册命令 "execution_run_get_general_workbench_state"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("图层设计 desktop-host 默认 mock 已退场并 fail closed", async () => {
    const removedLayeredDesignMockCommands = [
      "save_layered_design_project_export",
      "read_layered_design_project_export",
      "recognize_layered_design_text",
      "analyze_layered_design_flat_image",
    ];

    for (const command of removedLayeredDesignMockCommands) {
      await expect(
        invokeMockOnly(command, {
          request: {
            projectRootPath: "/mock/workspace",
          },
        }),
      ).rejects.toThrow(`未注册命令 "${command}"`);
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("Capability Draft 显式 mock handler 已退役并 fail closed", async () => {
    registerSkillForgeTestMocks();

    for (const command of [
      "capability_draft_create",
      "capability_draft_list",
      "capability_draft_get",
      "capability_draft_verify",
      "capability_draft_register",
      "capability_draft_submit_approval_session_inputs",
      "capability_draft_execute_controlled_get",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("知识库 legacy 显式 mock 已退场", async () => {
    for (const command of [
      "knowledge_list_packs",
      "knowledge_import_source",
      "knowledge_get_pack",
      "knowledge_update_pack_status",
      "knowledge_resolve_context",
      "knowledge_validate_context_run",
      "knowledge_set_default_pack",
      "knowledge_compile_pack",
    ]) {
      await expect(
        invokeMockOnly(command, {
          request: {
            workingDir: "/tmp/lime-knowledge-e2e",
            name: "brand-product-demo",
            packName: "brand-product-demo",
            status: "ready",
            runPath: "runs/context-mock.json",
          },
        }),
      ).rejects.toThrow(`未注册命令 "${command}"`);
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("工具库存 legacy 显式 mock 已退场", async () => {
    await expect(
      invokeMockOnly("agent_runtime_get_tool_inventory", {
        request: {
          caller: "assistant",
          browserAssist: true,
        },
      }),
    ).rejects.toThrow('未注册命令 "agent_runtime_get_tool_inventory"');

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("review decision 默认 mock 已移出 residual 注册并 fail closed", async () => {
    await expect(
      invokeMockOnly("agent_runtime_save_review_decision", {
        request: {
          session_id: "mock-session",
          decision_status: "accepted",
          decision_summary: "错误接受被拒绝的权限确认。",
          risk_level: "low",
        },
      }),
    ).rejects.toThrow('未注册命令 "agent_runtime_save_review_decision"');
  });

  it("显式 mock 入口可返回默认工作区数据已退场", async () => {
    await expect(invokeMockOnly("workspace_get_projects_root")).rejects.toThrow(
      '未注册命令 "workspace_get_projects_root"',
    );
    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("媒体任务 artifact 默认 mock 已退场并 fail closed", async () => {
    for (const command of [
      "create_image_generation_task_artifact",
      "create_audio_generation_task_artifact",
      "complete_audio_generation_task_artifact",
      "get_media_task_artifact",
      "list_media_task_artifacts",
      "cancel_media_task_artifact",
    ]) {
      await expect(invokeMockOnly(command)).rejects.toThrow(
        `未注册命令 "${command}"`,
      );
    }

    expect(mocks.invokeViaHttp).not.toHaveBeenCalled();
  });

  it("旧 Agent 命令别名不再注册 default mock", async () => {
    mocks.isDevBridgeAvailable.mockReturnValue(false);

    await expect(invokeMockOnly("list_agent_sessions")).rejects.toThrow(
      '未注册命令 "list_agent_sessions"',
    );
    await expect(invokeMockOnly("get_agent_process_status")).rejects.toThrow(
      '未注册命令 "get_agent_process_status"',
    );
  });
});
