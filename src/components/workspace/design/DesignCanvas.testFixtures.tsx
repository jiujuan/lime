import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, vi } from "vitest";
import type { MediaTaskArtifactOutput } from "@/lib/api/mediaTasks";
import type {
  ReadLayeredDesignProjectExportOutput,
  SaveLayeredDesignProjectExportOutput,
} from "@/lib/api/layeredDesignProject";
import {
  createLayeredDesignFlatImageDraftDocument,
  createImageLayer,
  createSingleLayerAssetGenerationRequest,
  createTextLayer,
  recordLayeredDesignImageTaskSubmissions,
} from "@/lib/layered-design";
import type {
  AnalyzeLayeredDesignFlatImage,
  GeneratedDesignAsset,
  LayeredDesignDocument,
} from "@/lib/layered-design";
import { createLayeredDesignDocument } from "@/lib/layered-design";
import { DesignCanvas } from "./DesignCanvas";
import type { DesignCanvasProps, DesignCanvasState } from "./types";

export interface MountedCanvas {
  container: HTMLDivElement;
  root: Root;
  readState: () => DesignCanvasState;
}

const mountedCanvases: MountedCanvas[] = [];
export const CREATED_AT = "2026-05-05T00:00:00.000Z";
const SUBJECT_MODEL_SLOT_EXECUTION = {
  slotId: "subject-runtime",
  slotKind: "subject_matting",
  providerLabel: "Runtime subject matting",
  modelId: "runtime-matting-v1",
  execution: "remote_model",
  attempt: 1,
  maxAttempts: 1,
  timeoutMs: 45_000,
  fallbackStrategy: "return_null",
  fallbackUsed: false,
  status: "succeeded",
};
const CLEAN_PLATE_MODEL_SLOT_EXECUTION = {
  slotId: "clean-runtime",
  slotKind: "clean_plate",
  providerLabel: "Runtime clean plate",
  modelId: "runtime-inpaint-v1",
  execution: "remote_model",
  attempt: 2,
  maxAttempts: 2,
  timeoutMs: 45_000,
  fallbackStrategy: "return_null",
  fallbackUsed: false,
  status: "succeeded",
};
const OCR_MODEL_SLOT_EXECUTION = {
  slotId: "ocr-runtime",
  slotKind: "text_ocr",
  providerLabel: "Runtime OCR",
  modelId: "runtime-ocr-v1",
  execution: "remote_model",
  attempt: 1,
  maxAttempts: 1,
  timeoutMs: 45_000,
  fallbackStrategy: "use_heuristic",
  fallbackUsed: true,
  status: "fallback_succeeded",
};
const originalFileReader = globalThis.FileReader;

type DesignCanvasTestProps = Omit<
  Partial<DesignCanvasProps>,
  "state" | "onStateChange"
>;

function createAsset(id: string): GeneratedDesignAsset {
  return {
    id,
    kind: "subject",
    src: "",
    width: 512,
    height: 512,
    hasAlpha: true,
    provider: "test-provider",
    modelId: "test-model",
    createdAt: CREATED_AT,
  };
}

export function createDocument(): LayeredDesignDocument {
  return createLayeredDesignDocument({
    id: "design-test",
    title: "图层化海报",
    canvas: { width: 1080, height: 1440, backgroundColor: "#f8fafc" },
    layers: [
      createImageLayer({
        id: "subject",
        name: "角色层",
        type: "image",
        assetId: "asset-subject",
        x: 120,
        y: 240,
        width: 640,
        height: 840,
        zIndex: 2,
        source: "generated",
      }),
      createTextLayer({
        id: "headline",
        name: "标题层",
        type: "text",
        text: "冥界女巫",
        x: 160,
        y: 120,
        width: 760,
        height: 140,
        zIndex: 8,
        source: "planned",
      }),
    ],
    assets: [createAsset("asset-subject")],
    preview: {
      assetId: "asset-preview",
      src: "/preview.png",
      width: 1080,
      height: 1440,
      updatedAt: CREATED_AT,
      stale: false,
    },
    createdAt: CREATED_AT,
  });
}

export function createImageTaskOutput(
  taskId: string,
  result?: MediaTaskArtifactOutput["record"]["result"],
): MediaTaskArtifactOutput {
  return {
    success: true,
    task_id: taskId,
    task_type: "image_generate",
    task_family: "image",
    status: result ? "succeeded" : "pending_submit",
    normalized_status: result ? "succeeded" : "pending",
    path: `.lime/tasks/image_generate/${taskId}.json`,
    absolute_path: `/workspace/.lime/tasks/image_generate/${taskId}.json`,
    artifact_path: `.lime/tasks/image_generate/${taskId}.json`,
    absolute_artifact_path: `/workspace/.lime/tasks/image_generate/${taskId}.json`,
    reused_existing: false,
    record: {
      task_id: taskId,
      task_type: "image_generate",
      task_family: "image",
      payload: {
        prompt: "生成角色层",
        provider_id: "openai",
        model: "gpt-image-2",
      },
      status: result ? "succeeded" : "pending_submit",
      normalized_status: result ? "succeeded" : "pending",
      created_at: "2026-05-05T01:00:00.000Z",
      updated_at: "2026-05-05T01:00:00.000Z",
      result,
    },
  };
}

export function createProjectExportOutput(
  fileCount: number,
  assetCount: number,
  overrides: Partial<SaveLayeredDesignProjectExportOutput> = {},
): SaveLayeredDesignProjectExportOutput {
  return {
    projectRootPath: "/workspace",
    exportDirectoryPath:
      "/workspace/.lime/layered-designs/design-test.layered-design",
    exportDirectoryRelativePath:
      ".lime/layered-designs/design-test.layered-design",
    designPath:
      "/workspace/.lime/layered-designs/design-test.layered-design/design.json",
    manifestPath:
      "/workspace/.lime/layered-designs/design-test.layered-design/export-manifest.json",
    previewPngPath:
      "/workspace/.lime/layered-designs/design-test.layered-design/preview.png",
    fileCount,
    assetCount,
    bytesWritten: 128,
    remoteReferenceAssetCount: 0,
    cachedRemoteAssetCount: 0,
    uncachedRemoteAssetCount: 0,
    ...overrides,
  };
}

export function createProjectExportReadOutput(
  designJson: string,
): ReadLayeredDesignProjectExportOutput {
  return {
    projectRootPath: "/workspace",
    exportDirectoryPath:
      "/workspace/.lime/layered-designs/restored-design.layered-design",
    exportDirectoryRelativePath:
      ".lime/layered-designs/restored-design.layered-design",
    designPath:
      "/workspace/.lime/layered-designs/restored-design.layered-design/design.json",
    designJson,
    manifestPath:
      "/workspace/.lime/layered-designs/restored-design.layered-design/export-manifest.json",
    manifestJson: '{"assets":[]}',
    psdLikeManifestPath:
      "/workspace/.lime/layered-designs/restored-design.layered-design/psd-like-manifest.json",
    psdLikeManifestJson:
      '{"projectionKind":"psd-like-layer-stack","layers":[]}',
    previewPngPath:
      "/workspace/.lime/layered-designs/restored-design.layered-design/preview.png",
    fileCount: 5,
    assetCount: 0,
    updatedAtMs: 1778030000000,
  };
}

export function renderDesignCanvas(
  initialState: DesignCanvasState = {
    type: "design",
    document: createDocument(),
    selectedLayerId: "headline",
    zoom: 0.72,
  },
  canvasProps: DesignCanvasTestProps = {},
): MountedCanvas {
  function StatefulCanvas({
    initialState,
    canvasProps = {},
  }: {
    initialState: DesignCanvasState;
    canvasProps?: DesignCanvasTestProps;
  }) {
    const [state, setState] = useState(initialState);
    (
      globalThis as typeof globalThis & {
        __designCanvasState?: DesignCanvasState;
      }
    ).__designCanvasState = state;

    return (
      <DesignCanvas state={state} onStateChange={setState} {...canvasProps} />
    );
  }

  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: 1200,
  });
  Object.defineProperty(container, "clientHeight", {
    configurable: true,
    value: 800,
  });
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <StatefulCanvas initialState={initialState} canvasProps={canvasProps} />,
    );
  });

  const mounted: MountedCanvas = {
    container,
    root,
    readState: () =>
      (
        globalThis as typeof globalThis & {
          __designCanvasState: DesignCanvasState;
        }
      ).__designCanvasState,
  };
  mountedCanvases.push(mounted);
  return mounted;
}

export function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  expect(button).toBeDefined();
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function changeInputValue(ariaLabel: string, value: string) {
  const input = document.querySelector(
    `input[aria-label="${ariaLabel}"]`,
  ) as HTMLInputElement | null;

  expect(input).not.toBeNull();
  if (!input) {
    throw new Error(`未找到输入框：${ariaLabel}`);
  }

  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function setCheckboxValue(ariaLabel: string, checked: boolean) {
  const input = document.querySelector(
    `input[aria-label="${ariaLabel}"]`,
  ) as HTMLInputElement | null;

  expect(input).not.toBeNull();
  if (!input) {
    throw new Error(`未找到复选框：${ariaLabel}`);
  }

  if (input.checked === checked) {
    return;
  }

  act(() => {
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export function dispatchPointerEvent(
  element: Element,
  type: string,
  options: {
    pointerId?: number;
    clientX: number;
    clientY: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: options.pointerId ?? 1,
  });

  act(() => {
    element.dispatchEvent(event);
  });
}

export async function clickButtonAsync(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

export async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function waitForCanvasState(
  condition: () => boolean,
  errorMessage: string,
  timeout = 80,
) {
  for (let index = 0; index < timeout; index += 1) {
    if (condition()) {
      await flushEffects();
      return;
    }

    await flushEffects();
  }

  throw new Error(errorMessage);
}

export function createDocumentWithPendingImageTask(): LayeredDesignDocument {
  const document = createDocument();
  const generationRequest = createSingleLayerAssetGenerationRequest(
    document,
    "subject",
  );

  return recordLayeredDesignImageTaskSubmissions(
    document,
    [
      {
        generationRequest,
        taskRequest: {
          projectRootPath: "/workspace",
          prompt: generationRequest.prompt,
          title: "图层化海报 · 角色层",
          mode: "generate",
          size: "512x512",
          aspectRatio: "1:1",
          count: 1,
          entrySource: "layered_design_canvas",
          slotId: "subject",
          targetOutputId: "asset-subject",
          targetOutputRefId: generationRequest.id,
        },
        output: createImageTaskOutput("task-subject"),
      },
    ],
    { recordedAt: "2026-05-05T02:00:00.000Z" },
  );
}

export function createFlatImageDraftDocument(): LayeredDesignDocument {
  return createLayeredDesignFlatImageDraftDocument({
    title: "扁平海报拆层",
    image: {
      src: "data:image/png;base64,ZmxhdA==",
      width: 1080,
      height: 1440,
      fileName: "flat-poster.png",
      mimeType: "image/png",
    },
    analysis: {
      analyzer: {
        kind: "local_heuristic",
        label: "本地 heuristic analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: false,
        cleanPlate: false,
        ocrText: false,
      },
      generatedAt: CREATED_AT,
    },
    candidates: [
      {
        id: "subject-candidate",
        role: "subject",
        confidence: 0.92,
        layer: {
          id: "subject-layer",
          name: "人物主体",
          type: "image",
          assetId: "subject-asset",
          x: 120,
          y: 220,
          width: 760,
          height: 980,
          zIndex: 20,
          alphaMode: "embedded",
        },
        assets: [
          {
            id: "subject-asset",
            kind: "subject",
            src: "data:image/png;base64,c3ViamVjdA==",
            width: 760,
            height: 980,
            hasAlpha: true,
            createdAt: CREATED_AT,
            params: {
              alphaHoleFilledPixelCount: 128,
              totalPixelCount: 760 * 980,
              modelSlotExecution: SUBJECT_MODEL_SLOT_EXECUTION,
            },
          },
        ],
      },
      {
        id: "fragment-candidate",
        role: "background_fragment",
        confidence: 0.18,
        layer: {
          id: "fragment-layer",
          name: "边角碎片",
          type: "image",
          assetId: "fragment-asset",
          x: 32,
          y: 40,
          width: 120,
          height: 120,
          zIndex: 30,
          alphaMode: "embedded",
        },
        assets: [
          {
            id: "fragment-asset",
            kind: "effect",
            src: "data:image/png;base64,ZnJhZ21lbnQ=",
            width: 120,
            height: 120,
            hasAlpha: true,
            createdAt: CREATED_AT,
          },
        ],
      },
    ],
    cleanPlate: {
      status: "failed",
      message: "修补失败，保留原图背景。",
    },
    createdAt: CREATED_AT,
  });
}

export function createFlatImageDraftDocumentWithCleanPlate(): LayeredDesignDocument {
  return createLayeredDesignFlatImageDraftDocument({
    title: "带修补背景的扁平海报",
    image: {
      src: "data:image/png;base64,ZmxhdC1jbGVhbg==",
      width: 1080,
      height: 1440,
      fileName: "flat-clean-poster.png",
      mimeType: "image/png",
    },
    analysis: {
      analyzer: {
        kind: "local_heuristic",
        label: "测试 clean plate analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: false,
        cleanPlate: true,
        ocrText: false,
      },
      providerCapabilities: [
        {
          kind: "clean_plate",
          label: "Simple browser clean plate provider",
          execution: "browser_worker",
          modelId: "simple_neighbor_inpaint_v1",
          supports: {
            dataUrlPng: true,
            maskInput: true,
            cleanPlateOutput: true,
          },
          quality: {
            productionReady: false,
            deterministic: true,
            requiresHumanReview: true,
          },
        },
      ],
      generatedAt: CREATED_AT,
    },
    candidates: [
      {
        id: "subject-candidate",
        role: "subject",
        confidence: 0.92,
        layer: {
          id: "subject-layer",
          name: "人物主体",
          type: "image",
          assetId: "subject-asset",
          x: 120,
          y: 220,
          width: 760,
          height: 980,
          zIndex: 20,
          alphaMode: "embedded",
        },
        assets: [
          {
            id: "subject-asset",
            kind: "subject",
            src: "data:image/png;base64,c3ViamVjdC1jbGVhbg==",
            width: 760,
            height: 980,
            hasAlpha: true,
            createdAt: CREATED_AT,
            params: {
              alphaHoleFilledPixelCount: 128,
              totalPixelCount: 760 * 980,
              modelSlotExecution: SUBJECT_MODEL_SLOT_EXECUTION,
            },
          },
        ],
      },
    ],
    cleanPlate: {
      status: "succeeded",
      asset: {
        id: "clean-plate-asset",
        kind: "clean_plate",
        src: "data:image/png;base64,Y2xlYW4tcGxhdGU=",
        width: 1080,
        height: 1440,
        hasAlpha: false,
        createdAt: CREATED_AT,
        params: {
          seed: "worker_heuristic_clean_plate_provider",
          provider: "测试 clean plate provider",
          model: "fixture-inpaint",
          haloExpandedPixelCount: 18,
          totalSubjectPixelCount: 9200,
          modelSlotExecution: CLEAN_PLATE_MODEL_SLOT_EXECUTION,
        },
      },
      message: "背景修补可用。",
    },
    createdAt: CREATED_AT,
  });
}

export function createFlatImageDraftDocumentWithMaskAndTextCandidate(): LayeredDesignDocument {
  return createLayeredDesignFlatImageDraftDocument({
    title: "带 mask 和 OCR 文字候选的扁平海报",
    image: {
      src: "data:image/png;base64,ZmxhdC1tYXNrLW9jcg==",
      width: 1080,
      height: 1440,
      fileName: "flat-mask-ocr-poster.png",
      mimeType: "image/png",
    },
    analysis: {
      analyzer: {
        kind: "local_heuristic",
        label: "测试 mask + OCR analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: false,
        ocrText: true,
      },
      generatedAt: CREATED_AT,
    },
    candidates: [
      {
        id: "subject-candidate",
        role: "subject",
        confidence: 0.91,
        layer: {
          id: "subject-layer",
          name: "人物主体",
          type: "image",
          assetId: "subject-asset",
          maskAssetId: "subject-mask",
          x: 120,
          y: 220,
          width: 760,
          height: 980,
          zIndex: 20,
          alphaMode: "mask",
        },
        assets: [
          {
            id: "subject-asset",
            kind: "subject",
            src: "data:image/png;base64,c3ViamVjdC1tYXNrLW9jcg==",
            width: 760,
            height: 980,
            hasAlpha: true,
            createdAt: CREATED_AT,
          },
          {
            id: "subject-mask",
            kind: "mask",
            src: "data:image/png;base64,bWFzay1vY3I=",
            width: 760,
            height: 980,
            hasAlpha: false,
            createdAt: CREATED_AT,
          },
        ],
      },
      {
        id: "headline-candidate",
        role: "text",
        confidence: 0.88,
        layer: createTextLayer({
          id: "headline-layer",
          name: "标题文案",
          type: "text",
          text: "霓虹开幕",
          x: 148,
          y: 104,
          width: 720,
          height: 156,
          zIndex: 38,
          fontSize: 72,
          color: "#f97316",
          align: "center",
          source: "extracted",
          params: {
            modelSlotExecution: OCR_MODEL_SLOT_EXECUTION,
          },
        }),
      },
    ],
    cleanPlate: {
      status: "not_requested",
      message: "当前 analyzer 未生成 clean plate。",
    },
    createdAt: CREATED_AT,
  });
}

export function createFlatImageDraftDocumentWithQualityMetadataRisk(): LayeredDesignDocument {
  return createLayeredDesignFlatImageDraftDocument({
    title: "带异常质量元数据的扁平海报",
    image: {
      src: "data:image/png;base64,cmlzay1mbGF0",
      width: 1080,
      height: 1440,
      fileName: "risk-flat-poster.png",
      mimeType: "image/png",
    },
    analysis: {
      analyzer: {
        kind: "structured_pipeline",
        label: "质量风险 analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
        ocrText: true,
      },
      generatedAt: CREATED_AT,
    },
    candidates: [
      {
        id: "subject-candidate",
        role: "subject",
        confidence: 0.94,
        layer: {
          id: "subject-layer",
          name: "人物主体",
          type: "image",
          assetId: "subject-asset",
          maskAssetId: "subject-mask",
          x: 120,
          y: 220,
          width: 760,
          height: 980,
          zIndex: 20,
          alphaMode: "mask",
        },
        assets: [
          {
            id: "subject-asset",
            kind: "subject",
            src: "data:image/png;base64,cmlzay1zdWJqZWN0",
            width: 760,
            height: 980,
            hasAlpha: true,
            createdAt: CREATED_AT,
            params: {
              foregroundPixelCount: 12,
              detectedForegroundPixelCount: 0,
              ellipseFallbackApplied: true,
              totalPixelCount: 760 * 980,
            },
          },
          {
            id: "subject-mask",
            kind: "mask",
            src: "data:image/png;base64,cmlzay1tYXNr",
            width: 760,
            height: 980,
            hasAlpha: false,
            createdAt: CREATED_AT,
          },
        ],
      },
    ],
    cleanPlate: {
      status: "succeeded",
      asset: {
        id: "clean-plate-asset",
        kind: "clean_plate",
        src: "data:image/png;base64,cmlzay1jbGVhbg==",
        width: 1080,
        height: 1440,
        hasAlpha: false,
        createdAt: CREATED_AT,
        params: {
          provider: "风险 clean plate provider",
          model: "risk-inpaint",
          filledPixelCount: 0,
          totalSubjectPixelCount: 9_200,
          maskApplied: false,
        },
      },
      message: "背景修补状态为 succeeded，但质量元数据异常。",
    },
    createdAt: CREATED_AT,
  });
}

export function createFlatImageDraftDocumentWithProductionModelSlotReady(): LayeredDesignDocument {
  return createLayeredDesignFlatImageDraftDocument({
    title: "生产级 model slot ready 扁平图",
    image: {
      src: "data:image/png;base64,cHJvZC1yZWFkeS1mbGF0",
      width: 1080,
      height: 1440,
      fileName: "prod-ready-flat-poster.png",
      mimeType: "image/png",
    },
    analysis: {
      analyzer: {
        kind: "structured_pipeline",
        label: "生产 model slot analyzer",
      },
      outputs: {
        candidateRaster: true,
        candidateMask: true,
        cleanPlate: true,
        ocrText: true,
      },
      providerCapabilities: [
        {
          kind: "subject_matting",
          label: "生产主体抠图 slot",
          execution: "remote_model",
          modelId: "prod-matting-v1",
          supports: {
            dataUrlPng: true,
            alphaOutput: true,
            maskOutput: true,
          },
          quality: {
            productionReady: true,
            requiresHumanReview: false,
          },
        },
        {
          kind: "clean_plate",
          label: "生产 clean plate slot",
          execution: "remote_model",
          modelId: "prod-inpaint-v1",
          supports: {
            dataUrlPng: true,
            maskInput: true,
            cleanPlateOutput: true,
          },
          quality: {
            productionReady: true,
            requiresHumanReview: false,
          },
        },
      ],
      generatedAt: CREATED_AT,
    },
    candidates: [
      {
        id: "subject-candidate",
        role: "subject",
        confidence: 0.96,
        layer: {
          id: "subject-layer",
          name: "人物主体",
          type: "image",
          assetId: "subject-asset",
          maskAssetId: "subject-mask",
          x: 120,
          y: 220,
          width: 760,
          height: 980,
          zIndex: 20,
          alphaMode: "mask",
        },
        assets: [
          {
            id: "subject-asset",
            kind: "subject",
            src: "data:image/png;base64,cHJvZC1yZWFkeS1zdWJqZWN0",
            width: 760,
            height: 980,
            hasAlpha: true,
            createdAt: CREATED_AT,
            params: {
              foregroundPixelCount: 312_000,
              detectedForegroundPixelCount: 312_000,
              ellipseFallbackApplied: false,
              totalPixelCount: 760 * 980,
              modelSlotExecution: SUBJECT_MODEL_SLOT_EXECUTION,
            },
          },
          {
            id: "subject-mask",
            kind: "mask",
            src: "data:image/png;base64,cHJvZC1yZWFkeS1tYXNr",
            width: 760,
            height: 980,
            hasAlpha: false,
            createdAt: CREATED_AT,
          },
        ],
      },
    ],
    cleanPlate: {
      status: "succeeded",
      asset: {
        id: "clean-plate-asset",
        kind: "clean_plate",
        src: "data:image/png;base64,cHJvZC1yZWFkeS1jbGVhbg==",
        width: 1080,
        height: 1440,
        hasAlpha: false,
        createdAt: CREATED_AT,
        params: {
          filledPixelCount: 9_200,
          totalSubjectPixelCount: 9_200,
          haloExpandedPixelCount: 0,
          maskApplied: true,
          modelSlotExecution: CLEAN_PLATE_MODEL_SLOT_EXECUTION,
        },
      },
      message: "生产级背景修补可用。",
    },
    createdAt: CREATED_AT,
  });
}

export class MockFlatImageFileReader {
  public onload: ((event: { target: { result: string } }) => void) | null =
    null;
  public onerror: (() => void) | null = null;
  public error: Error | null = null;

  readAsDataURL(file: File) {
    queueMicrotask(() => {
      this.onload?.({
        target: {
          result: `data:${file.type || "image/png"};base64,ZmxhdC1pbWFnZQ==`,
        },
      });
    });
  }
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
      __designCanvasState?: DesignCanvasState;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.removeItem("lime.layeredDesign.analyzerEndpoint");
});

afterEach(() => {
  while (mountedCanvases.length > 0) {
    const mounted = mountedCanvases.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  delete (globalThis as { __designCanvasState?: DesignCanvasState })
    .__designCanvasState;
  window.localStorage.removeItem("lime.layeredDesign.analyzerEndpoint");
  globalThis.FileReader = originalFileReader;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

export type { AnalyzeLayeredDesignFlatImage, LayeredDesignDocument };
