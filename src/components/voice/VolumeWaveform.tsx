/**
 * @file VolumeWaveform.tsx
 * @description 音量波形可视化组件
 * @module components/voice/VolumeWaveform
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface VolumeWaveformProps {
  /** 当前音量级别 (0-100) */
  volume: number;
  /** 是否正在录音 */
  isRecording: boolean;
  /** 自定义类名 */
  className?: string;
  /** 条形数量 */
  barCount?: number;
}

export function VolumeWaveform({
  volume,
  isRecording,
  className,
  barCount = 5,
}: VolumeWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0));

  // 更新波形条高度
  useEffect(() => {
    if (!isRecording) {
      setBars(Array(barCount).fill(0));
      return;
    }

    // 基于音量生成随机波形
    const baseHeight = Math.min(volume / 100, 1);
    const newBars = Array(barCount)
      .fill(0)
      .map((_, i) => {
        // 中间的条形更高
        const centerFactor =
          1 - Math.abs(i - (barCount - 1) / 2) / (barCount / 2);
        const randomFactor = 0.5 + Math.random() * 0.5;
        return baseHeight * centerFactor * randomFactor;
      });
    setBars(newBars);
  }, [volume, isRecording, barCount]);

  return (
    <div
      className={cn("flex items-center justify-center gap-0.5 h-6", className)}
    >
      {bars.map((height, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-75",
            isRecording ? "bg-primary" : "bg-muted",
          )}
          style={{
            height: `${Math.max(4, height * 24)}px`,
            opacity: isRecording ? 0.6 + height * 0.4 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
