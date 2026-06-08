import { describe, expect, it } from "vitest";

import { companionMocks } from "./companionMocks";

describe("companionMocks", () => {
  it("桌宠命令不再注册伪成功默认 mock", () => {
    expect(companionMocks).not.toHaveProperty("companion_get_pet_status");
    expect(companionMocks).not.toHaveProperty("companion_launch_pet");
    expect(companionMocks).not.toHaveProperty("companion_send_pet_command");
  });
});
