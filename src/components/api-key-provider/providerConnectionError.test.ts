import { describe, expect, it } from "vitest";
import { formatProviderConnectionError } from "./providerConnectionError";

const copy = {
  fallback: "连接测试失败",
  timeout: "连接测试超时，请重试。",
};

describe("formatProviderConnectionError", () => {
  it("应把 Desktop Host 超时压缩为用户可操作文案", () => {
    const message = formatProviderConnectionError(
      new Error(
        '[Electron] Desktop Host IPC 命令 "app_server_handle_json_lines" 在 5000ms 内未返回，已按 fail-closed 结束。',
      ),
      copy,
    );

    expect(message).toBe(copy.timeout);
    expect(message).not.toContain("app_server_handle_json_lines");
  });

  it("应保留服务商返回的明确业务错误", () => {
    expect(formatProviderConnectionError("模型无权限", copy)).toBe(
      "模型无权限",
    );
  });
});
