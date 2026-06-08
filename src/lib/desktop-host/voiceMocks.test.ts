import { describe, expect, it } from "vitest";

import { voiceMocks } from "./voiceMocks";

describe("voiceMocks", () => {
  it("Voice / ASR degraded facade 不再注册 desktop-host 默认 mock", () => {
    expect(voiceMocks).not.toHaveProperty("get_asr_credentials");
    expect(voiceMocks).not.toHaveProperty("voice_models_list_catalog");
    expect(voiceMocks).not.toHaveProperty("voice_models_get_install_state");
    expect(voiceMocks).not.toHaveProperty("get_voice_shortcut_runtime_status");
    expect(voiceMocks).not.toHaveProperty("list_audio_devices");
  });
});
