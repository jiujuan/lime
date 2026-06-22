import type { McpResourceContent } from "@/lib/api/mcp";

export const MCP_RESOURCE_TEXT_PREVIEW_CHAR_LIMIT = 8000;

const DEFAULT_RESOURCE_MIME_TYPE = "text/plain";

export interface McpResourceTextPreview {
  kind: "text";
  mimeType: string;
  text: string;
  totalChars: number;
  hiddenChars: number;
  truncated: boolean;
}

export interface McpResourceBlobPreview {
  kind: "blob" | "image";
  mimeType: string;
  byteCount: number;
  encodedLength: number;
}

export interface McpResourceEmptyPreview {
  kind: "empty";
  mimeType: string;
}

export type McpResourcePreview =
  | McpResourceTextPreview
  | McpResourceBlobPreview
  | McpResourceEmptyPreview;

function normalizeMimeType(mimeType?: string): string {
  const normalized = mimeType?.trim();
  return normalized || DEFAULT_RESOURCE_MIME_TYPE;
}

function estimateBase64ByteLength(value: string): number {
  const compact = value.replace(/\s/g, "");
  if (!compact) {
    return 0;
  }

  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

export function buildMcpResourcePreview(
  content: McpResourceContent,
  textLimit = MCP_RESOURCE_TEXT_PREVIEW_CHAR_LIMIT,
): McpResourcePreview {
  const mimeType = normalizeMimeType(content.mime_type);

  if (content.text !== undefined) {
    const normalizedLimit = Math.max(0, textLimit);
    const totalChars = content.text.length;
    const truncated = totalChars > normalizedLimit;
    const text = truncated
      ? content.text.slice(0, normalizedLimit)
      : content.text;
    return {
      kind: "text",
      mimeType,
      text,
      totalChars,
      hiddenChars: truncated ? totalChars - normalizedLimit : 0,
      truncated,
    };
  }

  if (content.blob !== undefined) {
    return {
      kind: mimeType.toLowerCase().startsWith("image/") ? "image" : "blob",
      mimeType,
      byteCount: estimateBase64ByteLength(content.blob),
      encodedLength: content.blob.length,
    };
  }

  return {
    kind: "empty",
    mimeType,
  };
}
