import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { transcribeVoiceInputAudio } from "@/lib/api/asrProvider";
import {
  buildInputbarDictationCopy,
  type InputbarDictationCopy,
} from "./inputbarDictationCopy";

type InputbarDictationState = "idle" | "listening" | "transcribing";

interface UseInputbarDictationArgs {
  text: string;
  setText: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
}

interface ActiveRecording {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  mimeType: string;
}

export interface InputbarRecordingStatus {
  is_recording: boolean;
  volume: number;
  duration: number;
}

const MIN_RECORDING_DURATION_MS = 350;
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];
const WAV_MIME_TYPE = "audio/wav";

function getAudioContextConstructor(): typeof AudioContext | null {
  return (
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  );
}

function getPreferredRecorderMimeType(): string | undefined {
  const MediaRecorderCtor = globalThis.MediaRecorder;
  if (typeof MediaRecorderCtor?.isTypeSupported !== "function") {
    return undefined;
  }
  return RECORDER_MIME_TYPES.find((mimeType) =>
    MediaRecorderCtor.isTypeSupported(mimeType),
  );
}

function hasRecordingSupport(): boolean {
  return Boolean(
    typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function" &&
      typeof globalThis.MediaRecorder === "function" &&
      getAudioContextConstructor(),
  );
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || "未知错误");
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(
    error.name,
  );
}

function getMicrophonePermissionMessage(copy: InputbarDictationCopy): string {
  const navigatorWithUserAgentData = globalThis.navigator as
    | (Navigator & { userAgentData?: { platform?: string } })
    | undefined;
  const platform =
    navigatorWithUserAgentData?.userAgentData?.platform ??
    navigatorWithUserAgentData?.platform ??
    "";
  if (/mac/i.test(platform)) {
    return copy.permissionDeniedMac;
  }
  if (/win/i.test(platform)) {
    return copy.permissionDeniedWindows;
  }
  return copy.permissionDeniedDefault;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}

export function encodeAudioBufferToMonoPcm16WavBase64(
  audioBuffer: AudioBuffer,
): string {
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const frameCount = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2;
  const wavHeaderBytes = 44;
  const dataBytes = frameCount * bytesPerSample;
  const buffer = new ArrayBuffer(wavHeaderBytes + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  let writeOffset = wavHeaderBytes;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const mixed =
      channels.reduce((sum, channel) => sum + channel[frameIndex], 0) /
      channelCount;
    const clamped = Math.max(-1, Math.min(1, mixed));
    const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(writeOffset, Math.round(sample), true);
    writeOffset += bytesPerSample;
  }

  return bytesToBase64(new Uint8Array(buffer));
}

function insertTranscriptAtSelection(
  currentText: string,
  transcript: string,
  textarea: HTMLTextAreaElement | null,
): { nextText: string; selectionStart: number } {
  const cleanTranscript = transcript.trim();
  const start = textarea?.selectionStart ?? currentText.length;
  const end = textarea?.selectionEnd ?? start;
  const before = currentText.slice(0, start);
  const after = currentText.slice(end);
  const leadingSpace = before.trim().length > 0 && !/\s$/.test(before) ? " " : "";
  const trailingSpace = after.trim().length > 0 && !/^\s/.test(after) ? " " : "";
  const inserted = `${leadingSpace}${cleanTranscript}${trailingSpace}`;
  return {
    nextText: `${before}${inserted}${after}`,
    selectionStart: before.length + inserted.length,
  };
}

export function useInputbarDictation({
  text,
  setText,
  textareaRef,
  disabled,
}: UseInputbarDictationArgs) {
  const { t } = useTranslation("agent");
  const copy = useMemo(
    () => buildInputbarDictationCopy((key) => t(key)),
    [t],
  );
  const [dictationState, setDictationState] =
    useState<InputbarDictationState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textRef = useRef(text);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const clearRecordingTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    clearRecordingTimer();
    const activeRecording = activeRecordingRef.current;
    activeRecordingRef.current = null;
    if (activeRecording) {
      stopStream(activeRecording.stream);
    }
    setRecordingDuration(0);
  }, [clearRecordingTimer]);

  useEffect(
    () => () => {
      resetRecording();
    },
    [resetRecording],
  );

  const stopActiveRecording = useCallback((): Promise<Blob> => {
    const activeRecording = activeRecordingRef.current;
    if (!activeRecording) {
      return Promise.resolve(new Blob([], { type: WAV_MIME_TYPE }));
    }

    const { recorder, chunks, mimeType } = activeRecording;
    return new Promise<Blob>((resolve, reject) => {
      const cleanup = () => {
        recorder.removeEventListener("stop", handleStop);
        recorder.removeEventListener("error", handleError);
      };
      const handleStop = () => {
        cleanup();
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
      };
      const handleError = (event: Event) => {
        cleanup();
        reject(
          event instanceof ErrorEvent
            ? event.error || new Error(event.message)
            : new Error(copy.recognitionFailed),
        );
      };

      recorder.addEventListener("stop", handleStop, { once: true });
      recorder.addEventListener("error", handleError, { once: true });
      try {
        if (typeof recorder.requestData === "function") {
          recorder.requestData();
        }
        if (recorder.state === "inactive") {
          handleStop();
          return;
        }
        recorder.stop();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }, [copy.recognitionFailed]);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new Error(copy.unavailable);
    }

    const audioContext = new AudioContextCtor();
    try {
      const encodedAudio = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(
        encodedAudio.slice(0),
      );
      return transcribeVoiceInputAudio({
        audioBase64: encodeAudioBufferToMonoPcm16WavBase64(audioBuffer),
        mimeType: WAV_MIME_TYPE,
      });
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  }, [copy.unavailable]);

  const finishRecording = useCallback(async () => {
    const activeRecording = activeRecordingRef.current;
    if (!activeRecording) {
      return;
    }

    setDictationState("transcribing");
    clearRecordingTimer();
    const elapsedMs = performance.now() - activeRecording.startedAt;
    try {
      const blob = await stopActiveRecording();
      stopStream(activeRecording.stream);
      activeRecordingRef.current = null;

      if (elapsedMs < MIN_RECORDING_DURATION_MS || blob.size === 0) {
        toast.error(copy.tooShort);
        return;
      }

      const result = await transcribeBlob(blob);
      const transcript = result.text.trim();
      if (!transcript) {
        toast.error(copy.emptyTranscript);
        return;
      }

      const textarea = textareaRef.current;
      const { nextText, selectionStart } = insertTranscriptAtSelection(
        textRef.current,
        transcript,
        textarea,
      );
      setText(nextText);
      window.requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(selectionStart, selectionStart);
      });
    } catch (error) {
      toast.error(`${copy.recognitionFailed}: ${describeError(error)}`);
    } finally {
      resetRecording();
      setDictationState("idle");
    }
  }, [
    clearRecordingTimer,
    copy.emptyTranscript,
    copy.recognitionFailed,
    copy.tooShort,
    resetRecording,
    setText,
    stopActiveRecording,
    textareaRef,
    transcribeBlob,
  ]);

  const startRecording = useCallback(async () => {
    if (!hasRecordingSupport()) {
      toast.error(copy.unavailable);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = getPreferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const activeRecording: ActiveRecording = {
        stream,
        recorder,
        chunks: [],
        startedAt: performance.now(),
        mimeType: recorder.mimeType || mimeType || "",
      };
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          activeRecording.chunks.push(event.data);
        }
      });
      activeRecordingRef.current = activeRecording;
      recorder.start();
      setDictationState("listening");
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(
          Math.max(0, (performance.now() - activeRecording.startedAt) / 1000),
        );
      }, 250);
    } catch (error) {
      if (stream) {
        stopStream(stream);
      }
      resetRecording();
      toast.error(
        isPermissionDeniedError(error)
          ? getMicrophonePermissionMessage(copy)
          : `${copy.startFailed}: ${describeError(error)}`,
      );
      setDictationState("idle");
    }
  }, [copy, resetRecording]);

  const handleDictationToggle = useCallback(async () => {
    if (disabled || dictationState === "transcribing") {
      return;
    }
    if (dictationState === "listening") {
      await finishRecording();
      return;
    }
    await startRecording();
  }, [dictationState, disabled, finishRecording, startRecording]);

  const recordingStatus: InputbarRecordingStatus | null =
    dictationState === "idle"
      ? null
      : {
          is_recording: dictationState === "listening",
          volume: 0,
          duration: recordingDuration,
        };

  return {
    dictationEnabled: true,
    voiceConfigLoaded: true,
    dictationState,
    recordingStatus,
    liveTranscript: "",
    isDictating: dictationState === "listening",
    isDictationBusy: dictationState !== "idle",
    isDictationProcessing: dictationState === "transcribing",
    handleDictationToggle,
  };
}
