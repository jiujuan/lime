import { safeInvoke } from "@/lib/dev-bridge";
import type {
  ColorMood,
  CreateGalleryMetadataRequest,
  GalleryMaterial,
  GalleryMaterialMetadata,
  ImageCategory,
  LayoutCategory,
} from "@/types/gallery-material";

interface DiagnosticFacadeMeta {
  category?: string;
  source?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getDiagnosticFacadeMeta(value: unknown): DiagnosticFacadeMeta | null {
  const ownDiagnostic =
    isRecord(value) && isRecord(value.diagnostic) ? value.diagnostic : null;
  const arrayDiagnosticValue = Array.isArray(value)
    ? (value as unknown[] & { __diagnostic?: unknown }).__diagnostic
    : null;
  const arrayDiagnostic = isRecord(arrayDiagnosticValue)
    ? arrayDiagnosticValue
    : null;
  const diagnostic = ownDiagnostic ?? arrayDiagnostic;

  return diagnostic ? (diagnostic as DiagnosticFacadeMeta) : null;
}

async function invokeGalleryCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<unknown>(command, args);
  const diagnostic = getDiagnosticFacadeMeta(result);
  if (diagnostic) {
    const source = diagnostic.source || diagnostic.category || "diagnostic";
    throw new Error(
      `${command} 尚未接入真实图库材料 current 通道，收到 ${source} 诊断返回。`,
    );
  }

  return result as T;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGalleryMaterialMetadata(
  value: unknown,
): value is GalleryMaterialMetadata {
  return (
    isRecord(value) &&
    typeof value.materialId === "string" &&
    isStringArray(value.colors) &&
    isOptionalFiniteNumber(value.width) &&
    isOptionalFiniteNumber(value.height) &&
    isOptionalString(value.thumbnail) &&
    isOptionalString(value.colorSchemeJson) &&
    isOptionalFiniteNumber(value.elementCount) &&
    isOptionalString(value.preview) &&
    isOptionalString(value.fabricJson) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isGalleryMaterial(value: unknown): value is GalleryMaterial {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    isOptionalString(value.filePath) &&
    isOptionalFiniteNumber(value.fileSize) &&
    isOptionalString(value.mimeType) &&
    isOptionalString(value.content) &&
    isStringArray(value.tags) &&
    isOptionalString(value.description) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.metadata === undefined || isGalleryMaterialMetadata(value.metadata))
  );
}

function assertGalleryMaterialOrNull(
  command: string,
  value: unknown,
): asserts value is GalleryMaterial | null {
  if (value !== null && !isGalleryMaterial(value)) {
    throw new Error(`${command} did not return gallery material`);
  }
}

function assertGalleryMaterialMetadata(
  command: string,
  value: unknown,
): asserts value is GalleryMaterialMetadata {
  if (!isGalleryMaterialMetadata(value)) {
    throw new Error(`${command} did not return gallery material metadata`);
  }
}

function assertGalleryMaterialList(
  command: string,
  value: unknown,
): asserts value is GalleryMaterial[] {
  if (!Array.isArray(value) || !value.every(isGalleryMaterial)) {
    throw new Error(`${command} did not return gallery materials`);
  }
}

function assertVoidResult(command: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    throw new Error(`${command} did not return void result`);
  }
}

export async function getGalleryMaterial(
  materialId: string,
): Promise<GalleryMaterial | null> {
  const command = "get_gallery_material";
  const result = await invokeGalleryCommand<unknown>(command, {
    materialId,
  });
  assertGalleryMaterialOrNull(command, result);
  return result;
}

export async function createGalleryMetadata(
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  const command = "create_gallery_material_metadata";
  const result = await invokeGalleryCommand<unknown>(command, {
    req: request,
  });
  assertGalleryMaterialMetadata(command, result);
  return result;
}

export async function updateGalleryMetadata(
  materialId: string,
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  const command = "update_gallery_material_metadata";
  const result = await invokeGalleryCommand<unknown>(command, {
    materialId,
    req: request,
  });
  assertGalleryMaterialMetadata(command, result);
  return result;
}

export async function deleteGalleryMetadata(materialId: string): Promise<void> {
  const command = "delete_gallery_material_metadata";
  const result = await invokeGalleryCommand<unknown>(command, {
    materialId,
  });
  assertVoidResult(command, result);
}

export async function listGalleryMaterialsByImageCategory(
  projectId: string,
  category?: ImageCategory | null,
): Promise<GalleryMaterial[]> {
  const command = "list_gallery_materials_by_image_category";
  const result = await invokeGalleryCommand<unknown>(command, {
    projectId,
    category: category ?? null,
  });
  assertGalleryMaterialList(command, result);
  return result;
}

export async function listGalleryMaterialsByLayoutCategory(
  projectId: string,
  category?: LayoutCategory | null,
): Promise<GalleryMaterial[]> {
  const command = "list_gallery_materials_by_layout_category";
  const result = await invokeGalleryCommand<unknown>(command, {
    projectId,
    category: category ?? null,
  });
  assertGalleryMaterialList(command, result);
  return result;
}

export async function listGalleryMaterialsByMood(
  projectId: string,
  mood?: ColorMood | null,
): Promise<GalleryMaterial[]> {
  const command = "list_gallery_materials_by_mood";
  const result = await invokeGalleryCommand<unknown>(command, {
    projectId,
    mood: mood ?? null,
  });
  assertGalleryMaterialList(command, result);
  return result;
}
