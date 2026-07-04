import React from "react";
import { ImageUnavailablePlaceholder } from "./ImageUnavailablePlaceholder";

interface MarkdownImageWithFallbackProps
  extends Pick<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "className" | "loading" | "referrerPolicy" | "title"
  > {
  alt?: string;
  caption?: string;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  src: string;
  unavailableLabel: string;
}

export function MarkdownImageWithFallback({
  alt,
  caption,
  className,
  src,
  unavailableLabel,
  onError,
  ...props
}: MarkdownImageWithFallbackProps) {
  const [isUnavailable, setIsUnavailable] = React.useState(!src);

  React.useEffect(() => {
    setIsUnavailable(!src);
  }, [src]);

  if (isUnavailable) {
    return (
      <span
        className="my-3 inline-flex"
        data-markdown-image-src={src}
        data-testid="markdown-image-block"
      >
        <ImageUnavailablePlaceholder
          label={unavailableLabel}
          testId="markdown-image-unavailable"
        />
      </span>
    );
  }

  const image = (
    <img
      {...props}
      src={src}
      alt={alt ?? ""}
      data-markdown-image-src={src}
      className={[
        "max-h-[512px] max-w-full cursor-pointer rounded-[10px] border border-border object-contain transition hover:border-ring hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onError={(event) => {
        onError?.(event);
        setIsUnavailable(true);
      }}
    />
  );

  if (!caption) {
    return image;
  }

  return (
    <span
      className="my-3 inline-flex flex-col gap-1.5"
      data-testid="markdown-image-block"
    >
      {image}
      <span className="text-center text-xs text-muted-foreground">
        {caption}
      </span>
    </span>
  );
}
