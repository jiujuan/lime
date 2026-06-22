import { describe, expect, it } from "vitest";
import type { McpResourceDefinition } from "@/lib/api/mcp";
import {
  filterMcpResourcesByServer,
  groupMcpResourcesByServer,
} from "./mcpResourceBrowserModel";

function createResource(
  overrides: Partial<McpResourceDefinition> = {},
): McpResourceDefinition {
  return {
    uri: "file://demo/readme.md",
    name: "README",
    description: "项目说明",
    server_name: "docs",
    ...overrides,
  };
}

describe("mcpResourceBrowserModel", () => {
  it("按服务器保留资源原始顺序分组", () => {
    const grouped = groupMcpResourcesByServer([
      createResource({ name: "README", server_name: "docs" }),
      createResource({
        name: "Spec",
        uri: "file://docs/spec.md",
        server_name: "docs",
      }),
      createResource({
        name: "Guide",
        uri: "file://kb/guide.md",
        server_name: "kb",
      }),
    ]);

    expect(Object.keys(grouped)).toEqual(["docs", "kb"]);
    expect(grouped.docs.map((resource) => resource.name)).toEqual([
      "README",
      "Spec",
    ]);
    expect(grouped.kb.map((resource) => resource.name)).toEqual(["Guide"]);
  });

  it("按名称、URI 和描述做大小写不敏感过滤", () => {
    const grouped = groupMcpResourcesByServer([
      createResource({ name: "README", description: "Project overview" }),
      createResource({
        name: "Guide",
        uri: "file://demo/search-api.md",
        description: undefined,
      }),
      createResource({
        name: "Spec",
        uri: "file://demo/spec.md",
        description: "Runtime Protocol",
      }),
    ]);

    expect(
      filterMcpResourcesByServer(grouped, "project").docs.map(
        (resource) => resource.name,
      ),
    ).toEqual(["README"]);
    expect(
      filterMcpResourcesByServer(grouped, "SEARCH").docs.map(
        (resource) => resource.name,
      ),
    ).toEqual(["Guide"]);
    expect(
      filterMcpResourcesByServer(grouped, "protocol").docs.map(
        (resource) => resource.name,
      ),
    ).toEqual(["Spec"]);
  });

  it("空查询返回所有非空服务器分组", () => {
    const grouped = groupMcpResourcesByServer([
      createResource({ name: "README", server_name: "docs" }),
      createResource({
        name: "Guide",
        uri: "file://kb/guide.md",
        server_name: "kb",
      }),
    ]);

    expect(filterMcpResourcesByServer(grouped, "  ")).toEqual(grouped);
  });
});
