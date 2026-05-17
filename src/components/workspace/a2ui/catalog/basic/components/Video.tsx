import type { VideoComponent } from "../../../types";
import { resolveDynamicValue } from "../../../parser";

interface VideoRendererProps {
  component: VideoComponent;
  data: Record<string, unknown>;
  scopePath?: string;
}

export function VideoRenderer({
  component,
  data,
  scopePath = "/",
}: VideoRendererProps) {
  const url = String(
    resolveDynamicValue(component.url, data, "", scopePath) ?? "",
  );

  if (!url) {
    return null;
  }

  return (
    <video
      src={url}
      controls
      className="w-full overflow-hidden rounded-[12px] border border-slate-200 bg-black shadow-none"
    />
  );
}

export const Video = VideoRenderer;
