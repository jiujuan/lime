import { Image } from "lucide-react";
import type { WorkspaceProductProfileStructuredPreview } from "./workspaceProductProfileModel";
import { resolveWorkspaceProductProfileImageRenderSrc } from "./workspaceProductProfileImagePreview";

function isRenderableImageSrc(value: string): boolean {
  return /^(?:https?:|data:image\/|blob:|asset:)/i.test(value);
}

export function WorkspaceProductProfileImageCell({
  image,
}: {
  image: WorkspaceProductProfileStructuredPreview["images"][number];
}) {
  const imageSrc = resolveWorkspaceProductProfileImageRenderSrc(image);
  return (
    <div
      className="aspect-[4/3] overflow-hidden rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)]"
      data-testid="workspace-product-profile-image-cell"
    >
      <div className="flex h-full flex-col">
        {imageSrc && isRenderableImageSrc(imageSrc) ? (
          <img
            alt={image.alt ?? image.title}
            className="min-h-0 flex-1 object-cover"
            src={imageSrc}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Image className="h-5 w-5 text-[color:var(--lime-text-muted)]" />
          </div>
        )}
        <div className="min-h-[36px] border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-2 py-1">
          <div className="truncate text-[11px] font-medium text-[color:var(--lime-text-strong)]">
            {image.title}
          </div>
          {image.prompt ? (
            <div className="truncate text-[10px] text-[color:var(--lime-text-muted)]">
              {image.prompt}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
