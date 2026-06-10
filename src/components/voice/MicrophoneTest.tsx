/**
 * @file MicrophoneTest.tsx
 * @description 麦克风设备选择组件
 * @module components/voice/MicrophoneTest
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Check, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAudioDevices, type AudioDeviceInfo } from "@/lib/api/asrProvider";

interface MicrophoneTestProps {
  /** 当前选择的设备 ID */
  selectedDeviceId?: string;
  /** 设备选择变化回调 */
  onDeviceChange: (deviceId: string | undefined) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

export function MicrophoneTest({
  selectedDeviceId,
  onDeviceChange,
  disabled = false,
}: MicrophoneTestProps) {
  const { t } = useTranslation("settings");
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载设备列表
  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceList = await listAudioDevices();
      setDevices(deviceList);
    } catch (err: any) {
      setError(err?.message || t("settings.voice.microphone.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // 初始加载
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const defaultDevice = devices.find((device) => device.is_default);
  const selectedDeviceLabel = selectedDeviceId
    ? (devices.find((device) => device.id === selectedDeviceId)?.name ??
      selectedDeviceId)
    : defaultDevice?.name
      ? t("settings.voice.microphone.systemDefaultWithName", {
          name: defaultDevice.name,
        })
      : t("settings.voice.microphone.systemDefault");

  return (
    <div className="space-y-4">
      {/* 设备选择 */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Select
            value={selectedDeviceId || "__default__"}
            onValueChange={(value) =>
              onDeviceChange(value === "__default__" ? undefined : value)
            }
            disabled={disabled || loading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t("settings.voice.microphone.placeholder")}
              >
                {selectedDeviceLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                <div className="flex items-center gap-2">
                  <span>{t("settings.voice.microphone.systemDefault")}</span>
                  {defaultDevice && (
                    <span className="text-xs text-muted-foreground">
                      ({defaultDevice.name})
                    </span>
                  )}
                </div>
              </SelectItem>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex items-center gap-2">
                    <span>{device.name}</span>
                    {device.is_default && (
                      <Check className="h-3 w-3 text-primary" />
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadDevices}
          disabled={loading}
          title={t("settings.voice.microphone.refreshTitle")}
          aria-label={t("settings.voice.microphone.refreshTitle")}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
