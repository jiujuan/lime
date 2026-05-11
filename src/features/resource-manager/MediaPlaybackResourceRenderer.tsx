import { AlertCircle, Music, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getResourceFormatLabel,
  getResourcePreviewTargetLabel,
} from "./resourceFormatCatalog";
import type { ResourceManagerItem } from "./types";

interface MediaPlaybackResourceRendererProps {
  item: ResourceManagerItem;
}

function getPlaybackTitle(
  item: ResourceManagerItem,
  titleFallback: string,
): string {
  return item.title || item.metadata?.slotLabel?.toString() || titleFallback;
}

function getPlaybackDescription(item: ResourceManagerItem): string | null {
  return item.description || item.metadata?.prompt?.toString() || null;
}

export function MediaPlaybackResourceRenderer({
  item,
}: MediaPlaybackResourceRendererProps) {
  const { t } = useTranslation("workspace");
  const isVideo = item.kind === "video";
  const [loadFailed, setLoadFailed] = useState(false);
  const formatLabel = getResourceFormatLabel(item);
  const previewTargetLabel = getResourcePreviewTargetLabel(item);

  useEffect(() => {
    setLoadFailed(false);
  }, [item.id, item.src]);

  if (loadFailed) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f5f6f8] px-6 text-center text-slate-500">
        <div className="max-w-sm rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            {isVideo
              ? t("workspace.resourceManager.media.error.videoTitle")
              : t("workspace.resourceManager.media.error.audioTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t("workspace.resourceManager.media.error.description")}
          </p>
          {formatLabel ? (
            <div className="mt-4 inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
              {formatLabel} · {previewTargetLabel}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#f5f6f8] p-6">
        <video
          key={item.id}
          src={item.src ?? undefined}
          controls
          preload="metadata"
          playsInline
          data-testid="resource-manager-video-player"
          className="max-h-full max-w-full rounded-[18px] bg-black shadow-lg shadow-slate-950/15"
          onError={() => setLoadFailed(true)}
        >
          {t("workspace.resourceManager.media.videoUnsupported")}
        </video>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f5f6f8] px-6 text-center text-slate-500">
      <div className="w-full max-w-xl rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm shadow-slate-950/5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600">
          <Music className="h-7 w-7" />
        </div>
        <div className="mt-6 flex items-end justify-center gap-1.5 text-sky-500/70">
          {[18, 34, 24, 44, 30, 52, 26, 38, 20].map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="w-1.5 rounded-full bg-current"
              style={{ height }}
            />
          ))}
        </div>
        <h2 className="mt-6 text-lg font-semibold text-slate-950">
          {getPlaybackTitle(
            item,
            t("workspace.resourceManager.media.titleFallback"),
          )}
        </h2>
        {formatLabel ? (
          <div className="mt-3 inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
            {formatLabel} · {previewTargetLabel}
          </div>
        ) : null}
        {getPlaybackDescription(item) ? (
          <p className="mx-auto mt-2 line-clamp-2 max-w-md text-sm leading-6 text-slate-500">
            {getPlaybackDescription(item)}
          </p>
        ) : null}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
            <Volume2 className="h-3.5 w-3.5" />
            {t("workspace.resourceManager.media.audioControlLabel")}
          </div>
          <audio
            key={item.id}
            src={item.src ?? undefined}
            controls
            preload="metadata"
            data-testid="resource-manager-audio-player"
            className="w-full"
            onError={() => setLoadFailed(true)}
          >
            {t("workspace.resourceManager.media.audioUnsupported")}
          </audio>
        </div>
      </div>
    </div>
  );
}
