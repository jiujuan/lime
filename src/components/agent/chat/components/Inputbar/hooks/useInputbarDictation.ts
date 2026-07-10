import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  polishVoiceInputText,
  transcribeVoiceInputAudio,
} from "@/lib/api/asrProvider";
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
  finalizing: boolean;
  livePreviewInFlight: boolean;
  livePreviewSequence: number;
  lastLivePreviewChunkCount: number;
  liveTranscriptText: string;
  liveSampleCursor: number;
  sampler: LiveAudioSampler | null;
  draft: DictationDraft;
}

interface LiveAudioSampler {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  sampleRate: number;
  chunks: Float32Array[];
  totalFrames: number;
}

interface DictationDraft {
  baseText: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface InputbarRecordingStatus {
  is_recording: boolean;
  volume: number;
  duration: number;
}

const MIN_RECORDING_DURATION_MS = 350;
const LIVE_TRANSCRIPTION_TIMESLICE_MS = 1200;
const LIVE_TRANSCRIPTION_INTERVAL_MS = 1800;
const LIVE_TRANSCRIPTION_MIN_SAMPLE_MS = 650;
const LIVE_TRANSCRIPTION_MAX_SAMPLE_MS = 1800;
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
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext ??
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

function stopLiveAudioSampler(sampler: LiveAudioSampler | null): void {
  if (!sampler) {
    return;
  }
  sampler.processor.disconnect();
  sampler.source.disconnect();
  void sampler.audioContext.close().catch(() => undefined);
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
  const channels = Array.from({ length: channelCount }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  const samples = new Float32Array(frameCount);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    samples[frameIndex] =
      channels.reduce((sum, channel) => sum + channel[frameIndex], 0) /
      channelCount;
  }
  return encodeMonoPcmFloat32ToWavBase64(samples, sampleRate);
}

export function encodeMonoPcmFloat32ToWavBase64(
  samples: Float32Array,
  sampleRate: number,
): string {
  const frameCount = samples.length;
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

  let writeOffset = wavHeaderBytes;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[frameIndex]));
    const sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(writeOffset, Math.round(sample), true);
    writeOffset += bytesPerSample;
  }

  return bytesToBase64(new Uint8Array(buffer));
}

function createDictationDraft(
  currentText: string,
  textarea: HTMLTextAreaElement | null,
): DictationDraft {
  const selectionStart = textarea?.selectionStart ?? currentText.length;
  const selectionEnd = textarea?.selectionEnd ?? selectionStart;
  return {
    baseText: currentText,
    selectionStart,
    selectionEnd,
  };
}

function replaceDraftTranscript(
  draft: DictationDraft,
  transcript: string,
): { nextText: string; selectionStart: number } {
  return insertTranscriptAtSelection(
    draft.baseText,
    transcript,
    {
      selectionStart: draft.selectionStart,
      selectionEnd: draft.selectionEnd,
    } as HTMLTextAreaElement,
  );
}

function shouldJoinWithoutSpace(left: string, right: string): boolean {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) {
    return true;
  }
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]$/u.test(left) ||
    /^[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(right);
}

function appendTranscriptFragment(current: string, fragment: string): string {
  const cleanFragment = fragment.trim();
  if (!cleanFragment) {
    return current;
  }
  if (!current) {
    return cleanFragment;
  }
  if (current.endsWith(cleanFragment)) {
    return current;
  }
  if (cleanFragment.startsWith(current)) {
    return cleanFragment;
  }
  const separator = shouldJoinWithoutSpace(current, cleanFragment) ? "" : " ";
  return `${current}${separator}${cleanFragment}`;
}

function createLiveAudioSampler(stream: MediaStream): LiveAudioSampler | null {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    return null;
  }
  const audioContext = new AudioContextCtor();
  if (
    typeof audioContext.createMediaStreamSource !== "function" ||
    typeof audioContext.createScriptProcessor !== "function"
  ) {
    void audioContext.close().catch(() => undefined);
    return null;
  }

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const sampler: LiveAudioSampler = {
    audioContext,
    source,
    processor,
    sampleRate: audioContext.sampleRate,
    chunks: [],
    totalFrames: 0,
  };

  processor.onaudioprocess = (event) => {
    const inputBuffer = event.inputBuffer;
    const channelCount = Math.max(1, inputBuffer.numberOfChannels);
    const frameCount = inputBuffer.length;
    const mixed = new Float32Array(frameCount);
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channel = inputBuffer.getChannelData(channelIndex);
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        mixed[frameIndex] += channel[frameIndex] / channelCount;
      }
    }
    sampler.chunks.push(mixed);
    sampler.totalFrames += frameCount;
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
  void audioContext.resume?.().catch(() => undefined);
  return sampler;
}

function sliceLiveAudioSamples(
  sampler: LiveAudioSampler,
  startFrame: number,
  endFrame: number,
): Float32Array {
  const frameCount = Math.max(0, endFrame - startFrame);
  const samples = new Float32Array(frameCount);
  let chunkStart = 0;
  let writeOffset = 0;
  for (const chunk of sampler.chunks) {
    const chunkEnd = chunkStart + chunk.length;
    if (chunkEnd <= startFrame) {
      chunkStart = chunkEnd;
      continue;
    }
    if (chunkStart >= endFrame) {
      break;
    }
    const readStart = Math.max(0, startFrame - chunkStart);
    const readEnd = Math.min(chunk.length, endFrame - chunkStart);
    samples.set(chunk.subarray(readStart, readEnd), writeOffset);
    writeOffset += readEnd - readStart;
    chunkStart = chunkEnd;
  }
  return samples;
}

function collectLiveAudioSegment(activeRecording: ActiveRecording): {
  audioBase64: string;
  mimeType: string;
} | null {
  const sampler = activeRecording.sampler;
  if (!sampler) {
    return null;
  }
  const minFrames = Math.floor(
    (sampler.sampleRate * LIVE_TRANSCRIPTION_MIN_SAMPLE_MS) / 1000,
  );
  const maxFrames = Math.floor(
    (sampler.sampleRate * LIVE_TRANSCRIPTION_MAX_SAMPLE_MS) / 1000,
  );
  const availableFrames = sampler.totalFrames - activeRecording.liveSampleCursor;
  if (availableFrames < minFrames) {
    return null;
  }
  const endFrame = sampler.totalFrames;
  const startFrame = Math.max(
    activeRecording.liveSampleCursor,
    endFrame - maxFrames,
  );
  activeRecording.liveSampleCursor = endFrame;
  const samples = sliceLiveAudioSamples(sampler, startFrame, endFrame);
  if (samples.length === 0) {
    return null;
  }
  return {
    audioBase64: encodeMonoPcmFloat32ToWavBase64(samples, sampler.sampleRate),
    mimeType: WAV_MIME_TYPE,
  };
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
  const leadingSpace =
    before.trim().length > 0 && !/\s$/.test(before) ? " " : "";
  const trailingSpace =
    after.trim().length > 0 && !/^\s/.test(after) ? " " : "";
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
  const copy = useMemo(() => buildInputbarDictationCopy((key) => t(key)), [t]);
  const [dictationState, setDictationState] =
    useState<InputbarDictationState>("idle");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePreviewTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const textRef = useRef(text);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const clearRecordingTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (livePreviewTimerRef.current) {
      clearInterval(livePreviewTimerRef.current);
      livePreviewTimerRef.current = null;
    }
  }, []);

  const resetRecording = useCallback(() => {
    clearRecordingTimer();
    const activeRecording = activeRecordingRef.current;
    activeRecordingRef.current = null;
    if (activeRecording) {
      stopLiveAudioSampler(activeRecording.sampler);
      stopStream(activeRecording.stream);
    }
    setRecordingDuration(0);
    setLiveTranscript("");
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

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
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
    },
    [copy.unavailable],
  );

  const applyLiveTranscript = useCallback(
    (activeRecording: ActiveRecording, transcript: string) => {
      const cleanTranscript = transcript.trim();
      if (!cleanTranscript) {
        return;
      }
      activeRecording.liveTranscriptText = cleanTranscript;
      setLiveTranscript(cleanTranscript);
      const textarea = textareaRef.current;
      const { nextText, selectionStart } = replaceDraftTranscript(
        activeRecording.draft,
        cleanTranscript,
      );
      setText(nextText);
      window.requestAnimationFrame(() => {
        textarea?.setSelectionRange(selectionStart, selectionStart);
      });
    },
    [setText, textareaRef],
  );

  const updateLiveTranscript = useCallback(async () => {
    const activeRecording = activeRecordingRef.current;
    if (
      !activeRecording ||
      activeRecording.finalizing ||
      activeRecording.livePreviewInFlight
    ) {
      return;
    }

    const liveSegment = collectLiveAudioSegment(activeRecording);
    if (
      !liveSegment &&
      (activeRecording.chunks.length === 0 ||
        activeRecording.chunks.length ===
          activeRecording.lastLivePreviewChunkCount)
    ) {
      return;
    }

    activeRecording.livePreviewInFlight = true;
    activeRecording.lastLivePreviewChunkCount = activeRecording.chunks.length;
    activeRecording.livePreviewSequence += 1;
    const sequence = activeRecording.livePreviewSequence;

    try {
      const result = liveSegment
        ? await transcribeVoiceInputAudio(liveSegment)
        : await transcribeBlob(
            new Blob(activeRecording.chunks, {
              type: activeRecording.recorder.mimeType || activeRecording.mimeType,
            }),
          );
      const previewText = liveSegment
        ? appendTranscriptFragment(
            activeRecording.liveTranscriptText,
            result.text,
          )
        : result.text.trim();
      if (
        activeRecordingRef.current === activeRecording &&
        !activeRecording.finalizing &&
        activeRecording.livePreviewSequence === sequence
      ) {
        applyLiveTranscript(activeRecording, previewText);
      }
    } catch (error) {
      console.warn("[voice-input] live transcription preview failed", error);
    } finally {
      if (activeRecordingRef.current === activeRecording) {
        activeRecording.livePreviewInFlight = false;
      }
    }
  }, [applyLiveTranscript, transcribeBlob]);

  const polishTranscript = useCallback(async (transcript: string) => {
    try {
      const result = await polishVoiceInputText({ text: transcript });
      return result.text.trim() || transcript;
    } catch (error) {
      console.warn("[voice-input] polish failed, using raw transcript", error);
      return transcript;
    }
  }, []);

  const finishRecording = useCallback(async () => {
    const activeRecording = activeRecordingRef.current;
    if (!activeRecording) {
      return;
    }

    activeRecording.finalizing = true;
    setDictationState("transcribing");
    clearRecordingTimer();
    const elapsedMs = performance.now() - activeRecording.startedAt;
    try {
      const blob = await stopActiveRecording();
      stopLiveAudioSampler(activeRecording.sampler);
      stopStream(activeRecording.stream);
      activeRecordingRef.current = null;

      if (elapsedMs < MIN_RECORDING_DURATION_MS || blob.size === 0) {
        toast.error(copy.tooShort);
        return;
      }

      const result = await transcribeBlob(blob);
      const rawTranscript = result.text.trim();
      if (!rawTranscript) {
        toast.error(copy.emptyTranscript);
        return;
      }
      setLiveTranscript(rawTranscript);
      const transcript = await polishTranscript(rawTranscript);

      const textarea = textareaRef.current;
      const { nextText, selectionStart } = replaceDraftTranscript(
        activeRecording.draft,
        transcript,
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
    polishTranscript,
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
      const textarea = textareaRef.current;
      const activeRecording: ActiveRecording = {
        stream,
        recorder,
        chunks: [],
        startedAt: performance.now(),
        mimeType: recorder.mimeType || mimeType || "",
        finalizing: false,
        livePreviewInFlight: false,
        livePreviewSequence: 0,
        lastLivePreviewChunkCount: 0,
        liveTranscriptText: "",
        liveSampleCursor: 0,
        sampler: createLiveAudioSampler(stream),
        draft: createDictationDraft(textRef.current, textarea),
      };
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          activeRecording.chunks.push(event.data);
          void updateLiveTranscript();
        }
      });
      activeRecordingRef.current = activeRecording;
      recorder.start(LIVE_TRANSCRIPTION_TIMESLICE_MS);
      setDictationState("listening");
      setRecordingDuration(0);
      setLiveTranscript("");
      timerRef.current = setInterval(() => {
        setRecordingDuration(
          Math.max(0, (performance.now() - activeRecording.startedAt) / 1000),
        );
      }, 250);
      livePreviewTimerRef.current = setInterval(() => {
        if (typeof recorder.requestData === "function" && recorder.state === "recording") {
          recorder.requestData();
        }
        void updateLiveTranscript();
      }, LIVE_TRANSCRIPTION_INTERVAL_MS);
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
  }, [copy, resetRecording, textareaRef, updateLiveTranscript]);

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
    liveTranscript,
    isDictating: dictationState === "listening",
    isDictationBusy: dictationState !== "idle",
    isDictationProcessing: dictationState === "transcribing",
    handleDictationToggle,
  };
}
