import { safeListen } from "@/lib/dev-bridge";
import type { UnlistenFn } from "@/lib/desktop-host/event";

export const VOICE_START_RECORDING_EVENT = "voice-start-recording";
export const VOICE_STOP_RECORDING_EVENT = "voice-stop-recording";

async function onVoiceShortcutEvent(
  eventName: string,
  callback: () => void | Promise<void>,
): Promise<UnlistenFn> {
  return safeListen(eventName, () => {
    void callback();
  });
}

export async function onVoiceStartRecording(
  callback: () => void | Promise<void>,
): Promise<UnlistenFn> {
  return onVoiceShortcutEvent(VOICE_START_RECORDING_EVENT, callback);
}

export async function onVoiceStopRecording(
  callback: () => void | Promise<void>,
): Promise<UnlistenFn> {
  return onVoiceShortcutEvent(VOICE_STOP_RECORDING_EVENT, callback);
}
