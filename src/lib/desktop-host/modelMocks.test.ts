import { describe, expect, it } from "vitest";

import { modelMocks } from "./modelMocks";

describe("desktop-host/modelMocks", () => {
  it("不再为 App Server current 模型读链注册默认 mock", () => {
    expect(modelMocks).not.toHaveProperty("get_model_registry");
    expect(modelMocks).not.toHaveProperty("get_model_preferences");
    expect(modelMocks).not.toHaveProperty("get_model_sync_state");
    expect(modelMocks).not.toHaveProperty("get_models_for_provider");
    expect(modelMocks).not.toHaveProperty("get_models_by_tier");
    expect(modelMocks).not.toHaveProperty("get_provider_alias_config");
    expect(modelMocks).not.toHaveProperty("get_all_alias_configs");
    expect(modelMocks).not.toHaveProperty("get_model_registry_provider_ids");
    expect(modelMocks).not.toHaveProperty("refresh_model_registry");
    expect(modelMocks).not.toHaveProperty("search_models");
    expect(modelMocks).not.toHaveProperty("toggle_model_favorite");
    expect(modelMocks).not.toHaveProperty("hide_model");
    expect(modelMocks).not.toHaveProperty("record_model_usage");
  });

  it("托盘模型同步不再注册 desktop-host 默认 mock", () => {
    expect(modelMocks).not.toHaveProperty("sync_tray_model_shortcuts");
  });
});
