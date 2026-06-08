import { describe, expect, it } from "vitest";

import { voiceMocks } from "./voiceMocks";

describe("voiceMocks", () => {
  it("Voice / ASR / Recording degraded facade 不再注册 desktop-host 默认 mock", () => {
    const removedVoiceMockCommands = [
      "get_voice_input_config",
      "save_voice_input_config",
      "get_voice_instructions",
      "save_voice_instruction",
      "delete_voice_instruction",
      "list_audio_devices",
      "start_recording",
      "stop_recording",
      "get_recording_snapshot",
      "get_recording_segment",
      "cancel_recording",
      "get_recording_status",
      "transcribe_audio",
      "polish_voice_text",
      "output_voice_text",
      "get_asr_credentials",
      "add_asr_credential",
      "update_asr_credential",
      "delete_asr_credential",
      "set_default_asr_credential",
      "test_asr_credential",
      "voice_models_list_catalog",
      "voice_models_get_install_state",
      "voice_models_download",
      "voice_models_delete",
      "voice_models_set_default",
      "voice_models_test_transcribe_file",
      "get_voice_shortcut_runtime_status",
    ];

    expect(voiceMocks).toEqual({});

    for (const command of removedVoiceMockCommands) {
      expect(voiceMocks).not.toHaveProperty(command);
    }
  });
});
