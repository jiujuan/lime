import type { AudioPlayerComponent } from "../../../types";
import { resolveDynamicValue } from "../../../parser";
import { A2UI_FORM_TOKENS } from "../../../taskFormTokens";

interface AudioPlayerRendererProps {
  component: AudioPlayerComponent;
  data: Record<string, unknown>;
  scopePath?: string;
}

export function AudioPlayerRenderer({
  component,
  data,
  scopePath = "/",
}: AudioPlayerRendererProps) {
  const url = String(
    resolveDynamicValue(component.url, data, "", scopePath) ?? "",
  );
  const description = component.description
    ? String(resolveDynamicValue(component.description, data, "", scopePath))
    : "";

  if (!url) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-[16px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-3 shadow-sm shadow-slate-950/5">
      {description && (
        <div className={A2UI_FORM_TOKENS.helperText}>{description}</div>
      )}
      <audio src={url} controls className="w-full" />
    </div>
  );
}

export const AudioPlayer = AudioPlayerRenderer;
