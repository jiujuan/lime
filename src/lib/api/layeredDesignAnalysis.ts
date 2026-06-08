import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type { LayeredDesignFlatImageStructuredAnalyzerResult } from "@/lib/layered-design/analyzer";

export interface LayeredDesignTextBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayeredDesignRecognizedTextBlock {
  text: string;
  boundingBox?: LayeredDesignTextBoundingBox;
  confidence?: number;
}

export interface RecognizeLayeredDesignTextRequest {
  imageSrc: string;
  width: number;
  height: number;
  candidateId?: string;
}

export interface RecognizeLayeredDesignTextOutput {
  supported: boolean;
  engine: string;
  blocks: LayeredDesignRecognizedTextBlock[];
  message?: string;
}

export interface AnalyzeLayeredDesignFlatImageNativeRequest {
  image: {
    src: string;
    width: number;
    height: number;
    mimeType?: string;
    hasAlpha?: boolean;
  };
  createdAt?: string;
}

export interface AnalyzeLayeredDesignFlatImageNativeOutput {
  supported: boolean;
  engine: string;
  result?: LayeredDesignFlatImageStructuredAnalyzerResult;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isTextBlock(value: unknown): value is LayeredDesignRecognizedTextBlock {
  if (!isRecord(value) || typeof value.text !== "string") {
    return false;
  }

  if (value.confidence !== undefined && !isNumber(value.confidence)) {
    return false;
  }

  if (value.boundingBox === undefined) {
    return true;
  }

  return (
    isRecord(value.boundingBox) &&
    isNumber(value.boundingBox.x) &&
    isNumber(value.boundingBox.y) &&
    isNumber(value.boundingBox.width) &&
    isNumber(value.boundingBox.height)
  );
}

function assertRecognizeTextOutput(
  value: unknown,
): asserts value is RecognizeLayeredDesignTextOutput {
  if (
    !isRecord(value) ||
    typeof value.supported !== "boolean" ||
    !isString(value.engine) ||
    !Array.isArray(value.blocks) ||
    !value.blocks.every(isTextBlock) ||
    !isOptionalString(value.message)
  ) {
    throw new Error("recognize_layered_design_text 未返回有效图层文字识别结果");
  }
}

function assertFlatImageAnalysisOutput(
  value: unknown,
): asserts value is AnalyzeLayeredDesignFlatImageNativeOutput {
  if (
    !isRecord(value) ||
    typeof value.supported !== "boolean" ||
    !isString(value.engine) ||
    !isOptionalString(value.message)
  ) {
    throw new Error(
      "analyze_layered_design_flat_image 未返回有效图层扁平图分析结果",
    );
  }

  if (value.supported && !isRecord(value.result)) {
    throw new Error(
      "analyze_layered_design_flat_image 未返回有效图层扁平图分析结果",
    );
  }
}

export async function recognizeLayeredDesignText(
  request: RecognizeLayeredDesignTextRequest,
): Promise<RecognizeLayeredDesignTextOutput> {
  const result = await safeInvoke<unknown>(
    "recognize_layered_design_text",
    { request },
  );
  assertNotDiagnosticFacade(
    "recognize_layered_design_text",
    result,
    "真实 Layered Design extraction current 通道",
  );
  assertRecognizeTextOutput(result);
  return result;
}

export async function analyzeLayeredDesignFlatImageNative(
  request: AnalyzeLayeredDesignFlatImageNativeRequest,
): Promise<AnalyzeLayeredDesignFlatImageNativeOutput> {
  const result = await safeInvoke<unknown>(
    "analyze_layered_design_flat_image",
    { request },
  );
  assertNotDiagnosticFacade(
    "analyze_layered_design_flat_image",
    result,
    "真实 Layered Design extraction current 通道",
  );
  assertFlatImageAnalysisOutput(result);
  return result;
}
