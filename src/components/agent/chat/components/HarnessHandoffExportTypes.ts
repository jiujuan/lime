export interface HandoffPreviewRequest {
  title: string;
  description?: string;
  path?: string;
}

export type HandoffOpenPathHandler = (path: string) => void | Promise<void>;

export type HandoffOpenPreviewHandler = (
  request: HandoffPreviewRequest,
) => void | Promise<void>;
