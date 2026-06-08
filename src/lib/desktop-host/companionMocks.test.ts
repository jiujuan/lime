import { describe, expect, it } from "vitest";

import { companionMocks } from "./companionMocks";

describe("companionMocks", () => {
  it("桌宠启动和命令投递不再注册伪成功默认 mock", () => {
    expect(companionMocks).not.toHaveProperty("companion_launch_pet");
    expect(companionMocks).not.toHaveProperty("companion_send_pet_command");
  });

  it("保留仍被显式测试夹具依赖的状态读取 mock", () => {
    expect(companionMocks).toHaveProperty("companion_get_pet_status");
  });
});
