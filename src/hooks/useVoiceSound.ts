/**
 * @file useVoiceSound.ts
 * @description 语音录音音效 Hook，根据配置决定是否播放音效
 * @module hooks/useVoiceSound
 */

import { useCallback, useRef, useEffect } from "react";

interface UseVoiceSoundReturn {
  playStartSound: () => void;
  playStopSound: () => void;
}

function playAudioSafely(audio: HTMLAudioElement): void {
  audio.currentTime = 0;
  audio.play().catch((error) => {
    // 浏览器会在无用户手势时拒绝播放音效；这不影响语音输入主流程。
    console.debug("[语音音效] 播放被浏览器拦截，已跳过。", error);
  });
}

function tryPreloadAudio(audio: HTMLAudioElement): void {
  if (typeof audio.load !== "function") {
    return;
  }

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.toLowerCase().includes("jsdom")
  ) {
    return;
  }

  try {
    audio.load();
  } catch {
    // jsdom 不支持 HTMLMediaElement.load，测试环境下静默跳过即可。
  }
}

/**
 * 语音录音音效 Hook
 * @param enabled 是否启用音效
 */
export function useVoiceSound(enabled: boolean): UseVoiceSoundReturn {
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化音频
  useEffect(() => {
    if (!startAudioRef.current) {
      startAudioRef.current = new Audio("/sounds/recording-start.wav");
      startAudioRef.current.volume = 0.8;
      tryPreloadAudio(startAudioRef.current);
    }
    if (!stopAudioRef.current) {
      stopAudioRef.current = new Audio("/sounds/recording-stop.wav");
      stopAudioRef.current.volume = 0.8;
      tryPreloadAudio(stopAudioRef.current);
    }
  }, []);

  const playStartSound = useCallback(() => {
    if (!enabled || !startAudioRef.current) return;
    playAudioSafely(startAudioRef.current);
  }, [enabled]);

  const playStopSound = useCallback(() => {
    if (!enabled || !stopAudioRef.current) return;
    playAudioSafely(stopAudioRef.current);
  }, [enabled]);

  return {
    playStartSound,
    playStopSound,
  };
}
