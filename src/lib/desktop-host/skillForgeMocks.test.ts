import { describe, expect, it } from "vitest";

import { skillForgeMocks } from "./skillForgeMocks";

describe("skillForgeMocks", () => {
  it("已迁到 App Server current 的 registered skills / workspace bindings 不注册默认 mock", () => {
    expect(skillForgeMocks).not.toHaveProperty(
      "capability_draft_list_registered_skills",
    );
    expect(skillForgeMocks).not.toHaveProperty(
      "agent_runtime_list_workspace_skill_bindings",
    );
  });

  it("保留 Capability Draft 显式测试夹具命令", () => {
    expect(skillForgeMocks).toHaveProperty("capability_draft_create");
    expect(skillForgeMocks).toHaveProperty("capability_draft_verify");
    expect(skillForgeMocks).toHaveProperty("capability_draft_register");
  });
});
