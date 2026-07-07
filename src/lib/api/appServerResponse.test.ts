import { describe, expect, it } from "vitest";
import {
  APP_SERVER_METHOD_CONFIG_WARNING,
  APP_SERVER_METHOD_INITIALIZE,
  AppServerRpcError,
  expectAppServerResponse,
  isAppServerConfigWarningNotification,
  readAppServerConfigWarnings,
} from "./appServer";

describe("App Server response projection", () => {
  it("把 configWarning notification 投影成 typed configWarnings", () => {
    const messages = [
      {
        method: APP_SERVER_METHOD_CONFIG_WARNING,
        params: {
          summary: "App Server config warning during initialize",
          path: "/workspace/config.yaml",
          details: "invalid yaml",
        },
      },
      {
        id: 1,
        result: {
          serverInfo: {
            name: "app-server",
            version: "1.58.0",
            protocolVersion: "appserver.v0",
          },
          platform: {
            family: "desktop",
            os: "macos",
          },
          capabilities: {
            agentSession: true,
            capabilityDiscovery: true,
            artifact: true,
            evidence: true,
            workspace: true,
          },
        },
      },
    ];

    const result = expectAppServerResponse(
      messages,
      1,
      APP_SERVER_METHOD_INITIALIZE,
    );

    expect(result.notifications).toHaveLength(1);
    expect(result.configWarnings).toEqual([
      {
        summary: "App Server config warning during initialize",
        path: "/workspace/config.yaml",
        details: "invalid yaml",
      },
    ]);
  });

  it("忽略 shape 不完整的 configWarning notification", () => {
    const warnings = readAppServerConfigWarnings([
      {
        method: APP_SERVER_METHOD_CONFIG_WARNING,
        params: {
          path: "/workspace/config.yaml",
        },
      },
      {
        method: "agentSession/event",
        params: {
          event: {
            type: "message.delta",
          },
        },
      },
    ]);

    expect(warnings).toEqual([]);
  });

  it("JSON-RPC error 也携带 typed configWarnings 供 GUI 展示", () => {
    const response = {
      id: 2,
      error: {
        code: -32000,
        message: "request failed",
      },
    };
    const notification = {
      method: APP_SERVER_METHOD_CONFIG_WARNING,
      params: {
        summary: "App Server config warning during turn start",
      },
    };

    const error = new AppServerRpcError(
      response,
      [notification],
      [notification, response],
    );

    expect(isAppServerConfigWarningNotification(notification)).toBe(true);
    expect(error.configWarnings).toEqual([
      {
        summary: "App Server config warning during turn start",
      },
    ]);
  });
});
