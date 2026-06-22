import { describe, expect, it } from "vitest";
import {
  buildMcpToolFormArgs,
  buildMcpToolJsonArgs,
  extractMcpToolInputFields,
  getMcpToolContentKind,
  parseMcpToolFormValue,
} from "./mcpToolCallerModel";

describe("mcpToolCallerModel", () => {
  it("从 JSON Schema 提取表单字段", () => {
    expect(
      extractMcpToolInputFields({
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "检索词",
          },
          limit: {
            type: "number",
          },
        },
      }),
    ).toEqual([
      {
        name: "query",
        type: "string",
        description: "检索词",
        required: true,
      },
      {
        name: "limit",
        type: "number",
        description: "",
        required: false,
      },
    ]);
  });

  it("表单值优先按 JSON 解析，失败时保留原始字符串", () => {
    expect(parseMcpToolFormValue("42")).toBe(42);
    expect(parseMcpToolFormValue("true")).toBe(true);
    expect(parseMcpToolFormValue('{"mode":"fast"}')).toEqual({
      mode: "fast",
    });
    expect(parseMcpToolFormValue("plain text")).toBe("plain text");
  });

  it("表单参数组装时跳过空字符串", () => {
    const fields = extractMcpToolInputFields({
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        optional: { type: "string" },
      },
    });

    expect(
      buildMcpToolFormArgs({
        fields,
        args: {
          query: "docs",
          limit: "3",
          optional: "",
        },
      }),
    ).toEqual({
      query: "docs",
      limit: 3,
    });
  });

  it("JSON 模式直接解析输入并保留解析错误", () => {
    expect(buildMcpToolJsonArgs('{"query":"docs","limit":2}')).toEqual({
      query: "docs",
      limit: 2,
    });

    expect(() => buildMcpToolJsonArgs("{bad json")).toThrow();
  });

  it("返回内容类型沿 MCP content type 投影", () => {
    expect(getMcpToolContentKind({ type: "text", text: "ok" })).toBe("text");
    expect(
      getMcpToolContentKind({
        type: "image",
        data: "base64",
        mime_type: "image/png",
      }),
    ).toBe("image");
    expect(
      getMcpToolContentKind({
        type: "resource",
        uri: "file:///readme.md",
      }),
    ).toBe("resource");
  });
});
