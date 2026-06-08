import { describe, expect, it } from "vitest";

import { fileSystemMocks } from "./fileSystemMocks";

describe("fileSystemMocks", () => {
  it("External shell current 壳命令不再注册 desktop-host 默认 mock", () => {
    expect(fileSystemMocks).not.toHaveProperty("open_external_url");
    expect(fileSystemMocks).not.toHaveProperty(
      "start_oem_cloud_oauth_callback_bridge",
    );
  });
});
