import { describe, expect, it } from "vitest";

import {
  createSkillForgeMockHandlers,
  skillForgeMocks,
} from "./skillForgeMocks";

describe("skillForgeMocks", () => {
  it("已迁到 App Server current 的 registered skills / workspace bindings 不注册默认 mock", () => {
    expect(skillForgeMocks).not.toHaveProperty(
      "capability_draft_list_registered_skills",
    );
    expect(skillForgeMocks).not.toHaveProperty(
      "agent_runtime_list_workspace_skill_bindings",
    );
  });

  it("Capability Draft 默认 mock 不再全局注册", () => {
    expect(skillForgeMocks).not.toHaveProperty("capability_draft_create");
    expect(skillForgeMocks).not.toHaveProperty("capability_draft_list");
    expect(skillForgeMocks).not.toHaveProperty("capability_draft_get");
    expect(skillForgeMocks).not.toHaveProperty("capability_draft_verify");
    expect(skillForgeMocks).not.toHaveProperty("capability_draft_register");
    expect(skillForgeMocks).not.toHaveProperty(
      "capability_draft_submit_approval_session_inputs",
    );
    expect(skillForgeMocks).not.toHaveProperty(
      "capability_draft_execute_controlled_get",
    );
  });

  it("Capability Draft 显式测试夹具也不再注册旧命令", () => {
    const handlers = createSkillForgeMockHandlers();

    expect(handlers).not.toHaveProperty("capability_draft_create");
    expect(handlers).not.toHaveProperty("capability_draft_list");
    expect(handlers).not.toHaveProperty("capability_draft_get");
    expect(handlers).not.toHaveProperty("capability_draft_verify");
    expect(handlers).not.toHaveProperty("capability_draft_register");
    expect(handlers).not.toHaveProperty(
      "capability_draft_submit_approval_session_inputs",
    );
    expect(handlers).not.toHaveProperty(
      "capability_draft_execute_controlled_get",
    );
  });
});
