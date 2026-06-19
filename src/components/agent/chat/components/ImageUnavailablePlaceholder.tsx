import { ImageOff } from "lucide-react";

interface ImageUnavailablePlaceholderProps {
  label: string;
  className?: string;
  testId?: string;
}

export function ImageUnavailablePlaceholder({
  label,
  className,
  testId,
}: ImageUnavailablePlaceholderProps) {
  return (
    <span
      className={[
        "inline-flex min-h-24 min-w-36 items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
    >
      <ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
