import { describe, expect, it } from "vitest";
import {
  addMcpServerConfigEnvHeaderRef,
  removeMcpServerConfigEnvHeaderRef,
  summarizeMcpServerConfigJson,
  updateMcpServerConfigEnvHeaderRef,
  updateMcpServerConfigTextField,
} from "./mcpPageModel";

describe("mcpPageModel", () => {
  it("更新 streamable HTTP URL 时写回同一份 JSON 配置", () => {
    const configJson = JSON.stringify(
      {
        transport: "streamable_http",
        url: "https://mcp.context7.com/mcp",
      },
      null,
      2,
    );

    const nextConfig = JSON.parse(
      updateMcpServerConfigTextField(
        configJson,
        "url",
        " https://mcp.context7.com/v1/mcp ",
      ),
    );

    expect(nextConfig).toEqual({
      transport: "streamable_http",
      url: "https://mcp.context7.com/v1/mcp",
    });
  });

  it("编辑 HTTP header 环境变量引用时只保存 env var 名称", () => {
    const configJson = JSON.stringify({
      transport: "streamable_http",
      url: "https://mcp.context7.com/mcp",
      env_http_headers: {
        CONTEXT7_API_KEY: "CONTEXT7_API_KEY",
      },
    });

    const nextConfig = JSON.parse(
      updateMcpServerConfigEnvHeaderRef(configJson, 0, {
        envVar: "CONTEXT7_API_KEY_LIVE",
      }),
    );

    expect(nextConfig.env_http_headers).toEqual({
      CONTEXT7_API_KEY: "CONTEXT7_API_KEY_LIVE",
    });
  });

  it("新增和删除 env header 引用时保持 snake_case 配置字段", () => {
    const addedConfigJson = addMcpServerConfigEnvHeaderRef(
      JSON.stringify({
        transport: "streamable_http",
        url: "https://example.com/mcp",
        envHttpHeaders: {
          "X-Existing": "EXISTING_KEY",
        },
      }),
    );

    const addedConfig = JSON.parse(addedConfigJson);
    expect(addedConfig.envHttpHeaders).toBeUndefined();
    expect(addedConfig.env_http_headers).toEqual({
      "X-Existing": "EXISTING_KEY",
      "X-MCP-API-Key": "MCP_API_KEY",
    });

    const removedConfig = JSON.parse(
      removeMcpServerConfigEnvHeaderRef(addedConfigJson, 0),
    );
    expect(removedConfig.env_http_headers).toEqual({
      "X-MCP-API-Key": "MCP_API_KEY",
    });
  });

  it("bearer token env var 编辑会归一旧 camelCase 字段", () => {
    const nextConfig = JSON.parse(
      updateMcpServerConfigTextField(
        JSON.stringify({
          transport: "streamable_http",
          url: "https://example.com/mcp",
          bearerTokenEnvVar: "OLD_TOKEN",
        }),
        "bearer_token_env_var",
        "NEW_TOKEN",
      ),
    );

    expect(nextConfig.bearerTokenEnvVar).toBeUndefined();
    expect(nextConfig.bearer_token_env_var).toBe("NEW_TOKEN");
  });

  it("摘要继续隐藏真实 header value，只暴露 header 名和 env var 名", () => {
    expect(
      summarizeMcpServerConfigJson(
        JSON.stringify({
          transport: "streamable_http",
          url: "https://example.com/mcp",
          http_headers: {
            "X-Static": "secret-value",
          },
          env_http_headers: {
            Authorization: "MCP_BEARER_TOKEN",
          },
        }),
      ),
    ).toMatchObject({
      staticHeaderNames: ["X-Static"],
      envHeaderRefs: [
        {
          headerName: "Authorization",
          envVar: "MCP_BEARER_TOKEN",
        },
      ],
    });
  });
});
