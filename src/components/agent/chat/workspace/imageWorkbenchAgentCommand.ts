import type { MessageImage } from "../types";
import type { ParsedImageWorkbenchCommand } from "../utils/imageWorkbenchCommand";
import type { ImageWorkbenchApplyTarget } from "./imageWorkbenchHelpers";

export interface ImageWorkbenchCommandActionParams {
  rawText: string;
  parsedCommand: ParsedImageWorkbenchCommand;
  images: MessageImage[];
  applyTarget?: ImageWorkbenchApplyTarget | null;
}

export interface SubmitImageWorkbenchAgentCommandParams {
  rawText: string;
  displayContent?: string;
  images: MessageImage[];
  requestContext: Record<string, unknown>;
}
