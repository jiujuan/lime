import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isElectronHostCommandAvailable: vi.fn(),
}));

vi.mock("@/lib/electron-host", () => ({
  isElectronHostCommandAvailable: mocks.isElectronHostCommandAvailable,
}));

import {
  areOptionalLegacyUxCommandsAvailable,
  isBridgeTruthCommand,
  isBridgeTruthEvent,
  isOptionalLegacyUxCommand,
  isOptionalLegacyUxCommandAvailable,
  resolveDevBridgeCommandTimeoutProfile,
  shouldBypassDevBridgeCooldown,
  shouldRetryDevBridgeReadCommand,
} from "./commandPolicy";

describe("commandPolicy", () => {
  it("集中声明必须走真实桥接的前后端 truth 命令", () => {
    expect(isBridgeTruthCommand("app_server_handle_json_lines")).toBe(true);
    expect(isBridgeTruthCommand("agent_runtime_submit_turn")).toBe(true);
    expect(isBridgeTruthCommand("workspace_list")).toBe(true);
    expect(isBridgeTruthCommand("get_model_registry")).toBe(true);
    expect(isBridgeTruthCommand("agent_app_list_installed")).toBe(false);
    expect(isBridgeTruthCommand("knowledge_list_packs")).toBe(false);
    expect(isBridgeTruthCommand("get_automation_jobs")).toBe(false);
    expect(isBridgeTruthCommand("project_memory_get")).toBe(true);
    expect(isBridgeTruthCommand("agent_generate_title")).toBe(false);
    expect(isBridgeTruthCommand("get_hint_routes")).toBe(false);
  });

  it("集中声明 Claw 旧可选 UX 命令，只在 Electron host 明确支持时调用", () => {
    mocks.isElectronHostCommandAvailable.mockImplementation(
      (command: string) => command === "get_hint_routes",
    );

    expect(isOptionalLegacyUxCommand("get_hint_routes")).toBe(true);
    expect(isOptionalLegacyUxCommand("workspace_list")).toBe(false);
    expect(isOptionalLegacyUxCommandAvailable("get_hint_routes")).toBe(true);
    expect(
      isOptionalLegacyUxCommandAvailable("session_files_get_or_create"),
    ).toBe(false);
    expect(
      areOptionalLegacyUxCommandsAvailable([
        "session_files_get_or_create",
        "session_files_list_files",
      ]),
    ).toBe(false);
  });

  it("集中声明 DevBridge 超时、冷却绕过和读命令重试策略", () => {
    expect(resolveDevBridgeCommandTimeoutProfile("aster_agent_init")).toBe(
      "startup-truth",
    );
    expect(
      resolveDevBridgeCommandTimeoutProfile("agent_runtime_get_session"),
    ).toBe("agent-session-get");
    expect(
      resolveDevBridgeCommandTimeoutProfile("agent_app_start_ui_runtime"),
    ).toBe("agent-app-ui-runtime-start");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: "ui-runtime-start",
              method: "agentAppUiRuntime/start",
              params: {
                appId: "content-factory-sdk-fixture-app",
                entryKey: "dashboard",
              },
            }),
          ],
        },
      }),
    ).toBe("agent-app-ui-runtime-start");
    expect(resolveDevBridgeCommandTimeoutProfile("execute_skill")).toBe(
      "skill-execution",
    );
    expect(resolveDevBridgeCommandTimeoutProfile("agent_generate_title")).toBe(
      "default",
    );
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 1,
              method: "agentSession/list",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("agent-session-list");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 2,
              method: "agentSession/turn/start",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("app-server-turn-start");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 6,
              method: "workspace/default/ensure",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("startup-truth");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 7,
              method: "workspace/ensureReady",
              params: { workspaceId: "default" },
            }),
          ],
        },
      }),
    ).toBe("startup-truth");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 3,
              method: "agentSession/list",
              params: {},
            }),
            JSON.stringify({
              id: 4,
              method: "agentSession/turn/start",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("app-server-turn-start");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: 5,
              method: "agentSession/read",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("app-server-read");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: "knowledge",
              method: "knowledgePack/compile",
              params: {},
            }),
            JSON.stringify({
              id: "models",
              method: "modelProvider/list",
              params: {},
            }),
          ],
        },
      }),
    ).toBe("knowledge-compile");
    expect(
      resolveDevBridgeCommandTimeoutProfile("app_server_handle_json_lines", {
        request: {
          lines: [
            JSON.stringify({
              id: "file-write",
              method: "fileSystem/createFile",
              params: { path: "/tmp/demo.txt" },
            }),
          ],
        },
      }),
    ).toBe("app-server-read");
    expect(resolveDevBridgeCommandTimeoutProfile("unknown_command")).toBe(
      "default",
    );

    expect(shouldBypassDevBridgeCooldown("agent_runtime_get_session")).toBe(
      true,
    );
    expect(shouldRetryDevBridgeReadCommand("agent_runtime_get_session")).toBe(
      true,
    );
    expect(shouldRetryDevBridgeReadCommand("agent_runtime_submit_turn")).toBe(
      false,
    );
  });

  it("集中声明运行时真相事件前缀", () => {
    expect(isBridgeTruthEvent("aster_stream_session-1")).toBe(true);
    expect(isBridgeTruthEvent("agent_subagent_status:session-1")).toBe(true);
    expect(isBridgeTruthEvent("companion-pet-status")).toBe(false);
  });
});
