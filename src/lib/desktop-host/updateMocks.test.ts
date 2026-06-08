import { describe, expect, it } from "vitest";
import { updateMocks } from "./updateMocks";

describe("updateMocks", () => {
  it("不再注册旧 Tauri check_update 默认 mock", () => {
    expect(updateMocks).not.toHaveProperty("check_update");
    expect(updateMocks).toHaveProperty("check_for_updates");
  });
});
