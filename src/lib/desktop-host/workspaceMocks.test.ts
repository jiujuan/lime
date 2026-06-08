import { describe, expect, it } from "vitest";

import { workspaceMocks } from "./workspaceMocks";

describe("workspaceMocks", () => {
  it("workspace current 读链不再注册 desktop-host 默认 mock", () => {
    expect(workspaceMocks).not.toHaveProperty("workspace_list");
    expect(workspaceMocks).not.toHaveProperty("workspace_get");
    expect(workspaceMocks).not.toHaveProperty("workspace_get_default");
    expect(workspaceMocks).not.toHaveProperty("workspace_get_by_path");
    expect(workspaceMocks).not.toHaveProperty(
      "workspace_ensure_default_ready",
    );
    expect(workspaceMocks).not.toHaveProperty("workspace_ensure_ready");
    expect(workspaceMocks).not.toHaveProperty("workspace_resolve_project_path");
    expect(workspaceMocks).not.toHaveProperty("get_or_create_default_project");
    expect(workspaceMocks).not.toHaveProperty("workspace_get_projects_root");
  });

  it("workspace 写链不再注册伪成功默认 mock", () => {
    expect(workspaceMocks).not.toHaveProperty("workspace_create");
    expect(workspaceMocks).not.toHaveProperty("workspace_set_default");
  });
});
